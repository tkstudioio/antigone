"use client";

import { signMessage } from "@/lib/auth/signature";
import { decryptMnemonic, encryptMnemonic } from "@/lib/auth/vault";
import { backend } from "@/lib/backend";
import { derivePubkey, generateMnemonic, mnemonicToPrivateKey } from "@/lib/utils";
import useProfileStore from "@/stores/profile";
import { StoredAccount } from "@/types/account";
import { passphraseSchema } from "@/validators";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import { useLocalStorage } from "usehooks-ts";
import * as z from "zod";

const ACCOUNTS_STORAGE_KEY = "accounts";

/**
 * Reactive list of local accounts. Backed by `useLocalStorage`: every write
 * (create/restore/remove, which use the same key) automatically updates the
 * list without needing to invalidate queries.
 */
export function useAccountsList(): StoredAccount[] {
  const [accounts] = useLocalStorage<StoredAccount[]>(ACCOUNTS_STORAGE_KEY, []);
  // Discard entries from the old schema (without an encrypted vault): a clean break, they must be recreated.
  return accounts.filter((account) => Boolean(account?.vault));
}

export function useRemoveAccount() {
  const [, setAccounts] = useLocalStorage<StoredAccount[]>(ACCOUNTS_STORAGE_KEY, []);
  return useMutation({
    mutationKey: ["accounts", "remove"],
    mutationFn: async (pubkey: string) => {
      // Functional update: avoids stale closures and updates the list reactively.
      setAccounts((prev) => prev.filter((account) => account.pubkey !== pubkey));
    },
  });
}

export type LoginInput = {
  account: StoredAccount;
  passphrase: string;
};

export function useLoginMutation() {
  const profileStore = useProfileStore();
  const router = useRouter();

  return useMutation({
    mutationKey: ["login"],
    mutationFn: async ({ account, passphrase }: LoginInput) => {
      // Decrypt the mnemonic (the auth tag verifies the passphrase) and derive the privkey
      // using the passphrase also as the 13th BIP39 word.
      const mnemonic = await decryptMnemonic(account.vault, passphrase);
      const privateKey = mnemonicToPrivateKey(mnemonic, passphrase);
      const pubkey = derivePubkey(privateKey);

      const { data } = await backend.post<{
        nonce: string;
        pubkey: string;
        expiry: string;
      }>("/auth/challenge", { pubkey });

      const signature = signMessage(`${data.nonce} ${pubkey}`, privateKey);

      const result = await signIn("credentials", {
        redirect: false,
        pubkey,
        signature,
        nonce: data.nonce,
      });

      if (result?.error) throw new Error("Unable to login");

      profileStore.setAccount({ username: account.username, pubkey, privateKey });
    },

    onSuccess: () => {
      toast.success("Login successful");
      router.push("/");
    },

    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Login failed");
    },
  });
}

const createAccountSchema = z
  .object({
    username: z.string().min(6, "Username must be at least 6 characters"),
    passphrase: passphraseSchema,
    confirmPassphrase: z.string(),
  })
  .refine((data) => data.passphrase === data.confirmPassphrase, {
    message: "The passphrases do not match",
    path: ["confirmPassphrase"],
  });

type CreateAccountSchema = z.infer<typeof createAccountSchema>;

export function useCreateAccountMutation() {
  const [accounts, setAccounts] = useLocalStorage<StoredAccount[]>(ACCOUNTS_STORAGE_KEY, []);

  return useMutation({
    mutationKey: ["generate-account"],
    mutationFn: async ({ username, passphrase }: CreateAccountSchema) => {
      const mnemonic = generateMnemonic();
      // The passphrase is the 13th word: it enters the key derivation.
      const privateKey = mnemonicToPrivateKey(mnemonic, passphrase);
      const pubkey = derivePubkey(privateKey);

      const signature = signMessage(`${username} ${pubkey}`, privateKey);

      await backend.post("/auth/register", {
        pubkey,
        username,
        signature,
      });

      // The mnemonic is never stored in plaintext: only encrypted with the passphrase.
      const vault = await encryptMnemonic(mnemonic, passphrase);
      const newAccountsList = accounts.some((a) => a.pubkey === pubkey)
        ? accounts
        : [...accounts, { username, pubkey, vault }];
      setAccounts(newAccountsList);

      // We return the mnemonic once for backup; it is not persisted anywhere else.
      return { mnemonic };
    },
  });
}

export function useCreateAccountForm() {
  return useForm<CreateAccountSchema>({
    defaultValues: {
      username: "",
      passphrase: "",
      confirmPassphrase: "",
    },
    resolver: zodResolver(createAccountSchema),
  });
}

const restoreAccountSchema = z
  .object({
    username: z.string().min(1, "Username required"),
    mnemonic: z.string().min(1, "Mnemonic required"),
    passphrase: passphraseSchema,
    confirmPassphrase: z.string(),
  })
  .refine((data) => data.passphrase === data.confirmPassphrase, {
    message: "The passphrases do not match",
    path: ["confirmPassphrase"],
  });

type RestoreAccountSchema = z.infer<typeof restoreAccountSchema>;

export function useRestoreAccountMutation() {
  const router = useRouter();

  const [accounts, setAccounts] = useLocalStorage<StoredAccount[]>(ACCOUNTS_STORAGE_KEY, []);

  return useMutation({
    mutationKey: ["restore-account"],
    mutationFn: async (values: RestoreAccountSchema) => {
      // The passphrase is the 13th word: distinct accounts for different passphrases.
      const privateKey = mnemonicToPrivateKey(values.mnemonic, values.passphrase);
      const pubkey = derivePubkey(privateKey);

      const signature = signMessage(`${values.username} ${pubkey}`, privateKey);

      await backend.post("/auth/register", {
        pubkey,
        username: values.username,
        signature,
      });

      const vault = await encryptMnemonic(values.mnemonic, values.passphrase);
      const newAccountsList = accounts.some((a) => a.pubkey === pubkey)
        ? accounts
        : [...accounts, { username: values.username, pubkey, vault }];

      return setAccounts(newAccountsList);
    },
    onSuccess: () => router.push("/login"),
  });
}

export function useRestoreAccountForm() {
  return useForm<RestoreAccountSchema>({
    defaultValues: {
      username: "",
      mnemonic: "",
      passphrase: "",
      confirmPassphrase: "",
    },
    resolver: zodResolver(restoreAccountSchema),
  });
}
