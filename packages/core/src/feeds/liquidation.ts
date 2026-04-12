import type { BaseClient } from "../chains/base.js";
import {
  AAVE_V3_POOL_BASE,
  AAVE_POOL_ABI,
} from "../chains/contracts.js";
import type {
  LiquidationRiskResponse,
  CascadeRound,
  LendingPosition,
} from "../types/defi.js";
import { parseAbiItem } from "viem";
import { fetchSpotPrices } from "./oracle-health.js";

// Aave V3 uses 8 decimals for USD-denominated values in getUserAccountData
const AAVE_BASE_DECIMALS = 8;

/**
 * Discover active borrower addresses from Aave V3 Borrow events.
 * Scans recent blocks in chunks to avoid RPC limits (max 10K blocks per query).
 */
export async function discoverBorrowers(
  client: BaseClient,
  lookbackBlocks = 100_000n // ~2.3 days on Base (2s blocks)
): Promise<Set<`0x${string}`>> {
  const currentBlock = await client.getBlockNumber();
  const startBlock = currentBlock - lookbackBlocks;
  const CHUNK_SIZE = 9_999n;

  const borrowers = new Set<`0x${string}`>();
  const borrowEvent = parseAbiItem(
    "event Borrow(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint256 interestRateMode, uint256 borrowRate, uint16 indexed referralCode)"
  );

  // Query in chunks of 9,999 blocks
  for (
    let from = startBlock > 0n ? startBlock : 0n;
    from <= currentBlock;
    from += CHUNK_SIZE + 1n
  ) {
    const to =
      from + CHUNK_SIZE > currentBlock ? currentBlock : from + CHUNK_SIZE;

    try {
      const logs = await client.getLogs({
        address: AAVE_V3_POOL_BASE,
        event: borrowEvent,
        fromBlock: from,
        toBlock: to,
      });

      for (const log of logs) {
        if (log.args.onBehalfOf) {
          borrowers.add(log.args.onBehalfOf);
        }
      }
    } catch {
      // Skip chunks that fail (RPC issues) and continue
      continue;
    }

    // Stop early if we have enough borrowers
    if (borrowers.size >= 500) break;
  }

  return borrowers;
}

/**
 * Fetch account data for a list of borrower addresses from Aave V3.
 * Uses multicall for efficiency.
 */
export async function fetchPositions(
  client: BaseClient,
  addresses: `0x${string}`[]
): Promise<LendingPosition[]> {
  if (addresses.length === 0) return [];

  // Batch using multicall
  const calls = addresses.map((address) => ({
    address: AAVE_V3_POOL_BASE as `0x${string}`,
    abi: AAVE_POOL_ABI,
    functionName: "getUserAccountData" as const,
    args: [address] as const,
  }));

  const results = await client.multicall({ contracts: calls });

  const positions: LendingPosition[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status !== "success" || !result.result) continue;

    const [
      totalCollateralBase,
      totalDebtBase,
      ,
      ,
      ,
      healthFactor,
    ] = result.result;

    // Skip positions with no debt
    if (totalDebtBase === 0n) continue;

    const collateralUsd =
      Number(totalCollateralBase) / 10 ** AAVE_BASE_DECIMALS;
    const debtUsd = Number(totalDebtBase) / 10 ** AAVE_BASE_DECIMALS;
    const hf = Number(healthFactor) / 1e18;

    positions.push({
      address: addresses[i],
      protocol: "aave-v3",
      totalCollateralUsd: collateralUsd,
      totalDebtUsd: debtUsd,
      healthFactor: Math.round(hf * 10000) / 10000,
      lastUpdated: new Date().toISOString(),
    });
  }

  // Sort by health factor (most at-risk first)
  positions.sort((a, b) => a.healthFactor - b.healthFactor);

  return positions;
}

/**
 * Simulate a liquidation cascade for a given price drop.
 *
 * Model:
 * - When collateral price drops X%, health factors decrease proportionally
 * - Positions with HF < 1.0 after the drop are liquidatable
 * - Each round of liquidations creates sell pressure (price impact)
 * - This triggers additional liquidations in subsequent rounds
 * - Cascade continues until no new positions are liquidatable
 */
export function simulateCascade(
  positions: LendingPosition[],
  priceDropPct: number,
  currentPrice: number
): { cascadeRounds: CascadeRound[]; simulatedPrice: number } {
  const rounds: CascadeRound[] = [];
  let cumulativePriceDrop = priceDropPct;
  let simulatedPrice = currentPrice * (1 - priceDropPct / 100);

  // Clone positions for simulation
  let remainingPositions = positions.map((p) => ({ ...p }));

  for (let round = 1; round <= 10; round++) {
    // Adjust health factors based on cumulative price drop
    // HF_new = HF_original * (1 - priceDrop)
    // This is simplified — real HF depends on specific collateral composition
    const dropFactor = 1 - cumulativePriceDrop / 100;

    const liquidatable = remainingPositions.filter((p) => {
      const adjustedHF = p.healthFactor * dropFactor;
      return adjustedHF < 1.0;
    });

    if (liquidatable.length === 0) break;

    const liquidationVolume = liquidatable.reduce(
      (sum, p) => sum + p.totalDebtUsd,
      0
    );

    // Estimate price impact from liquidation sell pressure
    // Rule of thumb: $1M liquidation creates ~0.1% price impact on large cap assets
    const priceImpactPct = (liquidationVolume / 10_000_000) * 0.1;

    rounds.push({
      round,
      liquidations: liquidatable.length,
      volume: Math.round(liquidationVolume),
      priceImpact: -Math.round(priceImpactPct * 1000) / 1000,
    });

    // Remove liquidated positions from remaining
    const liquidatedAddresses = new Set(liquidatable.map((p) => p.address));
    remainingPositions = remainingPositions.filter(
      (p) => !liquidatedAddresses.has(p.address)
    );

    // Accumulate price impact for next round
    cumulativePriceDrop += priceImpactPct;
    simulatedPrice = currentPrice * (1 - cumulativePriceDrop / 100);

    // Stop if price impact is negligible
    if (priceImpactPct < 0.001) break;
  }

  return { cascadeRounds: rounds, simulatedPrice };
}

/**
 * Main endpoint: simulate liquidation risk for a given scenario.
 */
export async function getLiquidationRisk(
  client: BaseClient,
  protocol: string,
  asset: string,
  priceDropPct: number,
  cachedPositions?: LendingPosition[]
): Promise<LiquidationRiskResponse> {
  if (protocol !== "aave-v3") {
    throw new Error(`Unsupported protocol: ${protocol}. Available: aave-v3`);
  }

  if (priceDropPct <= 0 || priceDropPct > 99) {
    throw new Error("priceDropPct must be between 0 and 99");
  }

  // Use cached positions or fetch fresh ones
  let positions: LendingPosition[];
  if (cachedPositions && cachedPositions.length > 0) {
    positions = cachedPositions;
  } else {
    // Discover borrowers and fetch their positions
    const borrowers = await discoverBorrowers(client, 200_000n);
    const borrowerArray = Array.from(borrowers).slice(0, 500); // Cap at 500 for performance
    positions = await fetchPositions(client, borrowerArray);
  }

  // Get current price from CoinGecko
  const assetToCoingecko: Record<string, string> = {
    ETH: "ethereum",
    BTC: "bitcoin",
    USDC: "usd-coin",
    LINK: "chainlink",
    AAVE: "aave",
    COMP: "compound-governance-token",
  };
  const coingeckoId = assetToCoingecko[asset.toUpperCase()];
  let currentPrice = 1;
  if (coingeckoId) {
    const prices = await fetchSpotPrices([coingeckoId]);
    currentPrice = prices[coingeckoId]?.usd ?? 1;
  }

  const { cascadeRounds, simulatedPrice } = simulateCascade(
    positions,
    priceDropPct,
    currentPrice
  );

  const totalLiquidations = cascadeRounds.reduce(
    (sum, r) => sum + r.liquidations,
    0
  );
  const totalVolume = cascadeRounds.reduce((sum, r) => sum + r.volume, 0);
  const totalCollateralAtRisk = positions
    .filter((p) => {
      const dropFactor = 1 - priceDropPct / 100;
      return p.healthFactor * dropFactor < 1.0;
    })
    .reduce((sum, p) => sum + p.totalCollateralUsd, 0);

  return {
    protocol,
    chain: "base",
    asset,
    currentPrice,
    simulatedPrice: Math.round(simulatedPrice * 100) / 100,
    priceDropPct,
    atRiskPositions: totalLiquidations,
    totalCollateralAtRisk: Math.round(totalCollateralAtRisk),
    estimatedLiquidationVolume: totalVolume,
    cascadeDepth: cascadeRounds.length,
    cascadeRounds,
    timestamp: new Date().toISOString(),
  };
}
