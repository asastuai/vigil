# Vigil

**DeFi intelligence that AI agents can actually use.**

---

Everyone's building payment rails for agents. x402 is live. AgentKit exists. Wallets, policies, settlement — all solved.

But here's the thing nobody's talking about: **agents still can't make smart DeFi decisions.** They have wallets, sure. They can pay. But they're blind. They're swapping into sandwiched pools, trusting stale oracles, and ignoring liquidation cascades that are about to wipe the floor.

Vigil fixes that.

## What is this

Vigil is a set of **hard DeFi intelligence feeds** — the kind of signals that Chaos Labs and Gauntlet compute internally for their $9B+ clients, but nobody exposes as an API.

We're not wrapping DeFiLlama. We're not reselling CoinGecko. We're computing things that don't exist anywhere else as a consumable service:

| Signal | What it tells you | Who else does this |
|--------|------------------|--------------------|
| **Oracle Health Monitor** | Is this Chainlink feed stale? Deviating from spot? Is the L2 sequencer even up? | Chaos Labs (B2B only, no public API) |
| **Liquidation Cascade Predictor** | If ETH drops 10%, how many positions liquidate? What's the cascade depth? | Gauntlet (B2B only, no public API) |
| **MEV Exposure Score** | What's the sandwich risk for this pool right now? | Nobody |
| **Real-time Sandwich Detection** | Is this pool being actively sandwiched? | Nobody |
| **Predictive IL Risk** | What's the projected impermanent loss for this pool? | Nobody |

Every endpoint is monetized via [x402](https://x402.org) — the HTTP payment protocol. No API keys. No accounts. No subscriptions. An agent just pays per-request in USDC on Base and gets the data. That's it.

## Why this matters

McKinsey projects $3-5 trillion in agentic commerce by 2030. The payment infrastructure is ready (140M+ x402 transactions processed). But agents operating in DeFi are flying blind:

- **$289M lost to sandwich attacks in 2025** — agents are ideal targets because their patterns are predictable
- **$45M in agent-specific security incidents in 2026** — most from bad data, not bad code
- **An agent sent $250K to a random Twitter account** because it had no risk intelligence layer

The data agents need to make safe DeFi decisions doesn't exist as a service. We're building it.

## Quick Start

```bash
git clone https://github.com/asastuai/vigil.git
cd vigil
pnpm install
pnpm dev --filter @vigil/api
```

Server starts on `http://localhost:3402`. Hit it:

```bash
# What feeds are available?
curl http://localhost:3402/v1/defi/feeds

# Is the ETH/USD oracle healthy?
curl "http://localhost:3402/v1/defi/oracle-health?pair=ETH/USD"

# What happens if ETH drops 20%?
curl "http://localhost:3402/v1/defi/liquidation-risk?protocol=aave-v3&asset=ETH&priceDropPct=20"
```

### Example Response — Oracle Health

```json
{
  "feed": "ETH/USD",
  "feedAddress": "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",
  "chainlinkPrice": 2213.24,
  "spotPrice": 2212.93,
  "deviationPct": 0.014,
  "lastUpdate": "2026-04-12T04:41:11.000Z",
  "staleness": 110,
  "heartbeat": 1200,
  "stalenessRatio": 0.0917,
  "status": "healthy",
  "sequencerUp": true
}
```

### Example Response — Liquidation Risk

```json
{
  "protocol": "aave-v3",
  "chain": "base",
  "asset": "ETH",
  "currentPrice": 2213.42,
  "simulatedPrice": 1549.39,
  "priceDropPct": 30,
  "atRiskPositions": 142,
  "totalCollateralAtRisk": 12500000,
  "estimatedLiquidationVolume": 8200000,
  "cascadeDepth": 3,
  "cascadeRounds": [
    { "round": 1, "liquidations": 89, "volume": 5100000, "priceImpact": -2.1 },
    { "round": 2, "liquidations": 38, "volume": 2400000, "priceImpact": -1.3 },
    { "round": 3, "liquidations": 15, "volume": 700000, "priceImpact": -0.4 }
  ],
  "timestamp": "2026-04-12T04:52:09.026Z"
}
```

## How x402 Payments Work

When you deploy with a payee address, endpoints are gated by the x402 protocol:

```
Agent → GET /v1/defi/oracle-health?pair=ETH/USD
Server → 402 Payment Required (price: $0.001 USDC on Base)
Agent → signs USDC authorization with its wallet
Agent → retries request with payment proof
Server → returns data
```

No API key. No OAuth. No account creation. The agent pays and gets the data. Total time: ~3 seconds.

```bash
# Enable x402 paywall
X402_PAYEE_ADDRESS=0xYourWallet X402_FACILITATOR_URL=https://facilitator.x402.org pnpm dev --filter @vigil/api
```

### Pricing

| Endpoint | Price |
|----------|-------|
| Oracle Health (single feed) | $0.001 |
| Oracle Health (all feeds) | $0.005 |
| Liquidation Cascade Simulation | $0.01 |
| MEV Exposure Score | $0.005 |
| Sandwich Activity | $0.005 |
| IL Risk Prediction | $0.01 |

## Architecture

```
vigil/
├── apps/
│   ├── api/            ← Hono server + x402 paywall (the product)
│   └── mcp/            ← MCP server for Claude/GPT agents (Phase 2)
├── packages/
│   ├── core/           ← Business logic: feeds, chains, types
│   │   ├── feeds/      ← oracle-health, liquidation, mev, sandwich, il-risk
│   │   ├── chains/     ← viem clients, contract ABIs, addresses
│   │   └── types/      ← TypeScript types
│   ├── db/             ← Supabase client + schema
│   └── workers/        ← Background data pipelines
```

**Stack**: TypeScript, Hono, viem, x402, Supabase, Turborepo

**Chain**: Base (primary), reads Chainlink oracles and Aave V3 positions on-chain via multicall.

## What's Live

- [x] Oracle Health Monitor — 8 Chainlink feeds on Base, live deviation + staleness tracking
- [x] Liquidation Cascade Predictor — Aave V3 position indexing + cascade simulation
- [x] x402 paywall middleware — pay-per-request USDC on Base

## What's Coming

- [ ] MEV Exposure Score — per-pool sandwich risk scoring from on-chain swap analysis
- [ ] Real-time Sandwich Detection — block-level frontrun-victim-backrun pattern detection
- [ ] Predictive IL Risk — statistical volatility models for impermanent loss prediction
- [ ] MCP Server — expose all feeds as MCP tools for AI agent frameworks
- [ ] Agent Service Price Oracle — cross-registry price comparison for agent services (the one gap nobody is building)
- [ ] Background workers — continuous Chainlink polling + Aave position indexing
- [ ] Multi-chain — Ethereum, Arbitrum, Optimism

## The Bigger Picture

Vigil isn't just a DeFi data API. It's the first piece of something larger.

**Phase 1** (now): DeFi intelligence feeds that agents pay for. Prove the model works.

**Phase 2**: MCP server so any AI agent (Claude, GPT, LangChain, CrewAI) can consume these feeds natively.

**Phase 3**: Agent Service Price Oracle — the one genuinely empty gap in the entire agentic ecosystem. No protocol (ERC-8004, x402, UCP, HOL, Fetch.ai) offers machine-readable price comparison between equivalent agent services. We're building the Chainlink of service pricing.

**Phase 4**: Multi-chain expansion + real-time WebSocket feeds + alert subscriptions.

## Environment Variables

```env
# Base RPC (defaults to public endpoint, use Alchemy/QuickNode for production)
BASE_RPC_URL=https://mainnet.base.org

# Server port
PORT=3402

# x402 — set these to enable paid endpoints
X402_PAYEE_ADDRESS=0xYourUSDCReceivingWalletOnBase
X402_FACILITATOR_URL=https://facilitator.x402.org
```

## Contributing

This is early. If you're building AI agents that interact with DeFi and you're tired of flying blind — open an issue, share what signals you need. We're building what the ecosystem actually lacks, not another wrapper around existing APIs.

## License

MIT

---

Built by [@asastuai](https://github.com/asastuai) because agents deserve better data.
