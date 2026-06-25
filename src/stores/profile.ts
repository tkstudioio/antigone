import { create } from "zustand";

import { ArkadeSwaps, BoltzSwapProvider } from "@arkade-os/boltz-swap";
import {
  ArkProvider,
  IndexedDBContractRepository,
  IndexedDBWalletRepository,
  IndexerProvider,
  SingleKey,
  VtxoManager,
  Wallet,
} from "@arkade-os/sdk";
import { ExpoArkProvider, ExpoIndexerProvider } from "@arkade-os/sdk/adapters/expo";

import { StoredAccount, UnlockedAccount } from "@/types/account";

import { ARK_SERVER_URL } from "@/lib/ark";
import { clearUnlockedAccount, writeUnlockedAccount } from "@/lib/auth/session-vault";

type ProfileStore = {
  addresses?: {
    boardingAddress: string;
    offchainAddress: string;
  };
  lightningSwaps?: ArkadeSwaps;
  arkProvider?: ArkProvider;
  indexerProvider?: IndexerProvider;
  vtxoManager?: VtxoManager;
  wallet?: Wallet;
  showTransactionsList: boolean;
  setShowTransactionsList: (showTransactionsList: boolean) => void;
  removeProfile: (profileName: string) => Promise<void>;
  setAccount: (account: UnlockedAccount) => Promise<void>;
  /**
   * Ricostruisce la sola parte di rete del wallet (`Wallet.create` + indirizzi) per
   * l'`account` già in memoria. Idempotente e best-effort: ritorna `true` se il wallet
   * è (o era già) pronto, `false` se l'ASP è ancora irraggiungibile. Non throwa mai.
   */
  initWallet: () => Promise<boolean>;
  clear: () => void;
  account?: UnlockedAccount;
};

export enum StorageKeys {
  Profiles = "profiles",
}

const useProfileStore = create<ProfileStore>((set, get) => ({
  showTransactionsList: true,
  setShowTransactionsList: (showTransactionsList) => {
    set({
      showTransactionsList,
    });
  },
  removeProfile: async (profileName: string) => {
    const storedProfiles = await localStorage.getItem(StorageKeys.Profiles);

    const currentProfiles = storedProfiles ? (JSON.parse(storedProfiles) as StoredAccount[]) : [];

    const newStoredProfiles = currentProfiles.filter((profile) => profile.username !== profileName);

    await localStorage.setItem(StorageKeys.Profiles, JSON.stringify(newStoredProfiles));
  },

  clear: () => {
    clearUnlockedAccount();
    set({
      addresses: undefined,
      account: undefined,
      wallet: undefined,
      arkProvider: undefined,
      indexerProvider: undefined,
      vtxoManager: undefined,
      lightningSwaps: undefined,
    });
  },

  setAccount: async (account) => {
    // I provider sono costruttori puri (nessuna chiamata di rete): l'identità è
    // sempre impostabile anche se l'ASP è irraggiungibile. La creazione del
    // wallet (che fa il fetch di /v1/info) è delegata a initWallet, best-effort.
    const arkProvider = new ExpoArkProvider(ARK_SERVER_URL);
    const indexerProvider = new ExpoIndexerProvider(ARK_SERVER_URL);

    // Imposta subito l'identità e azzera eventuali residui wallet di un account
    // precedente, così l'app (login, chat, ordini, stock, carrello) resta usabile
    // anche con l'ASP giù. La passphrase è già stata verificata a monte
    // (decryptMnemonic nei chiamanti), quindi qui non ci sono errori credenziale.
    set({
      account,
      arkProvider,
      indexerProvider,
      wallet: undefined,
      addresses: undefined,
      vtxoManager: undefined,
      lightningSwaps: undefined,
    });

    // Cache l'account sbloccato per la durata della scheda: al reload la
    // rehydration richiama setAccount senza richiedere di nuovo la passphrase.
    writeUnlockedAccount(account);

    // Tenta la parte di rete del wallet; se l'ASP è giù non throwa, ci penserà
    // l'auto-retry (useWalletAutoInit) a popolarlo appena l'ASP torna.
    await get().initWallet();
  },

  initWallet: async () => {
    const { account, arkProvider, indexerProvider, wallet } = get();
    if (!account) return false;
    if (wallet) return true;
    if (!arkProvider || !indexerProvider) return false;

    const pubkey = account.pubkey;
    const identity = SingleKey.fromHex(account.privateKey);

    try {
      // Scope the persistent IndexedDB stores per-identity. The SDK otherwise
      // defaults to a single fixed database name shared across every account on
      // the origin, leaking a previous wallet's vtxos/transactions into a freshly
      // generated one (the DB survives reload and logout).
      const newWallet = await Wallet.create({
        identity,
        arkProvider,
        indexerProvider,
        storage: {
          walletRepository: new IndexedDBWalletRepository(`arkade-wallet-${pubkey}`),
          contractRepository: new IndexedDBContractRepository(`arkade-contract-${pubkey}`),
        },
      });

      const swapProvider = new BoltzSwapProvider({
        apiUrl: process.env.NEXT_PUBLIC_BOLTZ_SWAP_PROVIDER,
        network: "bitcoin",
      });

      const lightningSwaps = new ArkadeSwaps({ wallet: newWallet, swapProvider });
      const vtxoManager = new VtxoManager(newWallet, { enabled: true });

      const offchainAddress = await newWallet.getAddress();
      const boardingAddress = await newWallet.getBoardingAddress();

      // L'account potrebbe essere cambiato (logout/switch) durante l'await: non
      // sovrascrivere lo stato con un wallet ormai stantio.
      if (get().account?.pubkey !== pubkey) return false;

      set({
        addresses: { boardingAddress, offchainAddress },
        wallet: newWallet,
        vtxoManager,
        lightningSwaps,
      });
      return true;
    } catch (err) {
      // ASP irraggiungibile o init fallito: il wallet resta non disponibile, ma
      // sessione e funzionalità non-wallet continuano a funzionare.
      console.error("Init wallet Arkade fallito (ASP non raggiungibile?):", err);
      return false;
    }
  },
}));

export default useProfileStore;
