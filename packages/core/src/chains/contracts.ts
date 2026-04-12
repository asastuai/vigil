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
