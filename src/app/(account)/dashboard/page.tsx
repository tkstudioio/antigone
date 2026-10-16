"use client";

import { AccountPubkeyCard } from "@/components/account-pubkey-card";
import { WalletOverview } from "@/components/wallet-overview";
import { H1, P } from "@/components/ui/typography";

export default function WalletPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-16">
      <div className="space-y-2">
        <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
          Account
        </span>
        <H1 className="text-3xl">Dashboard</H1>
        <P className="text-pretty text-muted-foreground">
          Your identity and your wallet. Both are derived from your key, in this browser.
        </P>
      </div>
      <AccountPubkeyCard />
      <WalletOverview />
    </div>
  );
}
