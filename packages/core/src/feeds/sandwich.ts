import type { BaseClient } from "../chains/base.js";
import { parseAbiItem } from "viem";

export interface SandwichBot {
  address: string;
  attackCount: number;
  totalVictimLossUSD: number;
  lastSeen: string;
}

export interface SandwichActivityResponse {
  pool: string;
  poolAddress: string;
  timeframeBlocks: number;
  timeframeApproxHours: number;
  totalSwaps: number;
  detectedSandwiches: number;
  sandwichRatePct: number;
  threatLevel: "none" | "low" | "moderate" | "high" | "extreme";
  activeBots: SandwichBot[];
  averageVictimLossUSD: number;
  timestamp: string;
}

interface SwapLog {
  sender: string;
  recipient: string;
  amount0: bigint;
  amount1: bigint;
  blockNumber: bigint;
  transactionIndex: number;
  transactionHash: string;
}

/**
 * Detect sandwich attacks in swap events for a given pool.
 *
 * Sandwich pattern (within same block):
 * 1. Bot swaps token A → B (frontrun)
 * 2. Victim swaps token A → B (same direction, higher price)
 * 3. Bot swaps token B → A (backrun, profit from price movement)
 *
 * Detection heuristic: same sender address bracketing a different
 * sender's swap, with opposite-direction swaps, in the same block.
 */
export async function getSandwichActivity(
  client: BaseClient,
  poolAddress: `0x${string}`,
  lookbackBlocks = 5_000n
): Promise<SandwichActivityResponse> {
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
      fromBlock: fromBlock > 0n ? fromBlock : 0n,
      toBlock: currentBlock,
    });
  } catch {
    try {
      allLogs = await client.getLogs({
        address: poolAddress,
        event: swapEvent,
        fromBlock: currentBlock - 2_000n,
        toBlock: currentBlock,
      });
    } catch {
      return {
        pool: poolAddress,
        poolAddress,
        timeframeBlocks: Number(lookbackBlocks),
        timeframeApproxHours: Math.round((Number(lookbackBlocks) * 2) / 3600),
        totalSwaps: 0,
        detectedSandwiches: 0,
        sandwichRatePct: 0,
        threatLevel: "none",
        activeBots: [],
        averageVictimLossUSD: 0,
        timestamp: new Date().toISOString(),
      };
    }
  }

  const totalSwaps = allLogs.length;
  if (totalSwaps === 0) {
    return {
      pool: poolAddress,
      poolAddress,
      timeframeBlocks: Number(lookbackBlocks),
      timeframeApproxHours: Math.round((Number(lookbackBlocks) * 2) / 3600),
      totalSwaps: 0,
      detectedSandwiches: 0,
      sandwichRatePct: 0,
      threatLevel: "none",
      activeBots: [],
      averageVictimLossUSD: 0,
      timestamp: new Date().toISOString(),
    };
  }

  // Parse logs into structured swaps
  const swaps: SwapLog[] = allLogs.map((log) => ({
    sender: log.args.sender!,
    recipient: log.args.recipient!,
    amount0: log.args.amount0!,
    amount1: log.args.amount1!,
    blockNumber: log.blockNumber,
    transactionIndex: log.transactionIndex ?? 0,
    transactionHash: log.transactionHash,
  }));

  // Group by block
  const blockMap = new Map<bigint, SwapLog[]>();
  for (const swap of swaps) {
    if (!blockMap.has(swap.blockNumber)) blockMap.set(swap.blockNumber, []);
    blockMap.get(swap.blockNumber)!.push(swap);
  }

  // Detect sandwiches
  const botStats = new Map<string, { count: number; blocks: Set<bigint> }>();
  let totalSandwiches = 0;

  for (const [blockNum, blockSwaps] of blockMap) {
    if (blockSwaps.length < 3) continue;
    blockSwaps.sort((a, b) => a.transactionIndex - b.transactionIndex);

    const detected = new Set<number>(); // tx indices already matched

    for (let i = 0; i < blockSwaps.length - 2; i++) {
      if (detected.has(i)) continue;
      const frontrun = blockSwaps[i];

      for (let j = i + 1; j < blockSwaps.length - 1; j++) {
        if (detected.has(j)) continue;
        const victim = blockSwaps[j];
        if (victim.sender === frontrun.sender) continue; // same sender, not a victim

        for (let k = j + 1; k < blockSwaps.length; k++) {
          if (detected.has(k)) continue;
          const backrun = blockSwaps[k];

          // Backrun must be from the same address as frontrun
          if (backrun.sender !== frontrun.sender) continue;

          // Opposite direction check
          const frontrunDirection = frontrun.amount0 > 0n ? "buy" : "sell";
          const backrunDirection = backrun.amount0 > 0n ? "buy" : "sell";

          if (frontrunDirection !== backrunDirection) {
            totalSandwiches++;
            detected.add(i);
            detected.add(j);
            detected.add(k);

            // Track bot
            const bot = frontrun.sender;
            if (!botStats.has(bot)) {
              botStats.set(bot, { count: 0, blocks: new Set() });
            }
            const stats = botStats.get(bot)!;
            stats.count++;
            stats.blocks.add(blockNum);
            break;
          }
        }
        break; // one victim per frontrun candidate
      }
    }
  }

  const sandwichRate = totalSwaps > 0 ? (totalSandwiches / totalSwaps) * 100 : 0;

  // Build bot list
  const activeBots: SandwichBot[] = Array.from(botStats.entries())
    .map(([address, stats]) => ({
      address,
      attackCount: stats.count,
      totalVictimLossUSD: 0, // Would need price data to compute
      lastSeen: new Date().toISOString(),
    }))
    .sort((a, b) => b.attackCount - a.attackCount)
    .slice(0, 10);

  // Threat level
  let threatLevel: SandwichActivityResponse["threatLevel"];
  if (totalSandwiches === 0) threatLevel = "none";
  else if (sandwichRate < 1) threatLevel = "low";
  else if (sandwichRate < 3) threatLevel = "moderate";
  else if (sandwichRate < 7) threatLevel = "high";
  else threatLevel = "extreme";

  const blocksScanned = Math.min(Number(lookbackBlocks), Number(currentBlock - fromBlock));

  return {
    pool: poolAddress,
    poolAddress,
    timeframeBlocks: blocksScanned,
    timeframeApproxHours: Math.round((blocksScanned * 2) / 3600),
    totalSwaps,
    detectedSandwiches: totalSandwiches,
    sandwichRatePct: Math.round(sandwichRate * 100) / 100,
    threatLevel,
    activeBots,
    averageVictimLossUSD: 0, // Requires price context to compute
    timestamp: new Date().toISOString(),
  };
}
