import { Hono } from "hono";
import type { BaseClient } from "@vigil/core";
import {
  getOracleHealth,
  getAllOracleHealth,
  getAvailableFeeds,
  getLiquidationRisk,
} from "@vigil/core";

export function defiRoutes(client: BaseClient) {
  const router = new Hono();

  // List available feeds (free endpoint)
  router.get("/feeds", (c) => {
    return c.json({
      feeds: getAvailableFeeds(),
      count: getAvailableFeeds().length,
    });
  });

  // Oracle Health Monitor - single feed
  // x402: $0.001 per request
  router.get("/oracle-health", async (c) => {
    const pair = c.req.query("pair");
    if (!pair) {
      return c.json(
        {
          error: "Missing required query parameter: pair",
          example: "/v1/defi/oracle-health?pair=ETH/USD",
          available: getAvailableFeeds(),
        },
        400
      );
    }

    try {
      const result = await getOracleHealth(client, pair);
      return c.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return c.json({ error: message }, 400);
    }
  });

  // Oracle Health Monitor - all feeds
  // x402: $0.005 per request
  router.get("/oracle-health/all", async (c) => {
    try {
      const results = await getAllOracleHealth(client);
      return c.json({
        feeds: results,
        count: results.length,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return c.json({ error: message }, 500);
    }
  });

  // Liquidation Cascade Predictor
  // x402: $0.01 per request
  router.get("/liquidation-risk", async (c) => {
    const protocol = c.req.query("protocol") || "aave-v3";
    const asset = c.req.query("asset");
    const priceDropPctStr = c.req.query("priceDropPct");

    if (!asset || !priceDropPctStr) {
      return c.json(
        {
          error: "Missing required query parameters: asset, priceDropPct",
          example:
            "/v1/defi/liquidation-risk?protocol=aave-v3&asset=ETH&priceDropPct=10",
          protocols: ["aave-v3"],
          assets: ["ETH", "BTC", "USDC"],
        },
        400
      );
    }

    const priceDropPct = Number(priceDropPctStr);
    if (isNaN(priceDropPct) || priceDropPct <= 0 || priceDropPct > 99) {
      return c.json(
        { error: "priceDropPct must be a number between 0 and 99" },
        400
      );
    }

    try {
      const result = await getLiquidationRisk(
        client,
        protocol,
        asset,
        priceDropPct
      );
      return c.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return c.json({ error: message }, 400);
    }
  });

  return router;
}
