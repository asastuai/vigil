/**
 * Tests for the Vigil PoC attestation primitive.
 * Run with: tsx --test packages/core/test/*.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.POC_SIGNING_KEY =
  "5555555555555555555555555555555555555555555555555555555555555555";
process.env.POC_SOURCE_ID = "vigil:test";

const { attest, verify, getPublicKey } = await import("../src/poc.js");

test("attest emits f_i attestation for an oracle health response", async () => {
  const payload = { feed: "ETH/USD", price: 2500, staleness: 12 };
  const result = await attest(payload, {
    endpoint: "/v1/defi/oracle-health",
    freshnessHorizonSeconds: 30,
  });
  assert.equal(result._poc.freshness_type, "f_i");
  assert.equal(result._poc.source_id, "vigil:test");
  assert.ok(result._poc.signature, "signature present");
  assert.equal(result._poc.endpoint, "/v1/defi/oracle-health");
});

test("attest emits scope_disclaimer specific to Vigil's upstream sources", async () => {
  const result = await attest({ x: 1 }, {
    endpoint: "/v1/defi/mev-exposure",
    freshnessHorizonSeconds: 30,
  });
  assert.match(result._poc.scope_disclaimer, /Chainlink \/ Aave \/ Uniswap/);
});

test("verify accepts a fresh, well-signed Vigil attestation", async () => {
  const payload = { mev_score: 0.42 };
  const attested = await attest(payload, {
    endpoint: "/v1/defi/mev-exposure",
    freshnessHorizonSeconds: 30,
  });
  const result = await verify(attested);
  assert.equal(result.valid, true, `expected valid, got: ${result.reason}`);
});

test("verify rejects when payload is mutated", async () => {
  const attested = await attest({ il: 0.05 }, {
    endpoint: "/v1/defi/il-risk",
    freshnessHorizonSeconds: 60,
  });
  attested.il = 0.99;
  const result = await verify(attested);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "payload_hash_mismatch");
});

test("verify respects integrator's tighter maxAgeSeconds", async () => {
  const attested = await attest({ x: 1 }, {
    endpoint: "/v1/defi/oracle-health",
    freshnessHorizonSeconds: 60,
  });
  // Wait so the attestation is at least 1.5s old.
  await new Promise((r) => setTimeout(r, 1500));
  const result = await verify(attested, { maxAgeSeconds: 1 });
  assert.equal(result.valid, false);
  assert.match(result.reason, /^stale:/);
});

test("getPublicKey returns hex when signing key is configured", async () => {
  const pk = await getPublicKey();
  assert.ok(pk);
  assert.equal(pk!.length, 64);
});

test("verify rejects unsigned attestation by default", async () => {
  const attested = await attest({ x: 1 }, {
    endpoint: "/v1/defi/oracle-health",
    freshnessHorizonSeconds: 30,
  });
  attested._poc.signature = null;
  attested._poc.public_key = null;
  const result = await verify(attested);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "no_signature");
});
