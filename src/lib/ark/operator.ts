import "server-only";

import { RestArkProvider, networks } from "@arkade-os/sdk";
import { ARK_SERVER_URL } from "@/lib/ark";

export type ArkOperatorConfig = {
  /** Arkade operator pubkey, 33-byte compressed hex (getInfo().signerPubkey). */
  serverPubkey: string;
  /** Bech32 human-readable prefix matching the operator network. */
  hrp: string;
  /** Operator's CSV exit delay (raw getInfo().unilateralExitDelay value), used for escrow exit paths. */
  unilateralExitDelay: bigint;
  /** Operator's dust threshold (getInfo().dust): the minimum value a settlement output may carry. */
  dust: bigint;
};

/** Cache TTL for the operator config. The pubkey is stable, but `unilateralExitDelay` and other
 * `getInfo` fields can change if the operator updates its session config, so we re-fetch periodically
 * instead of caching for the whole process lifetime. */
const CONFIG_TTL_MS = 10 * 60 * 1000;
let cached: { config: ArkOperatorConfig; fetchedAt: number } | null = null;

/**
 * Fetch (and memoize, with a {@link CONFIG_TTL_MS} TTL) the Arkade operator configuration needed to
 * build escrow addresses. This performs a network call to the operator's `getInfo` endpoint, so it
 * MUST be called outside of any DB transaction.
 */
export async function getArkOperatorConfig(): Promise<ArkOperatorConfig> {
  if (cached && Date.now() - cached.fetchedAt < CONFIG_TTL_MS) return cached.config;
  const info = await new RestArkProvider(ARK_SERVER_URL).getInfo();
  const config: ArkOperatorConfig = {
    serverPubkey: info.signerPubkey,
    hrp: networks.mutinynet.hrp,
    unilateralExitDelay: info.unilateralExitDelay,
    dust: info.dust,
  };
  cached = { config, fetchedAt: Date.now() };
  return config;
}
