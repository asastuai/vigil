-- Vigil Database Schema
-- Run this in Supabase SQL Editor to initialize the database

-- Oracle feed configurations
CREATE TABLE IF NOT EXISTS oracle_feeds (
  id SERIAL PRIMARY KEY,
  pair TEXT NOT NULL UNIQUE,
  address TEXT NOT NULL,
  heartbeat INTEGER NOT NULL,
  decimals INTEGER NOT NULL,
  coingecko_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Oracle health snapshots (time-series)
CREATE TABLE IF NOT EXISTS oracle_snapshots (
  id BIGSERIAL PRIMARY KEY,
  feed_id INTEGER REFERENCES oracle_feeds(id),
  pair TEXT NOT NULL,
  chainlink_price NUMERIC NOT NULL,
  spot_price NUMERIC NOT NULL,
  deviation_pct NUMERIC NOT NULL,
  staleness INTEGER NOT NULL,
  staleness_ratio NUMERIC NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('healthy', 'stale', 'deviating', 'critical')),
  sequencer_up BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for time-series queries
CREATE INDEX IF NOT EXISTS idx_oracle_snapshots_pair_time ON oracle_snapshots(pair, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oracle_snapshots_status ON oracle_snapshots(status) WHERE status != 'healthy';

-- Lending positions (Aave V3)
CREATE TABLE IF NOT EXISTS lending_positions (
  id BIGSERIAL PRIMARY KEY,
  address TEXT NOT NULL,
  protocol TEXT NOT NULL DEFAULT 'aave-v3',
  total_collateral_usd NUMERIC NOT NULL,
  total_debt_usd NUMERIC NOT NULL,
  health_factor NUMERIC NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(address, protocol)
);

-- Index for liquidation queries (low health factor first)
CREATE INDEX IF NOT EXISTS idx_positions_health ON lending_positions(health_factor ASC) WHERE total_debt_usd > 0;

-- Pool snapshots for IL risk tracking
CREATE TABLE IF NOT EXISTS pool_snapshots (
  id BIGSERIAL PRIMARY KEY,
  pool_address TEXT NOT NULL,
  sqrt_price_x96 TEXT NOT NULL,
  liquidity TEXT NOT NULL,
  tick INTEGER,
  reserve0 TEXT,
  reserve1 TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pool_snapshots_pool_time ON pool_snapshots(pool_address, created_at DESC);

-- Sandwich detection cache
CREATE TABLE IF NOT EXISTS sandwich_events (
  id BIGSERIAL PRIMARY KEY,
  pool_address TEXT NOT NULL,
  block_number BIGINT NOT NULL,
  frontrun_tx TEXT NOT NULL,
  victim_tx TEXT NOT NULL,
  backrun_tx TEXT NOT NULL,
  bot_address TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sandwich_pool_block ON sandwich_events(pool_address, block_number DESC);
CREATE INDEX IF NOT EXISTS idx_sandwich_bot ON sandwich_events(bot_address);

-- Agent service pricing (Phase 3 - Price Oracle)
CREATE TABLE IF NOT EXISTS agent_services (
  id BIGSERIAL PRIMARY KEY,
  provider_name TEXT NOT NULL,
  provider_url TEXT,
  capability TEXT NOT NULL,
  price_usd NUMERIC NOT NULL,
  pricing_unit TEXT NOT NULL DEFAULT 'per-request',
  registry_source TEXT NOT NULL, -- 'x402', 'smithery', 'hol', 'self-registered'
  reputation_score INTEGER,
  latency_p50_ms INTEGER,
  uptime_30d NUMERIC,
  last_verified TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider_name, capability)
);

CREATE INDEX IF NOT EXISTS idx_services_capability ON agent_services(capability);
CREATE INDEX IF NOT EXISTS idx_services_price ON agent_services(capability, price_usd ASC);

-- x402 payment receipts
CREATE TABLE IF NOT EXISTS x402_receipts (
  id BIGSERIAL PRIMARY KEY,
  endpoint TEXT NOT NULL,
  amount_usd NUMERIC NOT NULL,
  payer_address TEXT,
  tx_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_receipts_time ON x402_receipts(created_at DESC);
