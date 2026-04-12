import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  createBaseClient,
  getOracleHealth,
  getAllOracleHealth,
  getAvailableFeeds,
  getLiquidationRisk,
  getMevExposure,
  getSandwichActivity,
  getIlRisk,
  BASE_POOLS,
} from "@vigil/core";

const client = createBaseClient(process.env.BASE_RPC_URL);

const server = new McpServer({
  name: "vigil",
  version: "0.1.0",
});

// Tool: check_oracle_health
server.tool(
  "check_oracle_health",
  "Check the health of a Chainlink price oracle on Base. Returns deviation from spot price, staleness, and sequencer status. Use this before trusting any on-chain price feed.",
  {
    pair: z
      .string()
      .describe(
        'Price feed pair (e.g. "ETH/USD", "BTC/USD"). Use "all" to get all feeds.'
      ),
  },
  async ({ pair }) => {
    if (pair.toLowerCase() === "all") {
      const results = await getAllOracleHealth(client);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ feeds: results, count: results.length }, null, 2),
          },
        ],
      };
    }

    const result = await getOracleHealth(client, pair);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool: simulate_liquidation_cascade
server.tool(
  "simulate_liquidation_cascade",
  "Simulate what happens to Aave V3 lending positions on Base if an asset drops by a given percentage. Returns cascade rounds, at-risk positions, and estimated liquidation volume.",
  {
    protocol: z
      .string()
      .default("aave-v3")
      .describe("Lending protocol (currently only aave-v3)"),
    asset: z
      .string()
      .describe('Asset to simulate price drop for (e.g. "ETH", "BTC")'),
    priceDropPct: z
      .number()
      .min(1)
      .max(99)
      .describe("Percentage price drop to simulate (1-99)"),
  },
  async ({ protocol, asset, priceDropPct }) => {
    const result = await getLiquidationRisk(client, protocol, asset, priceDropPct);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool: get_mev_exposure
server.tool(
  "get_mev_exposure",
  "Get the MEV risk score for a specific trade on a DEX pool on Base. Returns price impact estimation, historical sandwich rate, and a risk score (0-100). Use this before executing any swap.",
  {
    pool: z
      .string()
      .describe("Pool contract address on Base (use list_known_pools to find addresses)"),
    amountUSD: z
      .number()
      .positive()
      .describe("Trade size in USD to evaluate MEV risk for"),
  },
  async ({ pool, amountUSD }) => {
    const result = await getMevExposure(client, pool as `0x${string}`, amountUSD);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool: get_sandwich_activity
server.tool(
  "get_sandwich_activity",
  "Detect sandwich attack activity on a DEX pool on Base. Analyzes recent blocks for frontrun-victim-backrun patterns. Returns threat level, active bot addresses, and attack frequency.",
  {
    pool: z.string().describe("Pool contract address on Base"),
    lookbackBlocks: z
      .number()
      .default(5000)
      .describe("Number of blocks to analyze (default 5000, ~2.8 hours on Base)"),
  },
  async ({ pool, lookbackBlocks }) => {
    const result = await getSandwichActivity(
      client,
      pool as `0x${string}`,
      BigInt(lookbackBlocks)
    );
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool: predict_il_risk
server.tool(
  "predict_il_risk",
  "Predict impermanent loss risk for a liquidity pool on Base. Uses historical price volatility to estimate future IL. Returns predicted IL percentage, confidence interval, and risk level.",
  {
    pool: z.string().describe("Pool contract address on Base"),
    timeframeHours: z
      .number()
      .default(24)
      .describe("Prediction timeframe in hours (default 24)"),
  },
  async ({ pool, timeframeHours }) => {
    const result = await getIlRisk(client, pool as `0x${string}`, timeframeHours);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool: list_known_pools
server.tool(
  "list_known_pools",
  "List known DEX pool addresses on Base that can be used with the other tools.",
  {},
  async () => {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { pools: BASE_POOLS, availableOracleFeeds: getAvailableFeeds() },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Start
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Vigil MCP server running on stdio");
}

main().catch((err) => {
  console.error("Failed to start Vigil MCP server:", err);
  process.exit(1);
});
