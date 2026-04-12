import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

export function createBaseClient(rpcUrl?: string) {
  return createPublicClient({
    chain: base,
    transport: http(rpcUrl),
    batch: {
      multicall: true,
    },
  });
}

export type BaseClient = ReturnType<typeof createBaseClient>;
