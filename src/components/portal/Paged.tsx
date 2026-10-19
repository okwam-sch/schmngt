import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shared client pagination for every long list in the portal. Resets to the
 * first page when the underlying list changes length (e.g. a filter).
 */
export function usePaged<T>(items: T[], pageSize = 10) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  useEffect(() => setPage(0), [items.length]);
  const safe = Math.min(page, pages - 1);
  const slice = useMemo(() => items.slice(safe * pageSize, safe * pageSize + pageSize), [items, safe, pageSize]);
  return { items: slice, page: safe, pages, total: items.length, pageSize, setPage };
}

export function Pager({
  page,
  pages,
  total,
  pageSize,
  setPage,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  setPage: (n: number) => void;
}) {
  if (total <= pageSize) return null;
  const from = page * pageSize + 1;
  const to = Math.min(total, from + pageSize - 1);
  return (
    <div className="flex items-center justify-between gap-3 pt-3 text-sm text-muted-foreground">
      <span>
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <span className="px-2">
          Page {page + 1} of {pages}
        </span>
        <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Next page">
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
