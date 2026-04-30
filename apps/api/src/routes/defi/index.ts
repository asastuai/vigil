import { Hono } from "hono";
import type { BaseClient } from "@vigil/core";
import {
  getOracleHealth,
  getAllOracleHealth,
  getAvailableFeeds,
  getLiquidationRisk,
  getMevExposure,
  getSandwichActivity,
  getIlRisk,
  BASE_POOLS,
  attest,
} from "@vigil/core";

/**
 * Per-feed freshness horizon (seconds). Calibrated to the volatility of each
 * signal. Oracle health: short (price-sensitive). Liquidation cascade: medium
 * (state moves slower than price). MEV / sandwich: short (block-by-block).
 * IL risk: medium (statistical baseline updates per block).
 */
const HORIZON = {
  ORACLE_HEALTH: 30,
  LIQUIDATION: 60,
  MEV_EXPOSURE: 30,
  SANDWICH: 30,
  IL_RISK: 60,
} as const;

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
      const attested = await attest(result as unknown as Record<string, unknown>, {
        endpoint: "/v1/defi/oracle-health",
        freshnessHorizonSeconds: HORIZON.ORACLE_HEALTH,
        freshnessType: "f_i",
      });
      return c.json(attested);
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
      const attested = await attest(
        { feeds: results, count: results.length },
        {
          endpoint: "/v1/defi/oracle-health/all",
          freshnessHorizonSeconds: HORIZON.ORACLE_HEALTH,
          freshnessType: "f_i",
        }
      );
      return c.json(attested);
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
      const attested = await attest(result as unknown as Record<string, unknown>, {
        endpoint: "/v1/defi/liquidation-risk",
        freshnessHorizonSeconds: HORIZON.LIQUIDATION,
        freshnessType: "f_i",
      });
      return c.json(attested);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return c.json({ error: message }, 400);
    }
  });

  // MEV Exposure Score
  // x402: $0.005 per request
  router.get("/mev-exposure", async (c) => {
    const pool = c.req.query("pool");
    const amountStr = c.req.query("amountUSD");

    if (!pool || !amountStr) {
      return c.json(
        {
          error: "Missing required query parameters: pool, amountUSD",
          example:
            "/v1/defi/mev-exposure?pool=0xd0b53D9277642d899DF5C87A3966A349A798F224&amountUSD=50000",
          knownPools: BASE_POOLS,
        },
        400
      );
    }

    const amountUSD = Number(amountStr);
    if (isNaN(amountUSD) || amountUSD <= 0) {
      return c.json({ error: "amountUSD must be a positive number" }, 400);
    }

    try {
      const result = await getMevExposure(
        client,
        pool as `0x${string}`,
        amountUSD
      );
      const attested = await attest(result as unknown as Record<string, unknown>, {
        endpoint: "/v1/defi/mev-exposure",
        freshnessHorizonSeconds: HORIZON.MEV_EXPOSURE,
        freshnessType: "f_i",
      });
      return c.json(attested);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return c.json({ error: message }, 400);
    }
  });

  // Sandwich Activity Detection
  // x402: $0.005 per request
  router.get("/sandwich-activity", async (c) => {
    const pool = c.req.query("pool");
    const blocksStr = c.req.query("lookbackBlocks");

    if (!pool) {
      return c.json(
        {
          error: "Missing required query parameter: pool",
          example:
            "/v1/defi/sandwich-activity?pool=0xd0b53D9277642d899DF5C87A3966A349A798F224",
          knownPools: BASE_POOLS,
        },
        400
      );
    }

    const lookbackBlocks = blocksStr ? BigInt(blocksStr) : 5_000n;

    try {
      const result = await getSandwichActivity(
        client,
        pool as `0x${string}`,
        lookbackBlocks
      );
      const attested = await attest(result as unknown as Record<string, unknown>, {
        endpoint: "/v1/defi/sandwich-activity",
        freshnessHorizonSeconds: HORIZON.SANDWICH,
        freshnessType: "f_i",
      });
      return c.json(attested);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return c.json({ error: message }, 400);
    }
  });

  // IL Risk Prediction
  // x402: $0.01 per request
  router.get("/il-risk", async (c) => {
    const pool = c.req.query("pool");
    const hoursStr = c.req.query("timeframeHours");

    if (!pool) {
      return c.json(
        {
          error: "Missing required query parameter: pool",
          example:
            "/v1/defi/il-risk?pool=0xd0b53D9277642d899DF5C87A3966A349A798F224&timeframeHours=24",
          knownPools: BASE_POOLS,
        },
        400
      );
    }

    const timeframeHours = hoursStr ? Number(hoursStr) : 24;

    try {
      const result = await getIlRisk(
        client,
        pool as `0x${string}`,
        timeframeHours
      );
      const attested = await attest(result as unknown as Record<string, unknown>, {
        endpoint: "/v1/defi/il-risk",
        freshnessHorizonSeconds: HORIZON.IL_RISK,
        freshnessType: "f_i",
      });
      return c.json(attested);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return c.json({ error: message }, 400);
    }
  });

  return router;
}
