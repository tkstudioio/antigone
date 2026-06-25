import { loginSchema } from "@/validators";
import { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "@/db";
import { isAfter } from "date-fns";
import { schnorr } from "@noble/curves/secp256k1.js";
import { hex } from "@scure/base";
import { toXOnly, mnemonicToPrivateKey, derivePubkey } from "./utils";
import { SignJWT } from "jose";

const nextAuthSecret = process.env.NEXTAUTH_SECRET;

if (!nextAuthSecret) {
  throw new Error("NEXTAUTH_SECRET is required");
}

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        pubkey: { label: "Pubkey", type: "text" },
        nonce: { label: "Nonce", type: "text" },
        signature: { label: "Signature", type: "text" },
      },
      async authorize(credentials) {
        const { pubkey, nonce, signature } = loginSchema.parse(credentials);

        const challengeRecord = await db.challenge.findUnique({
          where: { nonce },
        });

        if (!challengeRecord) {
          throw new Error("Invalid nonce");
        }

        if (challengeRecord.pubkey !== pubkey) {
          throw new Error("Wrong pubkey");
        }

        if (isAfter(new Date(), challengeRecord.expiry)) {
          throw new Error("Challenge expired");
        }

        const isValid = schnorr.verify(
          hex.decode(signature),
          new TextEncoder().encode(`${nonce} ${pubkey}`),
          toXOnly(hex.decode(pubkey))
        );

        if (!isValid) {
          throw new Error("Invalid signature");
        }

        try {
          await db.challenge.delete({ where: { nonce } });
        } catch {
          // P2025: record not found — already consumed, treat as expired
          throw new Error("Challenge already consumed");
        }

        const existingAccount = await db.account.findUnique({
          where: { pubkey },
        });

        if (!existingAccount) {
          throw new Error("Account not found");
        }

        const now = Math.floor(Date.now() / 1000);

        const token = await new SignJWT({
          sub: pubkey,
          username: existingAccount.username,
          iat: now,
          exp: now + 3600,
        })
          .setProtectedHeader({ alg: "HS256" })
          .sign(new TextEncoder().encode(nextAuthSecret));

        return {
          id: pubkey,
          token,
          pubkey,
          username: existingAccount.username,
        };
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24, // 24h
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.token = user.token;
        token.pubkey = user.pubkey;
        token.username = user.username;
      }

      if (!process.env.ADMIN_MNEMONIC) {
        console.error("Missing ADMIN_MNEMONIC in env");
        return token;
      }

      try {
        // La passphrase (ADMIN_PASSPHRASE) è la 13ª parola dell'admin: deve combaciare
        // con quella usata nella UI, altrimenti la pubkey derivata non corrisponde.
        const adminPrivateKey = mnemonicToPrivateKey(
          process.env.ADMIN_MNEMONIC,
          process.env.ADMIN_PASSPHRASE
        );
        const adminPubkey = derivePubkey(adminPrivateKey);
        token.isAdmin = adminPubkey === token.pubkey;
      } catch (e) {
        console.error("Invalid ADMIN_MNEMONIC");
        console.error(e);
      }

      return token;
    },
    async session({ session, token }) {
      session.token = token.token ?? "";
      session.user.pubkey = token.pubkey ?? "";
      session.user.username = token.username ?? "";
      session.user.isAdmin = token.isAdmin ?? false;

      return session;
    },
  },
};
