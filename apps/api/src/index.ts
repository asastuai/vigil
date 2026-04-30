import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { createBaseClient, getPublicKey } from "@vigil/core";
import { defiRoutes } from "./routes/defi/index.js";
import { oracleRoutes } from "./routes/oracle/index.js";
import { createX402Middleware } from "./middleware/x402.js";
import { rateLimit } from "./middleware/rate-limit.js";

const app = new Hono();

// CORS — restrict to known origins via CORS_ALLOWED_ORIGINS env var.
const corsAllowlist = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (corsAllowlist.length > 0) {
  app.use(
    "*",
    cors({
      origin: (origin) => {
        if (!origin || corsAllowlist.includes(origin)) return origin ?? "*";
        return null;
      },
    })
  );
} else {
  app.use("*", cors());
}

// Rate limit free endpoints. Paid endpoints self-rate via x402 cost.
app.use("/", rateLimit());
app.use("/v1/poc/public-key", rateLimit());
app.use("/v1/defi/feeds", rateLimit());

// x402 payment middleware — gates paid routes, passes through free ones
// Only activate when payee address is configured
if (process.env.X402_PAYEE_ADDRESS) {
  console.log("x402 paywall ENABLED — paid routes require USDC on Base");
  app.use("/v1/*", createX402Middleware());
} else {
  console.log("x402 paywall DISABLED — set X402_PAYEE_ADDRESS to enable");
}

// Health check (free)
app.get("/", (c) => {
  return c.json({
    name: "Vigil API",
    version: "0.1.0",
    description: "DeFi Hard Intelligence Feeds for AI Agents",
    endpoints: {
      defi: {
        oracleHealth: "GET /v1/defi/oracle-health?pair=ETH/USD",
        liquidationRisk: "GET /v1/defi/liquidation-risk?protocol=aave-v3&asset=ETH&priceDropPct=10",
        mevExposure: "GET /v1/defi/mev-exposure?pool=0x...&amountUSD=50000",
        sandwichActivity: "GET /v1/defi/sandwich-activity?pool=0x...",
        ilRisk: "GET /v1/defi/il-risk?pool=0x...&timeframeHours=24",
        feeds: "GET /v1/defi/feeds",
      },
      oracle: {
        servicePrice: "GET /v1/oracle/service-price?capability=text-generation",
        serviceCompare: "GET /v1/oracle/service-compare?capability=...&providers=A,B",
        capabilities: "GET /v1/oracle/capabilities",
        register: "POST /v1/oracle/register",
      },
    },
    payment: "x402 (USDC on Base)",
    pricing: {
      "oracle-health": "$0.001/req",
      "oracle-health/all": "$0.005/req",
      "liquidation-risk": "$0.01/req",
      "mev-exposure": "$0.005/req",
      "sandwich-activity": "$0.005/req",
      "il-risk": "$0.01/req",
      "service-price": "$0.005/req",
      "service-compare": "$0.005/req",
    },
  });
});

// PoC operator public key — consumers fetch this to verify Vigil attestations
app.get("/v1/poc/public-key", async (c) => {
  const publicKey = await getPublicKey();
  return c.json({
    public_key: publicKey,
    source_id: process.env.POC_SOURCE_ID ?? "vigil:default",
    primitive: "Proof-of-Context (Aletheia)",
    spec: "https://github.com/asastuai/proof-of-context",
    impl: "https://github.com/asastuai/proof-of-context-impl",
    freshness_types_emitted: ["f_i"],
    note:
      publicKey === null
        ? "POC_SIGNING_KEY env var not set. Attestations will be unsigned (still informational)."
        : "Attestations are Ed25519-signed. Verify against this public key.",
  });
});

// Create shared viem client
const baseClient = createBaseClient(process.env.BASE_RPC_URL);

// Mount routes
app.route("/v1/defi", defiRoutes(baseClient));
app.route("/v1/oracle", oracleRoutes());

// Start server
const port = Number(process.env.PORT) || 3402;
console.log(`Vigil API starting on port ${port}`);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Vigil API running at http://localhost:${info.port}`);
});

export default app;
