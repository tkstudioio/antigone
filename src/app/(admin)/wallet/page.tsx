"use client";

import { WalletOverview } from "@/components/wallet-overview";
import { H1, P } from "@/components/ui/typography";

export default function AdminWalletPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-16">
      <div className="space-y-2">
        <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
          Arbiter
        </span>
        <H1 className="text-3xl">Wallet</H1>
        <P className="text-pretty text-muted-foreground">
          The arbiter wallet: arbitration earnings land here.
        </P>
      </div>
      <WalletOverview />
    </div>
  );
}
