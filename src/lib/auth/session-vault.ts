import { UnlockedAccount } from "@/types/account";

/**
 * Cache dell'account sbloccato in `sessionStorage`. La `privateKey` derivata vive
 * qui solo per la durata della scheda (cancellata alla chiusura, non inviata al
 * server), così reload e navigazione non richiedono di reinserire la passphrase.
 * Il dialog di sblocco resta come fallback quando questa cache è assente.
 */
const SESSION_ACCOUNT_KEY = "unlocked-account";

function isUnlockedAccount(value: unknown): value is UnlockedAccount {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.username === "string" &&
    typeof candidate.pubkey === "string" &&
    typeof candidate.privateKey === "string"
  );
}

/** Legge l'account sbloccato dalla cache di scheda. Su dato assente/corrotto pulisce e ritorna `null`. */
export function readUnlockedAccount(): UnlockedAccount | null {
  if (typeof window === "undefined") return null;

  const raw = window.sessionStorage.getItem(SESSION_ACCOUNT_KEY);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isUnlockedAccount(parsed)) {
      clearUnlockedAccount();
      return null;
    }
    return parsed;
  } catch {
    clearUnlockedAccount();
    return null;
  }
}

export function writeUnlockedAccount(account: UnlockedAccount): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(SESSION_ACCOUNT_KEY, JSON.stringify(account));
}

export function clearUnlockedAccount(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(SESSION_ACCOUNT_KEY);
}
