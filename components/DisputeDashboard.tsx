"use client";

import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "@ag-grid-community/react";
import {
  CommunityFeaturesModule,
  ModuleRegistry,
  type ColDef,
  type GridApi,
  type GridReadyEvent,
  type ICellRendererParams,
} from "@ag-grid-community/core";
import { ClientSideRowModelModule } from "@ag-grid-community/client-side-row-model";
import { CsvExportModule } from "@ag-grid-community/csv-export";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSearch,
  LayoutGrid,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DisputeReviewModal from "@/components/DisputeReviewModal";
import type { DataBackend, Dispute } from "@/lib/types";
import {
  cn,
  confidenceTone,
  formatDate,
  formatMoney,
  formatRemaining,
  hoursUntil,
  statusTone,
} from "@/lib/utils";

ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  CommunityFeaturesModule,
  CsvExportModule,
]);

export default function DisputeDashboard() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [backend, setBackend] = useState<DataBackend>("memory");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Dispute | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const gridApi = useRef<GridApi<Dispute> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/disputes", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load disputes");
      setDisputes(data.disputes ?? []);
      setBackend(data.backend);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load disputes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    gridApi.current?.setGridOption("quickFilterText", query);
  }, [query]);

  const onGridReady = useCallback((event: GridReadyEvent<Dispute>) => {
    gridApi.current = event.api;
    event.api.sizeColumnsToFit();
  }, []);

  const exportCsv = useCallback(() => {
    gridApi.current?.exportDataAsCsv({ fileName: `dispute-queue-${Date.now()}.csv` });
    setNotice("CSV export started.");
  }, []);

  const seedDemoData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dev/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 15 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Seed failed");
      await load();
      setNotice(`Seeded ${data.count} demo disputes (${data.backend} backend).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Seed failed");
    } finally {
      setLoading(false);
    }
  }, [load]);

  const handleChanged = useCallback((updated: Dispute) => {
    setDisputes((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  }, []);

  const columnDefs = useMemo<ColDef<Dispute>[]>(
    () => [
      {
        headerName: "Dispute ID",
        field: "paypal_dispute_id",
        minWidth: 185,
        cellClass: "font-mono text-[12px] tracking-tight",
      },
      {
        headerName: "Customer",
        valueGetter: (params) =>
          [params.data?.customer_name, params.data?.customer_email]
            .filter(Boolean)
            .join(" — "),
        minWidth: 140,
        flex: 0.8,
        cellRenderer: (params: ICellRendererParams<Dispute, string>) => {
          const d = params.data;
          if (!d?.customer_name && !d?.customer_email) {
            return <span className="text-slate-600">—</span>;
          }
          return (
            <span className="flex w-full min-w-0 flex-col leading-tight">
              <span className="truncate text-slate-200">{d.customer_name ?? "—"}</span>
              <span className="truncate font-mono text-[10.5px] text-slate-500">
                {d.customer_email}
              </span>
            </span>
          );
        },
      },
      {
        headerName: "Reason Code",
        field: "dispute_reason",
        minWidth: 180,
        flex: 1,
      },
      {
        headerName: "Key Evidence",
        valueGetter: (params) => params.data?.key_evidence?.summary ?? "",
        minWidth: 195,
        flex: 1.2,
        cellRenderer: (params: ICellRendererParams<Dispute, string>) => {
          const summary = params.value;
          if (!summary) return <span className="text-slate-600">—</span>;
          return (
            <span
              className="flex w-full min-w-0 items-center gap-1.5 text-slate-300"
              title={summary}
            >
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-signal" />
              <span className="min-w-0 truncate">{summary}</span>
            </span>
          );
        },
      },
      {
        headerName: "Amount",
        field: "dispute_amount",
        minWidth: 110,
        filter: "agNumberColumnFilter",
        valueFormatter: (params) =>
          params.data ? formatMoney(params.data.dispute_amount, params.data.currency) : "—",
      },
      {
        headerName: "Reply By Date",
        field: "reply_by_date",
        minWidth: 150,
        comparator: (a: string, b: string) => new Date(a).getTime() - new Date(b).getTime(),
        valueFormatter: (params) => (params.value ? formatDate(params.value) : "—"),
        cellRenderer: (params: ICellRendererParams<Dispute, string>) => {
          if (!params.value) return "—";
          const hours = hoursUntil(params.value);
          const urgent = hours > 0 && hours < 48;
          const overdue = hours <= 0;
          return (
            <div className="flex flex-col leading-tight">
              <span className="text-slate-200">{formatDate(params.value)}</span>
              <span
                className={cn(
                  "font-mono text-[10.5px]",
                  overdue ? "text-danger" : urgent ? "text-alert" : "text-slate-500",
                )}
              >
                {overdue
                  ? "deadline passed"
                  : `${formatRemaining(params.value)} left`}
              </span>
            </div>
          );
        },
      },
      {
        headerName: "AI Confidence",
        field: "ai_confidence_score",
        minWidth: 145,
        filter: "agNumberColumnFilter",
        cellRenderer: (params: ICellRendererParams<Dispute, number>) => {
          const score = params.value ?? 0;
          const tone = confidenceTone(score);
          return (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[11.5px] font-semibold",
                tone.chip,
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
              {score}%
              <span className="font-normal opacity-70">{tone.label}</span>
            </span>
          );
        },
      },
      {
        headerName: "Action Status",
        field: "status",
        minWidth: 155,
        cellRenderer: (params: ICellRendererParams<Dispute, string>) => {
          const tone = statusTone(params.value ?? "");
          return (
            <span className="flex flex-col items-start gap-1">
              <Badge className={cn("border", tone.chip)}>{tone.label}</Badge>
              {params.data?.merchant_submitted && (
                <span className="inline-flex items-center gap-1 text-[11px] text-signal">
                  <CheckCircle2 className="h-3 w-3" /> Evidence submitted
                </span>
              )}
            </span>
          );
        },
      },
      {
        headerName: "",
        field: "id",
        minWidth: 125,
        maxWidth: 125,
        sortable: false,
        filter: false,
        cellRenderer: (params: ICellRendererParams<Dispute, string>) => (
          <button
            type="button"
            onClick={() => params.context?.onInspect(params.data)}
            className="inline-flex items-center gap-1.5 rounded-md border border-ink-600 px-2.5 py-1 text-[12px] text-slate-300 transition-colors hover:border-signal/60 hover:text-signal"
          >
            <FileSearch className="h-3.5 w-3.5" />
            Inspect Case
          </button>
        ),
      },
    ],
    [],
  );

  const summaryStats = useMemo(() => {
    const open = disputes.filter((d) => d.status !== "RESOLVED").length;
    const urgent = disputes.filter(
      (d) => d.status !== "RESOLVED" && hoursUntil(d.reply_by_date) < 48,
    ).length;
    const atRisk = disputes
      .filter((d) => d.status !== "RESOLVED")
      .reduce((sum, d) => sum + d.dispute_amount, 0);
    const avg =
      disputes.length > 0
        ? Math.round(disputes.reduce((s, d) => s + (d.ai_confidence_score ?? 0), 0) / disputes.length)
        : 0;
    return { open, urgent, atRisk, avg };
  }, [disputes]);

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-ink-700/80 bg-ink-950/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 transition-colors hover:text-signal"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Home
            </Link>
            <span className="font-mono text-[13px] font-semibold tracking-wide text-slate-100">
              DISPUTE<span className="text-signal">▍</span>COPILOT
            </span>
            <Badge className="border border-fintech/30 bg-fintech-faint text-fintech">
              PayPal Sandbox
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => void load()}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={seedDemoData}>
              <LayoutGrid className="h-3.5 w-3.5" /> Load demo data
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-6 py-8">
        {/* Page heading + stats */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="kicker">financial operations · chargebacks</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-50">
              Dispute Queue
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Webhook-ingested cases with AI-drafted evidence, one review away from submission.
            </p>
          </div>
          <div className="flex flex-wrap gap-6 text-sm">
            <Stat label="Open cases" value={String(summaryStats.open)} />
            <Stat
              label="< 48h deadline"
              value={String(summaryStats.urgent)}
              tone={summaryStats.urgent > 0 ? "text-alert" : undefined}
            />
            <Stat label="Amount at risk" value={formatMoney(summaryStats.atRisk, "USD")} />
            <Stat label="Avg. AI confidence" value={summaryStats.avg ? `${summaryStats.avg}%` : "—"} />
          </div>
        </div>

        {/* Controls */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative w-80 max-w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Quick search — id, customer, key evidence…"
              className="pl-9"
              aria-label="Quick search disputes"
            />
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
          {query && (
            <Button variant="ghost" size="sm" onClick={() => setQuery("")}>
              Clear search
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
            <Sparkles className="h-3.5 w-3.5 text-signal" />
            {backend === "supabase"
              ? "Supabase (Postgres) backend"
              : "Local in-memory backend — mock data, no credentials needed"}
          </div>
        </div>

        {/* Status messaging */}
        {notice && (
          <div className="mb-3 flex items-center justify-between rounded-lg border border-signal/30 bg-signal-faint px-4 py-2 text-sm text-signal">
            {notice}
            <button onClick={() => setNotice(null)} className="text-xs opacity-70 hover:opacity-100">
              dismiss
            </button>
          </div>
        )}
        {error && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-faint px-4 py-2 text-sm text-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* AG Grid */}
        <div className="ag-theme-quartz-dark h-[62vh] min-h-[420px] w-full overflow-hidden rounded-xl border border-ink-700">
          {loading && disputes.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin text-signal" />
              <p className="text-sm">Loading dispute queue…</p>
            </div>
          ) : (
            <AgGridReact<Dispute>
              rowData={disputes}
              columnDefs={columnDefs}
              defaultColDef={{
                sortable: true,
                filter: true,
                resizable: true,
                floatingFilter: false,
                suppressHeaderMenuButton: false,
              }}
              onGridReady={onGridReady}
              context={{ onInspect: (d: Dispute) => setSelected(d) }}
              animateRows
              rowSelection="single"
              suppressCellFocus
              getRowId={(params) => params.data.id}
            />
          )}
        </div>

        <p className="mt-3 text-xs text-slate-500">
          {disputes.length} case{disputes.length === 1 ? "" : "s"} · sorting, filters, quick
          search and CSV export powered by AG Grid Community.
        </p>
      </main>

      <DisputeReviewModal
        open={selected !== null}
        dispute={selected}
        onClose={() => setSelected(null)}
        onChanged={handleChanged}
        onNotice={setNotice}
      />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-[120px]">
      <p className="text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={cn("mt-0.5 font-mono text-xl font-semibold text-slate-100", tone)}>{value}</p>
    </div>
  );
}