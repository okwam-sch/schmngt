import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Archive, ChevronLeft, ChevronRight, Download, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFinanceConfig } from "@/hooks/useFinanceConfig";
import { useAcademicCalendar } from "@/hooks/useAcademicCalendar";
import { exportArchiveRecords, getArchiveRecords, getArchiveSummary } from "@/lib/archives.functions";
import { toast } from "sonner";
import { ARCHIVE_STATE_LABEL, getArchiveSource, type ArchiveState } from "@/lib/archives";
import { downloadRecordsCsv } from "@/lib/csv";

const ALL = "__all";
const STATE_VARIANT: Record<ArchiveState, "default" | "secondary" | "destructive"> = {
  current: "default",
  archived: "secondary",
  "disposal-due": "destructive",
};

export function ArchivesManagement() {
  const summaryFn = useServerFn(getArchiveSummary);
  const recordsFn = useServerFn(getArchiveRecords);
  const exportFn = useServerFn(exportArchiveRecords);
  const [exporting, setExporting] = useState(false);
  const { money } = useFinanceConfig();
  const cal = useAcademicCalendar();

  const [source, setSource] = useState("attendance");
  const [year, setYear] = useState(ALL);
  const [period, setPeriod] = useState(ALL);
  const [state, setState] = useState<"all" | ArchiveState>("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Any filter change goes back to the first page.
  const resetPage = () => setPage(1);

  const summary = useQuery({ queryKey: ["archives", "summary"], queryFn: () => summaryFn(), staleTime: 60_000 });
  const records = useQuery({
    queryKey: ["archives", "records", source, year, period, state, dateFrom, dateTo, page, pageSize],
    queryFn: () =>
      recordsFn({
        data: {
          source,
          state,
          page,
          pageSize,
          ...(year !== ALL ? { year } : {}),
          ...(period !== ALL ? { period } : {}),
          ...(dateFrom ? { dateFrom } : {}),
          ...(dateTo ? { dateTo } : {}),
        },
      }),
  });

  const def = getArchiveSource(source)!;
  const current = summary.data?.sources.find((s) => s.key === source);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = records.data?.records ?? [];
    if (!q) return list;
    return list.filter((r) =>
      def.columns.some((c) => String(r.cells[c.key] ?? "").toLowerCase().includes(q)),
    );
  }, [records.data, search, def]);

  const cell = (cells: Record<string, string | number | null>, c: (typeof def.columns)[number]) => {
    const v = cells[c.key];
    if (v === null || v === undefined || v === "") return "—";
    return c.money ? money(Number(v)) : String(v);
  };

  // Export runs on the server: Export Controls authorize it, Data Access limits the rows, and it is audited.
  const exportCsv = async () => {
    setExporting(true);
    try {
      const out = await exportFn({
        data: {
          source, state, page: 1, pageSize: 50,
          ...(year !== ALL ? { year } : {}),
          ...(period !== ALL ? { period } : {}),
          ...(dateFrom ? { dateFrom } : {}),
          ...(dateTo ? { dateTo } : {}),
        },
      });
      const body = out.rows.map((r) => ({
        Date: r.date,
        "Academic year": r.year,
        State: ARCHIVE_STATE_LABEL[r.state as ArchiveState],
        ...Object.fromEntries(def.columns.map((c) => [c.label, cell(r.cells, c)])),
      }));
      if (out.watermark) body.unshift({ Date: out.watermark } as any);
      downloadRecordsCsv(`archive-${source}${year !== ALL ? `-${year.replace("/", "-")}` : ""}.csv`, body);
      if (out.truncated) toast.warning("Export stopped at the scan limit; narrow the filters for older records.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {summary.isLoading ? (
          <div className="surface flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Loading archive summary…
          </div>
        ) : (
          summary.data?.sources.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => {
                setSource(s.key);
                setYear(ALL);
                setPeriod(ALL);
                setSearch("");
                resetPage();
              }}
              className={`surface p-4 text-left transition ${s.key === source ? "ring-2 ring-primary" : "hover:bg-muted/40"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{s.label}</p>
                <span className="text-xs text-muted-foreground">{s.module}</span>
              </div>
              <p className="mt-1 text-2xl font-bold">{s.total}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {s.counts.current} current · {s.counts.archived} archived · {s.counts["disposal-due"]} past retention
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Keep {s.retention.years} years{s.retention.policy ? ` (${s.retention.policy})` : " (default)"}
              </p>
              {s.error ? <p className="mt-1 text-xs text-destructive">Not readable: {s.error}</p> : null}
            </button>
          ))
        )}
      </section>

      <section className="surface space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Academic year</Label>
            <Select
              value={year}
              onValueChange={(v) => {
                setYear(v);
                resetPage();
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All years</SelectItem>
                {(current?.years ?? []).map((y) => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{cal.labels.singular}</Label>
            <Select
              value={period}
              onValueChange={(v) => {
                setPeriod(v);
                resetPage();
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All {cal.labels.plural.toLowerCase()}</SelectItem>
                {cal.periods.map((p) => (
                  <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>State</Label>
            <Select
              value={state}
              onValueChange={(v) => {
                setState(v as typeof state);
                resetPage();
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All states</SelectItem>
                {(Object.keys(ARCHIVE_STATE_LABEL) as ArchiveState[]).map((k) => (
                  <SelectItem key={k} value={k}>{ARCHIVE_STATE_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ar-from">From date</Label>
            <Input
              id="ar-from"
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => {
                setDateFrom(e.target.value);
                resetPage();
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ar-to">To date</Label>
            <Input
              id="ar-to"
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => {
                setDateTo(e.target.value);
                resetPage();
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ar-search">Search this page</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
              <Input id="ar-search" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setYear(ALL);
                setPeriod(ALL);
                setState("all");
                setDateFrom("");
                setDateTo("");
                setSearch("");
                resetPage();
              }}
            >
              Clear
            </Button>
            <Button variant="outline" className="flex-1" onClick={exportCsv} disabled={rows.length === 0 || exporting || !summary.data?.canExport} title={summary.data?.canExport ? undefined : "Export Controls do not allow your role to export"}>
              <Download className="size-4" aria-hidden /> Export CSV
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Records stay in their own modules. A record is archived once its {cal.labels.singular.toLowerCase()} locks
          in the academic calendar or its academic year has passed, and is flagged past retention after the period set
          under Reporting & Records Configuration → Archive &amp; Retention → Retention Policies (When: the record type, Then:
          "retain N years"). Nothing is deleted automatically.
        </p>
      </section>

      <section className="surface overflow-x-auto">
        {records.isLoading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Loading records…
          </div>
        ) : records.error ? (
          <p className="p-6 text-sm text-destructive">{(records.error as Error).message}</p>
        ) : rows.length === 0 ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Archive className="size-4" aria-hidden /> No records match these filters.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left">
              <tr>
                <th className="p-3 font-medium">Date</th>
                <th className="p-3 font-medium">Academic year</th>
                {def.columns.map((c) => (
                  <th key={c.key} className="p-3 font-medium">{c.label}</th>
                ))}
                <th className="p-3 font-medium">State</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60">
                  <td className="p-3 tabular-nums">{r.date}</td>
                  <td className="p-3">{r.year}</td>
                  {def.columns.map((c) => (
                    <td key={c.key} className="p-3">{cell(r.cells, c)}</td>
                  ))}
                  <td className="p-3">
                    <Badge variant={STATE_VARIANT[r.state]}>{ARCHIVE_STATE_LABEL[r.state]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {records.data ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-3">
            <p className="text-xs text-muted-foreground">
              {records.data.total} record{records.data.total === 1 ? "" : "s"}
              {records.data.truncated
                ? " — state filter limited to the newest 100,000 in this date range; narrow the dates to see more"
                : ""}
            </p>
            <div className="flex items-center gap-2">
              <Label htmlFor="ar-page-size" className="text-xs text-muted-foreground">Rows</Label>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  resetPage();
                }}
              >
                <SelectTrigger id="ar-page-size" className="h-8 w-20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[25, 50, 100, 200].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => setPage(1)} disabled={page <= 1 || records.isFetching}>
                First
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || records.isFetching}
              >
                <ChevronLeft className="size-4" aria-hidden /> Prev
              </Button>
              <span className="text-xs tabular-nums text-muted-foreground">
                Page {records.data.page} of {records.data.pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= records.data.pageCount || records.isFetching}
              >
                Next <ChevronRight className="size-4" aria-hidden />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(records.data!.pageCount)}
                disabled={page >= records.data.pageCount || records.isFetching}
              >
                Last
              </Button>
              {records.isFetching ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden /> : null}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
