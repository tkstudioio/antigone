"use client";

import { schnorr } from "@noble/curves/secp256k1.js";
import { hex } from "@scure/base";

/** Firma Schnorr di un messaggio con la chiave privata (hex) già sbloccata in memoria. */
export function signMessage(message: string, privateKeyHex: string) {
  return hex.encode(schnorr.sign(new TextEncoder().encode(message), hex.decode(privateKeyHex)));
}
