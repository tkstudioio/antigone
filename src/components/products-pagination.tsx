"use client";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { paginate } from "@/lib/utils";

import { parseAsInteger, useQueryState } from "nuqs";

export function ProductsPagination(props: { pageCount: number }) {
  const [page, setPage] = useQueryState(
    "page",
    parseAsInteger.withDefault(1).withOptions({ shallow: false })
  );

  return (
    <Pagination>
      <PaginationContent>
        {page > 1 ? (
          <PaginationItem>
            <PaginationPrevious onClick={() => setPage(page - 1)} />
          </PaginationItem>
        ) : null}

        {paginate(page, props.pageCount).map((page, idx) => {
          if (typeof page === "string") {
            return (
              <PaginationItem key={idx}>
                <PaginationEllipsis />
              </PaginationItem>
            );
          }

          return (
            <PaginationItem key={idx}>
              <PaginationLink onClick={() => setPage(page)}>{page}</PaginationLink>
            </PaginationItem>
          );
        })}

        {page < props.pageCount ? (
          <PaginationItem onClick={() => setPage(page + 1)}>
            <PaginationNext />
          </PaginationItem>
        ) : null}
      </PaginationContent>
    </Pagination>
  );
}
