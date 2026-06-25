"use client";

import { create } from "zustand";
import type { Wallet } from "@arkade-os/sdk";

type WalletState = {
  initialized: boolean;
  wallet: Wallet | null;
  arkAddress: string | null;
  boardingAddress: string | null;
  aspSignerPubkey: string | null;
  balance: number;
  customVtxoScripts: string[];

  initialize: () => void;
  setWallet: (
    wallet: Wallet,
    arkAddress: string,
    boardingAddress: string,
    aspSignerPubkey: string | null
  ) => void;
  clear: () => void;
  setBalance: (amount: number) => void;
  addCustomScript: (script: string) => void;
};

export const useWalletStore = create<WalletState>((set) => ({
  initialized: false,
  wallet: null,
  arkAddress: null,
  boardingAddress: null,
  aspSignerPubkey: null,
  balance: 0,
  customVtxoScripts: [],

  initialize: () => set({ initialized: true }),

  setWallet: (wallet, arkAddress, boardingAddress, aspSignerPubkey) =>
    set({ wallet, arkAddress, boardingAddress, aspSignerPubkey, initialized: true }),

  clear: () =>
    set({
      initialized: false,
      wallet: null,
      arkAddress: null,
      boardingAddress: null,
      aspSignerPubkey: null,
      balance: 0,
      customVtxoScripts: [],
    }),

  setBalance: (amount) => set({ balance: amount }),

  addCustomScript: (script) =>
    set((state) => ({
      customVtxoScripts: [...new Set([...state.customVtxoScripts, script])],
    })),
}));
