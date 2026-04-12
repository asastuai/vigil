import type { BaseClient } from "../chains/base.js";
import {
  UNISWAP_V3_POOL_ABI,
  UNISWAP_V3_SWAP_EVENT_ABI,
  ERC20_ABI,
} from "../chains/contracts.js";
import { parseAbiItem } from "viem";

export interface MevExposureResponse {
  pool: string;
  poolAddress: string;
  token0: { symbol: string; address: string };
  token1: { symbol: string; address: string };
  amountUSD: number;
  currentLiquidity: string;
  estimatedPriceImpactPct: number;
  historicalSandwichRate: number; // sandwiches per 100 swaps in recent blocks
  mevRiskScore: number; // 0-100
  riskLevel: "low" | "medium" | "high" | "critical";
  recommendedMaxTradeUSD: number;
  timestamp: string;
}

/**
 * Estimate price impact for a given trade size on a Uniswap V3 pool.
 * Uses the constant product formula as approximation:
 * priceImpact ≈ tradeSize / (2 * liquidityUSD)
 */
function estimatePriceImpact(
  tradeAmountUSD: number,
  liquidityUSD: number
): number {
  if (liquidityUSD === 0) return 100;
  // For V3 concentrated liquidity, effective liquidity is higher in-range
  // This is a conservative estimate
  const impact = (tradeAmountUSD / (2 * liquidityUSD)) * 100;
  return Math.round(impact * 10000) / 10000;
}

/**
 * Compute MEV risk score (0-100) based on multiple factors.
 */
function computeMevScore(
  priceImpactPct: number,
  sandwichRate: number,
  liquidityUSD: number
): number {
  // Price impact component (0-40 points)
  const impactScore = Math.min(priceImpactPct * 20, 40);

  // Historical sandwich rate component (0-40 points)
  const sandwichScore = Math.min(sandwichRate * 10, 40);

  // Liquidity depth component (0-20 points) — lower liquidity = higher risk
  const liquidityScore =
    liquidityUSD < 100_000
      ? 20
      : liquidityUSD < 1_000_000
        ? 10
        : liquidityUSD < 10_000_000
          ? 5
          : 0;

  return Math.round(Math.min(impactScore + sandwichScore + liquidityScore, 100));
}

function riskLevel(score: number): MevExposureResponse["riskLevel"] {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

/**
 * Count sandwich patterns in recent swap events for a pool.
 * Pattern: Address A swaps direction X, Address B (victim) swaps direction X,
 * Address A swaps direction Y — all in the same block.
 */
async function countRecentSandwiches(
  client: BaseClient,
  poolAddress: `0x${string}`,
  lookbackBlocks = 5_000n
): Promise<{ sandwiches: number; totalSwaps: number }> {
  const currentBlock = await client.getBlockNumber();
  const fromBlock = currentBlock - lookbackBlocks;

  const swapEvent = parseAbiItem(
    "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)"
  );

  let allLogs;
  try {
    allLogs = await client.getLogs({
      address: poolAddress,
      event: swapEvent,
      fromBlock,
      toBlock: currentBlock,
    });
  } catch {
    // If RPC fails (block range too large), try smaller range
    try {
      allLogs = await client.getLogs({
        address: poolAddress,
        event: swapEvent,
        fromBlock: currentBlock - 2_000n,
        toBlock: currentBlock,
      });
    } catch {
      return { sandwiches: 0, totalSwaps: 0 };
    }
  }

  if (allLogs.length === 0) return { sandwiches: 0, totalSwaps: 0 };

  // Group swaps by block
  const blockSwaps = new Map<
    bigint,
    Array<{ sender: string; amount0: bigint; txIndex: number }>
  >();

  for (const log of allLogs) {
    const block = log.blockNumber;
    if (!blockSwaps.has(block)) blockSwaps.set(block, []);
    blockSwaps.get(block)!.push({
      sender: log.args.sender!,
      amount0: log.args.amount0!,
      txIndex: log.transactionIndex ?? 0,
    });
  }

  // Detect sandwich patterns
  let sandwiches = 0;
  for (const [, swaps] of blockSwaps) {
    if (swaps.length < 3) continue;

    // Sort by tx index within block
    swaps.sort((a, b) => a.txIndex - b.txIndex);

    for (let i = 0; i < swaps.length - 2; i++) {
      const first = swaps[i];
      // Look for a different address (victim) between two swaps from same address
      for (let j = i + 1; j < swaps.length - 1; j++) {
        if (swaps[j].sender === first.sender) continue; // skip same sender
        // Check if there's a closing swap from the first sender after the victim
        for (let k = j + 1; k < swaps.length; k++) {
          if (swaps[k].sender === first.sender) {
            // Check opposite direction: first.amount0 and closing.amount0 have opposite signs
            if (
              (first.amount0 > 0n && swaps[k].amount0 < 0n) ||
              (first.amount0 < 0n && swaps[k].amount0 > 0n)
            ) {
              sandwiches++;
              break;
            }
          }
        }
        break; // Only check first victim candidate per frontrun
      }
    }
  }

  return { sandwiches, totalSwaps: allLogs.length };
}

/**
 * Get MEV exposure score for a pool given a trade size.
 */
export async function getMevExposure(
  client: BaseClient,
  poolAddress: `0x${string}`,
  amountUSD: number
): Promise<MevExposureResponse> {
  // Read pool state
  const [slot0, liquidity, fee, token0Addr, token1Addr] = await Promise.all([
    client.readContract({
      address: poolAddress,
      abi: UNISWAP_V3_POOL_ABI,
      functionName: "slot0",
    }),
    client.readContract({
      address: poolAddress,
      abi: UNISWAP_V3_POOL_ABI,
      functionName: "liquidity",
    }),
    client.readContract({
      address: poolAddress,
      abi: UNISWAP_V3_POOL_ABI,
      functionName: "fee",
    }),
    client.readContract({
      address: poolAddress,
      abi: UNISWAP_V3_POOL_ABI,
      functionName: "token0",
    }),
    client.readContract({
      address: poolAddress,
      abi: UNISWAP_V3_POOL_ABI,
      functionName: "token1",
    }),
  ]);

  // Get token symbols
  const [symbol0, symbol1] = await Promise.all([
    client
      .readContract({ address: token0Addr, abi: ERC20_ABI, functionName: "symbol" })
      .catch(() => "???"),
    client
      .readContract({ address: token1Addr, abi: ERC20_ABI, functionName: "symbol" })
      .catch(() => "???"),
  ]);

  // Estimate liquidity in USD (simplified: use sqrtPriceX96 to get price ratio)
  const sqrtPriceX96 = slot0[0];
  const price = Number((sqrtPriceX96 * sqrtPriceX96 * 10n ** 18n) / (2n ** 192n)) / 1e18;
  // Rough USD liquidity estimate: liquidity * 2 * sqrt(price) * tokenPrice
  // For a more accurate estimate we'd need token prices, but this gives order of magnitude
  const liquidityFloat = Number(liquidity);
  const roughLiquidityUSD = liquidityFloat > 0 ? (liquidityFloat * 2) / 1e6 : 0;

  // Get historical sandwich data
  const { sandwiches, totalSwaps } = await countRecentSandwiches(
    client,
    poolAddress
  );
  const sandwichRate = totalSwaps > 0 ? (sandwiches / totalSwaps) * 100 : 0;

  // Compute metrics
  const priceImpact = estimatePriceImpact(amountUSD, roughLiquidityUSD);
  const score = computeMevScore(priceImpact, sandwichRate, roughLiquidityUSD);

  // Recommended max trade: the amount where price impact stays under 0.5%
  const recommendedMax = roughLiquidityUSD * 0.01; // 1% of liquidity

  const poolName = `${symbol0}/${symbol1}`;

  return {
    pool: poolName,
    poolAddress,
    token0: { symbol: symbol0, address: token0Addr },
    token1: { symbol: symbol1, address: token1Addr },
    amountUSD,
    currentLiquidity: liquidity.toString(),
    estimatedPriceImpactPct: priceImpact,
    historicalSandwichRate: Math.round(sandwichRate * 100) / 100,
    mevRiskScore: score,
    riskLevel: riskLevel(score),
    recommendedMaxTradeUSD: Math.round(recommendedMax),
    timestamp: new Date().toISOString(),
  };
}
