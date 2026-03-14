import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

interface Props { user: { id: number; name: string; email: string; role: string }; }
interface Client { id: number; name: string; email: string; phone: string | null; active: boolean; createdAt: string; }
interface Asset { id: number; portfolioId: number; name: string; symbol: string; quantity: number; avgPrice: number; currentPrice: number; color: string; }
interface Portfolio { id: number; userId: number; initialValue: number; goal: number; note: string | null; }
interface Snapshot { id: number; portfolioId: number; month: string; value: number; }
interface PortfolioData { portfolio: Portfolio; assets: Asset[]; snapshots: Snapshot[]; }

function fmt(v: number) { return "US$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default function AdminDashboard({ user }: Props) {
  const [, nav] = useLocation();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"clients" | "portfolio">("clients");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showAddClient, setShowAddClient] = useState(false);
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [showAddSnap, setShowAddSnap] = useState(false);
  const [msg, setMsg] = useState("");

  const { data: clients = [], isLoading } = useQuery<Client[]>({ queryKey: ["/api/admin/clients"] });
  const { data: portfolioData } = useQuery<PortfolioData>({
    queryKey: ["/api/portfolio", selectedClient?.id],
    queryFn: () => fetch(`/api/portfolio/${selectedClient!.id}`).then(r => r.json()),
    enabled: !!selectedClient && tab === "portfolio",
    staleTime: 10_000,
  });

  const logout = useMutation({
    mutationFn: () => fetch("/api/auth/logout", { method: "POST" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/auth/me"] }); nav("/login"); },
  });

  const deleteClientMut = useMutation({
    mutationFn: (id: number) => fetch(`/api/admin/clients/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/clients"] }); setMsg("Cliente removido."); },
  });

  const deleteAssetMut = useMutation({
    mutationFn: (id: number) => fetch(`/api/assets/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/portfolio", selectedClient?.id] }); },
  });

  const deleteSnapMut = useMutation({
    mutationFn: (id: number) => fetch(`/api/snapshots/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/portfolio", selectedClient?.id] }); },
  });

  const total = portfolioData?.assets.reduce((s, a) => s + a.quantity * a.currentPrice, 0) ?? 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-card px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg className="w-7 h-7" viewBox="0 0 48 48" fill="none">
            <rect x="4" y="4" width="40" height="40" rx="2" stroke="#C9A84C" strokeWidth="2" fill="none"/>
            <path d="M14 14 L34 14 L34 34 L14 34 Z" stroke="#C9A84C" strokeWidth="1.5" fill="none"/>
            <path d="M4 4 L14 14M34 14 L44 4M14 34 L4 44M34 34 L44 44" stroke="#C9A84C" strokeWidth="1.5"/>
          </svg>
          <div>
            <p className="text-sm font-bold text-gold">BOX CAPITAL STRATEGY</p>
            <p className="text-[10px] text-muted-foreground">Painel Administrativo</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground hidden sm:block">{user.name}</span>
          <span className="text-[10px] bg-yellow-500/10 text-gold px-2 py-0.5 rounded-full font-semibold">ADMIN</span>
          <button onClick={() => logout.mutate()} className="text-muted-foreground hover:text-red-400 transition-colors p-1.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </header>

      <div className="border-b border-border px-6">
        <nav className="flex gap-6">
          {(["clients", "portfolio"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${tab === t ? "border-yellow-500 text-gold" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t === "clients" ? `Clientes (${clients.length})` : `Portf\u00f3lio do Cliente`}
            </button>
          ))}
        </nav>
      </div>

      {msg && (
        <div className="mx-6 mt-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-xs text-green-400 flex items-center justify-between">
          {msg}
          <button onClick={() => setMsg("")} className="text-green-400 hover:text-green-300">&times;</button>
        </div>
      )}

      <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
        {tab === "clients" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Clientes Cadastrados</h2>
              <button onClick={() => setShowAddClient(true)} className="btn-gold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5">
                + Novo Cliente
              </button>
            </div>

            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>
            ) : clients.length === 0 ? (
              <div className="text-center py-12 bg-card border border-border rounded-xl">
                <p className="text-muted-foreground text-sm">Nenhum cliente ainda.</p>
                <button onClick={() => setShowAddClient(true)} className="mt-3 text-gold text-sm hover:underline">+ Adicionar primeiro cliente</button>
              </div>
            ) : (
              <div className="grid gap-3">
                {clients.map(c => (
                  <div key={c.id} className="card-hover bg-card border border-border rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-yellow-600/15 flex items-center justify-center text-gold font-bold text-sm">
                        {c.name[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${c.active ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                        {c.active ? "Ativo" : "Inativo"}
                      </span>
                      <button onClick={() => { setSelectedClient(c); setTab("portfolio"); }}
                        className="text-xs border border-border px-3 py-1.5 rounded-lg hover:border-yellow-500/40 hover:text-gold transition-colors">
                        Ver Portf\u00f3lio
                      </button>
                      <button onClick={() => { if (confirm(`Remover ${c.name}?`)) deleteClientMut.mutate(c.id); }}
                        className="text-muted-foreground hover:text-red-400 transition-colors p-1.5">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "portfolio" && (
          <div className="space-y-4">
            {!selectedClient ? (
              <div className="text-center py-12 bg-card border border-border rounded-xl">
                <p className="text-muted-foreground text-sm">Selecione um cliente na aba Clientes.</p>
                <button onClick={() => setTab("clients")} className="mt-3 text-gold text-sm hover:underline">&larr; Ir para Clientes</button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h2 className="text-base font-semibold">Portf\u00f3lio de {selectedClient.name}</h2>
                    <p className="text-xs text-muted-foreground">{selectedClient.email}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setShowAddAsset(true)} className="btn-gold px-3 py-1.5 rounded-lg text-xs">+ Ativo</button>
                    <button onClick={() => setShowAddSnap(true)} className="text-xs border border-border px-3 py-1.5 rounded-lg hover:border-yellow-500/40 hover:text-gold transition-colors">+ Snapshot</button>
                    <button onClick={() => { setTab("clients"); setSelectedClient(null); }} className="text-xs text-muted-foreground hover:text-foreground">&larr; Voltar</button>
                  </div>
                </div>

                {portfolioData && (
                  <div className="bg-card border rounded-xl p-4" style={{ borderColor: "rgba(201,168,76,0.18)" }}>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Patrim\u00f4nio Total</p>
                        <p className="text-lg font-bold tabular">{fmt(total)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Meta</p>
                        <p className="text-lg font-bold text-gold">{fmt(portfolioData.portfolio.goal)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Progresso</p>
                        <p className="text-lg font-bold text-gold">{(total / portfolioData.portfolio.goal * 100).toFixed(0)}%</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-card border border-border rounded-xl p-4">
                  <h3 className="text-sm font-semibold mb-3">Ativos</h3>
                  {!portfolioData?.assets.length ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">Nenhum ativo.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-border">
                        {["Ativo","S\u00edmbolo","Qtd.","Pre\u00e7o Atual","Valor Total","A\u00e7\u00f5es"].map(h => (
                          <th key={h} className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {portfolioData.assets.map(a => (
                          <tr key={a.id} className="border-b border-border/40 hover:bg-accent/30 last:border-0">
                            <td className="py-2.5 px-2 font-semibold">{a.name}</td>
                            <td className="py-2.5 px-2 text-muted-foreground">{a.symbol}</td>
                            <td className="py-2.5 px-2 tabular">{a.quantity}</td>
                            <td className="py-2.5 px-2 tabular">${a.currentPrice.toLocaleString("en-US")}</td>
                            <td className="py-2.5 px-2 tabular font-semibold">${Math.round(a.quantity * a.currentPrice).toLocaleString("en-US")}</td>
                            <td className="py-2.5 px-2">
                              <button onClick={() => deleteAssetMut.mutate(a.id)} className="text-muted-foreground hover:text-red-400">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="bg-card border border-border rounded-xl p-4">
                  <h3 className="text-sm font-semibold mb-3">Hist\u00f3rico (Snapshots)</h3>
                  {!portfolioData?.snapshots.length ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">Nenhum snapshot.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {portfolioData.snapshots.map(s => (
                        <div key={s.id} className="flex items-center gap-2 bg-accent/40 rounded-lg px-3 py-2 text-xs">
                          <span className="text-muted-foreground">{s.month}</span>
                          <span className="font-semibold tabular text-gold">{fmt(s.value)}</span>
                          <button onClick={() => deleteSnapMut.mutate(s.id)} className="text-muted-foreground hover:text-red-400 ml-1">&times;</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </main>

      <footer className="text-center py-3 text-[11px] text-muted-foreground/40 border-t border-border">
        <a href="https://www.perplexity.ai/computer" target="_blank" rel="noopener noreferrer" className="hover:text-gold transition-colors">Criado com Perplexity Computer</a>
      </footer>

      {showAddClient && <AddClientModal onClose={() => setShowAddClient(false)} onSuccess={(m) => { setMsg(m); qc.invalidateQueries({ queryKey: ["/api/admin/clients"] }); }} />}
      {showAddAsset && selectedClient && portfolioData && (
        <AddAssetModal portfolioId={portfolioData.portfolio.id} onClose={() => setShowAddAsset(false)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ["/api/portfolio", selectedClient.id] })} />
      )}
      {showAddSnap && selectedClient && portfolioData && (
        <AddSnapshotModal portfolioId={portfolioData.portfolio.id} onClose={() => setShowAddSnap(false)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ["/api/portfolio", selectedClient.id] })} />
      )}
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl fade-up">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg">&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AddClientModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (m: string) => void }) {
  const [name, setName] = useState(""); const [email, setEmail] = useState("");
  const [password, setPassword] = useState(""); const [phone, setPhone] = useState("");
  const [err, setErr] = useState(""); const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (!name || !email || !password) { setErr("Preencha todos os campos obrigat\u00f3rios."); return; }
    if (password.length < 6) { setErr("Senha m\u00ednima de 6 caracteres."); return; }
    setLoading(true);
    const r = await fetch("/api/admin/clients", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, phone }) });
    const d = await r.json(); setLoading(false);
    if (!r.ok) { setErr(d.error || "Erro."); return; }
    onSuccess(`Cliente ${name} criado com sucesso!`); onClose();
  }

  return (
    <ModalShell title="Novo Cliente" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Nome completo *" value={name} onChange={setName} placeholder="Ex: Jo\u00e3o Silva" />
        <Field label="E-mail *" value={email} onChange={setEmail} placeholder="joao@email.com" type="email" />
        <Field label="Senha inicial *" value={password} onChange={setPassword} placeholder="M\u00ednimo 6 caracteres" type="password" />
        <Field label="Telefone" value={phone} onChange={setPhone} placeholder="+55 11 99999-9999" />
        {err && <p className="text-xs text-red-400">{err}</p>}
        <button type="submit" disabled={loading} className="btn-gold w-full py-2.5 rounded-lg text-sm font-semibold mt-2 disabled:opacity-60">
          {loading ? "Criando..." : "Criar Cliente"}
        </button>
      </form>
    </ModalShell>
  );
}

function AddAssetModal({ portfolioId, onClose, onSuccess }: { portfolioId: number; onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState(""); const [symbol, setSymbol] = useState("");
  const [qty, setQty] = useState(""); const [avgPrice, setAvgPrice] = useState("");
  const [currPrice, setCurrPrice] = useState(""); const [color, setColor] = useState("#C9A84C");
  const [err, setErr] = useState(""); const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (!name || !symbol || !qty || !currPrice) { setErr("Preencha todos os campos obrigat\u00f3rios."); return; }
    setLoading(true);
    const r = await fetch(`/api/portfolio/${portfolioId}/assets`, { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, symbol: symbol.toUpperCase(), quantity: parseFloat(qty),
        avgPrice: parseFloat(avgPrice) || 0, currentPrice: parseFloat(currPrice), color }) });
    const d = await r.json(); setLoading(false);
    if (!r.ok) { setErr(d.error || "Erro."); return; }
    onSuccess(); onClose();
  }

  return (
    <ModalShell title="Adicionar Ativo" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome *" value={name} onChange={setName} placeholder="Bitcoin" />
          <Field label="S\u00edmbolo *" value={symbol} onChange={setSymbol} placeholder="BTC" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantidade *" value={qty} onChange={setQty} placeholder="1.08" type="number" />
          <Field label="Pre\u00e7o Atual (USD) *" value={currPrice} onChange={setCurrPrice} placeholder="84200" type="number" />
        </div>
        <Field label="Pre\u00e7o M\u00e9dio (USD)" value={avgPrice} onChange={setAvgPrice} placeholder="70000" type="number" />
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Cor</label>
          <input type="color" value={color} onChange={e => setColor(e.target.value)}
            className="h-9 w-full rounded-lg cursor-pointer bg-input border border-border" />
        </div>
        {err && <p className="text-xs text-red-400">{err}</p>}
        <button type="submit" disabled={loading} className="btn-gold w-full py-2.5 rounded-lg text-sm font-semibold mt-2 disabled:opacity-60">
          {loading ? "Salvando..." : "Adicionar Ativo"}
        </button>
      </form>
    </ModalShell>
  );
}

function AddSnapshotModal({ portfolioId, onClose, onSuccess }: { portfolioId: number; onClose: () => void; onSuccess: () => void }) {
  const [month, setMonth] = useState(""); const [value, setValue] = useState("");
  const [err, setErr] = useState(""); const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (!month || !value) { setErr("M\u00eas e valor s\u00e3o obrigat\u00f3rios."); return; }
    setLoading(true);
    const r = await fetch(`/api/portfolio/${portfolioId}/snapshots`, { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, value: parseFloat(value) }) });
    const d = await r.json(); setLoading(false);
    if (!r.ok) { setErr(d.error || "Erro."); return; }
    onSuccess(); onClose();
  }

  return (
    <ModalShell title="Adicionar Snapshot Mensal" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">M\u00eas (AAAA-MM) *</label>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg text-sm bg-input border border-border text-foreground focus:outline-none focus:border-yellow-600/50 transition-all" />
        </div>
        <Field label="Valor Patrimonial (USD) *" value={value} onChange={setValue} placeholder="193668" type="number" />
        {err && <p className="text-xs text-red-400">{err}</p>}
        <button type="submit" disabled={loading} className="btn-gold w-full py-2.5 rounded-lg text-sm font-semibold mt-2 disabled:opacity-60">
          {loading ? "Salvando..." : "Salvar Snapshot"}
        </button>
      </form>
    </ModalShell>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-lg text-sm bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-yellow-600/50 focus:ring-2 focus:ring-yellow-600/10 transition-all" />
    </div>
  );
}
