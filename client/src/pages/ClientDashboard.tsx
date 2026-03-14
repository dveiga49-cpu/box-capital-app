import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useState, useMemo } from "react";
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine
} from "recharts";

interface Props { user: { id: number; name: string; email: string; role: string }; }
interface Asset { id: number; name: string; symbol: string; quantity: number; avgPrice: number; currentPrice: number; color: string; }
interface Portfolio { id: number; userId: number; initialValue: number; goal: number; note: string | null; updatedAt: string; }
interface Snapshot { id: number; portfolioId: number; month: string; value: number; cdi?: number | null; ibov?: number | null; dolar?: number | null; }

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
// and carry CDI/IBOV/Dolar from that row
function buildAnnualData(snapshots: Snapshot[], initialValue: number) {
  if (!snapshots.length) return [];
  const byYear: Record<string, Snapshot[]> = {};
  for (const s of snapshots) {
    const yr = s.month.slice(0, 4);
    if (!byYear[yr]) byYear[yr] = [];
    byYear[yr].push(s);
  }
  // Sort years
  const years = Object.keys(byYear).sort();
  // For each year pick the latest snapshot (usually December)
  const annual = years.map(yr => {
    const snaps = byYear[yr].sort((a, b) => a.month.localeCompare(b.month));
    const last = snaps[snaps.length - 1];
    return { year: yr, snap: last };
  });

  // Compute % growth vs. the previous year (or initial value for first year)
  return annual.map((d, i) => {
    const prevValue = i === 0 ? initialValue : annual[i - 1].snap.value;
    const boxPct = prevValue > 0 ? ((d.snap.value - prevValue) / prevValue) * 100 : 0;
    return {
      year: d.year,
      patrimonio: d.snap.value,
      boxPct: parseFloat(boxPct.toFixed(2)),
      cdi: d.snap.cdi ?? null,
      ibov: d.snap.ibov ?? null,
      dolar: d.snap.dolar ?? null,
    };
  });
}

// Custom tooltip for the comparison chart
function BenchmarkTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a1c24] border border-[rgba(201,168,76,0.2)] rounded-xl px-4 py-3 shadow-xl text-xs space-y-1.5 min-w-[160px]">
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
    </div>
  );
}

// Custom tooltip for patrimony area chart
function PatrimonyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a1c24] border border-[rgba(201,168,76,0.2)] rounded-xl px-4 py-3 shadow-xl text-xs min-w-[160px]">
      <p className="text-gold font-bold text-sm mb-2">{label}</p>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Patrimônio</span>
        <span className="font-bold text-white tabular">{fmtBRL(payload[0]?.value ?? 0)}</span>
      </div>
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

// ── Main Component ────────────────────────────────────────────────────────────
export default function ClientDashboard({ user }: Props) {
  const [, nav] = useLocation();
  const qc = useQueryClient();
  const [hidden, setHidden] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "portfolio" | "benchmark">("overview");

  const { data, isLoading } = useQuery<{ portfolio: Portfolio; assets: Asset[]; snapshots: Snapshot[] }>({
    queryKey: ["/api/portfolio", user.id],
    queryFn: () => fetch(`/api/portfolio/${user.id}`).then(r => r.json()),
    staleTime: 30_000,
  });

  const logoutMutation = useMutation({
    mutationFn: () => fetch("/api/auth/logout", { method: "POST" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/auth/me"] }); nav("/login"); },
  });

  const assets = data?.assets ?? [];
  const portfolio = data?.portfolio;
  const snapshots = data?.snapshots ?? [];

  const total = assets.reduce((s, a) => s + a.quantity * a.currentPrice, 0);
  const initialValue = portfolio?.initialValue ?? 0;
  const goal = portfolio?.goal ?? 500000;
  const gain = total - initialValue;
  const gainPct = initialValue > 0 ? (gain / initialValue) * 100 : 0;
  const goalPct = goal > 0 ? Math.min((total / goal) * 100, 100) : 0;

  // Annual data for charts
  const annualData = useMemo(() => buildAnnualData(snapshots, initialValue), [snapshots, initialValue]);

  // Monthly data for area chart (all snapshots)
  const monthlyData = useMemo(() =>
    snapshots.map(s => ({ label: labelMonth(s.month), value: s.value })),
    [snapshots]
  );

  // Last year benchmark comparison
  const lastAnnual = annualData[annualData.length - 1];

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
          <svg className="w-7 h-7 flex-shrink-0" viewBox="0 0 48 48" fill="none">
            <rect x="4" y="4" width="40" height="40" rx="2" stroke="#C9A84C" strokeWidth="2" fill="none"/>
            <path d="M14 14 L34 14 L34 34 L14 34 Z" stroke="#C9A84C" strokeWidth="1.5" fill="none"/>
            <path d="M4 4 L14 14M34 14 L44 4M14 34 L4 44M34 34 L44 44" stroke="#C9A84C" strokeWidth="1.5"/>
          </svg>
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
            { key: "overview",   label: "Visão Geral" },
            { key: "portfolio",  label: "Portfólio" },
            { key: "benchmark",  label: "Comparativo" },
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
                <div className="text-right flex-shrink-0">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Rendimento</p>
                  <p
                    className={`text-lg font-bold tabular ${gain >= 0 ? "text-green-400" : "text-red-400"} transition-all`}
                    style={{ filter: hidden ? "blur(8px)" : "none" }}
                  >
                    {gain >= 0 ? "+" : ""}{fmtBRL(gain)}
                  </p>
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
                label="Performance total"
                value={fmtPct(gainPct)}
                sub="desde o investimento inicial"
                positive={gain >= 0}
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

            {/* Patrimony evolution chart */}
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
                  <p className="text-[11px] text-muted-foreground mt-0.5">Histórico mensal do seu patrimônio</p>
                </div>
                <span className="text-[10px] bg-yellow-500/10 text-gold px-2.5 py-1 rounded-full font-semibold">
                  {snapshots.length} registros
                </span>
              </div>
              {monthlyData.length > 1 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={monthlyData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#C9A84C" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#C9A84C" stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#6b7280", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
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
                      dataKey="value"
                      stroke="#C9A84C"
                      strokeWidth={2.5}
                      fill="url(#goldGrad)"
                      dot={false}
                      activeDot={{ r: 5, fill: "#C9A84C", stroke: "#0d0f14", strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
                  Histórico em construção...
                </div>
              )}
            </div>
          </>
        )}

        {/* ══════════════════ TAB: PORTFÓLIO ══════════════════ */}
        {activeTab === "portfolio" && (
          <div className="space-y-4">
            <div
              className="rounded-2xl p-5"
              style={{ background: "#131620", border: "1px solid rgba(201,168,76,0.12)" }}
            >
              <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" strokeWidth="2"><path d="M2 20h20M5 20V10l7-7 7 7v10"/></svg>
                Composição do Portfólio
              </h3>

              {assets.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">
                  Portfólio em configuração. Em breve seus ativos aparecerão aqui.
                </p>
              ) : (
                <div className="space-y-3">
                  {assets.map(a => {
                    const val = a.quantity * a.currentPrice;
                    const pct = total > 0 ? (val / total) * 100 : 0;
                    const ret = a.avgPrice > 0 ? ((a.currentPrice - a.avgPrice) / a.avgPrice) * 100 : null;
                    return (
                      <div
                        key={a.id}
                        className="rounded-xl p-3.5 flex items-center justify-between gap-3"
                        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                            style={{ background: a.color + "25", border: `1px solid ${a.color}40` }}
                          >
                            <span style={{ color: a.color }}>{a.symbol.slice(0, 3)}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{a.name}</p>
                            <p className="text-[11px] text-muted-foreground">{a.quantity} {a.symbol}</p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p
                            className="text-sm font-bold text-white tabular transition-all"
                            style={{ filter: hidden ? "blur(6px)" : "none" }}
                          >
                            {fmtBRL(val)}
                          </p>
                          <p className="text-[11px] text-muted-foreground">{pct.toFixed(1)}% da carteira</p>
                          {ret !== null && (
                            <p className={`text-[11px] font-semibold ${ret >= 0 ? "text-green-400" : "text-red-400"}`}>
                              {fmtPct(ret)} retorno
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Allocation donut-style bar */}
            {assets.length > 0 && (
              <div
                className="rounded-2xl p-5"
                style={{ background: "#131620", border: "1px solid rgba(201,168,76,0.12)" }}
              >
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Alocação</h3>
                <div className="flex h-4 rounded-full overflow-hidden gap-px">
                  {assets.map(a => {
                    const val = a.quantity * a.currentPrice;
                    const pct = total > 0 ? (val / total) * 100 : 0;
                    return (
                      <div
                        key={a.id}
                        style={{ width: pct + "%", background: a.color, transition: "width 0.8s ease" }}
                        title={`${a.name}: ${pct.toFixed(1)}%`}
                      />
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4">
                  {assets.map(a => {
                    const val = a.quantity * a.currentPrice;
                    const pct = total > 0 ? (val / total) * 100 : 0;
                    return (
                      <div key={a.id} className="flex items-center gap-1.5 text-xs">
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ background: a.color }} />
                        <span className="text-muted-foreground">{a.name}</span>
                        <span className="font-semibold text-white">{pct.toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
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

              {annualData.length > 0 && annualData.some(d => d.cdi != null || d.ibov != null || d.dolar != null) ? (
                <>
                  <ResponsiveContainer width="100%" height={280}>
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
                        width={44}
                      />
                      <Tooltip content={<BenchmarkTooltip />} cursor={{ stroke: "rgba(255,255,255,0.06)", strokeWidth: 1 }} />
                      <Legend
                        wrapperStyle={{ fontSize: 11, paddingTop: 16, color: "#9ca3af" }}
                        iconType="circle"
                        iconSize={8}
                      />
                      <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
                      <Line
                        type="monotone"
                        dataKey="boxPct"
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
                        dataKey="dolar"
                        name="Dólar"
                        stroke="#f97316"
                        strokeWidth={2}
                        strokeDasharray="5 3"
                        dot={{ fill: "#f97316", r: 4, strokeWidth: 0 }}
                        activeDot={{ r: 6 }}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>

                  {/* Annual table */}
                  <div className="mt-5 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-white/5">
                          {["Ano", "Box Capital", "CDI", "IBOVESPA", "Dólar", "vs CDI"].map(h => (
                            <th key={h} className="text-left py-2.5 px-3 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold first:pl-0">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {annualData.map((d, i) => {
                          const vsCdi = d.cdi != null ? d.boxPct - d.cdi : null;
                          return (
                            <tr
                              key={d.year}
                              className={`border-b border-white/5 last:border-0 ${i % 2 === 0 ? "" : "bg-white/[0.015]"}`}
                            >
                              <td className="py-3 px-3 font-bold text-white first:pl-0">{d.year}</td>
                              <td className="py-3 px-3">
                                <span className={`font-bold ${d.boxPct >= 0 ? "text-gold" : "text-red-400"}`}>
                                  {fmtPct(d.boxPct)}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-green-400">{d.cdi != null ? fmtPct(d.cdi) : <span className="text-muted-foreground">—</span>}</td>
                              <td className="py-3 px-3 text-blue-400">{d.ibov != null ? fmtPct(d.ibov) : <span className="text-muted-foreground">—</span>}</td>
                              <td className="py-3 px-3 text-orange-400">{d.dolar != null ? fmtPct(d.dolar) : <span className="text-muted-foreground">—</span>}</td>
                              <td className="py-3 px-3">
                                {vsCdi != null ? (
                                  <span className={`font-semibold ${vsCdi >= 0 ? "text-green-400" : "text-red-400"}`}>
                                    {vsCdi >= 0 ? "+" : ""}{vsCdi.toFixed(2)}%
                                  </span>
                                ) : <span className="text-muted-foreground">—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : annualData.length > 0 ? (
                // Has snapshots but no benchmark data yet
                <div className="space-y-3">
                  <div className="h-[280px] flex flex-col items-center justify-center text-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-yellow-500/10 flex items-center justify-center">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" strokeWidth="1.5"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">Benchmarks em breve</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Os dados de CDI, IBOVESPA e Dólar serão adicionados<br />pelo seu gestor em cada atualização anual.
                      </p>
                    </div>
                  </div>
                  {/* Show box capital only chart */}
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={annualData} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="year" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => v + "%"} width={44} />
                      <Tooltip content={<BenchmarkTooltip />} />
                      <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
                      <Line type="monotone" dataKey="boxPct" name="Box Capital" stroke="#C9A84C" strokeWidth={3}
                        dot={{ fill: "#C9A84C", r: 5, strokeWidth: 0 }} activeDot={{ r: 7, fill: "#C9A84C", stroke: "#0d0f14", strokeWidth: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
                  Histórico em construção...
                </div>
              )}
            </div>

            {/* Legend explanation */}
            <div
              className="rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3"
              style={{ background: "#131620", border: "1px solid rgba(201,168,76,0.08)" }}
            >
              {[
                { color: "#C9A84C", label: "Box Capital", desc: "Seu patrimônio gerido" },
                { color: "#3fcf8e", label: "CDI", desc: "Taxa referência renda fixa" },
                { color: "#60a5fa", label: "IBOVESPA", desc: "Índice da bolsa brasileira" },
                { color: "#f97316", label: "Dólar", desc: "Variação USD/BRL no ano" },
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
