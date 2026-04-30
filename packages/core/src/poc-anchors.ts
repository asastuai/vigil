/**
 * Real-anchor fetchers for Vigil's PoC attestations.
 *
 * Mirrors the `proof-of-context-impl` Rust crate's `clients` module:
 *   - Drand mainnet round from a public mirror (Cloudflare default).
 *   - EVM block height from a JSON-RPC endpoint (`eth_blockNumber`).
 *
 * Fetches are cached in-memory with TTLs aligned to each clock's cadence.
 * Drand: 25s (period 30s). Base block: 1.5s (target 2s).
 *
 * Opt-in via env var `POC_ENABLE_TRIPLE_ANCHOR=1`. Without it, both
 * fields are null. Without it the attestation falls back to the server
 * timestamp as the only binding clock — honest fallback.
 */

const DRAND_URL = process.env.POC_DRAND_URL ?? "https://drand.cloudflare.com";
const BASE_RPC_URL =
  process.env.POC_BASE_RPC_URL ?? "https://mainnet.base.org";

const TRIPLE_ANCHOR_ENABLED =
  process.env.POC_ENABLE_TRIPLE_ANCHOR === "1" ||
  process.env.POC_ENABLE_TRIPLE_ANCHOR === "true";

const DRAND_CACHE_MS = 25_000;
const BLOCK_CACHE_MS = 1_500;

interface CacheCell<T> {
  value: T | null;
  expiresAt: number;
}

let _drandCache: CacheCell<number> = { value: null, expiresAt: 0 };
let _blockCache: CacheCell<number> = { value: null, expiresAt: 0 };

async function fetchDrandRound(): Promise<number | null> {
  const now = Date.now();
  if (_drandCache.value !== null && now < _drandCache.expiresAt) {
    return _drandCache.value;
  }
  try {
    const resp = await fetch(`${DRAND_URL}/public/latest`, {
      headers: { Accept: "application/json" },
    });
    if (!resp.ok) return null;
    const body = (await resp.json()) as { round?: number };
    if (typeof body.round !== "number") return null;
    _drandCache = { value: body.round, expiresAt: now + DRAND_CACHE_MS };
    return body.round;
  } catch {
    return null;
  }
}

async function fetchBlockHeight(): Promise<number | null> {
  const now = Date.now();
  if (_blockCache.value !== null && now < _blockCache.expiresAt) {
    return _blockCache.value;
  }
  try {
    const resp = await fetch(BASE_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_blockNumber",
        params: [],
      }),
    });
    if (!resp.ok) return null;
    const body = (await resp.json()) as { result?: string };
    if (typeof body.result !== "string") return null;
    const trimmed = body.result.startsWith("0x")
      ? body.result.slice(2)
      : body.result;
    const height = parseInt(trimmed, 16);
    if (Number.isNaN(height)) return null;
    _blockCache = { value: height, expiresAt: now + BLOCK_CACHE_MS };
    return height;
  } catch {
    return null;
  }
}

export interface AnchorsBlock {
  server_timestamp: string;
  block_height: number | null;
  drand_round: number | null;
}

export async function buildAnchors(): Promise<AnchorsBlock> {
  const serverTimestamp = new Date().toISOString();

  if (!TRIPLE_ANCHOR_ENABLED) {
    return {
      server_timestamp: serverTimestamp,
      block_height: null,
      drand_round: null,
    };
  }

  const [drandRound, blockHeight] = await Promise.all([
    fetchDrandRound(),
    fetchBlockHeight(),
  ]);

  return {
    server_timestamp: serverTimestamp,
    block_height: blockHeight,
    drand_round: drandRound,
  };
}

export const _internals = {
  resetCaches: () => {
    _drandCache = { value: null, expiresAt: 0 };
    _blockCache = { value: null, expiresAt: 0 };
  },
  isEnabled: () => TRIPLE_ANCHOR_ENABLED,
};
