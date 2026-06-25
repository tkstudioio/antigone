"use client";

import { useWalletAutoInit, useWalletNotifications } from "@/hooks/wallet";
import { UnlockDialog } from "@/components/unlock-dialog";

export function WalletAutoReconnect() {
  // Repopulate the wallet as soon as the ASP becomes reachable again (if init had failed).
  useWalletAutoInit();
  useWalletNotifications();
  return <UnlockDialog />;
}
