import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type { SupabaseClient } from "@supabase/supabase-js";

export function createSupabaseClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables");
  }

  return createClient(url, key);
}

// Optional Supabase — returns null if not configured (for dev mode)
export function tryCreateSupabaseClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// ---- Typed insert helpers ----

export interface OracleSnapshotRow {
  pair: string;
  chainlink_price: number;
  spot_price: number;
  deviation_pct: number;
  staleness: number;
  staleness_ratio: number;
  status: string;
  sequencer_up: boolean;
}

export interface LendingPositionRow {
  address: string;
  protocol: string;
  total_collateral_usd: number;
  total_debt_usd: number;
  health_factor: number;
}

export interface PoolSnapshotRow {
  pool_address: string;
  sqrt_price_x96: string;
  liquidity: string;
  tick: number | null;
  reserve0: string | null;
  reserve1: string | null;
}

export interface AgentServiceRow {
  provider_name: string;
  provider_url: string | null;
  capability: string;
  price_usd: number;
  pricing_unit: string;
  registry_source: string;
  reputation_score: number | null;
  latency_p50_ms: number | null;
  uptime_30d: number | null;
}

export async function insertOracleSnapshots(
  db: SupabaseClient,
  rows: OracleSnapshotRow[]
) {
  return db.from("oracle_snapshots").insert(rows);
}

export async function insertLendingPositions(
  db: SupabaseClient,
  rows: LendingPositionRow[]
) {
  return db.from("lending_positions").upsert(rows, {
    onConflict: "address,protocol",
  });
}

export async function insertPoolSnapshot(
  db: SupabaseClient,
  row: PoolSnapshotRow
) {
  return db.from("pool_snapshots").insert(row);
}

export async function upsertAgentService(
  db: SupabaseClient,
  row: AgentServiceRow
) {
  return db.from("agent_services").upsert(row, {
    onConflict: "provider_name,capability",
  });
}

export async function queryAgentServices(
  db: SupabaseClient,
  capability: string
) {
  return db
    .from("agent_services")
    .select("*")
    .eq("capability", capability)
    .order("price_usd", { ascending: true });
}

export async function queryAllCapabilities(db: SupabaseClient) {
  return db
    .from("agent_services")
    .select("capability")
    .order("capability");
}
