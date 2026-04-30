<div align="center">

# Vigil

### DeFi intelligence that AI agents can actually use. Hard signals, x402-monetized, every response carries a PoC `f_i` attestation.

[![Base L2](https://img.shields.io/badge/Base-L2-0052FF.svg)](https://base.org)
[![x402](https://img.shields.io/badge/payments-x402-brightgreen.svg)](https://www.x402.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

*Part of [**Aletheia**](https://github.com/asastuai/aletheia). Full stack for the agentic economics.*

</div>

---

## What it is

Everyone is building payment rails for agents. x402 is live. AgentKit exists. Wallets, policies, settlement, all solved.

Here is the thing nobody is solving: agents still cannot make smart DeFi decisions. They have wallets. They can pay. But they are blind. They are swapping into sandwiched pools, trusting stale oracles, and ignoring liquidation cascades that are about to wipe the floor.

Vigil is a set of hard DeFi intelligence feeds. The kind of signals that Chaos Labs and Gauntlet compute internally for their $9B+ clients but nobody exposes as an API. Each response carries a Proof-of-Context attestation typed as input freshness (`f_i`). A consumer that integrates the attestation can refuse to settle downstream computation if the signal drifted past the protocol-defined horizon.

| Signal | What it tells you | Who else does this |
|---|---|---|
| **Oracle Health Monitor** | Is this Chainlink feed stale? Deviating from spot? Is the L2 sequencer up? | Chaos Labs (B2B only, no public API) |
| **Liquidation Cascade Predictor** | If ETH drops 10%, how many positions liquidate? What is the cascade depth? | Gauntlet (B2B only, no public API) |
| **MEV Exposure Score** | What is the sandwich risk for this pool right now? | Nobody |
| **Real-time Sandwich Detection** | Is this pool being actively sandwiched? | Nobody |
| **Predictive IL Risk** | What is the projected impermanent loss for this pool? | Nobody |

Every endpoint is monetized via x402. No API keys. No accounts. No subscriptions. The agent pays per request in USDC on Base and gets the data plus the PoC attestation.

---

## How it ties into Proof-of-Context

PoC is a verification primitive that binds attestations to a freshness horizon and gates settlement against it. Vigil is a producer of `f_i`-typed PoC commitments for risk and MEV signals.

Two concrete surfaces.

**1. Risk signals are PoC-attested.** When an agent queries `/v1/defi/oracle-health?pair=ETH/USD`, the response includes the staleness data plus an attestation: `(measurement_block, source_id, sequencer_status, signature)`. The consumer can verify the attestation chain and check whether the signal is within their freshness horizon.

**2. MEV exposure scores carry timing context.** A sandwich-risk score from 30 seconds ago and one from 2 seconds ago are not the same signal economically. The PoC commitment makes that timing explicit. The consumer's downstream settlement gate refuses to clear if the signal aged past horizon.

The economic stakes for `f_i` on risk signals are high. $289M lost to sandwich attacks in 2025. $45M in agent-specific security incidents in 2026. Most from bad data, not bad code. Stale risk signal = silent value leakage.

---

## Why this matters

Agents operating in DeFi are flying blind.

- $289M lost to sandwich attacks in 2025. Agents are ideal targets because their patterns are predictable.
- $45M in agent-specific security incidents in 2026. Most from bad data, not bad code.
- An agent sent $250K to a random Twitter account because it had no risk intelligence layer.

The data agents need to make safe DeFi decisions does not exist as a service. Vigil exists to close that gap, with PoC-attested freshness so the consumer can refuse to settle on stale risk.

---

## Quick start

```bash
git clone https://github.com/asastuai/vigil.git
cd vigil
pnpm install
pnpm dev --filter @vigil/api
```

Server starts on `http://localhost:3402`.

```bash
# What feeds are available?
curl http://localhost:3402/v1/defi/feeds

# Is the ETH/USD oracle healthy?
curl "http://localhost:3402/v1/defi/oracle-health?pair=ETH/USD"

# What happens if ETH drops 20%?
curl "http://localhost:3402/v1/defi/liquidation-risk?protocol=aave-v3&asset=ETH&priceDropPct=20"

# What is the MEV risk for a $50K swap on this pool?
curl "http://localhost:3402/v1/defi/mev-exposure?pool=0xd0b53D9277642d899DF5C87A3966A349A798F224&amountUSD=50000"

# Is this pool being sandwiched?
curl "http://localhost:3402/v1/defi/sandwich-activity?pool=0xd0b53D9277642d899DF5C87A3966A349A798F224"

# Predicted impermanent loss?
curl "http://localhost:3402/v1/defi/il-risk?pool=0xd0b53D9277642d899DF5C87A3966A349A798F224&timeframeHours=24"
```

---

## How x402 payments work

When deployed with a payee address, endpoints are gated by the x402 protocol.

```
Agent → GET /v1/defi/oracle-health?pair=ETH/USD
Server → 402 Payment Required (price: $0.001 USDC on Base)
Agent → signs USDC authorization with its wallet
Agent → retries request with payment proof
Server → returns data + PoC f_i attestation
```

No API key. No OAuth. No account creation. Total time: ~3 seconds.

```bash
# Enable x402 paywall
X402_PAYEE_ADDRESS=0xYourWallet \
X402_FACILITATOR_URL=https://facilitator.x402.org \
pnpm dev --filter @vigil/api
```

---

## Pricing

| Endpoint | Price | PoC type |
|---|---|---|
| Oracle Health (single feed) | $0.001 | `f_i` attested |
| Oracle Health (all feeds) | $0.005 | `f_i` attested |
| Liquidation Cascade Simulation | $0.01 | `f_i` attested |
| MEV Exposure Score | $0.005 | `f_i` attested |
| Sandwich Activity | $0.005 | `f_i` attested |
| IL Risk Prediction | $0.01 | `f_i` attested |

---

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

Stack. TypeScript, Hono, viem, x402, Supabase, Turborepo.

Chain. Base (primary). Reads Chainlink oracles and Aave V3 positions on-chain via multicall.

---

## Tests

```bash
cd packages/core && pnpm test
```

7 PoC primitive tests passing. Coverage: `f_i` attestation emission, scope_disclaimer validation, fresh signature acceptance, payload tampering rejection, integrator-tighter horizon override, public key derivation, unsigned attestation rejection.

---

## Generating a PoC signing key

```bash
node -e "import('crypto').then(({randomBytes}) => console.log(randomBytes(32).toString('hex')))"
```

Set as `POC_SIGNING_KEY` in `.env`. Publish the public key (returned by `GET /v1/poc/public-key`) so consumers can verify Vigil attestations against your operator identity.

If `POC_SIGNING_KEY` is unset, attestations are returned without signatures (still informational, but not cryptographically bound).

---

## Status

| What runs | What is missing |
|---|---|
| 5 risk feeds live (Oracle Health, Liquidation Cascade, MEV Exposure, Sandwich Detection, IL Risk). x402 paywall middleware working. Indexed on Base. **All 6 paid endpoints emit Ed25519-signed PoC `f_i` attestations.** 7 tests passing in core package. `/v1/poc/public-key` published. | Triple-anchor `block_height` + `drand_round` wiring. MCP server (Phase 2). Multi-chain expansion. Real-time WebSocket feeds. |

---

## What is coming

- MCP Server. Expose all feeds as MCP tools for AI agent frameworks.
- Agent Service Price Oracle. Cross-registry price comparison for agent services. The one gap nobody is building.
- Background workers. Continuous Chainlink polling + Aave position indexing.
- Multi-chain. Ethereum, Arbitrum, Optimism.

---

## Part of Aletheia

Vigil is a data layer of [Aletheia](https://github.com/asastuai/aletheia). Five sibling repos compose the rest of the stack.

- [**Proof-of-Context**](https://github.com/asastuai/proof-of-context) — verification spine. The primitive that types Vigil's response attestations.
- [**SUR Protocol**](https://github.com/asastuai/sur-protocol) — perp DEX. Consumer of Vigil signals for agent trading risk decisions.
- [**TrustLayer**](https://github.com/asastuai/TrustLayer) — agent reputation. Aggregates PoC commitments from Vigil queries into reputation history.
- [**PayClaw**](https://github.com/asastuai/payclaw) — agent wallet. Holds the USDC an agent spends on Vigil queries.
- [**BaseOracle**](https://github.com/asastuai/BaseOracle) — pay-per-query market data. Sibling data layer for price and trend signals.

---

## Environment variables

```env
# Base RPC (defaults to public endpoint, use Alchemy/QuickNode for production)
BASE_RPC_URL=https://mainnet.base.org

# Server port
PORT=3402

# x402 — enable paid endpoints
X402_PAYEE_ADDRESS=0xYourUSDCReceivingWalletOnBase
X402_FACILITATOR_URL=https://facilitator.x402.org
```

---

## License

MIT. See [LICENSE](LICENSE).

---

Built by [Juan Cruz Maisu](https://github.com/asastuai). Buenos Aires, Argentina.
