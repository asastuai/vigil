import type { BaseClient } from "../chains/base.js";
import {
  UNISWAP_V3_POOL_ABI,
  UNISWAP_V3_SWAP_EVENT_ABI,
} from "../chains/contracts.js";
import { parseAbiItem } from "viem";

export interface IlRiskResponse {
  pool: string;
  poolAddress: string;
  timeframeHours: number;
  currentPrice: number;
  priceVolatility24h: number; // annualized volatility percentage
  predictedILPct: number; // predicted IL percentage (negative = loss)
  confidenceInterval: {
    lower: number; // worst case IL
    upper: number; // best case IL
  };
  priceRange24h: {
    high: number;
    low: number;
    changePct: number;
  };
  riskLevel: "low" | "medium" | "high" | "extreme";
  timestamp: string;
}

/**
 * Compute impermanent loss for a given price change ratio.
 * IL = 2 * sqrt(priceRatio) / (1 + priceRatio) - 1
 *
 * @param priceRatio - new price / original price
 * @returns IL as a decimal (negative means loss)
 */
function computeIL(priceRatio: number): number {
  if (priceRatio <= 0) return -1;
  return (2 * Math.sqrt(priceRatio)) / (1 + priceRatio) - 1;
}

/**
 * Estimate volatility from a series of price observations.
 * Uses log returns and annualizes.
 */
function computeVolatility(prices: number[]): number {
  if (prices.length < 2) return 0;

  const logReturns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > 0 && prices[i - 1] > 0) {
      logReturns.push(Math.log(prices[i] / prices[i - 1]));
    }
  }

  if (logReturns.length === 0) return 0;

  const mean = logReturns.reduce((s, r) => s + r, 0) / logReturns.length;
  const variance =
    logReturns.reduce((s, r) => s + (r - mean) ** 2, 0) /
    (logReturns.length - 1);
  const stdDev = Math.sqrt(variance);

  // Annualize: assume ~12 observations per hour on Base (every ~5 min sampling)
  // 12 * 24 * 365 = 105,120 periods per year
  const periodsPerYear = 105_120;
  const annualizedVol = stdDev * Math.sqrt(periodsPerYear) * 100;

  return Math.round(annualizedVol * 100) / 100;
}

/**
 * Extract price history from recent swap events.
 * Uses sqrtPriceX96 from Swap events to reconstruct price over time.
 */
async function getPriceHistory(
  client: BaseClient,
  poolAddress: `0x${string}`,
  lookbackBlocks: bigint
): Promise<number[]> {
  const currentBlock = await client.getBlockNumber();
  const fromBlock = currentBlock - lookbackBlocks;

  const swapEvent = parseAbiItem(
    "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)"
  );

  let logs;
  try {
    logs = await client.getLogs({
      address: poolAddress,
      event: swapEvent,
      fromBlock: fromBlock > 0n ? fromBlock : 0n,
      toBlock: currentBlock,
    });
  } catch {
    try {
      logs = await client.getLogs({
        address: poolAddress,
        event: swapEvent,
        fromBlock: currentBlock - 2_000n,
        toBlock: currentBlock,
      });
    } catch {
      return [];
    }
  }

  // Extract prices from sqrtPriceX96
  // price = (sqrtPriceX96 / 2^96)^2 = sqrtPriceX96^2 / 2^192
  const prices: number[] = [];
  for (const log of logs) {
    const sqrtPrice = log.args.sqrtPriceX96;
    if (!sqrtPrice || sqrtPrice === 0n) continue;
    // Convert to float carefully to avoid overflow
    const priceFloat = Number(sqrtPrice) / 2 ** 96;
    const price = priceFloat * priceFloat;
    if (price > 0 && isFinite(price)) {
      prices.push(price);
    }
  }

  return prices;
}

/**
 * Predict impermanent loss risk for a Uniswap V3 pool.
 */
export async function getIlRisk(
  client: BaseClient,
  poolAddress: `0x${string}`,
  timeframeHours = 24
): Promise<IlRiskResponse> {
  // ~1 block every 2 seconds on Base, so hours * 1800 blocks/hour
  const lookbackBlocks = BigInt(Math.min(timeframeHours * 1800, 9_999));

  // Get price history and current pool state in parallel
  const [priceHistory, slot0] = await Promise.all([
    getPriceHistory(client, poolAddress, lookbackBlocks),
    client.readContract({
      address: poolAddress,
      abi: UNISWAP_V3_POOL_ABI,
      functionName: "slot0",
    }),
  ]);

  // Current price from slot0
  const sqrtPriceX96 = slot0[0];
  const currentPriceRaw = Number(sqrtPriceX96) / 2 ** 96;
  const currentPrice = currentPriceRaw * currentPriceRaw;

  if (priceHistory.length < 5) {
    return {
      pool: poolAddress,
      poolAddress,
      timeframeHours,
      currentPrice,
      priceVolatility24h: 0,
      predictedILPct: 0,
      confidenceInterval: { lower: 0, upper: 0 },
      priceRange24h: { high: currentPrice, low: currentPrice, changePct: 0 },
      riskLevel: "low",
      timestamp: new Date().toISOString(),
    };
  }

  // Compute volatility
  const volatility = computeVolatility(priceHistory);

  // Price range stats
  const highPrice = Math.max(...priceHistory);
  const lowPrice = Math.min(...priceHistory);
  const firstPrice = priceHistory[0];
  const changePct =
    firstPrice > 0
      ? ((currentPrice - firstPrice) / firstPrice) * 100
      : 0;

  // Predict IL using volatility-based price scenarios
  // Expected price change over timeframe using volatility
  const timefractionOfYear = timeframeHours / 8760;
  const expectedMove = (volatility / 100) * Math.sqrt(timefractionOfYear);

  // Scenarios
  const expectedRatioUp = 1 + expectedMove;
  const expectedRatioDown = 1 - expectedMove;
  const extremeRatioUp = 1 + 2 * expectedMove; // 2 sigma
  const extremeRatioDown = Math.max(0.01, 1 - 2 * expectedMove);

  // IL for each scenario
  const ilExpectedUp = computeIL(expectedRatioUp) * 100;
  const ilExpectedDown = computeIL(expectedRatioDown) * 100;
  const ilExtremeUp = computeIL(extremeRatioUp) * 100;
  const ilExtremeDown = computeIL(extremeRatioDown) * 100;

  // Average expected IL (symmetric)
  const predictedIL = (ilExpectedUp + ilExpectedDown) / 2;

  // Confidence interval (2 sigma)
  const worstCase = Math.min(ilExtremeUp, ilExtremeDown);
  const bestCase = Math.max(ilExpectedUp, ilExpectedDown);

  // Risk level
  let riskLevel: IlRiskResponse["riskLevel"];
  if (Math.abs(predictedIL) < 0.5) riskLevel = "low";
  else if (Math.abs(predictedIL) < 2) riskLevel = "medium";
  else if (Math.abs(predictedIL) < 5) riskLevel = "high";
  else riskLevel = "extreme";

  return {
    pool: poolAddress,
    poolAddress,
    timeframeHours,
    currentPrice,
    priceVolatility24h: volatility,
    predictedILPct: Math.round(predictedIL * 10000) / 10000,
    confidenceInterval: {
      lower: Math.round(worstCase * 10000) / 10000,
      upper: Math.round(bestCase * 10000) / 10000,
    },
    priceRange24h: {
      high: highPrice,
      low: lowPrice,
      changePct: Math.round(changePct * 100) / 100,
    },
    riskLevel,
    timestamp: new Date().toISOString(),
  };
}
