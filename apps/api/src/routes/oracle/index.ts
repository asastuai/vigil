import { Hono } from "hono";
import {
  resolveCapability,
  listCapabilities,
  buildServicePriceResponse,
  CAPABILITY_TAXONOMY,
  type AgentService,
} from "@vigil/core";
import { tryCreateSupabaseClient, queryAgentServices, upsertAgentService } from "@vigil/db";

const db = tryCreateSupabaseClient();

export function oracleRoutes() {
  const router = new Hono();

  // List available capabilities (free endpoint)
  router.get("/capabilities", (c) => {
    return c.json({
      capabilities: Object.entries(CAPABILITY_TAXONOMY).map(([name, info]) => ({
        name,
        normalizedUnit: info.normalizedUnit,
        aliases: info.aliases,
      })),
      count: listCapabilities().length,
    });
  });

  // Service Price Oracle
  // x402: $0.005 per request
  router.get("/service-price", async (c) => {
    const capabilityRaw = c.req.query("capability");

    if (!capabilityRaw) {
      return c.json(
        {
          error: "Missing required query parameter: capability",
          example: "/v1/oracle/service-price?capability=text-generation",
          available: listCapabilities(),
        },
        400
      );
    }

    const capability = resolveCapability(capabilityRaw);
    if (!capability) {
      return c.json(
        {
          error: `Unknown capability: "${capabilityRaw}"`,
          available: listCapabilities(),
          hint: "Use /v1/oracle/capabilities to see all capabilities and their aliases",
        },
        400
      );
    }

    // Query from Supabase if available
    let services: AgentService[] = [];

    if (db) {
      const { data, error } = await queryAgentServices(db, capability);
      if (!error && data) {
        services = data.map((row: Record<string, unknown>) => ({
          providerName: row.provider_name as string,
          providerUrl: row.provider_url as string | null,
          capability: row.capability as string,
          priceUSD: Number(row.price_usd),
          pricingUnit: row.pricing_unit as string,
          registrySource: row.registry_source as string,
          reputationScore: row.reputation_score as number | null,
          latencyP50Ms: row.latency_p50_ms as number | null,
          uptime30d: row.uptime_30d as number | null,
          valueScore: 0,
          lastVerified: row.last_verified as string,
        }));
      }
    }

    // Always include Vigil's own DeFi feeds as a reference if querying defi-intelligence
    if (capability === "defi-intelligence") {
      const vigilFeeds: AgentService[] = [
        {
          providerName: "Vigil",
          providerUrl: null,
          capability: "defi-intelligence",
          priceUSD: 0.001,
          pricingUnit: "per-request",
          registrySource: "self",
          reputationScore: null,
          latencyP50Ms: 500,
          uptime30d: 99.9,
          valueScore: 0,
          lastVerified: new Date().toISOString(),
        },
      ];
      // Merge without duplicating
      const existingNames = new Set(services.map((s) => s.providerName));
      for (const feed of vigilFeeds) {
        if (!existingNames.has(feed.providerName)) {
          services.push(feed);
        }
      }
    }

    const response = buildServicePriceResponse(capability, services);
    return c.json(response);
  });

  // Service comparison
  // x402: $0.005 per request
  router.get("/service-compare", async (c) => {
    const capabilityRaw = c.req.query("capability");
    const providersRaw = c.req.query("providers");

    if (!capabilityRaw || !providersRaw) {
      return c.json(
        {
          error: "Missing required query parameters: capability, providers",
          example:
            "/v1/oracle/service-compare?capability=text-generation&providers=ProviderA,ProviderB",
        },
        400
      );
    }

    const capability = resolveCapability(capabilityRaw);
    if (!capability) {
      return c.json({ error: `Unknown capability: "${capabilityRaw}"` }, 400);
    }

    const providerNames = providersRaw.split(",").map((p) => p.trim());

    let services: AgentService[] = [];
    if (db) {
      const { data } = await queryAgentServices(db, capability);
      if (data) {
        services = data
          .filter((row: Record<string, unknown>) =>
            providerNames.includes(row.provider_name as string)
          )
          .map((row: Record<string, unknown>) => ({
            providerName: row.provider_name as string,
            providerUrl: row.provider_url as string | null,
            capability: row.capability as string,
            priceUSD: Number(row.price_usd),
            pricingUnit: row.pricing_unit as string,
            registrySource: row.registry_source as string,
            reputationScore: row.reputation_score as number | null,
            latencyP50Ms: row.latency_p50_ms as number | null,
            uptime30d: row.uptime_30d as number | null,
            valueScore: 0,
            lastVerified: row.last_verified as string,
          }));
      }
    }

    const best = services.sort(
      (a, b) =>
        (b.reputationScore ?? 50) / (b.priceUSD || 1) -
        (a.reputationScore ?? 50) / (a.priceUSD || 1)
    )[0];

    return c.json({
      capability,
      providers: services,
      recommendation: best
        ? `${best.providerName} offers the best value/price ratio`
        : "No providers found for comparison",
      timestamp: new Date().toISOString(),
    });
  });

  // Self-registration endpoint (FREE — no x402 gate)
  router.post("/register", async (c) => {
    if (!db) {
      return c.json(
        { error: "Database not configured. Self-registration requires Supabase." },
        503
      );
    }

    const body = await c.req.json();
    const { providerName, providerUrl, capability, priceUSD, pricingUnit } = body;

    if (!providerName || !capability || priceUSD === undefined) {
      return c.json(
        {
          error: "Missing required fields: providerName, capability, priceUSD",
          example: {
            providerName: "My Agent Service",
            providerUrl: "https://api.example.com",
            capability: "text-generation",
            priceUSD: 0.005,
            pricingUnit: "per-request",
          },
        },
        400
      );
    }

    const resolved = resolveCapability(capability);
    if (!resolved) {
      return c.json(
        {
          error: `Unknown capability: "${capability}"`,
          available: listCapabilities(),
        },
        400
      );
    }

    const { error } = await upsertAgentService(db, {
      provider_name: providerName,
      provider_url: providerUrl ?? null,
      capability: resolved,
      price_usd: priceUSD,
      pricing_unit: pricingUnit ?? "per-request",
      registry_source: "self-registered",
      reputation_score: null,
      latency_p50_ms: null,
      uptime_30d: null,
    });

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({
      success: true,
      message: `Registered ${providerName} for ${resolved} at $${priceUSD}/${pricingUnit ?? "per-request"}`,
    });
  });

  return router;
}
