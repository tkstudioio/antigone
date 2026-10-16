"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "react-toastify";
import { ImagePlus, KeyRound, Loader2, Trash2 } from "lucide-react";

import { useSaveProduct, type AdminProductRow } from "@/hooks/admin";
import { IMAGE_MIME_ALLOWLIST, MAX_ATTACHMENT_BYTES, productFieldsSchema } from "@/validators";
import { toProxySrc } from "@/components/product-image";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const RATING_ERROR = "The rating must be a number between 0 and 5";

// The form keeps description and rating as raw strings; they become `string | null` and
// `number | null` only in the payload.
const formSchema = productFieldsSchema.pick({ name: true, slug: true }).extend({
  description: z
    .string()
    .max(5000, { message: "The description must be at most 5,000 characters" }),
  rating: z.string().refine((v) => {
    if (v.trim() === "") return true;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= 5;
  }, RATING_ERROR),
});

type FormValues = z.infer<typeof formSchema>;

/** "Dark Quest: Deluxe Édition" → "dark-quest-deluxe-edition". */
function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/, "");
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The product to edit; omitted to create a new one. */
  product?: AdminProductRow | null;
};

export function AdminProductDialog({ open, onOpenChange, product }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{product ? "Edit product" : "New product"}</DialogTitle>
          <DialogDescription>
            {product
              ? "Changes are visible in the shop right away. Changing the slug changes the product URL."
              : "The product is listed in the shop as soon as it is created; sellers can then add keys to it."}
          </DialogDescription>
        </DialogHeader>
        {/* Remounted per product, so the form always starts from the row being edited. */}
        {open && (
          <ProductForm
            key={product?.id ?? "new"}
            product={product ?? null}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProductForm({ product, onDone }: { product: AdminProductRow | null; onDone: () => void }) {
  const save = useSaveProduct();
  // While creating, the slug follows the name until the admin edits it.
  const [slugTouched, setSlugTouched] = useState(product != null);
  const [imageUrl, setImageUrl] = useState<string | null>(product?.imageUrl ?? null);
  const [file, setFile] = useState<File | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: product?.name ?? "",
      slug: product?.slug ?? "",
      description: product?.description ?? "",
      rating: product?.rating != null ? String(Math.round(product.rating * 10) / 10) : "",
    },
  });

  const watchedName = useWatch({ control: form.control, name: "name" });

  async function onSubmit(values: FormValues) {
    const rating = values.rating.trim() === "" ? null : Math.round(Number(values.rating) * 10) / 10;
    try {
      await save.mutateAsync({
        id: product?.id,
        fields: {
          name: values.name.trim(),
          slug: values.slug.trim(),
          description: values.description.trim() || null,
          rating,
          imageUrl: file ? null : imageUrl,
        },
        file,
      });
      toast.success(product ? "Product updated" : "Product created");
      onDone();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error while saving the product";
      if (msg.toLowerCase().includes("slug")) {
        form.setError("slug", { message: msg });
      } else {
        toast.error(msg);
      }
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <ImageField
          imageUrl={imageUrl}
          file={file}
          name={watchedName}
          onFile={setFile}
          onRemove={() => {
            setFile(null);
            setImageUrl(null);
          }}
        />

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  autoComplete="off"
                  placeholder="Dark Quest: Deluxe Edition"
                  {...field}
                  onChange={(e) => {
                    field.onChange(e);
                    if (!slugTouched) {
                      form.setValue("slug", slugify(e.target.value), { shouldValidate: true });
                    }
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Slug</FormLabel>
              <FormControl>
                <Input
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono"
                  placeholder="dark-quest-deluxe-edition"
                  {...field}
                  onChange={(e) => {
                    setSlugTouched(true);
                    field.onChange(e.target.value.toLowerCase());
                  }}
                />
              </FormControl>
              <FormDescription>
                The product URL: <span className="font-mono">/products/{field.value || "…"}</span>
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea rows={4} className="max-h-64" {...field} />
              </FormControl>
              <FormDescription>
                Optional. The first 160 characters are used for SEO.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="rating"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Rating</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={5}
                  step={0.1}
                  className="w-28 tabular-nums"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Optional, 0–5. Orders the «Top-rated» strip on the home page.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <DialogFooter>
          <Button type="button" variant="outline" action="muted" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {product ? "Save" : "Create product"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function ImageField({
  imageUrl,
  file,
  name,
  onFile,
  onRemove,
}: {
  imageUrl: string | null;
  file: File | null;
  name: string;
  onFile: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Local preview of a picked file; the object URL is released when it changes or unmounts.
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const src = previewUrl ?? (imageUrl ? toProxySrc(imageUrl) : null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    if (!(IMAGE_MIME_ALLOWLIST as readonly string[]).includes(picked.type)) {
      toast.error("Unsupported file type. Only images are allowed (JPEG, PNG, WebP, GIF).");
      return;
    }
    if (picked.size > MAX_ATTACHMENT_BYTES) {
      toast.error("The image exceeds the maximum size of 5 MB.");
      return;
    }
    onFile(picked);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Image</p>
      <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-md bg-muted">
        {src ? (
          <Image
            src={src}
            alt={name ? `${name} preview` : "Product image preview"}
            fill
            unoptimized
            sizes="512px"
            className="object-cover"
          />
        ) : (
          <KeyRound className="size-10 text-muted-foreground" aria-hidden />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={IMAGE_MIME_ALLOWLIST.join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={handleChange}
        />
        <Button
          type="button"
          variant="outline"
          action="muted"
          size="sm"
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus />
          {src ? "Replace image" : "Upload image"}
        </Button>
        {src && (
          <Button type="button" variant="ghost" action="negative" size="sm" onClick={onRemove}>
            <Trash2 />
            Remove
          </Button>
        )}
        <span className="text-xs text-muted-foreground">JPEG, PNG, WebP or GIF, up to 5 MB.</span>
      </div>
    </div>
  );
}
