import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useEffect, useRef, useState } from "react";
import PerplexityAttribution from "@/components/PerplexityAttribution";

interface Props { user: { id: number; name: string; email: string; role: string }; }
interface Asset { id: number; name: string; symbol: string; quantity: number; avgPrice: number; currentPrice: number; color: string; }
interface Portfolio { id: number; userId: number; initialValue: number; goal: number; note: string | null; updatedAt: string; }
interface Snapshot { id: number; portfolioId: number; month: string; value: number; }

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function fmt(v: number) {
  return "US$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ClientDashboard({ user }: Props) {
  const [, nav] = useLocation();
  const qc = useQueryClient();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hidden, setHidden] = useState(false);
  const [clock, setClock] = useState(new Date().toLocaleTimeString("pt-BR"));

  const { data, isLoading } = useQuery<{ portfolio: Portfolio; assets: Asset[]; snapshots: Snapshot[] }>({
    queryKey: ["/api/portfolio", user.id],
    queryFn: () => fetch(`/api/portfolio/${user.id}`).then(r => r.json()),
    staleTime: 30_000,
  });

  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleTimeString("pt-BR")), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!data?.snapshots?.length || !canvasRef.current) return;
    drawChart(canvasRef.current, data.snapshots);
  }, [data]);

  const logoutMutation = useMutation({
    mutationFn: () => fetch("/api/auth/logout", { method: "POST" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/auth/me"] }); nav("/login"); },
  });

  if (isLoading) return (
    <div className="h-screen flex items-center justify-center bg-background">
      <div className="w-8 h-8 border-2 border-yellow-500 rounded-full border-t-transparent spin" />
    </div>
  );

  const assets = data?.assets ?? [];
  const portfolio = data?.portfolio;
  const total = assets.reduce((s, a) => s + a.quantity * a.currentPrice, 0);
  const initialValue = portfolio?.initialValue ?? 0;
  const goal = portfolio?.goal ?? 500000;
  const gain = total - initialValue;
  const gainPct = initialValue > 0 ? (gain / initialValue) * 100 : 0;
  const goalPct = goal > 0 ? Math.min((total / goal) * 100, 100) : 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-card px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg className="w-7 h-7" viewBox="0 0 48 48" fill="none">
            <rect x="4" y="4" width="40" height="40" rx="2" stroke="#C9A84C" strokeWidth="2" fill="none"/>
            <path d="M14 14 L34 14 L34 34 L14 34 Z" stroke="#C9A84C" strokeWidth="1.5" fill="none"/>
            <path d="M4 4 L14 14M34 14 L44 4M14 34 L4 44M34 34 L44 44" stroke="#C9A84C" strokeWidth="1.5"/>
          </svg>
          <div className="leading-tight">
            <p className="text-xs text-muted-foreground">{greeting()}, <span className="text-gold font-semibold">{user.name.split(" ")[0]}</span></p>
            <p className="text-[11px] text-muted-foreground/60">Bem-vindo ao seu portf\u00f3lio premium</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground tabular hidden sm:block">{clock}</span>
          <div className="w-8 h-8 rounded-full bg-yellow-600/20 flex items-center justify-center text-gold font-bold text-sm">
            {user.name[0].toUpperCase()}
          </div>
          <button onClick={() => logoutMutation.mutate()} className="text-muted-foreground hover:text-red-400 transition-colors p-1.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6 flex flex-col gap-5 max-w-4xl mx-auto w-full">
        <div className="fade-up bg-card border rounded-2xl p-5 relative overflow-hidden" style={{ borderColor: "rgba(201,168,76,0.18)" }}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">Patrim\u00f4nio Total</p>
              <p className="text-3xl font-bold tabular" style={{ filter: hidden ? "blur(8px)" : "none" }}>{fmt(total)}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${gain >= 0 ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                  {gain >= 0 ? "\u25b2" : "\u25bc"} {Math.abs(gainPct).toFixed(1)}%
                </span>
                <span className="text-xs text-muted-foreground">desde o in\u00edcio</span>
              </div>
            </div>
            <button onClick={() => setHidden(!hidden)} className="text-muted-foreground hover:text-gold transition-colors p-1.5">
              {hidden ? "\ud83d\udc41" : "\ud83d\ude48"}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-border">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Rendimento Total</p>
              <p className={`text-sm font-semibold tabular ${gain >= 0 ? "text-green-400" : "text-red-400"}`} style={{ filter: hidden ? "blur(6px)" : "none" }}>
                {gain >= 0 ? "+" : ""}{fmt(gain)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Performance</p>
              <p className="text-sm font-semibold text-gold">+{Math.abs(gainPct).toFixed(1)}% total</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Meta</p>
              <p className="text-sm font-semibold text-gold">{goalPct.toFixed(0)}% de {fmt(goal)}</p>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex justify-between text-[10px] text-muted-foreground mb-1.5">
              <span>In\u00edcio: {fmt(initialValue)}</span>
              <span className="text-gold font-semibold">Meta: {fmt(goal)}</span>
            </div>
            <div className="alloc-bar">
              <div className="alloc-fill" style={{ width: goalPct + "%", background: "linear-gradient(90deg, #C9A84C, #e8c878, #3fcf8e)", transition: "width 1s ease" }} />
            </div>
          </div>

          {portfolio?.note && <p className="mt-3 text-xs text-muted-foreground border-t border-border pt-3">{portfolio.note}</p>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="fade-up bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Portf\u00f3lio</h3>
              <span className="text-[10px] font-semibold bg-yellow-500/10 text-gold px-2 py-0.5 rounded-full">{assets.length} ativos</span>
            </div>
            {assets.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhum ativo cadastrado ainda.</p>
            ) : (
              <div className="space-y-2">
                {assets.map(a => {
                  const val = a.quantity * a.currentPrice;
                  const pct = total > 0 ? (val / total) * 100 : 0;
                  return (
                    <div key={a.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: a.color }} />
                        <div>
                          <p className="text-xs font-semibold">{a.name}</p>
                          <p className="text-[10px] text-muted-foreground">{a.quantity} {a.symbol}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-semibold tabular" style={{ filter: hidden ? "blur(5px)" : "none" }}>US$ {Math.round(val).toLocaleString("en-US")}</p>
                        <p className="text-[10px] text-muted-foreground">{pct.toFixed(1)}%</p>
                        <div className="alloc-bar mt-1 w-16"><div className="alloc-fill" style={{ width: pct + "%", background: a.color }} /></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="fade-up bg-card border border-border rounded-xl p-4 flex flex-col">
            <h3 className="text-sm font-semibold mb-3">Evolu\u00e7\u00e3o Patrimonial</h3>
            {data?.snapshots && data.snapshots.length > 1 ? (
              <canvas ref={canvasRef} className="flex-1 w-full" style={{ minHeight: 160 }} />
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-xs text-muted-foreground">Hist\u00f3rico em constru\u00e7\u00e3o...</p>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="text-center py-3 text-[11px] text-muted-foreground/40 border-t border-border">
        <a href="https://www.perplexity.ai/computer" target="_blank" rel="noopener noreferrer" className="hover:text-gold transition-colors">Criado com Perplexity Computer</a>
      </footer>
    </div>
  );
}

function drawChart(canvas: HTMLCanvasElement, snapshots: Snapshot[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.offsetWidth || 300;
  const H = canvas.offsetHeight || 160;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  ctx.scale(dpr, dpr);

  const data = snapshots.map(s => s.value);
  const labels = snapshots.map(s => s.month.slice(5));
  const pad = { t: 10, r: 8, b: 26, l: 10 };
  const cW = W - pad.l - pad.r;
  const cH = H - pad.t - pad.b;
  const min = Math.min(...data) * 0.97;
  const max = Math.max(...data) * 1.02;

  const x = (i: number) => pad.l + (i / (data.length - 1)) * cW;
  const y = (v: number) => pad.t + cH - ((v - min) / (max - min)) * cH;

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "rgba(201,168,76,0.28)");
  grad.addColorStop(1, "rgba(201,168,76,0.01)");

  ctx.beginPath();
  ctx.moveTo(x(0), y(data[0]));
  for (let i = 1; i < data.length; i++) ctx.lineTo(x(i), y(data[i]));
  ctx.lineTo(x(data.length - 1), pad.t + cH);
  ctx.lineTo(x(0), pad.t + cH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x(0), y(data[0]));
  for (let i = 1; i < data.length; i++) ctx.lineTo(x(i), y(data[i]));
  ctx.strokeStyle = "#C9A84C";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.stroke();

  ctx.fillStyle = "rgba(138,143,158,0.6)";
  ctx.font = "9px Inter, sans-serif";
  ctx.textAlign = "center";
  const step = Math.ceil(labels.length / 5);
  labels.forEach((l, i) => { if (i % step === 0) ctx.fillText(l, x(i), H - 6); });

  const lx = x(data.length - 1);
  const ly = y(data[data.length - 1]);
  ctx.beginPath(); ctx.arc(lx, ly, 4, 0, Math.PI * 2);
  ctx.fillStyle = "#C9A84C"; ctx.fill();
  ctx.strokeStyle = "#0d0f14"; ctx.lineWidth = 2; ctx.stroke();
}
