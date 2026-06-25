"use client";

import type { ChatMessageAttachment } from "@/lib/backend/query-chat-types";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toLocaleString("en-US", { maximumFractionDigits: 1 })} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("en-US", { maximumFractionDigits: 1 })} MB`;
}

const IMAGE_MIME_PREFIXES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

type Props = {
  attachment: ChatMessageAttachment;
};

export function MessageAttachment({ attachment }: Props) {
  const isImage = IMAGE_MIME_PREFIXES.includes(attachment.contentType);

  if (isImage) {
    return (
      <a
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block mt-1"
        title={`${attachment.name} (${formatFileSize(attachment.size)})`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.url}
          alt={attachment.name}
          className="max-h-48 max-w-full rounded-md border object-contain cursor-pointer hover:opacity-90 transition-opacity"
        />
        <span className="block text-[10px] text-muted-foreground mt-0.5">
          {attachment.name} · {formatFileSize(attachment.size)}
        </span>
      </a>
    );
  }

  // Fallback chip for non-image types (defensive)
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 mt-1 rounded-md border bg-muted px-2 py-1 text-xs hover:bg-muted/70 transition-colors"
    >
      <span className="truncate max-w-[180px]">{attachment.name}</span>
      <span className="text-muted-foreground shrink-0">{formatFileSize(attachment.size)}</span>
    </a>
  );
}
