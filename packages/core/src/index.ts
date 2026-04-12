export { createBaseClient } from "./chains/base.js";
export type { BaseClient } from "./chains/base.js";
export {
  getOracleHealth,
  getAllOracleHealth,
  getAvailableFeeds,
  fetchSpotPrices,
} from "./feeds/oracle-health.js";
export {
  getLiquidationRisk,
  discoverBorrowers,
  fetchPositions,
  simulateCascade,
} from "./feeds/liquidation.js";
export * from "./types/defi.js";
export { CHAINLINK_FEEDS } from "./chains/contracts.js";
