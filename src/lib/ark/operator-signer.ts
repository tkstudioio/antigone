import type { ArkProvider } from "@arkade-os/sdk";
import { samePubkey } from "@/lib/auth/verify-signed-action";
import useProfileStore from "@/stores/profile";

/**
 * The Ark operator's signer pubkey as reported by the operator itself (`getInfo()`), read in the
 * BROWSER through the wallet context's Ark provider — never relayed by our server. It anchors trust
 * in `escrow.serverPubkey`: an escrow whose operator key differs from the real operator's would let
 * somebody else co-sign its spends.
 *
 * Client-only (reads the Zustand profile store). Returns null when the ASP is unreachable or the
 * wallet context has no provider yet; callers must show an explicit "unavailable" state and must not
 * fall back to a value from our API.
 */

const OPERATOR_TTL_MS = 60_000;
let cached: { provider: ArkProvider; pubkey: string; at: number } | null = null;

export async function getOperatorSignerPubkey(): Promise<string | null> {
  const { arkProvider } = useProfileStore.getState();
  if (!arkProvider) return null;
  if (cached && cached.provider === arkProvider && Date.now() - cached.at < OPERATOR_TTL_MS) {
    return cached.pubkey;
  }
  try {
    const info = await arkProvider.getInfo();
    cached = { provider: arkProvider, pubkey: info.signerPubkey, at: Date.now() };
    return info.signerPubkey;
  } catch {
    return null;
  }
}

/**
 * Abort unless the escrow's operator key equals the operator's own reported signer key. Call it
 * before any signing or payment that depends on the escrow.
 */
export async function assertEscrowOperator(escrow: { serverPubkey: string }): Promise<void> {
  const signer = await getOperatorSignerPubkey();
  if (!signer) {
    throw new Error(
      "Unable to reach the Arkade operator to verify this escrow. Try again in a moment."
    );
  }
  if (!samePubkey(signer, escrow.serverPubkey)) {
    throw new Error(
      "The operator key in this escrow does not match the Arkade operator. Aborting for your safety."
    );
  }
}
