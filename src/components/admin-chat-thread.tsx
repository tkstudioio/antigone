"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { match } from "ts-pattern";
import { toast } from "react-toastify";
import { useAdminChat, useAdminSendMessage, useUploadAdminChatAttachment } from "@/hooks/admin";
import type { AttachmentMeta, VerifiedChatMessage } from "@/hooks/chat";
import { MessageAttachment } from "@/components/message-attachment";
import {
  ChainGapBanner,
  MessageVerificationBadge,
  VerificationBadge,
} from "@/components/verification-badge";
import { Badge, type BadgeStyle } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { IMAGE_MIME_ALLOWLIST, MAX_ATTACHMENT_BYTES } from "@/validators";

const CHAT_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  closed: "Closed",
};

function statusBadge(status: string): BadgeStyle {
  if (status === "open") return { action: "positive", variant: "solid" };
  if (status === "closed") return { action: "muted", variant: "solid" };
  return { action: "muted", variant: "outline" };
}

function AdminMessageBubble({
  msg,
  buyerPubkey,
  sellerPubkey,
}: {
  msg: VerifiedChatMessage;
  buyerPubkey: string;
  sellerPubkey: string;
}) {
  if (msg.isSystem) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <span className="rounded bg-muted px-3 py-1 text-xs italic text-muted-foreground">
          {msg.message ?? "—"}
        </span>
        <VerificationBadge status="system" className="text-[10px]" />
      </div>
    );
  }

  const isBuyer = msg.senderPubkey === buyerPubkey;
  const isSeller = msg.senderPubkey === sellerPubkey;
  const senderLabel = isBuyer ? "Buyer" : isSeller ? "Seller" : "Admin";
  const align = isBuyer ? "items-start" : isSeller ? "items-end" : "items-center";
  const bubbleClass = isBuyer
    ? "bg-muted text-foreground"
    : isSeller
      ? "bg-primary text-primary-foreground"
      : "bg-accent text-accent-foreground";

  // A message that failed verification is never rendered: its content may have been forged.
  if (msg.verification.status === "tampered") {
    return (
      <div className={`flex flex-col gap-0.5 ${align}`}>
        <span className="text-xs text-muted-foreground">{senderLabel}</span>
        <div className="max-w-xs rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
          <MessageVerificationBadge msg={msg} />
        </div>
        <span className="text-xs text-muted-foreground">
          {new Date(msg.sentAt).toLocaleString("en-US")}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-0.5 ${align}`}>
      <span className="text-xs text-muted-foreground">{senderLabel}</span>
      <div className={`max-w-xs rounded-lg px-3 py-2 text-sm ${bubbleClass}`}>
        {msg.message ?? (msg.attachment == null ? "—" : null)}
        {msg.attachment != null && <MessageAttachment attachment={msg.attachment} />}
      </div>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {new Date(msg.sentAt).toLocaleString("en-US")}
        <MessageVerificationBadge msg={msg} />
      </span>
    </div>
  );
}

type Props = {
  chatId: number;
  showHeader?: boolean;
  /**
   * Buyer and seller as established by the VERIFIED order (the dispute detail). Without it the
   * chat's own (server-provided) buyer/seller are used.
   */
  parties?: { buyerPubkey: string; sellerPubkey: string };
};

export function AdminChatThread({ chatId, showHeader = false, parties }: Props) {
  const chatQuery = useAdminChat(chatId, parties);
  const sendMutation = useAdminSendMessage(chatId, {
    buyerPubkey: parties?.buyerPubkey ?? chatQuery.data?.buyerPubkey ?? "",
    sellerPubkey: parties?.sellerPubkey ?? chatQuery.data?.sellerPubkey ?? "",
  });
  const uploadMutation = useUploadAdminChatAttachment(chatId);

  const [draft, setDraft] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const messageCount = chatQuery.data?.messages.length ?? 0;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messageCount]);

  // Revoke object URL when the file changes or the component unmounts
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const isClosed = chatQuery.data?.status === "closed";
  const isBusy = sendMutation.isPending || uploadMutation.isPending;
  const canSend = !isClosed && !isBusy && (draft.trim().length > 0 || pendingFile != null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!(IMAGE_MIME_ALLOWLIST as readonly string[]).includes(file.type)) {
      toast.error("Unsupported file type. Only images are allowed (JPEG, PNG, WebP, GIF).");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error("The file exceeds the maximum size of 5 MB.");
      e.target.value = "";
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    e.target.value = "";
  }

  function removePendingFile() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingFile(null);
    setPreviewUrl(null);
  }

  async function handleSend() {
    if (!canSend) return;

    let attachment: AttachmentMeta | undefined;
    if (pendingFile) {
      try {
        attachment = await uploadMutation.mutateAsync(pendingFile);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error uploading the attachment");
        return;
      }
    }

    const message = draft.trim() || undefined;

    sendMutation.mutate(
      { message, attachment },
      {
        onSuccess: () => {
          setDraft("");
          removePendingFile();
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Error sending the message");
        },
      }
    );
  }

  return (
    <div className="flex flex-col gap-0 h-full">
      {showHeader &&
        match(chatQuery)
          .with({ isSuccess: true }, ({ data: chat }) => {
            const statusLabel = CHAT_STATUS_LABELS[chat.status] ?? chat.status;
            return (
              <div className="flex items-center gap-3 border-b px-4 py-3">
                <span className="text-sm font-medium">
                  Chat #{chat.id} — Order #{chat.orderId}
                </span>
                <Badge {...statusBadge(chat.status)}>{statusLabel}</Badge>
              </div>
            );
          })
          .with({ isPending: true }, () => (
            <div className="border-b px-4 py-3">
              <Skeleton className="h-5 w-48" />
            </div>
          ))
          .otherwise(() => null)}

      {match(chatQuery)
        .with({ isPending: true }, () => (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ))
        .with({ isError: true }, () => (
          <div className="flex flex-1 items-center justify-center p-6">
            <p className="text-sm text-destructive">
              Error loading the chat. Please try again later.
            </p>
          </div>
        ))
        .with({ isSuccess: true }, ({ data: chat }) => (
          <>
            {isClosed && (
              <div className="bg-muted px-4 py-2 text-sm text-muted-foreground text-center">
                This chat is closed. You cannot send new messages.
              </div>
            )}

            {/* Thread */}
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4 max-h-96">
              {chat.messages.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground">
                  No messages in this chat.
                </p>
              ) : (
                chat.messages.map((msg) => {
                  const v = msg.verification;
                  const gapBefore =
                    (v.status === "verified" || v.status === "tampered") && v.gapBefore;
                  return (
                    <Fragment key={msg.id}>
                      {gapBefore && <ChainGapBanner />}
                      <AdminMessageBubble
                        msg={msg}
                        buyerPubkey={parties?.buyerPubkey ?? chat.buyerPubkey}
                        sellerPubkey={parties?.sellerPubkey ?? chat.sellerPubkey}
                      />
                    </Fragment>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            {/* Composer */}
            {!isClosed && (
              <div className="border-t px-4 py-3">
                {/* File preview */}
                {previewUrl && pendingFile && (
                  <div className="mb-2 flex items-start gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt="Attachment preview"
                      className="h-16 w-16 rounded object-cover border"
                    />
                    <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                      <span className="truncate max-w-[150px]">{pendingFile.name}</span>
                      <button
                        type="button"
                        onClick={removePendingFile}
                        className="text-destructive hover:underline text-left"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <Textarea
                    placeholder="Write a message as admin..."
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    disabled={isBusy}
                    rows={3}
                    className="resize-none"
                  />
                  <div className="flex items-center justify-between">
                    <div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="hidden"
                        onChange={handleFileChange}
                        disabled={isBusy}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Attach image
                      </Button>
                    </div>
                    <Button
                      type="button"
                      disabled={!canSend}
                      size="sm"
                      onClick={() => void handleSend()}
                    >
                      {isBusy ? "Sending..." : "Send"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        ))
        .otherwise(() => null)}
    </div>
  );
}
