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
export { getMevExposure } from "./feeds/mev-exposure.js";
export type { MevExposureResponse } from "./feeds/mev-exposure.js";
export { getSandwichActivity } from "./feeds/sandwich.js";
export type { SandwichActivityResponse } from "./feeds/sandwich.js";
export { getIlRisk } from "./feeds/il-risk.js";
export type { IlRiskResponse } from "./feeds/il-risk.js";
export * from "./types/defi.js";
export { CHAINLINK_FEEDS, BASE_POOLS } from "./chains/contracts.js";
export {
  buildServicePriceResponse,
  computeValueScore,
  resolveCapability,
  listCapabilities,
  scanX402Endpoint,
  CAPABILITY_TAXONOMY,
} from "./oracle/price-oracle.js";
export type {
  AgentService,
  ServicePriceResponse,
  ServiceCompareResponse,
} from "./oracle/price-oracle.js";

// Proof-of-Context attestation primitive.
// Part of the Aletheia stack: github.com/asastuai/aletheia
export { attest, verify, getPublicKey } from "./poc.js";
export type {
  PocBlock,
  AttestOptions,
  VerifyOptions,
  PocVerdict,
} from "./poc.js";
