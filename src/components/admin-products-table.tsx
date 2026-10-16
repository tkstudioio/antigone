"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { match } from "ts-pattern";
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { useDebounceValue } from "usehooks-ts";
import { toast } from "react-toastify";
import {
  Archive,
  ArchiveRestore,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  MoreHorizontal,
  PackageSearch,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import {
  useAdminProducts,
  useDeleteProduct,
  useSetProductArchived,
  type AdminProductRow,
} from "@/hooks/admin";
import { toProxySrc } from "@/components/product-image";
import { AdminProductDialog } from "@/components/admin-product-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { H1, P } from "@/components/ui/typography";

const statusOptions = [
  { value: "active", label: "Listed" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" },
] as const;

const sortOptions = [
  { value: "createdAt", label: "Newest", dir: "desc" },
  { value: "name", label: "Name", dir: "asc" },
] as const;

/** What the confirmation dialog is about to do, if anything. */
type PendingAction = { kind: "archive" | "delete"; product: AdminProductRow } | null;

const n = (value: number) => value.toLocaleString("en-US");

export function AdminProductsTable() {
  const [query, setQuery] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    search: parseAsString.withDefault(""),
    status: parseAsStringLiteral(["active", "archived", "all"] as const).withDefault("active"),
    sort: parseAsStringLiteral(["createdAt", "name"] as const).withDefault("createdAt"),
  });

  const [inputValue, setInputValue] = useState(query.search);
  const [debouncedInput] = useDebounceValue(inputValue, 350);

  useEffect(() => {
    if (debouncedInput === query.search) return;
    setQuery({ search: debouncedInput, page: 1 });
  }, [debouncedInput]); // eslint-disable-line react-hooks/exhaustive-deps

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdminProductRow | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);

  const productsQuery = useAdminProducts({
    page: query.page,
    search: query.search || undefined,
    status: query.status,
    sort: query.sort,
    dir: sortOptions.find((o) => o.value === query.sort)?.dir,
  });
  const setArchived = useSetProductArchived();
  const deleteProduct = useDeleteProduct();

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(product: AdminProductRow) {
    setEditing(product);
    setDialogOpen(true);
  }

  async function archive(product: AdminProductRow, archived: boolean) {
    try {
      await setArchived.mutateAsync({ id: product.id, archived });
      toast.success(archived ? `«${product.name}» archived` : `«${product.name}» is listed again`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error while updating the product");
    }
  }

  async function remove(product: AdminProductRow) {
    try {
      await deleteProduct.mutateAsync({ id: product.id });
      toast.success(`«${product.name}» deleted`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error while deleting the product");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 py-8 pb-16">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
            Catalog
          </span>
          <H1 className="text-3xl">Products</H1>
          <P className="max-w-xl text-pretty text-muted-foreground">
            The products sellers can list keys for. Archiving takes a product off the shop without
            touching past orders; only a product that never had keys can be deleted.
          </P>
        </div>
        <Button onClick={openCreate} className="w-full font-semibold sm:w-auto">
          <Plus />
          New product
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <InputGroup className="lg:max-w-sm">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search name or slug"
            aria-label="Search name or slug"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          {(inputValue.length > 0 || query.search.length > 0) && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                aria-label="Clear search"
                onClick={() => {
                  setInputValue("");
                  setQuery({ search: "", page: 1 });
                }}
              >
                <X />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>

        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <SegmentedControl
            aria-label="Status"
            className="min-w-fit flex-1 sm:flex-none"
            value={query.status}
            onValueChange={(status) => setQuery({ status, page: 1 })}
            options={statusOptions.map((o) => ({ value: o.value, label: o.label }))}
          />
          <SegmentedControl
            aria-label="Sort by"
            className="min-w-fit flex-1 sm:flex-none"
            value={query.sort}
            onValueChange={(sort) => setQuery({ sort, page: 1 })}
            options={sortOptions.map((o) => ({ value: o.value, label: o.label }))}
          />
        </div>
      </div>

      <section aria-label="Products" className="space-y-4">
        {match(productsQuery)
          .with({ isPending: true }, () => <ProductRowsSkeleton />)
          .with({ isError: true }, () => (
            <p className="text-sm text-destructive">Error loading products. Try again later.</p>
          ))
          .with({ isSuccess: true }, ({ data }) => {
            const { data: rows, total, pageSize } = data;
            const totalPages = Math.ceil(total / pageSize);

            if (rows.length === 0) {
              return (
                <EmptyState
                  filtered={query.search.length > 0 || query.status !== "active"}
                  onCreate={openCreate}
                />
              );
            }

            return (
              <>
                <p className="text-sm text-muted-foreground">
                  {n(total)} product{total === 1 ? "" : "s"}
                </p>

                <Card className="space-y-0 py-0">
                  <ul className="divide-y">
                    {rows.map((row) => (
                      <li key={row.id}>
                        <ProductRow
                          product={row}
                          onEdit={() => openEdit(row)}
                          onArchive={() => setPending({ kind: "archive", product: row })}
                          onRestore={() => archive(row, false)}
                          onDelete={() => setPending({ kind: "delete", product: row })}
                        />
                      </li>
                    ))}
                  </ul>
                </Card>

                {totalPages > 1 && (
                  <nav
                    aria-label="Pagination"
                    className="flex items-center justify-between gap-4 sm:justify-end"
                  >
                    <Button
                      variant="outline"
                      action="muted"
                      size="sm"
                      disabled={query.page <= 1}
                      onClick={() => setQuery({ page: query.page - 1 })}
                    >
                      <ChevronLeft />
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      Page {n(query.page)} of {n(totalPages)}
                    </span>
                    <Button
                      variant="outline"
                      action="muted"
                      size="sm"
                      disabled={query.page >= totalPages}
                      onClick={() => setQuery({ page: query.page + 1 })}
                    >
                      Next
                      <ChevronRight />
                    </Button>
                  </nav>
                )}
              </>
            );
          })
          .otherwise(() => null)}
      </section>

      <AdminProductDialog open={dialogOpen} onOpenChange={setDialogOpen} product={editing} />

      <AlertDialog open={pending != null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          {pending?.kind === "archive" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Archive «{pending.product.name}»?</AlertDialogTitle>
                <AlertDialogDescription>
                  It leaves the shop: its {n(pending.product.availableKeys)} available key
                  {pending.product.availableKeys === 1 ? "" : "s"} can no longer be reserved or
                  bought, and sellers cannot add new stock. Existing orders are not affected. You
                  can list it again at any time.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel action="muted">Cancel</AlertDialogCancel>
                <AlertDialogAction action="warning" onClick={() => archive(pending.product, true)}>
                  Archive
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
          {pending?.kind === "delete" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete «{pending.product.name}»?</AlertDialogTitle>
                <AlertDialogDescription>
                  The product and its image are permanently removed. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel action="muted">Cancel</AlertDialogCancel>
                <AlertDialogAction action="negative" onClick={() => remove(pending.product)}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ProductRow({
  product,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
}: {
  product: AdminProductRow;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const archived = product.archivedAt != null;
  const deletable = product.totalKeys === 0;

  return (
    <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="relative flex aspect-video w-20 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
          {product.imageUrl ? (
            <Image
              src={toProxySrc(product.imageUrl)}
              alt=""
              fill
              unoptimized
              sizes="80px"
              className={archived ? "object-cover opacity-50 grayscale" : "object-cover"}
            />
          ) : (
            <KeyRound className="size-5 text-muted-foreground" aria-hidden />
          )}
        </div>
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate font-semibold">{product.name}</p>
            {archived && (
              <Badge variant="outline" action="muted" className="shrink-0 text-xs">
                Archived
              </Badge>
            )}
          </div>
          <p className="truncate font-mono text-xs text-muted-foreground">/{product.slug}</p>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-4 text-sm sm:w-72 sm:shrink-0">
        <Stat label="Available" value={product.availableKeys} />
        <Stat label="Sold" value={product.soldKeys} />
        <Stat label="Total keys" value={product.totalKeys} />
      </dl>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            action="muted"
            size="sm"
            className="self-end sm:self-auto"
            aria-label={`Actions for ${product.name}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil />
            Edit
          </DropdownMenuItem>
          {archived ? (
            <DropdownMenuItem onSelect={onRestore}>
              <ArchiveRestore />
              List again
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={onArchive}>
              <Archive />
              Archive
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" disabled={!deletable} onSelect={onDelete}>
            <Trash2 />
            {deletable ? "Delete" : "Delete (has keys)"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{n(value)}</dd>
    </div>
  );
}

function ProductRowsSkeleton() {
  return (
    <Card className="space-y-0 divide-y py-0" aria-busy aria-label="Loading products">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 p-5">
          <Skeleton className="aspect-video w-20 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-2/5" />
            <Skeleton className="h-4 w-1/4" />
          </div>
          <Skeleton className="hidden h-10 w-72 sm:block" />
        </div>
      ))}
    </Card>
  );
}

function EmptyState({ filtered, onCreate }: { filtered: boolean; onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-md border border-dashed px-6 py-16 text-center">
      <span
        aria-hidden
        className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-5"
      >
        <PackageSearch />
      </span>
      <div className="space-y-1">
        <p className="font-semibold">{filtered ? "No products found" : "The catalog is empty"}</p>
        <p className="text-sm text-muted-foreground">
          {filtered
            ? "Try a different search or status."
            : "Create the first product so sellers can list keys for it."}
        </p>
      </div>
      {!filtered && (
        <Button onClick={onCreate}>
          <Plus />
          New product
        </Button>
      )}
    </div>
  );
}
