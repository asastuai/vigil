/**
 * Agent Service Price Oracle
 *
 * The one genuinely empty gap in the entire agentic ecosystem.
 * No protocol (ERC-8004, x402, UCP, HOL, Fetch.ai) offers
 * machine-readable price comparison between equivalent agent services.
 *
 * This module:
 * 1. Scans x402-enabled endpoints to discover pricing
 * 2. Normalizes pricing across different models (per-request, per-token, etc.)
 * 3. Combines price with reputation data to compute "value scores"
 * 4. Serves it as an API that agents can query before paying for services
 */

export interface AgentService {
  providerName: string;
  providerUrl: string | null;
  capability: string;
  priceUSD: number;
  pricingUnit: string;
  registrySource: string;
  reputationScore: number | null;
  latencyP50Ms: number | null;
  uptime30d: number | null;
  valueScore: number; // composite score (0-100)
  lastVerified: string;
}

export interface ServicePriceResponse {
  capability: string;
  normalizedUnit: string;
  providers: AgentService[];
  stats: {
    count: number;
    medianPrice: number;
    cheapest: string;
    bestValue: string;
  };
  timestamp: string;
}

export interface ServiceCompareResponse {
  capability: string;
  providers: AgentService[];
  recommendation: string;
  timestamp: string;
}

// Canonical capability taxonomy
export const CAPABILITY_TAXONOMY: Record<string, { normalizedUnit: string; aliases: string[] }> = {
  "text-generation": {
    normalizedUnit: "per-1k-tokens",
    aliases: ["text-gen", "llm", "chat", "completion", "generate-text"],
  },
  "image-generation": {
    normalizedUnit: "per-image",
    aliases: ["text-to-image", "generate-image", "img-gen", "dalle", "stable-diffusion"],
  },
  "code-generation": {
    normalizedUnit: "per-request",
    aliases: ["code-gen", "code-completion", "codegen"],
  },
  "text-summarization": {
    normalizedUnit: "per-1k-tokens",
    aliases: ["summarize", "summary", "tldr"],
  },
  "translation": {
    normalizedUnit: "per-1k-chars",
    aliases: ["translate", "text-translation"],
  },
  "web-search": {
    normalizedUnit: "per-query",
    aliases: ["search", "web-query", "internet-search"],
  },
  "data-retrieval": {
    normalizedUnit: "per-request",
    aliases: ["data-fetch", "api-call", "data-query"],
  },
  "code-review": {
    normalizedUnit: "per-request",
    aliases: ["review-code", "code-analysis"],
  },
  "defi-intelligence": {
    normalizedUnit: "per-request",
    aliases: ["defi-data", "defi-analytics", "chain-data", "on-chain-data"],
  },
  "embedding": {
    normalizedUnit: "per-1k-tokens",
    aliases: ["embeddings", "text-embedding", "vector-embedding"],
  },
};

/**
 * Resolve a capability string to its canonical form.
 */
export function resolveCapability(input: string): string | null {
  const lower = input.toLowerCase().trim();

  // Direct match
  if (CAPABILITY_TAXONOMY[lower]) return lower;

  // Alias match
  for (const [canonical, { aliases }] of Object.entries(CAPABILITY_TAXONOMY)) {
    if (aliases.includes(lower)) return canonical;
  }

  return null;
}

/**
 * Compute a value score (0-100) based on price, reputation, and reliability.
 */
export function computeValueScore(service: {
  priceUSD: number;
  medianPrice: number;
  reputationScore: number | null;
  uptime30d: number | null;
  latencyP50Ms: number | null;
}): number {
  // Price component (0-40): lower price = higher score
  const priceRatio = service.medianPrice > 0 ? service.priceUSD / service.medianPrice : 1;
  const priceScore = Math.max(0, Math.min(40, 40 * (2 - priceRatio)));

  // Reputation component (0-35)
  const repScore = service.reputationScore
    ? (service.reputationScore / 100) * 35
    : 17.5; // neutral if unknown

  // Reliability component (0-25)
  const uptimeScore = service.uptime30d
    ? (service.uptime30d / 100) * 15
    : 7.5;
  const latencyScore = service.latencyP50Ms
    ? Math.max(0, 10 - (service.latencyP50Ms / 5000) * 10)
    : 5;

  return Math.round(Math.min(priceScore + repScore + uptimeScore + latencyScore, 100));
}

/**
 * Build service price response from a list of services.
 */
export function buildServicePriceResponse(
  capability: string,
  services: AgentService[]
): ServicePriceResponse {
  const taxonomy = CAPABILITY_TAXONOMY[capability];
  const normalizedUnit = taxonomy?.normalizedUnit ?? "per-request";

  // Sort by price
  const sorted = [...services].sort((a, b) => a.priceUSD - b.priceUSD);

  // Stats
  const prices = sorted.map((s) => s.priceUSD);
  const medianPrice =
    prices.length > 0
      ? prices[Math.floor(prices.length / 2)]
      : 0;

  // Compute value scores
  const withScores = sorted.map((s) => ({
    ...s,
    valueScore: computeValueScore({
      priceUSD: s.priceUSD,
      medianPrice,
      reputationScore: s.reputationScore,
      uptime30d: s.uptime30d,
      latencyP50Ms: s.latencyP50Ms,
    }),
  }));

  const cheapest = withScores[0]?.providerName ?? "none";
  const bestValue =
    [...withScores].sort((a, b) => b.valueScore - a.valueScore)[0]?.providerName ?? "none";

  return {
    capability,
    normalizedUnit,
    providers: withScores,
    stats: {
      count: withScores.length,
      medianPrice,
      cheapest,
      bestValue,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * List all known capabilities in the taxonomy.
 */
export function listCapabilities(): string[] {
  return Object.keys(CAPABILITY_TAXONOMY);
}

/**
 * Scan a x402-enabled URL and extract pricing from the 402 response.
 * Returns null if the endpoint doesn't return a 402 or can't be parsed.
 */
export async function scanX402Endpoint(
  url: string
): Promise<{ price: string; network: string; payTo: string } | null> {
  try {
    const res = await fetch(url, { method: "GET" });

    if (res.status !== 402) return null;

    // x402 pricing info is in the response headers or body
    const paymentRequired = res.headers.get("x-payment") || res.headers.get("payment-required");
    if (!paymentRequired) {
      // Try parsing the body
      const body = await res.json().catch(() => null);
      if (body && typeof body === "object" && "price" in body) {
        return {
          price: String(body.price),
          network: String((body as Record<string, unknown>).network ?? "unknown"),
          payTo: String((body as Record<string, unknown>).payTo ?? "unknown"),
        };
      }
      return null;
    }

    // Parse base64 payment requirements header
    try {
      const decoded = JSON.parse(atob(paymentRequired));
      return {
        price: String(decoded.price ?? decoded.maxAmountRequired ?? "unknown"),
        network: String(decoded.network ?? "unknown"),
        payTo: String(decoded.payTo ?? "unknown"),
      };
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}
