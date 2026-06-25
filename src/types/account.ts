/** Mnemonic cifrata a riposo (AES-GCM + PBKDF2). Tutti i campi binari sono base64. */
export type EncryptedVault = {
  ciphertext: string;
  iv: string;
  salt: string;
  iterations: number;
};

/**
 * Account come persistito in `localStorage["accounts"]`.
 * Non contiene mai la mnemonic in chiaro né la passphrase: solo i dati pubblici
 * (`username`, `pubkey`) e la mnemonic cifrata.
 */
export type StoredAccount = {
  username: string;
  pubkey: string;
  vault: EncryptedVault;
};

/**
 * Account sbloccato, tenuto **solo in memoria** (profile store) dopo l'inserimento
 * della passphrase. `privateKey` è la chiave hex derivata da mnemonic + passphrase.
 */
export type UnlockedAccount = {
  username: string;
  pubkey: string;
  privateKey: string;
};
