import type { BaseClient } from "../chains/base.js";
import {
  CHAINLINK_AGGREGATOR_ABI,
  CHAINLINK_FEEDS,
  SEQUENCER_UPTIME_ABI,
  BASE_SEQUENCER_FEED,
} from "../chains/contracts.js";
import type { ChainlinkFeedConfig, OracleHealthResponse } from "../types/defi.js";

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

interface SpotPrices {
  [coingeckoId: string]: { usd: number };
}

export async function fetchSpotPrices(
  coingeckoIds: string[]
): Promise<SpotPrices> {
  const ids = coingeckoIds.join(",");
  const url = `${COINGECKO_BASE}/simple/price?ids=${ids}&vs_currencies=usd`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`CoinGecko API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<SpotPrices>;
}

export async function checkSequencerStatus(
  client: BaseClient
): Promise<boolean> {
  try {
    const data = await client.readContract({
      address: BASE_SEQUENCER_FEED,
      abi: SEQUENCER_UPTIME_ABI,
      functionName: "latestRoundData",
    });
    // answer: 0 = sequencer is up, 1 = sequencer is down
    return data[1] === 0n;
  } catch {
    // If we can't read the sequencer feed, assume it's up
    // (the RPC itself working is a good signal)
    return true;
  }
}

function computeStatus(
  deviationPct: number,
  stalenessRatio: number
): OracleHealthResponse["status"] {
  // Critical: deviation > 5% OR staleness > 3x heartbeat
  if (Math.abs(deviationPct) > 5 || stalenessRatio > 3) return "critical";
  // Deviating: deviation > 1%
  if (Math.abs(deviationPct) > 1) return "deviating";
  // Stale: staleness > 1.5x heartbeat
  if (stalenessRatio > 1.5) return "stale";
  return "healthy";
}

export async function getOracleHealth(
  client: BaseClient,
  pair: string,
  spotPrices?: SpotPrices
): Promise<OracleHealthResponse> {
  const feedConfig = CHAINLINK_FEEDS.find(
    (f) => f.pair.toLowerCase() === pair.toLowerCase()
  );
  if (!feedConfig) {
    throw new Error(
      `Unknown feed pair: ${pair}. Available: ${CHAINLINK_FEEDS.map((f) => f.pair).join(", ")}`
    );
  }

  // Fetch on-chain data and spot price in parallel
  const [roundData, sequencerUp, prices] = await Promise.all([
    client.readContract({
      address: feedConfig.address,
      abi: CHAINLINK_AGGREGATOR_ABI,
      functionName: "latestRoundData",
    }),
    checkSequencerStatus(client),
    spotPrices
      ? Promise.resolve(spotPrices)
      : fetchSpotPrices([feedConfig.coingeckoId]),
  ]);

  const answer = roundData[1];
  const updatedAt = roundData[3];

  const chainlinkPrice =
    Number(answer) / Math.pow(10, feedConfig.decimals);
  const spotPrice =
    prices[feedConfig.coingeckoId]?.usd ?? chainlinkPrice;

  const now = Math.floor(Date.now() / 1000);
  const staleness = now - Number(updatedAt);
  const stalenessRatio = staleness / feedConfig.heartbeat;

  const deviationPct =
    spotPrice > 0
      ? ((chainlinkPrice - spotPrice) / spotPrice) * 100
      : 0;

  const status = computeStatus(deviationPct, stalenessRatio);

  return {
    feed: feedConfig.pair,
    feedAddress: feedConfig.address,
    chainlinkPrice,
    spotPrice,
    deviationPct: Math.round(deviationPct * 1000) / 1000,
    lastUpdate: new Date(Number(updatedAt) * 1000).toISOString(),
    staleness,
    heartbeat: feedConfig.heartbeat,
    stalenessRatio: Math.round(stalenessRatio * 10000) / 10000,
    status,
    sequencerUp,
  };
}

export async function getAllOracleHealth(
  client: BaseClient
): Promise<OracleHealthResponse[]> {
  // Batch fetch all spot prices in one CoinGecko call
  const coingeckoIds = CHAINLINK_FEEDS.map((f) => f.coingeckoId);
  const spotPrices = await fetchSpotPrices(coingeckoIds);

  // Fetch all feeds in parallel
  const results = await Promise.all(
    CHAINLINK_FEEDS.map((feed) =>
      getOracleHealth(client, feed.pair, spotPrices).catch((err) => ({
        feed: feed.pair,
        feedAddress: feed.address,
        chainlinkPrice: 0,
        spotPrice: 0,
        deviationPct: 0,
        lastUpdate: new Date().toISOString(),
        staleness: 0,
        heartbeat: feed.heartbeat,
        stalenessRatio: 0,
        status: "critical" as const,
        sequencerUp: false,
        error: (err as Error).message,
      }))
    )
  );

  return results;
}

export function getAvailableFeeds(): string[] {
  return CHAINLINK_FEEDS.map((f) => f.pair);
}
