import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { HDKey } from "@scure/bip32";
import {
  generateMnemonic as _generateMnemonic,
  validateMnemonic as _validateMnemonic,
  mnemonicToSeedSync,
} from "@scure/bip39";

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hex } from "@scure/base";

import { bytesToHex } from "@noble/hashes/utils.js";
import { wordlist } from "@scure/bip39/wordlists/english.js";
const DERIVATION_PATH = "m/84'/0'/0'/0/0";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(value: string | number | null): string {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "string" ? parseInt(value, 10) : Math.round(value);
  if (isNaN(n)) return "—";
  return `${Intl.NumberFormat("en-US", { minimumIntegerDigits: 1 }).format(n)}`;
}

export function toXOnly(pubkey: Uint8Array): Uint8Array {
  return pubkey.length === 33 ? pubkey.slice(1) : pubkey;
}

export function generateMnemonic(wordCount: 12 | 24 = 12): string {
  const strength = wordCount === 12 ? 128 : 256;
  return _generateMnemonic(wordlist, strength);
}

export function mnemonicToPrivateKey(mnemonic: string, passphrase?: string): string {
  const seed = mnemonicToSeedSync(mnemonic, passphrase);
  const hdKey = HDKey.fromMasterSeed(seed);
  const child = hdKey.derive(DERIVATION_PATH);

  if (!child.privateKey) {
    throw new Error("Failed to derive private key");
  }

  return bytesToHex(child.privateKey);
}

export function getMasterFingerprint(mnemonic: string, passphrase?: string): string {
  const seed = mnemonicToSeedSync(mnemonic, passphrase);
  const hdKey = HDKey.fromMasterSeed(seed);
  return hdKey.fingerprint.toString(16).padStart(8, "0");
}

export function validateMnemonic(mnemonic: string): boolean {
  return _validateMnemonic(mnemonic, wordlist);
}

export function getRandomVerificationIndices(wordCount: number, count: number): number[] {
  const indices: Set<number> = new Set();
  while (indices.size < count) {
    indices.add(Math.floor(Math.random() * wordCount));
  }
  return Array.from(indices).sort((a, b) => a - b);
}

export function derivePubkey(privateKey: string): string {
  return bytesToHex(secp256k1.getPublicKey(hex.decode(privateKey), true));
}

export function paginate(page: number, pageCount: number) {
  const current = page,
    last = pageCount,
    delta = 2,
    left = current - delta,
    right = current + delta + 1,
    range = [],
    rangeWithDots = [];

  for (let i = 1; i <= last; i++) {
    if (i == 1 || i == last || (i >= left && i < right)) {
      range.push(i);
    }
  }

  let l;
  for (const i of range) {
    if (l) {
      if (i - l === 2) {
        rangeWithDots.push(l + 1);
      } else if (i - l !== 1) {
        rangeWithDots.push("...");
      }
    }
    rangeWithDots.push(i);
    l = i;
  }

  return rangeWithDots;
}
