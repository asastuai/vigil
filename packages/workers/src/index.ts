import { createBaseClient, getAllOracleHealth, discoverBorrowers, fetchPositions } from "@vigil/core";
import { tryCreateSupabaseClient, insertOracleSnapshots, insertLendingPositions } from "@vigil/db";
import type { OracleSnapshotRow, LendingPositionRow } from "@vigil/db";

const client = createBaseClient(process.env.BASE_RPC_URL);
const db = tryCreateSupabaseClient();

if (!db) {
  console.warn("Supabase not configured — workers will log to console only");
  console.warn("Set SUPABASE_URL and SUPABASE_ANON_KEY to enable persistence");
}

// ---- Oracle Health Worker ----
// Polls all Chainlink feeds every 15 seconds

async function oracleHealthWorker() {
  try {
    const feeds = await getAllOracleHealth(client);

    const rows: OracleSnapshotRow[] = feeds.map((f) => ({
      pair: f.feed,
      chainlink_price: f.chainlinkPrice,
      spot_price: f.spotPrice,
      deviation_pct: f.deviationPct,
      staleness: f.staleness,
      staleness_ratio: f.stalenessRatio,
      status: f.status,
      sequencer_up: f.sequencerUp,
    }));

    if (db) {
      const { error } = await insertOracleSnapshots(db, rows);
      if (error) console.error("Oracle snapshot insert error:", error.message);
    }

    const unhealthy = feeds.filter((f) => f.status !== "healthy");
    if (unhealthy.length > 0) {
      console.warn(
        `[oracle] ${unhealthy.length} unhealthy feeds:`,
        unhealthy.map((f) => `${f.feed}=${f.status}`).join(", ")
      );
    } else {
      console.log(`[oracle] ${feeds.length} feeds healthy`);
    }
  } catch (err) {
    console.error("[oracle] worker error:", (err as Error).message);
  }
}

// ---- Liquidation Position Worker ----
// Indexes Aave V3 borrower positions every 5 minutes

async function positionWorker() {
  try {
    console.log("[positions] discovering borrowers...");
    const borrowers = await discoverBorrowers(client, 50_000n);
    const addresses = Array.from(borrowers).slice(0, 500);
    console.log(`[positions] found ${addresses.length} borrowers, fetching positions...`);

    const positions = await fetchPositions(client, addresses);
    const withDebt = positions.filter((p) => p.totalDebtUsd > 0);

    if (db && withDebt.length > 0) {
      const rows: LendingPositionRow[] = withDebt.map((p) => ({
        address: p.address,
        protocol: p.protocol,
        total_collateral_usd: p.totalCollateralUsd,
        total_debt_usd: p.totalDebtUsd,
        health_factor: p.healthFactor,
      }));

      const { error } = await insertLendingPositions(db, rows);
      if (error) console.error("Position upsert error:", error.message);
    }

    const atRisk = withDebt.filter((p) => p.healthFactor < 1.5);
    console.log(
      `[positions] ${withDebt.length} active positions, ${atRisk.length} at risk (HF < 1.5)`
    );
  } catch (err) {
    console.error("[positions] worker error:", (err as Error).message);
  }
}

// ---- Start Workers ----

console.log("Vigil Workers starting...");
console.log(`Supabase: ${db ? "connected" : "disabled (console-only mode)"}`);

// Run immediately, then on interval
oracleHealthWorker();
positionWorker();

// Oracle health: every 15 seconds
setInterval(oracleHealthWorker, 15_000);

// Positions: every 5 minutes
setInterval(positionWorker, 5 * 60_000);

console.log("Workers running:");
console.log("  - Oracle health: every 15s");
console.log("  - Position indexer: every 5m");
