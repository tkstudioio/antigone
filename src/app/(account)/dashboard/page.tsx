"use client";

import { AccountPubkeyCard } from "@/components/account-pubkey-card";
import { WalletOverview } from "@/components/wallet-overview";

export default function WalletPage() {
  return (
    <>
      <AccountPubkeyCard />
      <WalletOverview />
    </>
  );
}
