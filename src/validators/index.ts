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
  signature: z.string().min(1),
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
  signature: z.string().min(1),
});

export const updateListingSchema = createListingSchema.partial().extend({
  signature: z.string().min(1),
});

export const sendMessageSchema = z.object({
  message: z.string().min(1).optional(),
  offeredPrice: z.number().int().positive().optional(),
  signature: z.string().min(1),
});

export const respondOfferSchema = z.object({
  accepted: z.boolean(),
  signature: z.string().min(1),
});

export const createEscrowSchema = z.object({
  exitDelay: z.number().int().positive(),
  price: z.number().int().positive().optional(),
  serverPubkey: z.string().min(1).optional(),
  escrowAddress: z.string().min(1).optional(),
  signature: z.string().min(1),
});

/**
 * Dual-purpose schema: used for both creating a new stock tier (POST /api/stocks when the
 * (seller, productId, price) tuple has no existing rows) and appending keys to an existing tier
 * (same endpoint, same payload — the server decides at write-time based on prior row existence).
 */
export const createStockSchema = z.object({
  productId: z.number().int().positive(),
  price: z.number().int().positive({ message: "Il prezzo deve essere un intero positivo" }),
  codes: z
    .array(z.string().min(1))
    .min(1, { message: "Inserisci almeno una chiave" })
    .max(1000, { message: "Massimo 1000 chiavi per richiesta" }),
  signature: z.string().min(1),
});

/**
 * Form-side schema: uses a `keysText` string field that is transformed into `codes[]`.
 * The `productId` and `price` are already known from the form context.
 */
export const createStockFormSchema = z.object({
  productId: z.number().int().positive(),
  price: z
    .number({ error: "Il prezzo deve essere un intero positivo" })
    .int({ error: "Il prezzo deve essere un intero positivo" })
    .positive({ error: "Il prezzo deve essere un intero positivo" }),
  keysText: z.string().min(1, { message: "Inserisci almeno una chiave" }),
});

export const updateStockPriceSchema = z
  .object({
    productId: z.number().int().positive(),
    oldPrice: z.number().int().positive(),
    newPrice: z
      .number({ error: "Il prezzo deve essere un intero positivo" })
      .int({ error: "Il prezzo deve essere un intero positivo" })
      .positive({ error: "Il prezzo deve essere un intero positivo" }),
    signature: z.string().min(1),
  })
  .refine((data) => data.oldPrice !== data.newPrice, {
    message: "Il nuovo prezzo deve essere diverso da quello attuale",
    path: ["newPrice"],
  });

export const deleteStockSchema = z.object({
  productId: z.number().int().positive(),
  price: z.number().int().positive(),
  signature: z.string().min(1),
});

export const deleteKeysSchema = z.object({
  keyIds: z.array(z.string().min(1)).min(1, { message: "Seleziona almeno una chiave" }).max(1000),
  signature: z.string().min(1),
});

export const addToCartSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().positive(),
  // Optional stock selector: when present, reserve only from this seller at this
  // exact price tier. When absent, fall back to cheapest-first across all sellers.
  sellerPubkey: z.string().min(1).optional(),
  price: z.number().int().nonnegative().optional(),
  signature: z.string().min(1),
});

export const removeFromCartSchema = z.object({
  productId: z.number().int().positive(),
  signature: z.string().min(1),
});

export const clearCartSchema = z.object({
  signature: z.string().min(1),
});

export const checkoutSchema = z.object({
  keyIds: z
    .array(z.number().int().positive())
    .min(1, { message: "Seleziona almeno una chiave" })
    .max(1000),
  signature: z.string().min(1),
});

export const openChatSchema = z.object({
  orderId: z.number().int().positive(),
  signature: z.string().min(1),
});

/** Seller arms the collaborative release: signs the ark tx and stores the unsigned checkpoints. */
export const prepareReleaseSchema = z.object({
  sellerSignedCollabPsbt: z.string().min(1),
  checkpointPsbts: z.array(z.string().min(1)).min(1),
  signature: z.string().min(1),
});

/** Buyer countersigns: submits the ark tx to the operator and signs the returned checkpoints. */
export const collaborateReleaseSchema = z.object({
  collabArkTxid: z.string().min(1),
  serverSignedCheckpoints: z.array(z.string().min(1)).min(1),
  buyerSignedCheckpoints: z.array(z.string().min(1)).min(1),
  signature: z.string().min(1),
});

/** Seller finalizes: broadcasts the fully-signed checkpoints, releasing the funds. */
export const finalizeReleaseSchema = z.object({
  signature: z.string().min(1),
});

/** Seller confirms the order (delivers keys). */
export const confirmOrderSchema = z.object({
  signature: z.string().min(1),
});

/** Buyer or seller triggers a re-check of escrow funding against the indexer. */
export const verifyFundingSchema = z.object({
  signature: z.string().min(1),
});

/** Buyer or seller escalates the order to a dispute. */
export const openDisputeSchema = z.object({
  signature: z.string().min(1),
});

/**
 * Favoured party prepares the dispute settlement: sends the signed ark tx and unsigned
 * checkpoint PSBTs. Amounts/addresses are NOT sent — the server recalculates them from the
 * stored verdict and validates the client-submitted tx against them.
 */
export const settleDisputePrepareSchema = z.object({
  favouredSignedArkPsbt: z.string().min(1),
  checkpointPsbts: z.array(z.string().min(1)).min(1),
  signature: z.string().min(1),
});

/** Favoured party finalizes the dispute settlement: sends the fully-signed checkpoint PSBTs. */
export const settleDisputeFinalizeSchema = z.object({
  fullySignedCheckpoints: z.array(z.string().min(1)).min(1),
  signature: z.string().min(1),
});

/** Stage 2 surface — unilateral CSV exit (stub; endpoint responds 501). */
export const disputeExitSchema = z.object({
  signature: z.string().min(1),
});

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
    // Content ciphertext (ECIES envelope, `v1:...`). Optional only when an attachment carries the message.
    ciphertext: z.string().min(1).max(20000).optional(),
    // One wrapped CEK per recipient (buyer + seller). wrapperPubkey is set server-side = sender.
    keys: z.array(wrappedKeySchema).optional(),
    attachment: chatAttachmentSchema.optional(),
    signature: z.string().min(1),
  })
  .refine((data) => data.ciphertext != null || data.attachment != null, {
    message: "È necessario inserire un testo o allegare un'immagine.",
  })
  .refine((data) => data.ciphertext == null || (data.keys != null && data.keys.length >= 2), {
    message: "Envelope incompleto: chiavi mancanti per i destinatari.",
  });

// Admin chat message. Same shape as a user message but addressed to buyer + seller + admin, and
// signed by the admin key (chatId comes from the URL, not the body).
export const adminMessageSchema = z
  .object({
    ciphertext: z.string().min(1).max(20000).optional(),
    keys: z.array(wrappedKeySchema).optional(),
    attachment: chatAttachmentSchema.optional(),
    signature: z.string().min(1),
  })
  .refine((data) => data.ciphertext != null || data.attachment != null, {
    message: "È necessario inserire un testo o allegare un'immagine.",
  })
  .refine((data) => data.ciphertext == null || (data.keys != null && data.keys.length >= 2), {
    message: "Envelope incompleto: chiavi mancanti per i destinatari.",
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
  signature: z.string().min(1),
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
    signature: z.string().min(1),
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
