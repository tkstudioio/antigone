import { z } from "zod";

/** Lunghezza minima della passphrase (13ª parola + chiave di cifratura). */
export const MIN_PASSPHRASE_LENGTH = 8;

/** Campo passphrase riusato dai form di creazione/ripristino account. */
export const passphraseSchema = z
  .string()
  .min(MIN_PASSPHRASE_LENGTH, `La passphrase deve avere almeno ${MIN_PASSPHRASE_LENGTH} caratteri`);

export const loginSchema = z.object({
  pubkey: z.string().min(1),
  nonce: z.string().min(1),
  signature: z.string().min(1),
});

export const challengeSchema = z.object({
  pubkey: z.string().min(1),
});

export const registerSchema = z.object({
  pubkey: z.string().min(1),
  username: z.string().min(2),
});

export const listingAttributeInputSchema = z.object({
  attributeId: z.number().int().positive(),
  valueId: z.number().int().positive().optional(),
  valueBool: z.boolean().optional(),
  valueText: z.string().optional(),
  valueIds: z.array(z.number().int().positive()).optional(),
});

export const createListingSchema = z.object({
  name: z.string().min(3),
  description: z.string().min(12).optional(),
  price: z.number().int().positive(),
  categoryId: z.number().int().positive().nullable().optional(),
  attributes: z.array(listingAttributeInputSchema).default([]),
});

export const updateListingSchema = createListingSchema.partial();

export const sendMessageSchema = z.object({
  message: z.string().min(1).optional(),
  offeredPrice: z.number().int().positive().optional(),
});

export const respondOfferSchema = z.object({
  accepted: z.boolean(),
});

export const createEscrowSchema = z.object({
  exitDelay: z.number().int().positive(),
  price: z.number().int().positive().optional(),
  serverPubkey: z.string().min(1).optional(),
  escrowAddress: z.string().min(1).optional(),
});

/** `v1:<iv_b64>:<ciphertext_b64>` — the ECIES/AES-GCM sealed format of `src/lib/crypto/ecies.ts`. */
const SEALED_FORMAT = /^v1:[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}$/;

/** One license code encrypted for its seller, as uploaded to `POST /api/stocks`. */
export const encryptedCodeSchema = z.object({
  ciphertext: z.string().max(8192).regex(SEALED_FORMAT, { message: "Malformed code ciphertext" }),
  wrappedCek: z
    .string()
    .max(512)
    .regex(SEALED_FORMAT, { message: "Malformed wrapped content key" }),
  // HMAC-SHA256 (hex) keyed by a secret derived from the seller's private key.
  codeHash: z.string().regex(/^[0-9a-f]{64}$/, { message: "Malformed code hash" }),
});

/**
 * One content key (CEK) of a license code re-wrapped toward a single recipient. The recipient is
 * implicit in the endpoint (the buyer for confirm/deliver, the escrow arbiter for
 * grant-arbiter-keys) and the wrapper is the signer — both are set server-side.
 */
export const keyCodeWrapSchema = z.object({
  keyId: z.number().int().positive(),
  wrappedCek: z
    .string()
    .max(512)
    .regex(SEALED_FORMAT, { message: "Malformed wrapped content key" }),
});

const keyCodeWrapsSchema = z
  .array(keyCodeWrapSchema)
  .min(1, { message: "At least one key wrap is required" })
  .max(1000, { message: "Maximum 1000 keys per request" })
  .refine((keys) => new Set(keys.map((k) => k.keyId)).size === keys.length, {
    message: "Duplicate key IDs",
  });

/**
 * Dual-purpose schema: used for both creating a new stock tier (POST /api/stocks when the
 * (seller, productId, price) tuple has no existing rows) and appending keys to an existing tier
 * (same endpoint, same payload — the server decides at write-time based on prior row existence).
 */
export const createStockSchema = z.object({
  productId: z.number().int().positive(),
  price: z.number().int().positive({ message: "Price must be a positive integer" }),
  // Each code is E2E-encrypted in the browser (envelope addressed to the seller only) and carries
  // its seller-keyed dedup hash. The server never sees a plaintext code.
  codes: z
    .array(encryptedCodeSchema)
    .min(1, { message: "Enter at least one key" })
    .max(1000, { message: "Maximum 1000 keys per request" }),
});

/**
 * Form-side schema: uses a `keysText` string field that is transformed into `codes[]`.
 * The `productId` and `price` are already known from the form context.
 */
export const createStockFormSchema = z.object({
  productId: z.number().int().positive({ error: "Select a product" }),
  price: z
    .number({ error: "Price must be a positive integer" })
    .int({ error: "Price must be a positive integer" })
    .positive({ error: "Price must be a positive integer" }),
  keysText: z.string().min(1, { message: "Enter at least one key" }),
});

export const updateStockPriceSchema = z
  .object({
    productId: z.number().int().positive(),
    oldPrice: z.number().int().positive(),
    newPrice: z
      .number({ error: "Il prezzo deve essere un intero positivo" })
      .int({ error: "Il prezzo deve essere un intero positivo" })
      .positive({ error: "Il prezzo deve essere un intero positivo" }),
  })
  .refine((data) => data.oldPrice !== data.newPrice, {
    message: "Il nuovo prezzo deve essere diverso da quello attuale",
    path: ["newPrice"],
  });

export const deleteStockSchema = z.object({
  productId: z.number().int().positive(),
  price: z.number().int().positive(),
});

export const deleteKeysSchema = z.object({
  keyIds: z.array(z.string().min(1)).min(1, { message: "Seleziona almeno una chiave" }).max(1000),
});

export const addToCartSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().positive(),
  // Optional stock selector: when present, reserve only from this seller at this
  // exact price tier. When absent, fall back to cheapest-first across all sellers.
  sellerPubkey: z.string().min(1).optional(),
  price: z.number().int().nonnegative().optional(),
});

export const removeFromCartSchema = z.object({
  productId: z.number().int().positive(),
});

export const clearCartSchema = z.object({});

/**
 * One line of the buyer-signed checkout terms: the key the buyer saw in the cart, its seller and the
 * price (sats) they agreed to. The server rejects the checkout (409) when any of them changed.
 */
export const checkoutItemSchema = z.object({
  keyId: z.number().int().positive(),
  sellerPubkey: z.string().min(1),
  price: z.number().int().nonnegative(),
});

export const checkoutSchema = z.object({
  items: z
    .array(checkoutItemSchema)
    .min(1, { message: "Select at least one key" })
    .max(1000)
    .refine((items) => new Set(items.map((i) => i.keyId)).size === items.length, {
      message: "Duplicate key IDs",
    }),
});

/** Hex SHA-256 linking a chat message to the previous one (see `src/lib/chat-chain.ts`). */
export const chatPrevHashSchema = z.string().regex(/^[0-9a-f]{64}$/, {
  message: "Malformed chat chain hash",
});

export const openChatSchema = z.object({
  orderId: z.number().int().positive(),
});

/** Seller arms the collaborative release: signs the ark tx and stores the unsigned checkpoints. */
export const prepareReleaseSchema = z.object({
  sellerSignedCollabPsbt: z.string().min(1),
  checkpointPsbts: z.array(z.string().min(1)).min(1),
});

/** Buyer countersigns: submits the ark tx to the operator and signs the returned checkpoints. */
export const collaborateReleaseSchema = z.object({
  collabArkTxid: z.string().min(1),
  serverSignedCheckpoints: z.array(z.string().min(1)).min(1),
  buyerSignedCheckpoints: z.array(z.string().min(1)).min(1),
});

/** Seller finalizes: broadcasts the fully-signed checkpoints, releasing the funds. */
export const finalizeReleaseSchema = z.object({});

/**
 * Seller confirms the order = delivers the keys: one content-key wrap toward the buyer for every
 * key of the order (the server checks the set is complete).
 */
export const confirmOrderSchema = z.object({ keys: keyCodeWrapsSchema });

/** Seller delivers the keys during a dispute (same payload as confirm, no status change). */
export const deliverKeysSchema = z.object({ keys: keyCodeWrapsSchema });

/** A party re-wraps the content keys it can open toward the escrow arbiter (dispute only). */
export const grantArbiterKeysSchema = z.object({ keys: keyCodeWrapsSchema });

/** Buyer or seller triggers a re-check of escrow funding against the indexer. */
export const verifyFundingSchema = z.object({});

/** Buyer (or seller after the payment deadline) cancels an unpaid order. */
export const cancelOrderSchema = z.object({
  orderId: z.number().int().positive(),
});

/** Buyer or seller escalates the order to a dispute. */
export const openDisputeSchema = z.object({});

/**
 * Favoured party prepares the dispute settlement: sends the signed ark tx and unsigned
 * checkpoint PSBTs. Amounts/addresses are NOT sent — the server recalculates them from the
 * stored verdict and validates the client-submitted tx against them, then persists the PSBTs for
 * the arbiter to co-sign (the server signs nothing).
 */
export const settleDisputePrepareSchema = z.object({
  favouredSignedArkPsbt: z.string().min(1),
  checkpointPsbts: z.array(z.string().min(1)).min(1),
});

/**
 * Arbiter (admin) records its client-side co-signature: the ark txid returned by the operator's
 * `submitTx` plus the checkpoints as signed by the operator and by the arbiter.
 */
export const cosignDisputeSchema = z.object({
  disputeArkTxid: z.string().min(1),
  serverSignedCheckpoints: z.array(z.string().min(1)).min(1),
  adminSignedCheckpoints: z.array(z.string().min(1)).min(1),
});

/**
 * Favoured party records that it finalized the settlement on the operator (the browser already
 * called `finalizeTx`). `disputeArkTxid` is optional and, when present, must match the stored one.
 */
export const settleDisputeFinalizeSchema = z.object({
  disputeArkTxid: z.string().min(1).optional(),
});

/** Stage 2 surface — unilateral CSV exit (stub; endpoint responds 501). */
export const disputeExitSchema = z.object({});

export const IMAGE_MIME_ALLOWLIST = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

/** 5 MB in byte */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export const chatAttachmentSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  contentType: z.enum(IMAGE_MIME_ALLOWLIST, {
    error: "Tipo file non supportato. Sono ammesse solo immagini (JPEG, PNG, WebP, GIF).",
  }),
  size: z
    .number()
    .int()
    .positive()
    .max(MAX_ATTACHMENT_BYTES, { message: "L'allegato supera la dimensione massima di 5 MB." }),
});

export const wrappedKeySchema = z.object({
  recipientPubkey: z.string().min(1),
  wrappedCek: z.string().min(1),
});

export const postChatMessageSchema = z
  .object({
    chatId: z.number().int().positive(),
    // Hash of the previous message's signed action in this chat (or the chat genesis hash). The
    // server rejects (409) a send whose `prevHash` is not the current tail.
    prevHash: chatPrevHashSchema,
    // Content ciphertext (ECIES envelope, `v1:...`). Optional only when an attachment carries the message.
    ciphertext: z.string().min(1).max(20000).optional(),
    // One wrapped CEK per recipient (buyer + seller). wrapperPubkey is set server-side = sender.
    keys: z.array(wrappedKeySchema).optional(),
    attachment: chatAttachmentSchema.optional(),
  })
  .refine((data) => data.ciphertext != null || data.attachment != null, {
    message: "Enter a message or attach an image.",
  })
  .refine((data) => data.ciphertext == null || (data.keys != null && data.keys.length >= 2), {
    message: "Incomplete envelope: missing keys for the recipients.",
  });

// Admin chat message. Same shape as a user message but addressed to buyer + seller + admin, and
// signed by the admin key (chatId comes from the URL, not the body).
export const adminMessageSchema = z
  .object({
    prevHash: chatPrevHashSchema,
    ciphertext: z.string().min(1).max(20000).optional(),
    keys: z.array(wrappedKeySchema).optional(),
    attachment: chatAttachmentSchema.optional(),
  })
  .refine((data) => data.ciphertext != null || data.attachment != null, {
    message: "Enter a message or attach an image.",
  })
  .refine((data) => data.ciphertext == null || (data.keys != null && data.keys.length >= 2), {
    message: "Incomplete envelope: missing keys for the recipients.",
  });

export const grantAdminChatAccessSchema = z.object({
  chatId: z.number().int().positive(),
  // Admin-wrapped CEKs, one per (still-encrypted) message in the chat.
  keys: z
    .array(
      z.object({
        messageId: z.number().int().positive(),
        wrappedCek: z.string().min(1),
        wrapperPubkey: z.string().min(1),
      })
    )
    .min(1),
});

export const concludeDisputeSchema = z
  .object({
    orderId: z.number().int().positive(),
    refundAmount: z
      .number({ error: "Importo non valido" })
      .int({ error: "Importo non valido" })
      .min(0, { message: "Importo non valido" }),
    conclusionStatus: z.enum(["completed", "partially_refunded", "cancelled"], {
      error: "Esito disputa non valido",
    }),
    favouredRole: z.enum(["buyer", "seller"], {
      error: "Parte favorita non valida",
    }),
    refundedKeyIds: z.array(z.number().int().positive()).default([]),
  })
  .refine((data) => new Set(data.refundedKeyIds).size === data.refundedKeyIds.length, {
    message: "ID chiave duplicati",
    path: ["refundedKeyIds"],
  });

export const concludeDisputeFormSchema = z
  .object({
    orderId: z.number().int().positive(),
    refundAmount: z
      .number({ error: "Importo non valido" })
      .int({ error: "Importo non valido" })
      .min(0, { message: "Importo non valido" }),
    conclusionStatus: z.enum(["completed", "partially_refunded", "cancelled"], {
      error: "Esito disputa non valido",
    }),
    favouredRole: z.enum(["buyer", "seller"], {
      error: "Parte favorita non valida",
    }),
    refundedKeyIds: z.array(z.number().int().positive()).default([]),
  })
  .refine((data) => new Set(data.refundedKeyIds).size === data.refundedKeyIds.length, {
    message: "ID chiave duplicati",
    path: ["refundedKeyIds"],
  });
