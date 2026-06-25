"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { PassphraseDialog } from "@/components/passphrase-dialog";
import { useWalletAutoReconnect } from "@/hooks/wallet";
import useProfileStore from "@/stores/profile";
import { decryptMnemonic } from "@/lib/auth/vault";
import { mnemonicToPrivateKey } from "@/lib/utils";

/**
 * Shows the unlock dialog when the session is authenticated but the wallet is not
 * in memory (e.g. after a reload). Decrypts the mnemonic with the passphrase, derives
 * the privkey (passphrase = 13th word) and rebuilds the wallet in the profile store.
 *
 * On unlock `lockedAccount` becomes `null` (the account is in memory) and the
 * component unmounts, closing the dialog.
 */
export function UnlockDialog() {
  const lockState = useWalletAutoReconnect();
  const setAccount = useProfileStore((s) => s.setAccount);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Nothing to unlock or silent rehydration in progress: no dialog (no flash).
  if (lockState.kind !== "locked") return null;

  const lockedAccount = lockState.account;

  const handleSubmit = async (passphrase: string) => {
    setPending(true);
    setError(null);
    try {
      const mnemonic = await decryptMnemonic(lockedAccount.vault, passphrase);
      const privateKey = mnemonicToPrivateKey(mnemonic, passphrase);
      await setAccount({
        username: lockedAccount.username,
        pubkey: lockedAccount.pubkey,
        privateKey,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wrong passphrase");
    } finally {
      setPending(false);
    }
  };

  return (
    <PassphraseDialog
      open
      // Not dismissable: either unlock or sign out.
      dismissable={false}
      onOpenChange={() => {}}
      title={`Unlock ${lockedAccount.username}`}
      description="Enter the passphrase to rebuild the wallet."
      submitLabel="Unlock"
      pending={pending}
      error={error}
      onSubmit={handleSubmit}
      secondaryLabel="Sign out"
      onSecondary={() => void signOut()}
    />
  );
}
