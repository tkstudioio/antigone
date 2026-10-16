import "server-only";

import { db } from "@/db";
import { deleteProductObject } from "@/lib/storage/s3";
import { PRODUCT_IMAGE_KEY_REGEX } from "@/validators";

type ProductFields = {
  name: string;
  slug: string;
  description: string | null;
  rating: number | null;
  imageUrl: string | null;
};

type MutationError = { error: string; status: number };

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}

const SLUG_TAKEN: MutationError = {
  error: "This slug is already used by another product",
  status: 409,
};
const NOT_FOUND: MutationError = { error: "Product not found", status: 404 };
const INVALID_IMAGE: MutationError = { error: "Invalid product image", status: 422 };

/** Only images uploaded through the admin image endpoint live under `products/` in the bucket. */
function isUploadedImageKey(value: string | null): value is string {
  return value != null && PRODUCT_IMAGE_KEY_REGEX.test(value);
}

function normalize(fields: ProductFields): ProductFields {
  return { ...fields, description: fields.description || null };
}

export async function createProduct(
  fields: ProductFields
): Promise<{ id: number; slug: string } | MutationError> {
  // A new product can only point at an uploaded image (or none): never at an arbitrary key or URL.
  if (fields.imageUrl != null && !isUploadedImageKey(fields.imageUrl)) return INVALID_IMAGE;

  try {
    const product = await db.product.create({
      data: normalize(fields),
      select: { id: true, slug: true },
    });
    return product;
  } catch (err) {
    if (isUniqueViolation(err)) return SLUG_TAKEN;
    throw err;
  }
}

export async function updateProduct(
  id: number,
  fields: ProductFields
): Promise<{ id: number; slug: string } | MutationError> {
  const current = await db.product.findUnique({ where: { id }, select: { imageUrl: true } });
  if (!current) return NOT_FOUND;

  // The image may stay as it is (also a legacy external URL), be removed, or be a fresh upload.
  const imageChanged = fields.imageUrl !== current.imageUrl;
  if (imageChanged && fields.imageUrl != null && !isUploadedImageKey(fields.imageUrl)) {
    return INVALID_IMAGE;
  }

  let product: { id: number; slug: string };
  try {
    product = await db.product.update({
      where: { id },
      data: normalize(fields),
      select: { id: true, slug: true },
    });
  } catch (err) {
    if (isUniqueViolation(err)) return SLUG_TAKEN;
    throw err;
  }

  if (imageChanged && isUploadedImageKey(current.imageUrl)) {
    await deleteProductObject(current.imageUrl);
  }
  return product;
}

/**
 * Archive (or restore) a product. An archived product leaves the storefront and accepts no new
 * stock, reservation or checkout; keys already sold and their orders are untouched.
 */
export async function setProductArchived(
  id: number,
  archived: boolean
): Promise<{ id: number; archivedAt: string | null } | MutationError> {
  const result = await db.product.updateMany({
    where: { id },
    data: { archivedAt: archived ? new Date() : null },
  });
  if (result.count === 0) return NOT_FOUND;

  const product = await db.product.findUniqueOrThrow({
    where: { id },
    select: { id: true, archivedAt: true },
  });
  return { id: product.id, archivedAt: product.archivedAt?.toISOString() ?? null };
}

/**
 * Permanently delete a product. Only a product that never had keys can go: `Key.product` cascades,
 * so deleting one with keys would wipe sellers' stock and the keys of past orders. Those are
 * archived instead.
 */
export async function deleteProduct(id: number): Promise<{ deleted: true } | MutationError> {
  const product = await db.product.findUnique({ where: { id }, select: { imageUrl: true } });
  if (!product) return NOT_FOUND;

  // Conditional delete: the "no keys" check and the delete are one statement, so a key uploaded
  // in between cannot be cascaded away (and a key insert racing the delete fails on its FK).
  const deleted = await db.product.deleteMany({ where: { id, keys: { none: {} } } });
  if (deleted.count === 0) {
    return {
      error: "This product has license keys and cannot be deleted: archive it instead",
      status: 409,
    };
  }

  if (isUploadedImageKey(product.imageUrl)) await deleteProductObject(product.imageUrl);
  return { deleted: true };
}
