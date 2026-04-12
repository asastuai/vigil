import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { createBaseClient } from "@vigil/core";
import { defiRoutes } from "./routes/defi/index.js";
import { createX402Middleware } from "./middleware/x402.js";

const app = new Hono();

// Global middleware
app.use("*", cors());

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
      health: "GET /",
      oracleHealth: "GET /v1/defi/oracle-health?pair=ETH/USD",
      oracleHealthAll: "GET /v1/defi/oracle-health/all",
      liquidationRisk: "GET /v1/defi/liquidation-risk?protocol=aave-v3&asset=ETH&priceDropPct=10",
      availableFeeds: "GET /v1/defi/feeds",
    },
    payment: "x402 (USDC on Base)",
    pricing: {
      "oracle-health": "$0.001/req",
      "oracle-health/all": "$0.005/req",
      "liquidation-risk": "$0.01/req",
    },
  });
});

// Create shared viem client
const baseClient = createBaseClient(process.env.BASE_RPC_URL);

// Mount DeFi routes
app.route("/v1/defi", defiRoutes(baseClient));

// Start server
const port = Number(process.env.PORT) || 3402;
console.log(`Vigil API starting on port ${port}`);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Vigil API running at http://localhost:${info.port}`);
});

export default app;
