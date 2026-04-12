export interface OracleHealthResponse {
  feed: string;
  feedAddress: string;
  chainlinkPrice: number;
  spotPrice: number;
  deviationPct: number;
  lastUpdate: string;
  staleness: number;
  heartbeat: number;
  stalenessRatio: number;
  status: "healthy" | "stale" | "deviating" | "critical";
  sequencerUp: boolean;
}

export interface ChainlinkFeedConfig {
  pair: string;
  address: `0x${string}`;
  heartbeat: number; // seconds
  decimals: number;
  coingeckoId: string; // for spot price comparison
}

export interface LiquidationRiskResponse {
  protocol: string;
  chain: string;
  asset: string;
  currentPrice: number;
  simulatedPrice: number;
  priceDropPct: number;
  atRiskPositions: number;
  totalCollateralAtRisk: number;
  estimatedLiquidationVolume: number;
  cascadeDepth: number;
  cascadeRounds: CascadeRound[];
  timestamp: string;
}

export interface CascadeRound {
  round: number;
  liquidations: number;
  volume: number;
  priceImpact: number;
}

export interface LendingPosition {
  address: `0x${string}`;
  protocol: string;
  totalCollateralUsd: number;
  totalDebtUsd: number;
  healthFactor: number;
  lastUpdated: string;
}
