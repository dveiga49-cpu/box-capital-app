import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useState, useMemo } from "react";
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine
} from "recharts";

interface Props { user: { id: number; name: string; email: string; role: string }; }
interface Asset { id: number; name: string; symbol: string; quantity: number; avgPrice: number; currentPrice: number; color: string; }
interface Portfolio { id: number; userId: number; initialValue: number; goal: number; note: string | null; projectionRate: number | null; updatedAt: string; }
interface Snapshot { id: number; portfolioId: number; month: string; value: number; cdi?: number | null; ibov?: number | null; dolar?: number | null; withdrawal?: number | null; }

// ── Box Capital historical returns (real data — sócio com sorteio) ────────────
// Source: official Box Capital performance table
const BOX_CAPITAL_RETURNS: Record<string, { box: number; cdi: number; ibov: number; poupanca: number; inflacao: number }> = {
  "2011": { box: 16.70, cdi: 11.59, ibov: -18.00, poupanca: 7.50, inflacao: 6.50 },
  "2012": { box: 14.90, cdi:  8.40, ibov:   7.40, poupanca: 6.47, inflacao: 5.84 },
  "2013": { box: 12.80, cdi:  8.06, ibov: -15.50, poupanca: 6.37, inflacao: 5.91 },
  "2014": { box: 15.35, cdi: 10.81, ibov:  -2.90, poupanca: 7.16, inflacao: 6.41 },
  "2015": { box: 14.30, cdi: 13.24, ibov: -11.36, poupanca: 8.15, inflacao: 10.67 },
  "2016": { box: 15.60, cdi: 14.00, ibov:  38.93, poupanca: 8.30, inflacao: 6.29 },
  "2017": { box: 17.20, cdi:  9.93, ibov:  26.90, poupanca: 6.61, inflacao: 2.95 },
  "2018": { box: 18.40, cdi:  6.42, ibov:  15.00, poupanca: 4.62, inflacao: 3.75 },
  "2019": { box: 24.70, cdi:  5.96, ibov:  31.60, poupanca: 4.26, inflacao: 4.31 },
  "2020": { box: 27.90, cdi:  2.76, ibov:   2.90, poupanca: 2.11, inflacao: 4.52 },
  "2021": { box: 27.10, cdi:  4.21, ibov: -11.93, poupanca: 2.98, inflacao: 10.06 },
  "2022": { box: 27.30, cdi: 13.15, ibov:  -5.74, poupanca: 5.75, inflacao: 5.78 },
  "2023": { box: 41.50, cdi: 11.58, ibov:  17.29, poupanca: 8.26, inflacao: 3.75 },
  "2024": { box: 144.00, cdi: 11.25, ibov: -3.70, poupanca: 6.17, inflacao: 4.76 },
  "2025": { box: 55.00, cdi: 15.00, ibov:  29.35, poupanca: 8.04, inflacao: 4.68 },
};

// ── helpers ──────────────────────────────────────────────────────────────────
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}
function fmtBRL(v: number) {
  return "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(v: number, decimals = 2) {
  return (v >= 0 ? "+" : "") + v.toFixed(decimals) + "%";
}
function labelMonth(m: string) {
  // "2025-12" → "Dez/25"
  const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const [y, mo] = m.split("-");
  return months[parseInt(mo) - 1] + "/" + y.slice(2);
}

// Aggregate snapshots by year: pick December (or last available month) for patrimony
// Sum all withdrawals within the year
function buildAnnualData(snapshots: Snapshot[], initialValue: number) {
  if (!snapshots.length) return [];
  const byYear: Record<string, Snapshot[]> = {};
  for (const s of snapshots) {
    const yr = s.month.slice(0, 4);
    if (!byYear[yr]) byYear[yr] = [];
    byYear[yr].push(s);
  }
  const years = Object.keys(byYear).sort();
  const annual = years.map(yr => {
    const snaps = byYear[yr].sort((a, b) => a.month.localeCompare(b.month));
    const last = snaps[snaps.length - 1];
    const totalWithdrawal = snaps.reduce((sum, s) => sum + (s.withdrawal ?? 0), 0);
    return { year: yr, snap: last, totalWithdrawal };
  });

  return annual.map((d, i) => {
    const prevValue = i === 0 ? initialValue : annual[i - 1].snap.value;
    const effectiveValue = d.snap.value + d.totalWithdrawal;
    const boxPct = prevValue > 0 ? ((effectiveValue - prevValue) / prevValue) * 100 : 0;
    // Use real Box Capital historical data for benchmark comparisons
    const real = BOX_CAPITAL_RETURNS[d.year];
    return {
      year: d.year,
      patrimonio: d.snap.value,
      boxPct: parseFloat(boxPct.toFixed(2)),
      // Real benchmark data from official Box Capital table
      boxReal: real?.box ?? null,
      cdi: real?.cdi ?? d.snap.cdi ?? null,
      ibov: real?.ibov ?? d.snap.ibov ?? null,
      dolar: d.snap.dolar ?? null,
      poupanca: real?.poupanca ?? null,
      inflacao: real?.inflacao ?? null,
      withdrawal: d.totalWithdrawal > 0 ? d.totalWithdrawal : null,
    };
  });
}

// Custom tooltip for the comparison chart
function BenchmarkTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="bg-[#1a1c24] border border-[rgba(201,168,76,0.2)] rounded-xl px-4 py-3 shadow-xl text-xs space-y-1.5 min-w-[190px]">
      <p className="text-gold font-bold text-sm mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
            <span className="text-muted-foreground">{p.name}</span>
          </span>
          <span className="font-semibold tabular" style={{ color: p.color }}>
            {p.value != null ? fmtPct(p.value) : "—"}
          </span>
        </div>
      ))}
      {d?.withdrawal > 0 && (
        <div className="flex items-center justify-between gap-4 pt-1.5 mt-0.5 border-t border-white/5">
          <span className="text-red-400 flex items-center gap-1">
            <span className="text-[9px]">&#9660;</span> Saque
          </span>
          <span className="font-bold text-red-400 tabular">-{fmtBRL(d.withdrawal)}</span>
        </div>
      )}
    </div>
  );
}

// Custom dot with withdrawal marker for area/bar charts
function WithdrawalDot(props: any) {
  const { cx, cy, payload } = props;
  if (!payload?.withdrawal) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={7} fill="#ef4444" stroke="#0d0f14" strokeWidth={2} />
      <text x={cx} y={cy - 14} textAnchor="middle" fill="#ef4444" fontSize={9} fontWeight="bold">
        -{(payload.withdrawal / 1000).toFixed(0)}k
      </text>
    </g>
  );
}

// Custom tooltip for patrimony area chart
function PatrimonyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="bg-[#1a1c24] border border-[rgba(201,168,76,0.2)] rounded-xl px-4 py-3 shadow-xl text-xs min-w-[170px]">
      <p className="text-gold font-bold text-sm mb-2">{label}</p>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Patrimônio</span>
        <span className="font-bold text-white tabular">{fmtBRL(payload[0]?.value ?? 0)}</span>
      </div>
      {d?.withdrawal > 0 && (
        <div className="flex items-center justify-between gap-4 mt-1.5 pt-1.5 border-t border-white/5">
          <span className="text-red-400 flex items-center gap-1">
            <span className="text-[9px]">&#9660;</span> Saque
          </span>
          <span className="font-bold text-red-400 tabular">-{fmtBRL(d.withdrawal)}</span>
        </div>
      )}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, positive }: { label: string; value: string; sub?: string; positive?: boolean }) {
  return (
    <div className="bg-[#131620] border rounded-xl p-4 flex flex-col gap-1" style={{ borderColor: "rgba(201,168,76,0.12)" }}>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</p>
      <p className={`text-xl font-bold tabular ${positive === undefined ? "text-gold" : positive ? "text-green-400" : "text-red-400"}`}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

// Build cumulative index: simulates R$1.000 invested from the first year growing year by year
// Uses real Box Capital historical data (sócio com sorteio)
const SIMULATION_BASE = 1000;
function buildCumulativeData(annualData: ReturnType<typeof buildAnnualData>) {
  if (!annualData.length) return [];
  let box = SIMULATION_BASE, cdi = SIMULATION_BASE, ibov = SIMULATION_BASE, poupanca = SIMULATION_BASE, inflacao = SIMULATION_BASE;
  return annualData.map(d => {
    // Use real Box Capital return (boxReal) for the cumulative, not the client's individual return
    const br = d.boxReal ?? d.boxPct;
    box      = box      * (1 + br            / 100);
    cdi      = d.cdi      != null ? cdi      * (1 + d.cdi      / 100) : cdi;
    ibov     = d.ibov     != null ? ibov     * (1 + d.ibov     / 100) : ibov;
    poupanca = d.poupanca != null ? poupanca * (1 + d.poupanca / 100) : poupanca;
    inflacao = d.inflacao != null ? inflacao * (1 + d.inflacao / 100) : inflacao;
    return {
      year:     d.year,
      box:      parseFloat(box.toFixed(2)),
      cdi:      d.cdi      != null ? parseFloat(cdi.toFixed(2))      : null,
      ibov:     d.ibov     != null ? parseFloat(ibov.toFixed(2))     : null,
      poupanca: d.poupanca != null ? parseFloat(poupanca.toFixed(2)) : null,
      inflacao: d.inflacao != null ? parseFloat(inflacao.toFixed(2)) : null,
      withdrawal: d.withdrawal,
    };
  });
}

// Custom tooltip for cumulative chart
function CumulativeTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="bg-[#1a1c24] border border-[rgba(201,168,76,0.2)] rounded-xl px-4 py-3 shadow-xl text-xs space-y-1.5 min-w-[190px]">
      <p className="text-gold font-bold text-sm mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
            <span className="text-muted-foreground">{p.name}</span>
          </span>
          <span className="font-semibold tabular" style={{ color: p.color }}>
            {p.value != null ? `R$${p.value.toFixed(2)}` : "—"}
          </span>
        </div>
      ))}
      {d?.withdrawal > 0 && (
        <div className="flex items-center justify-between gap-4 pt-1.5 mt-0.5 border-t border-white/5">
          <span className="text-red-400 flex items-center gap-1">
            <span className="text-[9px]">&#9660;</span> Saque
          </span>
          <span className="font-bold text-red-400 tabular">-{fmtBRL(d.withdrawal)}</span>
        </div>
      )}
      <p className="text-[10px] text-muted-foreground/50 pt-1 border-t border-white/5 mt-1">Base: R$1.000 investidos no início</p>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ClientDashboard({ user }: Props) {
  const [, nav] = useLocation();
  const qc = useQueryClient();
  const [hidden, setHidden] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "benchmark">("overview");

  const { data, isLoading } = useQuery<{ portfolio: Portfolio; assets: Asset[]; snapshots: Snapshot[] }>({
    queryKey: ["/api/portfolio", user.id],
    queryFn: () => fetch(`/api/portfolio/${user.id}`).then(r => r.json()),
    staleTime: 30_000,
  });

  const logoutMutation = useMutation({
    mutationFn: () => fetch("/api/auth/logout", { method: "POST" }),
    onSuccess: () => {
      qc.setQueryData(["/api/auth/me"], null);
      qc.clear();
      nav("/login");
    },
  });

  const assets = data?.assets ?? [];
  const portfolio = data?.portfolio;
  const snapshots = data?.snapshots ?? [];

  const assetsTotal = assets.reduce((s, a) => s + a.quantity * a.currentPrice, 0);
  // Use latest snapshot value as total when no assets are tracked individually
  const latestSnapshot = snapshots.length > 0 ? [...snapshots].sort((a, b) => b.month.localeCompare(a.month))[0] : null;
  const total = assetsTotal > 0 ? assetsTotal : (latestSnapshot?.value ?? 0);
  const initialValue = portfolio?.initialValue ?? 0;
  const goal = portfolio?.goal ?? 500000;
  const gain = total - initialValue;
  const gainPct = initialValue > 0 ? (gain / initialValue) * 100 : 0;
  const goalPct = goal > 0 ? Math.min((total / goal) * 100, 100) : 0;

  // Annual data for charts (used in both Visão Geral and Comparativo)
  const annualData = useMemo(() => buildAnnualData(snapshots, initialValue), [snapshots, initialValue]);

  // Last year benchmark comparison
  const lastAnnual = annualData[annualData.length - 1];

  // Real Box Capital accumulated return (compound from all years in history)
  // Computed from BOX_CAPITAL_RETURNS for years the client has snapshots
  const boxRealAccumPct = useMemo(() => {
    if (!annualData.length) return null;
    let acc = 1;
    for (const d of annualData) {
      const r = d.boxReal ?? d.boxPct;
      acc *= (1 + r / 100);
    }
    return parseFloat(((acc - 1) * 100).toFixed(2));
  }, [annualData]);

  // ── 2026 projection data ─────────────────────────────────
  const projectionData = useMemo(() => {
    const rate = (portfolio?.projectionRate ?? 1) / 100; // monthly rate as decimal
    // Base: latest snapshot value, or total
    const base = latestSnapshot?.value ?? total;
    if (base <= 0) return [];
    const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    return months.map((m, i) => ({
      label: `${m}/26`,
      projected: parseFloat((base * Math.pow(1 + rate, i + 1)).toFixed(2)),
    }));
  }, [portfolio?.projectionRate, latestSnapshot, total]);

  if (isLoading) return (
    <div className="h-screen flex items-center justify-center bg-background">
      <div className="w-8 h-8 border-2 border-yellow-500 rounded-full border-t-transparent animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col text-foreground">
      {/* ── Topbar ── */}
      <header className="sticky top-0 z-20 border-b border-border bg-[#0d0f14]/95 backdrop-blur px-4 md:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="leading-tight">
            <p className="text-[11px] text-muted-foreground">
              {greeting()}, <span className="text-gold font-bold">{user.name.split(" ")[0]}</span>
            </p>
            <p className="text-[10px] text-muted-foreground/50" style={{ fontFamily: "Georgia, serif" }}>
              BOX CAPITAL STRATEGY
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setHidden(!hidden)}
            className="text-muted-foreground hover:text-gold transition-colors p-2"
            title={hidden ? "Mostrar valores" : "Ocultar valores"}
          >
            {hidden
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            }
          </button>
          <div className="w-8 h-8 rounded-full bg-yellow-600/20 flex items-center justify-center text-gold font-bold text-sm">
            {user.name[0].toUpperCase()}
          </div>
          <button
            onClick={() => logoutMutation.mutate()}
            className="text-muted-foreground hover:text-red-400 transition-colors p-2"
            title="Sair"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </header>

      {/* ── Navigation tabs ── */}
      <div className="border-b border-border px-4 md:px-6 bg-[#0d0f14]/80">
        <nav className="flex gap-0">
          {([
            { key: "overview",  label: "Visão Geral" },
            { key: "benchmark", label: "Comparativo" },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`py-3 px-4 text-xs font-semibold border-b-2 transition-all ${
                activeTab === t.key
                  ? "border-yellow-500 text-gold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <main className="flex-1 p-4 md:p-6 max-w-5xl mx-auto w-full space-y-5">

        {/* ══════════════════ TAB: VISÃO GERAL ══════════════════ */}
        {activeTab === "overview" && (
          <>
            {/* Hero patrimony card */}
            <div
              className="rounded-2xl p-5 md:p-6 relative overflow-hidden"
              style={{ background: "linear-gradient(135deg, #131620 0%, #1a1c26 100%)", border: "1px solid rgba(201,168,76,0.22)" }}
            >
              {/* Gold glow */}
              <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full pointer-events-none"
                style={{ background: "radial-gradient(circle, rgba(201,168,76,0.08) 0%, transparent 70%)" }} />

              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold flex items-center gap-1.5 mb-2">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" strokeWidth="2.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                    Patrimônio Total
                  </p>
                  <p
                    className="text-3xl md:text-4xl font-bold tabular text-white transition-all"
                    style={{ filter: hidden ? "blur(12px)" : "none" }}
                  >
                    {fmtBRL(total)}
                  </p>
                  <div className="flex items-center gap-2 mt-2.5">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${gain >= 0 ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
                      {gain >= 0 ? "▲" : "▼"} {Math.abs(gainPct).toFixed(2)}%
                    </span>
                    <span className="text-xs text-muted-foreground">desde o início</span>
                  </div>
                </div>

              </div>

              {/* Progress bar */}
              <div className="mt-5">
                <div className="flex justify-between text-[10px] text-muted-foreground mb-2">
                  <span>Início: {fmtBRL(initialValue)}</span>
                  <span className="text-gold font-semibold">{goalPct.toFixed(1)}% da meta</span>
                  <span className="text-gold">Meta: {fmtBRL(goal)}</span>
                </div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{ width: goalPct + "%", background: "linear-gradient(90deg, #C9A84C, #e8c878, #3fcf8e)" }}
                  />
                </div>
              </div>

              {portfolio?.note && (
                <p className="mt-4 text-xs text-muted-foreground border-t border-white/5 pt-4 italic">
                  "{portfolio.note}"
                </p>
              )}
            </div>

            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard
                label="Rentabilidade Box Capital"
                value={boxRealAccumPct != null ? fmtPct(boxRealAccumPct) : fmtPct(gainPct)}
                sub="acumulada no período (dados reais)"
                positive={(boxRealAccumPct ?? gainPct) >= 0}
              />
              <KpiCard
                label="Progresso da meta"
                value={goalPct.toFixed(1) + "%"}
                sub={fmtBRL(goal - total) + " restante"}
              />
              {lastAnnual?.cdi != null && (
                <KpiCard
                  label="vs CDI (último ano)"
                  value={fmtPct(lastAnnual.boxPct - lastAnnual.cdi)}
                  sub={`Box ${fmtPct(lastAnnual.boxPct)} · CDI ${fmtPct(lastAnnual.cdi)}`}
                  positive={lastAnnual.boxPct >= lastAnnual.cdi}
                />
              )}
              {lastAnnual?.ibov != null && (
                <KpiCard
                  label="vs IBOVESPA (último ano)"
                  value={fmtPct(lastAnnual.boxPct - lastAnnual.ibov)}
                  sub={`Box ${fmtPct(lastAnnual.boxPct)} · IBOV ${fmtPct(lastAnnual.ibov)}`}
                  positive={lastAnnual.boxPct >= lastAnnual.ibov}
                />
              )}
            </div>

            {/* Patrimony evolution chart — annual cumulative */}
            <div
              className="rounded-2xl p-5"
              style={{ background: "#131620", border: "1px solid rgba(201,168,76,0.12)" }}
            >
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                    Evolução Patrimonial
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Somatório anual do seu patrimônio
                    {annualData.some(d => d.withdrawal) && (
                      <span className="ml-2 text-red-400">· ● saque</span>
                    )}
                  </p>
                </div>
                <span className="text-[10px] bg-yellow-500/10 text-gold px-2.5 py-1 rounded-full font-semibold">
                  {annualData.length} anos
                </span>
              </div>
              {annualData.length > 1 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={annualData} margin={{ top: 24, right: 16, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#C9A84C" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#C9A84C" stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis
                      dataKey="year"
                      tick={{ fill: "#6b7280", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "#6b7280", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={v => "R$" + (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v)}
                      width={52}
                    />
                    <Tooltip content={<PatrimonyTooltip />} cursor={{ stroke: "rgba(201,168,76,0.3)", strokeWidth: 1 }} />
                    <Area
                      type="monotone"
                      dataKey="patrimonio"
                      stroke="#C9A84C"
                      strokeWidth={2.5}
                      fill="url(#goldGrad)"
                      dot={<WithdrawalDot />}
                      activeDot={{ r: 5, fill: "#C9A84C", stroke: "#0d0f14", strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
                  Histórico em construção...
                </div>
              )}
            </div>

            {/* ── Projeção 2026 ── */}
            {projectionData.length > 0 && (
              <div
                className="rounded-2xl p-5"
                style={{ background: "#131620", border: "1px solid rgba(96,165,250,0.15)" }}
              >
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2"><path d="M2 12h20M12 2l10 10-10 10"/></svg>
                      Projeção 2026
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Projeção baseada em crescimento composto
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Dez/26 projetado</p>
                    <p className="text-base font-bold text-blue-400 tabular">
                      {projectionData.length > 0 ? fmtBRL(projectionData[projectionData.length - 1].projected) : "—"}
                    </p>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={projectionData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#6b7280", fontSize: 10 }}
                      axisLine={false} tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "#6b7280", fontSize: 10 }}
                      axisLine={false} tickLine={false}
                      tickFormatter={v => "R$" + (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v)}
                      width={52}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="bg-[#1a1c24] border border-[rgba(96,165,250,0.2)] rounded-xl px-4 py-3 shadow-xl text-xs">
                            <p className="text-blue-400 font-bold text-sm mb-1">{label}</p>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-muted-foreground">Projetado</span>
                              <span className="font-bold text-white tabular">{fmtBRL(payload[0]?.value ?? 0)}</span>
                            </div>
                          </div>
                        );
                      }}
                      cursor={{ stroke: "rgba(96,165,250,0.3)", strokeWidth: 1 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="projected"
                      stroke="#60a5fa"
                      strokeWidth={2}
                      fill="url(#projGrad)"
                      dot={{ fill: "#60a5fa", r: 3, strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: "#60a5fa", stroke: "#0d0f14", strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
                <p className="text-[10px] text-muted-foreground/50 mt-3 text-center" style={{ display: 'none' }}>
                </p>
              </div>
            )}
          </>
        )}

        {/* ══════════════════ TAB: COMPARATIVO ══════════════════ */}
        {activeTab === "benchmark" && (
          <div className="space-y-5">
            {/* Annual comparison chart */}
            <div
              className="rounded-2xl p-5"
              style={{ background: "#131620", border: "1px solid rgba(201,168,76,0.12)" }}
            >
              <div className="mb-5">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" strokeWidth="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
                  Retorno Anual vs. Benchmarks
                </h3>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Variação % ao ano — Box Capital vs CDI, IBOVESPA e Dólar
                </p>
              </div>

              {annualData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={annualData} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis
                        dataKey="year"
                        tick={{ fill: "#6b7280", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: "#6b7280", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={v => v + "%"}
                        width={50}
                      />
                      <Tooltip content={<BenchmarkTooltip />} cursor={{ stroke: "rgba(255,255,255,0.06)", strokeWidth: 1 }} />
                      <Legend
                        wrapperStyle={{ fontSize: 11, paddingTop: 16, color: "#9ca3af" }}
                        iconType="circle"
                        iconSize={8}
                      />
                      <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
                      {annualData.filter(d => d.withdrawal).map(d => (
                        <ReferenceLine
                          key={d.year}
                          x={d.year}
                          stroke="#ef4444"
                          strokeWidth={1.5}
                          strokeDasharray="3 3"
                          label={{ value: `\u2193saque`, position: "insideTopRight", fill: "#ef4444", fontSize: 9 }}
                        />
                      ))}
                      {/* Box Capital real historical return */}
                      <Line
                        type="monotone"
                        dataKey="boxReal"
                        name="Box Capital"
                        stroke="#C9A84C"
                        strokeWidth={3}
                        dot={{ fill: "#C9A84C", r: 5, strokeWidth: 0 }}
                        activeDot={{ r: 7, fill: "#C9A84C", stroke: "#0d0f14", strokeWidth: 2 }}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="cdi"
                        name="CDI"
                        stroke="#3fcf8e"
                        strokeWidth={2}
                        strokeDasharray="5 3"
                        dot={{ fill: "#3fcf8e", r: 4, strokeWidth: 0 }}
                        activeDot={{ r: 6 }}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="ibov"
                        name="IBOVESPA"
                        stroke="#60a5fa"
                        strokeWidth={2}
                        strokeDasharray="5 3"
                        dot={{ fill: "#60a5fa", r: 4, strokeWidth: 0 }}
                        activeDot={{ r: 6 }}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="poupanca"
                        name="Poupança"
                        stroke="#a78bfa"
                        strokeWidth={2}
                        strokeDasharray="5 3"
                        dot={{ fill: "#a78bfa", r: 4, strokeWidth: 0 }}
                        activeDot={{ r: 6 }}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="inflacao"
                        name="Inflação"
                        stroke="#fb7185"
                        strokeWidth={2}
                        strokeDasharray="3 3"
                        dot={{ fill: "#fb7185", r: 3, strokeWidth: 0 }}
                        activeDot={{ r: 5 }}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>

                  {/* Annual table */}
                  <div className="mt-5 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-white/5">
                          {["Ano", "Box Capital", "CDI", "IBOVESPA", "Poupança", "Inflação", "vs CDI", "Saque"].map(h => (
                            <th key={h} className="text-left py-2.5 px-3 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold first:pl-0">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {annualData.map((d, i) => {
                          const boxVal = d.boxReal ?? d.boxPct;
                          const vsCdi = d.cdi != null ? boxVal - d.cdi : null;
                          return (
                            <tr
                              key={d.year}
                              className={`border-b border-white/5 last:border-0 ${i % 2 === 0 ? "" : "bg-white/[0.015]"}`}
                            >
                              <td className="py-3 px-3 font-bold text-white first:pl-0">{d.year}</td>
                              <td className="py-3 px-3">
                                <span className={`font-bold ${boxVal >= 0 ? "text-gold" : "text-red-400"}`}>
                                  {fmtPct(boxVal)}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-green-400">{d.cdi != null ? fmtPct(d.cdi) : <span className="text-muted-foreground">—</span>}</td>
                              <td className="py-3 px-3 text-blue-400">{d.ibov != null ? fmtPct(d.ibov) : <span className="text-muted-foreground">—</span>}</td>
                              <td className="py-3 px-3 text-violet-400">{d.poupanca != null ? fmtPct(d.poupanca) : <span className="text-muted-foreground">—</span>}</td>
                              <td className="py-3 px-3 text-rose-400">{d.inflacao != null ? fmtPct(d.inflacao) : <span className="text-muted-foreground">—</span>}</td>
                              <td className="py-3 px-3">
                                {vsCdi != null ? (
                                  <span className={`font-semibold ${vsCdi >= 0 ? "text-green-400" : "text-red-400"}`}>
                                    {vsCdi >= 0 ? "+" : ""}{vsCdi.toFixed(2)}%
                                  </span>
                                ) : <span className="text-muted-foreground">—</span>}
                              </td>
                              <td className="py-3 px-3">
                                {d.withdrawal ? (
                                  <span className="text-red-400 font-semibold">-{fmtBRL(d.withdrawal)}</span>
                                ) : <span className="text-muted-foreground">—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
                  Histórico em construção...
                </div>
              )}
            </div>

            {/* ── Cumulative total chart ── */}
            {annualData.length > 1 && (() => {
              const cumData = buildCumulativeData(annualData);
              const lastCum = cumData[cumData.length - 1];
              return (
                <div
                  className="rounded-2xl p-5"
                  style={{ background: "#131620", border: "1px solid rgba(201,168,76,0.12)" }}
                >
                  <div className="mb-5">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" strokeWidth="2"><path d="M2 12h20M12 2l10 10-10 10"/></svg>
                      Rentabilidade Acumulada Total
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Quanto R$1.000 investidos no início valeriam hoje em cada ativo — dados reais Box Capital
                    </p>
                  </div>

                  {/* Summary badges */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
                    {[
                      { label: "Box Capital",  value: lastCum?.box,       color: "#C9A84C", bg: "rgba(201,168,76,0.08)" },
                      { label: "CDI",          value: lastCum?.cdi,       color: "#3fcf8e", bg: "rgba(63,207,142,0.08)" },
                      { label: "IBOVESPA",     value: lastCum?.ibov,      color: "#60a5fa", bg: "rgba(96,165,250,0.08)" },
                      { label: "Poupança",     value: lastCum?.poupanca,  color: "#a78bfa", bg: "rgba(167,139,250,0.08)" },
                    ].map(b => b.value != null && (
                      <div key={b.label} className="rounded-xl p-3" style={{ background: b.bg, border: `1px solid ${b.color}22` }}>
                        <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: b.color }}>{b.label}</p>
                        <p className="text-base font-bold text-white tabular mt-0.5">{fmtBRL(b.value ?? 0)}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: b.color }}>
                          {b.value != null ? fmtPct(b.value - SIMULATION_BASE) : ""}
                        </p>
                      </div>
                    ))}
                  </div>

                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={cumData} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis
                        dataKey="year"
                        tick={{ fill: "#6b7280", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: "#6b7280", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={v => `R$${v}`}
                        width={60}
                      />
                      <Tooltip content={<CumulativeTooltip />} cursor={{ stroke: "rgba(255,255,255,0.06)", strokeWidth: 1 }} />
                      <Legend
                        wrapperStyle={{ fontSize: 11, paddingTop: 16, color: "#9ca3af" }}
                        iconType="circle"
                        iconSize={8}
                      />
                      {cumData.filter(d => d.withdrawal).map(d => (
                        <ReferenceLine
                          key={d.year}
                          x={d.year}
                          stroke="#ef4444"
                          strokeWidth={1.5}
                          strokeDasharray="3 3"
                          label={{ value: `\u2193saque`, position: "insideTopRight", fill: "#ef4444", fontSize: 9 }}
                        />
                      ))}
                      <Line
                        type="monotone"
                        dataKey="box"
                        name="Box Capital"
                        stroke="#C9A84C"
                        strokeWidth={3}
                        dot={{ fill: "#C9A84C", r: 5, strokeWidth: 0 }}
                        activeDot={{ r: 7, fill: "#C9A84C", stroke: "#0d0f14", strokeWidth: 2 }}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="cdi"
                        name="CDI"
                        stroke="#3fcf8e"
                        strokeWidth={2}
                        strokeDasharray="5 3"
                        dot={{ fill: "#3fcf8e", r: 4, strokeWidth: 0 }}
                        activeDot={{ r: 6 }}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="ibov"
                        name="IBOVESPA"
                        stroke="#60a5fa"
                        strokeWidth={2}
                        strokeDasharray="5 3"
                        dot={{ fill: "#60a5fa", r: 4, strokeWidth: 0 }}
                        activeDot={{ r: 6 }}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="poupanca"
                        name="Poupança"
                        stroke="#a78bfa"
                        strokeWidth={2}
                        strokeDasharray="5 3"
                        dot={{ fill: "#a78bfa", r: 4, strokeWidth: 0 }}
                        activeDot={{ r: 6 }}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="inflacao"
                        name="Inflação"
                        stroke="#fb7185"
                        strokeWidth={2}
                        strokeDasharray="3 3"
                        dot={{ fill: "#fb7185", r: 3, strokeWidth: 0 }}
                        activeDot={{ r: 5 }}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  <p className="text-[10px] text-muted-foreground/50 mt-3 text-center">
                    Simulação com R$1.000 investidos no primeiro ano registrado. Dados reais Box Capital (sócio com sorteio).
                  </p>
                </div>
              );
            })()}

            {/* Legend explanation */}
            <div
              className="rounded-xl p-4 grid grid-cols-2 md:grid-cols-5 gap-3"
              style={{ background: "#131620", border: "1px solid rgba(201,168,76,0.08)" }}
            >
              {[
                { color: "#C9A84C", label: "Box Capital", desc: "Retorno real histórico (sócio)" },
                { color: "#3fcf8e", label: "CDI",         desc: "Taxa referência renda fixa" },
                { color: "#60a5fa", label: "IBOVESPA",    desc: "Índice da bolsa brasileira" },
                { color: "#a78bfa", label: "Poupança",    desc: "Caderneta de poupança" },
                { color: "#fb7185", label: "Inflação",    desc: "IPCA anual" },
              ].map(b => (
                <div key={b.label} className="flex items-start gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full mt-0.5 flex-shrink-0" style={{ background: b.color }} />
                  <div>
                    <p className="text-xs font-semibold" style={{ color: b.color }}>{b.label}</p>
                    <p className="text-[11px] text-muted-foreground">{b.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="text-center py-4 text-[11px] text-muted-foreground/30 border-t border-border">
        <a href="https://www.perplexity.ai/computer" target="_blank" rel="noopener noreferrer"
          className="hover:text-gold transition-colors">
          Criado com Perplexity Computer
        </a>
      </footer>
    </div>
  );
}
