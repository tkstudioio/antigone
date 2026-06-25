import { type ArkTransaction } from "@arkade-os/sdk";

// Single source of truth for both client (wallet provider) and server (escrow/indexer). Defaults
// to mutinynet so the wallet's on-chain network (tb1…) matches the escrow derivation; without this
// the SDK provider falls back to https://arkade.computer (mainnet → bc1… boarding addresses).
export const ARK_SERVER_URL =
  process.env.NEXT_PUBLIC_ARK_OPERATOR_URL ?? "https://mutinynet.arkade.sh";

export type { ArkTransaction };

export type ParsedPayment = {
  type: "bip21" | "ark" | "onchain" | "lightning";
  onchainAddress?: string;
  arkAddress?: string;
  signerPubkey?: string;
  lightningInvoice?: string;
  amount?: number; // satoshis
};

export function parseBIP21Address(input: string): ParsedPayment | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Extended BIP21 with Ark: bitcoin:<addr>?ark=<arkAddr>&signerPubkey=<pk>&amount=<btc>
  if (trimmed.startsWith("bitcoin:")) {
    const withoutScheme = trimmed.slice("bitcoin:".length);
    const qIndex = withoutScheme.indexOf("?");
    const onchainAddress = qIndex >= 0 ? withoutScheme.slice(0, qIndex) : withoutScheme;
    const params =
      qIndex >= 0 ? new URLSearchParams(withoutScheme.slice(qIndex + 1)) : new URLSearchParams();
    const arkAddress = params.get("ark") ?? undefined;
    const signerPubkey = params.get("signerPubkey") ?? undefined;
    const amountBtc = params.get("amount");
    const amount = amountBtc ? Math.round(Number(amountBtc) * 1e8) : undefined;
    return { type: "bip21", onchainAddress, arkAddress, signerPubkey, amount };
  }

  // Ark virtual address
  if (trimmed.startsWith("tark1") || trimmed.startsWith("ark1")) {
    return { type: "ark", arkAddress: trimmed };
  }

  // Lightning invoice
  if (trimmed.toLowerCase().startsWith("ln")) {
    return { type: "lightning", lightningInvoice: trimmed };
  }

  // On-chain Bitcoin address
  if (trimmed.startsWith("bc1") || trimmed.startsWith("tb1") || trimmed.startsWith("bcrt1")) {
    return { type: "onchain", onchainAddress: trimmed };
  }

  return null;
}
