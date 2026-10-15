/**
 * Trust-on-first-use (TOFU) pin of the instance's arbiter pubkey, per origin (`localStorage`).
 *
 * The arbiter (= platform admin) key is part of every escrow, so a server that quietly swapped it
 * for another key could co-sign settlements with someone else. The browser therefore remembers the
 * first arbiter it ever sees; if a later order or escrow carries a DIFFERENT one, the UI blocks
 * payments and signing on that order until the user explicitly acknowledges the change.
 *
 * Client-only in practice, but written against a `Storage`-like interface so it can be exercised in
 * tests. EVERY storage access is wrapped in try/catch: `localStorage` can throw (private mode,
 * disabled storage, quota) and the pin must never take a page down — it then degrades to "unpinned".
 */

const PIN_KEY = "antigone:arbiter-pin:v1";
const ACK_KEY = "antigone:arbiter-ack:v1";

/** Minimal storage surface used here (a subset of the Web `Storage`). */
export type PinStorage = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): PinStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function normalize(pubkey: string): string {
  return pubkey.trim().toLowerCase();
}

/** Case-insensitive comparison of two arbiter pubkeys. */
export function sameArbiter(a: string | null | undefined, b: string | null | undefined): boolean {
  return a != null && b != null && normalize(a) === normalize(b);
}

/** The pinned arbiter pubkey, or null when none is pinned or storage is unavailable. */
export function readArbiterPin(storage: PinStorage | null = defaultStorage()): string | null {
  try {
    const value = storage?.getItem(PIN_KEY);
    return value ? normalize(value) : null;
  } catch {
    return null;
  }
}

/** Pin `pubkey`. Returns false when storage is unavailable. */
export function writeArbiterPin(
  pubkey: string,
  storage: PinStorage | null = defaultStorage()
): boolean {
  try {
    if (!storage) return false;
    storage.setItem(PIN_KEY, normalize(pubkey));
    return true;
  } catch {
    return false;
  }
}

/** Arbiter pubkeys the user explicitly acknowledged although they differ from the pin. */
export function readAcknowledgedArbiters(storage: PinStorage | null = defaultStorage()): string[] {
  try {
    const raw = storage?.getItem(ACK_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string").map(normalize)
      : [];
  } catch {
    return [];
  }
}

/** Record that the user accepted working with `pubkey` as the arbiter despite the pin. */
export function acknowledgeArbiter(
  pubkey: string,
  storage: PinStorage | null = defaultStorage()
): boolean {
  try {
    if (!storage) return false;
    const current = readAcknowledgedArbiters(storage);
    const next = normalize(pubkey);
    if (!current.includes(next)) current.push(next);
    storage.setItem(ACK_KEY, JSON.stringify(current));
    return true;
  } catch {
    return false;
  }
}

export type ArbiterCheck =
  /** First arbiter ever seen: it has just been pinned. */
  | { status: "pinned"; pinned: string; seen: string }
  /** Matches the pin. */
  | { status: "match"; pinned: string; seen: string }
  /** Differs from the pin and the user has not acknowledged it: block signing and paying. */
  | { status: "mismatch"; pinned: string; seen: string }
  /** Differs from the pin but the user explicitly acknowledged this key. */
  | { status: "acknowledged"; pinned: string; seen: string }
  /** Storage unavailable: nothing to compare against (neither blocked nor protected). */
  | { status: "unpinned"; pinned: null; seen: string };

/**
 * Compare the arbiter carried by an escrow with the pin, pinning it when none exists yet (TOFU).
 * Pure comparison + the first-sight write; never throws.
 */
export function checkArbiter(
  seen: string,
  storage: PinStorage | null = defaultStorage()
): ArbiterCheck {
  const seenNormalized = normalize(seen);
  const pinned = readArbiterPin(storage);

  if (!pinned) {
    return writeArbiterPin(seenNormalized, storage)
      ? { status: "pinned", pinned: seenNormalized, seen: seenNormalized }
      : { status: "unpinned", pinned: null, seen: seenNormalized };
  }
  if (pinned === seenNormalized) return { status: "match", pinned, seen: seenNormalized };
  if (readAcknowledgedArbiters(storage).includes(seenNormalized)) {
    return { status: "acknowledged", pinned, seen: seenNormalized };
  }
  return { status: "mismatch", pinned, seen: seenNormalized };
}

/** Whether signing / paying must stay disabled because of this arbiter check. */
export function isArbiterBlocked(check: ArbiterCheck | null | undefined): boolean {
  return check?.status === "mismatch";
}
