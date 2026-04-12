import { paymentMiddlewareFromConfig, type x402HTTPResourceServer } from "@x402/hono";
import { HTTPFacilitatorClient } from "@x402/core/server";
import type { RoutesConfig } from "@x402/core/server";

// Payee address — the wallet that receives USDC on Base
const PAYEE_ADDRESS = process.env.X402_PAYEE_ADDRESS || "0x0000000000000000000000000000000000000000";

// Base mainnet network identifier
const BASE_NETWORK = "eip155:8453";

// x402 route pricing configuration
export const x402Routes: RoutesConfig = {
  "GET /v1/defi/oracle-health": {
    accepts: {
      scheme: "exact",
      network: BASE_NETWORK,
      payTo: PAYEE_ADDRESS,
      price: "$0.001",
      maxTimeoutSeconds: 60,
    },
    description: "Oracle health check for a single Chainlink feed on Base",
  },
  "GET /v1/defi/oracle-health/all": {
    accepts: {
      scheme: "exact",
      network: BASE_NETWORK,
      payTo: PAYEE_ADDRESS,
      price: "$0.005",
      maxTimeoutSeconds: 60,
    },
    description: "Oracle health check for all tracked Chainlink feeds on Base",
  },
  "GET /v1/defi/liquidation-risk": {
    accepts: {
      scheme: "exact",
      network: BASE_NETWORK,
      payTo: PAYEE_ADDRESS,
      price: "$0.01",
      maxTimeoutSeconds: 120,
    },
    description: "Simulate liquidation cascades for a given price drop scenario",
  },
  "GET /v1/defi/mev-exposure": {
    accepts: {
      scheme: "exact",
      network: BASE_NETWORK,
      payTo: PAYEE_ADDRESS,
      price: "$0.005",
      maxTimeoutSeconds: 60,
    },
    description: "MEV exposure score for a pool given a trade size",
  },
  "GET /v1/defi/sandwich-activity": {
    accepts: {
      scheme: "exact",
      network: BASE_NETWORK,
      payTo: PAYEE_ADDRESS,
      price: "$0.005",
      maxTimeoutSeconds: 60,
    },
    description: "Real-time sandwich attack detection for a pool",
  },
  "GET /v1/defi/il-risk": {
    accepts: {
      scheme: "exact",
      network: BASE_NETWORK,
      payTo: PAYEE_ADDRESS,
      price: "$0.01",
      maxTimeoutSeconds: 60,
    },
    description: "Predictive impermanent loss risk for a pool",
  },
};

// Create facilitator client
const facilitatorUrl =
  process.env.X402_FACILITATOR_URL || "https://facilitator.x402.org";

const facilitator = new HTTPFacilitatorClient({ url: facilitatorUrl });

// Export the configured middleware
export function createX402Middleware() {
  return paymentMiddlewareFromConfig(x402Routes, facilitator);
}
