import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { paginate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PaginationEllipsis } from "@/components/ui/pagination";

/** Real links (crawlable, keyboard-friendly); `href` builds the URL of a page keeping the filters. */
export function ProductsPagination({
  page,
  pageCount,
  href,
}: {
  page: number;
  pageCount: number;
  href: (page: number) => string;
}) {
  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-1">
      {page > 1 && (
        <Button asChild variant="ghost" action="muted">
          <Link href={href(page - 1)} aria-label="Previous page">
            <ChevronLeft />
            <span className="hidden sm:inline">Previous</span>
          </Link>
        </Button>
      )}

      {paginate(page, pageCount).map((p, idx) =>
        typeof p === "string" ? (
          <PaginationEllipsis key={`dots-${idx}`} />
        ) : (
          <Button
            key={p}
            asChild
            variant={p === page ? "outline" : "ghost"}
            action="muted"
            className="min-w-10 tabular-nums"
          >
            <Link href={href(p)} aria-current={p === page ? "page" : undefined}>
              {p}
            </Link>
          </Button>
        )
      )}

      {page < pageCount && (
        <Button asChild variant="ghost" action="muted">
          <Link href={href(page + 1)} aria-label="Next page">
            <span className="hidden sm:inline">Next</span>
            <ChevronRight />
          </Link>
        </Button>
      )}
    </nav>
  );
}
