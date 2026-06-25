"use client";

import { useEffect, useState } from "react";
import { match } from "ts-pattern";
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { useDebounceValue } from "usehooks-ts";
import { MessageSquare, SearchIcon } from "lucide-react";

import { formatPrice } from "@/lib/utils";
import { useAdminChats } from "@/hooks/admin";
import { AdminChatSheet } from "@/components/admin-chat-sheet";
import { Badge, type BadgeStyle } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupText,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "createdAt_desc", label: "Date (newest)" },
  { value: "createdAt_asc", label: "Date (oldest)" },
  { value: "totalSats_desc", label: "Amount descending" },
  { value: "totalSats_asc", label: "Amount ascending" },
  { value: "status_asc", label: "Status A→Z" },
  { value: "status_desc", label: "Status Z→A" },
];

const CHAT_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  closed: "Closed",
};

function chatStatusBadge(status: string): BadgeStyle {
  if (status === "open") return { action: "positive", variant: "solid" };
  if (status === "closed") return { action: "muted", variant: "solid" };
  return { action: "muted", variant: "outline" };
}

export function ChatsTable() {
  const [query, setQuery] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    sort: parseAsStringLiteral(["createdAt", "totalSats", "status"] as const).withDefault(
      "createdAt"
    ),
    dir: parseAsStringLiteral(["asc", "desc"] as const).withDefault("desc"),
    search: parseAsString.withDefault(""),
  });

  const [inputValue, setInputValue] = useState(query.search);
  const [debouncedInput] = useDebounceValue(inputValue, 400);

  useEffect(() => {
    if (debouncedInput === query.search) return;
    setQuery({ search: debouncedInput || "", page: 1 });
  }, [debouncedInput]); // eslint-disable-line react-hooks/exhaustive-deps

  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const sortSelectValue = `${query.sort}_${query.dir}`;

  function handleSortChange(value: string) {
    const [sort, dir] = value.split("_") as ["createdAt" | "totalSats" | "status", "asc" | "desc"];
    void setQuery({ sort, dir, page: 1 });
  }

  function handleRowClick(chatId: number) {
    setSelectedChatId(chatId);
    setSheetOpen(true);
  }

  const chatsQuery = useAdminChats({
    page: query.page,
    sort: query.sort,
    dir: query.dir,
    search: query.search || undefined,
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <InputGroup className="max-w-small">
          <InputGroupAddon>
            <InputGroupText>
              <SearchIcon className="size-4" />
            </InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search by buyer or seller username..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
        </InputGroup>
        <Select value={sortSelectValue} onValueChange={handleSortChange}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Sort by..." />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {match(chatsQuery)
        .with({ isPending: true }, () => (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ))
        .with({ isError: true }, () => (
          <div className="flex flex-col items-center gap-3 py-16 text-destructive">
            <p className="text-sm">Error loading chats. Try again later.</p>
          </div>
        ))
        .with({ isSuccess: true }, ({ data }) => {
          const { data: rows, total, pageSize } = data;
          const totalPages = Math.ceil(total / pageSize);

          if (rows.length === 0) {
            return (
              <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
                <MessageSquare className="size-10 opacity-40" />
                <p className="text-sm">No chats found.</p>
              </div>
            );
          }

          return (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">{total.toLocaleString("en-US")} chat</p>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Chat ID</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead>Buyer</TableHead>
                      <TableHead>Seller</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Messages</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const statusLabel = CHAT_STATUS_LABELS[row.status] ?? row.status;
                      const statusBadge = chatStatusBadge(row.status);

                      return (
                        <TableRow
                          key={row.id}
                          className="cursor-pointer"
                          onClick={() => handleRowClick(row.id)}
                        >
                          <TableCell className="font-mono text-sm">#{row.id}</TableCell>
                          <TableCell className="font-mono text-sm">#{row.orderId}</TableCell>
                          <TableCell>{row.buyerUsername ?? "—"}</TableCell>
                          <TableCell>{row.sellerUsername ?? "—"}</TableCell>
                          <TableCell className="text-right">{formatPrice(row.totalSats)}</TableCell>
                          <TableCell className="text-right">
                            {row.messageCount.toLocaleString("en-US")}
                          </TableCell>
                          <TableCell>
                            <Badge {...statusBadge}>{statusLabel}</Badge>
                          </TableCell>
                          <TableCell>
                            {new Date(row.createdAt).toLocaleDateString("en-US")}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={query.page <= 1}
                    onClick={() => setQuery({ page: query.page - 1 })}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {query.page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={query.page >= totalPages}
                    onClick={() => setQuery({ page: query.page + 1 })}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          );
        })
        .otherwise(() => null)}

      {/* Sheet */}
      <AdminChatSheet chatId={selectedChatId} open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}
