/**
 * Proof-of-Context (PoC) attestation primitive for Vigil.
 *
 * Vigil is a producer of `f_i` (input freshness) PoC commitments for DeFi
 * intelligence signals. Every paid endpoint response is wrapped with a `_poc`
 * block that carries an Ed25519 signature over (payload_hash, source_id,
 * endpoint, timestamp, freshness_horizon_seconds, freshness_type).
 *
 * Consumers verify the attestation against the operator's known public key
 * (fetched from /api/v1/poc/public-key) and refuse to settle downstream
 * computation if the data drifted past the protocol-defined horizon.
 *
 * Reference primitive: github.com/asastuai/proof-of-context-impl
 * Position paper:      github.com/asastuai/proof-of-context
 *
 * Honest scope: the operator vouches for the freshness of the signal at
 * timestamp of signing. Upstream Chainlink / Aave / Uniswap source honesty
 * is not attested by this primitive.
 */

import { signAsync, verifyAsync, getPublicKeyAsync, etc } from '@noble/ed25519';
import { sha512, sha256 } from '@noble/hashes/sha2';
import { buildAnchors } from './poc-anchors.js';

// noble/ed25519 v2.x: wire sha512 via the etc namespace.
etc.sha512Async = async (...m: Uint8Array[]) =>
  sha512(etc.concatBytes(...m));

const POC_SIGNING_KEY_HEX = process.env.POC_SIGNING_KEY ?? '';
const POC_SOURCE_ID = process.env.POC_SOURCE_ID ?? 'vigil:default';

let _publicKeyHex: string | null = null;
let _privateKeyBytes: Uint8Array | null = null;

if (POC_SIGNING_KEY_HEX && POC_SIGNING_KEY_HEX.length === 64) {
  const matches = POC_SIGNING_KEY_HEX.match(/.{1,2}/g);
  if (matches) {
    _privateKeyBytes = Uint8Array.from(matches.map((b) => parseInt(b, 16)));
  }
}

export interface PocBlock {
  version: string;
  freshness_type: 'f_c' | 'f_m' | 'f_i' | 'f_s';
  source_id: string;
  endpoint: string;
  timestamp: string;
  freshness_horizon_seconds: number;
  payload_hash: string;
  signature: string | null;
  public_key: string | null;
  anchors: {
    server_timestamp: string;
    block_height: number | null;
    drand_round: number | null;
  };
  scope_disclaimer: string;
}

export interface AttestOptions {
  endpoint: string;
  freshnessHorizonSeconds: number;
  freshnessType?: 'f_c' | 'f_m' | 'f_i' | 'f_s';
}

function utf8(str: string): Uint8Array {
  // @ts-ignore — TextEncoder is globally available in Node 18+ and browsers.
  return new TextEncoder().encode(str);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function sortKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(sortKeys) as unknown as T;
  if (value && typeof value === 'object') {
    return Object.keys(value as object)
      .sort()
      .reduce((acc, k) => {
        (acc as Record<string, unknown>)[k] = sortKeys(
          (value as Record<string, unknown>)[k]
        );
        return acc;
      }, {} as Record<string, unknown>) as unknown as T;
  }
  return value;
}

/**
 * SHA-256 of canonical JSON (sorted keys, no whitespace, RFC 8259).
 *
 * Exported because it is the canonical-hash construction tested by the
 * cross-language test vectors at github.com/asastuai/proof-of-context.
 */
export function canonicalHash(payload: unknown): string {
  return toHex(sha256(utf8(JSON.stringify(sortKeys(payload)))));
}

export async function getPublicKey(): Promise<string | null> {
  if (!_privateKeyBytes) return null;
  if (_publicKeyHex) return _publicKeyHex;
  const pk = await getPublicKeyAsync(_privateKeyBytes);
  _publicKeyHex = toHex(pk);
  return _publicKeyHex;
}

/**
 * Wrap a payload with a PoC attestation. Returns the original payload extended
 * with a `_poc` block.
 */
export async function attest<T extends Record<string, unknown>>(
  payload: T,
  opts: AttestOptions
): Promise<T & { _poc: PocBlock }> {
  const timestamp = new Date().toISOString();
  const freshnessType = opts.freshnessType ?? 'f_i';
  const payloadHash = canonicalHash(payload);

  const signingMessage = JSON.stringify({
    payload_hash: payloadHash,
    source_id: POC_SOURCE_ID,
    endpoint: opts.endpoint,
    timestamp,
    freshness_horizon_seconds: opts.freshnessHorizonSeconds,
    freshness_type: freshnessType,
  });

  let signatureHex: string | null = null;
  let publicKeyHex: string | null = null;

  if (_privateKeyBytes) {
    const sig = await signAsync(utf8(signingMessage), _privateKeyBytes);
    signatureHex = toHex(sig);
    publicKeyHex = await getPublicKey();
  }

  // Triple-anchor: best-effort fetch of block_height + drand_round when
  // POC_ENABLE_TRIPLE_ANCHOR is set. Otherwise null. See poc-anchors.ts.
  const anchors = await buildAnchors();
  anchors.server_timestamp = timestamp;

  return {
    ...payload,
    _poc: {
      version: '0.1',
      freshness_type: freshnessType,
      source_id: POC_SOURCE_ID,
      endpoint: opts.endpoint,
      timestamp,
      freshness_horizon_seconds: opts.freshnessHorizonSeconds,
      payload_hash: payloadHash,
      signature: signatureHex,
      public_key: publicKeyHex,
      anchors,
      scope_disclaimer:
        'Operator vouches for freshness at timestamp of signing. Upstream Chainlink / Aave / Uniswap source honesty is not attested.',
    },
  };
}

export interface VerifyOptions {
  expectedPublicKey?: string;
  maxAgeSeconds?: number;
  allowUnsigned?: boolean;
}

export interface PocVerdict {
  valid: boolean;
  reason: string;
  poc?: PocBlock;
  ageSeconds?: number;
}

function fromHex(hex: string): Uint8Array {
  const matches = hex.match(/.{1,2}/g);
  if (!matches) return new Uint8Array(0);
  return Uint8Array.from(matches.map((b) => parseInt(b, 16)));
}

/**
 * Verify a Vigil PoC commitment. Used by integrators that consume Vigil's
 * signals and need to gate their own settlement against freshness.
 */
export async function verify(
  attestedPayload: Record<string, unknown> & { _poc?: PocBlock },
  opts: VerifyOptions = {}
): Promise<PocVerdict> {
  if (!attestedPayload || !attestedPayload._poc) {
    return { valid: false, reason: 'missing_poc_block' };
  }

  const poc = attestedPayload._poc;

  if (!poc.signature && !opts.allowUnsigned) {
    return { valid: false, reason: 'no_signature', poc };
  }

  const ageSeconds = (Date.now() - new Date(poc.timestamp).getTime()) / 1000;
  const horizon = opts.maxAgeSeconds ?? poc.freshness_horizon_seconds;
  if (ageSeconds > horizon) {
    return {
      valid: false,
      reason: `stale: age=${ageSeconds.toFixed(1)}s, horizon=${horizon}s`,
      poc,
      ageSeconds,
    };
  }

  const { _poc: _ignored, ...rawPayload } = attestedPayload;
  const recomputed = canonicalHash(rawPayload);
  if (recomputed !== poc.payload_hash) {
    return { valid: false, reason: 'payload_hash_mismatch', poc, ageSeconds };
  }

  if (poc.signature && poc.public_key) {
    const messageBytes = utf8(
      JSON.stringify({
        payload_hash: poc.payload_hash,
        source_id: poc.source_id,
        endpoint: poc.endpoint,
        timestamp: poc.timestamp,
        freshness_horizon_seconds: poc.freshness_horizon_seconds,
        freshness_type: poc.freshness_type,
      })
    );
    try {
      const ok = await verifyAsync(
        fromHex(poc.signature),
        messageBytes,
        fromHex(poc.public_key)
      );
      if (!ok) {
        return { valid: false, reason: 'signature_invalid', poc, ageSeconds };
      }
    } catch (e) {
      return {
        valid: false,
        reason: `signature_check_failed: ${(e as Error).message}`,
        poc,
        ageSeconds,
      };
    }

    if (
      opts.expectedPublicKey &&
      poc.public_key !== opts.expectedPublicKey
    ) {
      return { valid: false, reason: 'operator_mismatch', poc, ageSeconds };
    }
  }

  return { valid: true, reason: 'ok', poc, ageSeconds };
}
