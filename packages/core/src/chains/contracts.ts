import type { ChainlinkFeedConfig } from "../types/defi.js";

// Chainlink Price Feed addresses on Base mainnet
// Source: https://docs.chain.link/data-feeds/price-feeds/addresses?network=base
export const CHAINLINK_FEEDS: ChainlinkFeedConfig[] = [
  {
    pair: "ETH/USD",
    address: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",
    heartbeat: 1200, // 20 min
    decimals: 8,
    coingeckoId: "ethereum",
  },
  {
    pair: "BTC/USD",
    address: "0x64c911996D3c6aC71f9b455B1E8E7266BcbD848F",
    heartbeat: 1200,
    decimals: 8,
    coingeckoId: "bitcoin",
  },
  {
    pair: "USDC/USD",
    address: "0x7e860098F58bBFC8648a4311b374B1D669a2bc6B",
    heartbeat: 86400, // 24h
    decimals: 8,
    coingeckoId: "usd-coin",
  },
  {
    pair: "LINK/USD",
    address: "0x17CAb8FE31cA45e91fc51D547c3a39a7F0d4C4d8",
    heartbeat: 1200,
    decimals: 8,
    coingeckoId: "chainlink",
  },
  {
    pair: "AAVE/USD",
    address: "0x6Gl5R545UXkWfeAsPB0Aw4lvtQzBqFLGCvMC8wHSv0",
    heartbeat: 1200,
    decimals: 8,
    coingeckoId: "aave",
  },
  {
    pair: "COMP/USD",
    address: "0x9DDa783DE64A9d1A60c49ca761EbE528C35BA428",
    heartbeat: 1200,
    decimals: 8,
    coingeckoId: "compound-governance-token",
  },
  {
    pair: "DAI/USD",
    address: "0x591e79239a7d679378eC8c847e5038150364C78F",
    heartbeat: 86400,
    decimals: 8,
    coingeckoId: "dai",
  },
  {
    pair: "cbETH/USD",
    address: "0xd7818272B9e248357d13057AAb0B417aF31E817d",
    heartbeat: 1200,
    decimals: 8,
    coingeckoId: "coinbase-wrapped-staked-eth",
  },
];

// Chainlink Aggregator V3 ABI (only what we need)
export const CHAINLINK_AGGREGATOR_ABI = [
  {
    inputs: [],
    name: "latestRoundData",
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Base L2 Sequencer Uptime Feed
export const BASE_SEQUENCER_FEED = "0xBCF85224fc0756B9Fa45aA7892530B47e10b6433" as const;

export const SEQUENCER_UPTIME_ABI = [
  {
    inputs: [],
    name: "latestRoundData",
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" }, // 0 = up, 1 = down
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Aave V3 Pool on Base
export const AAVE_V3_POOL_BASE = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5" as const;

export const AAVE_POOL_ABI = [
  {
    inputs: [{ name: "user", type: "address" }],
    name: "getUserAccountData",
    outputs: [
      { name: "totalCollateralBase", type: "uint256" },
      { name: "totalDebtBase", type: "uint256" },
      { name: "availableBorrowsBase", type: "uint256" },
      { name: "currentLiquidationThreshold", type: "uint256" },
      { name: "ltv", type: "uint256" },
      { name: "healthFactor", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Aave V3 Pool events for position discovery
export const AAVE_POOL_EVENTS_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "reserve", type: "address" },
      { indexed: false, name: "user", type: "address" },
      { indexed: true, name: "onBehalfOf", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: true, name: "referralCode", type: "uint16" },
    ],
    name: "Supply",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "reserve", type: "address" },
      { indexed: false, name: "user", type: "address" },
      { indexed: true, name: "onBehalfOf", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "interestRateMode", type: "uint256" },
      { indexed: false, name: "borrowRate", type: "uint256" },
      { indexed: true, name: "referralCode", type: "uint16" },
    ],
    name: "Borrow",
    type: "event",
  },
] as const;

// ============================================================
// DEX Pool ABIs and Addresses (Uniswap V3 + Aerodrome on Base)
// ============================================================

// Uniswap V3 Swap event
export const UNISWAP_V3_SWAP_EVENT_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "sender", type: "address" },
      { indexed: true, name: "recipient", type: "address" },
      { indexed: false, name: "amount0", type: "int256" },
      { indexed: false, name: "amount1", type: "int256" },
      { indexed: false, name: "sqrtPriceX96", type: "uint160" },
      { indexed: false, name: "liquidity", type: "uint128" },
      { indexed: false, name: "tick", type: "int24" },
    ],
    name: "Swap",
    type: "event",
  },
] as const;

// Uniswap V3 Pool read functions
export const UNISWAP_V3_POOL_ABI = [
  {
    inputs: [],
    name: "slot0",
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "liquidity",
    outputs: [{ name: "", type: "uint128" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "fee",
    outputs: [{ name: "", type: "uint24" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "token0",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "token1",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Aerodrome V2 Pool read functions
export const AERODROME_POOL_ABI = [
  {
    inputs: [],
    name: "getReserves",
    outputs: [
      { name: "_reserve0", type: "uint256" },
      { name: "_reserve1", type: "uint256" },
      { name: "_blockTimestampLast", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "token0",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "token1",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ERC20 minimal ABI
export const ERC20_ABI = [
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Major pool addresses on Base
export const BASE_POOLS = {
  "WETH/USDC-V3-500": "0xd0b53D9277642d899DF5C87A3966A349A798F224" as const,
  "WETH/USDC-V3-3000": "0x4C36388bE6F416A29C8d8Ae5C112AB4cc73c0E16" as const,
  "WETH/USDC-AERO": "0xcDAC0d6c6C59727a65F871236188350531885C43" as const,
} as const;
