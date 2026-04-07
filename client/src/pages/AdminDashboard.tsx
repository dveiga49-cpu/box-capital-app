import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

interface Props { user: { id: number; name: string; email: string; role: string }; }
interface Client { id: number; name: string; email: string; phone: string | null; active: boolean; createdAt: string; }
interface Asset { id: number; portfolioId: number; name: string; symbol: string; quantity: number; avgPrice: number; currentPrice: number; color: string; }
interface Portfolio { id: number; userId: number; initialValue: number; goal: number; note: string | null; projectionRate: number | null; }
interface Snapshot { id: number; portfolioId: number; month: string; value: number; cdi?: number | null; ibov?: number | null; dolar?: number | null; withdrawal?: number | null; }
interface PortfolioData { portfolio: Portfolio; assets: Asset[]; snapshots: Snapshot[]; }

function fmtBRL(v: number) { return "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// ── Icon helpers ──────────────────────────────────────────────
const IconEdit = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const IconTrash = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);
const IconPlus = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

export default function AdminDashboard({ user }: Props) {
  const [, nav] = useLocation();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"clients" | "portfolio">("clients");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"success" | "error">("success");

  // Modal states
  const [modalAdminPwd, setModalAdminPwd] = useState(false);
  const [modalAddClient, setModalAddClient] = useState(false);
  const [modalEditClient, setModalEditClient] = useState<Client | null>(null);
  const [modalEditPortfolio, setModalEditPortfolio] = useState(false);
  const [modalAddAsset, setModalAddAsset] = useState(false);
  const [modalEditAsset, setModalEditAsset] = useState<Asset | null>(null);
  const [modalAddSnap, setModalAddSnap] = useState(false);
  const [modalEditSnap, setModalEditSnap] = useState<Snapshot | null>(null);

  const showMsg = (text: string, type: "success" | "error" = "success") => {
    setMsg(text); setMsgType(type);
    setTimeout(() => setMsg(""), 4000);
  };

  // ── Queries ──────────────────────────────────────────────────
  const { data: clients = [], isLoading } = useQuery<Client[]>({ queryKey: ["/api/admin/clients"] });
  const { data: portfolioData, refetch: refetchPortfolio } = useQuery<PortfolioData>({
    queryKey: ["/api/portfolio", selectedClient?.id],
    queryFn: () => fetch(`/api/portfolio/${selectedClient!.id}`).then(r => r.json()),
    enabled: !!selectedClient && tab === "portfolio",
    staleTime: 10_000,
  });

  // ── Mutations ────────────────────────────────────────────────
  const logout = useMutation({
    mutationFn: () => fetch("/api/auth/logout", { method: "POST" }),
    onSuccess: () => {
      qc.setQueryData(["/api/auth/me"], null);
      qc.clear();
      nav("/login");
    },
  });

  const deleteClientMut = useMutation({
    mutationFn: (id: number) => fetch(`/api/admin/clients/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/clients"] }); showMsg("Cliente removido."); },
  });

  const deleteAssetMut = useMutation({
    mutationFn: (id: number) => fetch(`/api/assets/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/portfolio", selectedClient?.id] }); showMsg("Ativo removido."); },
  });

  const deleteSnapMut = useMutation({
    mutationFn: (id: number) => fetch(`/api/snapshots/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/portfolio", selectedClient?.id] }); showMsg("Snapshot removido."); },
  });

  // Latest snapshot value as patrimony when no assets
  const latestSnap = portfolioData?.snapshots.length
    ? [...(portfolioData.snapshots)].sort((a, b) => b.month.localeCompare(a.month))[0]
    : null;
  const assetsTotal = portfolioData?.assets.reduce((s, a) => s + a.quantity * a.currentPrice, 0) ?? 0;
  const total = assetsTotal > 0 ? assetsTotal : (latestSnap?.value ?? 0);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-card px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg className="w-7 h-7" viewBox="0 0 48 48" fill="none">
            <rect x="4" y="4" width="40" height="40" rx="2" stroke="#C9A84C" strokeWidth="2" fill="none"/>
            <path d="M14 14 L34 14 L34 34 L14 34 Z" stroke="#C9A84C" strokeWidth="1.5" fill="none"/>
            <path d="M4 4 L14 14M34 14 L44 4M14 34 L4 44M34 34 L44 44" stroke="#C9A84C" strokeWidth="1.5"/>
          </svg>
          <div>
            <p className="text-sm font-bold text-gold" style={{ fontFamily: "Georgia, serif" }}>BOX CAPITAL STRATEGY</p>
            <p className="text-[10px] text-muted-foreground">Painel Administrativo</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground hidden sm:block">{user.name}</span>
          <span className="text-[10px] bg-yellow-500/10 text-gold px-2 py-0.5 rounded-full font-semibold">ADMIN</span>
          <button onClick={() => setModalAdminPwd(true)} className="text-muted-foreground hover:text-gold transition-colors p-1.5" title="Alterar minha senha">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </button>
          <button onClick={() => logout.mutate()} className="text-muted-foreground hover:text-red-400 transition-colors p-1.5" title="Sair">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-border px-6">
        <nav className="flex gap-6">
          {(["clients", "portfolio"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${tab === t ? "border-yellow-500 text-gold" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t === "clients" ? `Clientes (${clients.length})` : `Portfólio do Cliente`}
            </button>
          ))}
        </nav>
      </div>

      {/* Feedback message */}
      {msg && (
        <div className={`mx-6 mt-3 p-3 border rounded-lg text-xs flex items-center justify-between ${
          msgType === "success"
            ? "bg-green-500/10 border-green-500/20 text-green-400"
            : "bg-red-500/10 border-red-500/20 text-red-400"
        }`}>
          {msg}
          <button onClick={() => setMsg("")}>✕</button>
        </div>
      )}

      <main className="flex-1 p-6 max-w-5xl mx-auto w-full">

        {/* ══ TAB: CLIENTES ══ */}
        {tab === "clients" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Clientes Cadastrados</h2>
              <button onClick={() => setModalAddClient(true)}
                className="btn-gold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5">
                <IconPlus /> Novo Cliente
              </button>
            </div>

            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>
            ) : clients.length === 0 ? (
              <div className="text-center py-12 bg-card border border-border rounded-xl">
                <p className="text-muted-foreground text-sm">Nenhum cliente ainda.</p>
                <button onClick={() => setModalAddClient(true)} className="mt-3 text-gold text-sm hover:underline">+ Adicionar primeiro cliente</button>
              </div>
            ) : (
              <div className="grid gap-3">
                {clients.map(c => (
                  <div key={c.id} className="card-hover bg-card border border-border rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-yellow-600/15 flex items-center justify-center text-gold font-bold text-sm">
                        {c.name[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.email}</p>
                        {c.phone && <p className="text-xs text-muted-foreground">{c.phone}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${c.active ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                        {c.active ? "Ativo" : "Inativo"}
                      </span>
                      {/* Edit client */}
                      <button onClick={() => setModalEditClient(c)}
                        className="text-xs border border-border px-3 py-1.5 rounded-lg hover:border-yellow-500/40 hover:text-gold transition-colors flex items-center gap-1">
                        <IconEdit /> Editar
                      </button>
                      {/* View portfolio */}
                      <button onClick={() => { setSelectedClient(c); setTab("portfolio"); }}
                        className="text-xs border border-border px-3 py-1.5 rounded-lg hover:border-yellow-500/40 hover:text-gold transition-colors">
                        Ver Portfólio
                      </button>
                      {/* Delete */}
                      <button onClick={() => { if (confirm(`Remover ${c.name}?`)) deleteClientMut.mutate(c.id); }}
                        className="text-muted-foreground hover:text-red-400 transition-colors p-1.5">
                        <IconTrash />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ TAB: PORTFÓLIO ══ */}
        {tab === "portfolio" && (
          <div className="space-y-4">
            {!selectedClient ? (
              <div className="text-center py-12 bg-card border border-border rounded-xl">
                <p className="text-muted-foreground text-sm">Selecione um cliente na aba Clientes.</p>
                <button onClick={() => setTab("clients")} className="mt-3 text-gold text-sm hover:underline">← Ir para Clientes</button>
              </div>
            ) : (
              <>
                {/* Portfolio header */}
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h2 className="text-base font-semibold">Portfólio de {selectedClient.name}</h2>
                    <p className="text-xs text-muted-foreground">{selectedClient.email}</p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => setModalAddAsset(true)}
                      className="btn-gold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1">
                      <IconPlus /> Ativo
                    </button>
                    <button onClick={() => setModalAddSnap(true)}
                      className="text-xs border border-border px-3 py-1.5 rounded-lg hover:border-yellow-500/40 hover:text-gold transition-colors flex items-center gap-1">
                      <IconPlus /> Snapshot
                    </button>
                    <button onClick={() => { setTab("clients"); setSelectedClient(null); }}
                      className="text-xs text-muted-foreground hover:text-foreground">← Voltar</button>
                  </div>
                </div>

                {/* ── Portfolio summary card (editable) ── */}
                {portfolioData && (
                  <div className="bg-card border rounded-xl p-4" style={{ borderColor: "rgba(201,168,76,0.18)" }}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Configuração do Portfólio</h3>
                      <button onClick={() => setModalEditPortfolio(true)}
                        className="text-xs border border-border px-3 py-1 rounded-lg hover:border-yellow-500/40 hover:text-gold transition-colors flex items-center gap-1">
                        <IconEdit /> Editar
                      </button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wider">Patrimônio Atual</p>
                        <p className="text-base font-bold text-foreground tabular">{fmtBRL(total)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wider">Valor Inicial</p>
                        <p className="text-base font-bold text-muted-foreground tabular">{fmtBRL(portfolioData.portfolio.initialValue)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wider">Meta</p>
                        <p className="text-base font-bold text-gold tabular">{fmtBRL(portfolioData.portfolio.goal)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wider">Progresso</p>
                        <p className="text-base font-bold text-gold">{portfolioData.portfolio.goal > 0 ? (total / portfolioData.portfolio.goal * 100).toFixed(1) : "0"}%</p>
                      </div>
                    </div>
                    {portfolioData.portfolio.note && (
                      <p className="text-xs text-muted-foreground mt-3 border-t border-border pt-3 italic">"{portfolioData.portfolio.note}"</p>
                    )}
                  </div>
                )}

                {/* ── Assets ── */}
                <div className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold">Ativos</h3>
                    <button onClick={() => setModalAddAsset(true)}
                      className="text-xs text-gold hover:underline flex items-center gap-1">
                      <IconPlus /> Adicionar
                    </button>
                  </div>
                  {!portfolioData?.assets.length ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">Nenhum ativo cadastrado.</p>
                  ) : (
                    <div className="space-y-2">
                      {portfolioData.assets.map(a => (
                        <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 hover:bg-accent/30 transition-colors border border-transparent hover:border-border">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-[10px] font-bold"
                              style={{ background: a.color + "20", border: `1px solid ${a.color}40`, color: a.color }}>
                              {a.symbol.slice(0, 3)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate">{a.name}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {a.quantity} × {fmtBRL(a.currentPrice)} = <span className="font-semibold text-foreground">{fmtBRL(a.quantity * a.currentPrice)}</span>
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button onClick={() => setModalEditAsset(a)}
                              className="text-muted-foreground hover:text-gold transition-colors p-1.5" title="Editar">
                              <IconEdit />
                            </button>
                            <button onClick={() => { if (confirm(`Remover ${a.name}?`)) deleteAssetMut.mutate(a.id); }}
                              className="text-muted-foreground hover:text-red-400 transition-colors p-1.5" title="Remover">
                              <IconTrash />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Snapshots ── */}
                <div className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold">Histórico Patrimonial (Snapshots)</h3>
                    <button onClick={() => setModalAddSnap(true)}
                      className="text-xs text-gold hover:underline flex items-center gap-1">
                      <IconPlus /> Adicionar
                    </button>
                  </div>
                  {!portfolioData?.snapshots.length ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">Nenhum snapshot. Clique em "+ Snapshot" para adicionar.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border">
                            {["Mês", "Patrimônio (R$)", "Saque (R$)", "CDI %", "IBOVESPA %", "Dólar %", "Ações"].map(h => (
                              <th key={h} className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[...(portfolioData.snapshots)].sort((a, b) => b.month.localeCompare(a.month)).map(s => (
                            <tr key={s.id} className="border-b border-border/40 last:border-0 hover:bg-accent/20 transition-colors">
                              <td className="py-2.5 px-2 font-semibold text-white">{s.month}</td>
                              <td className="py-2.5 px-2 font-semibold text-gold tabular">{fmtBRL(s.value)}</td>
                              <td className="py-2.5 px-2 tabular">{s.withdrawal && s.withdrawal > 0 ? <span className="text-red-400 font-semibold">-{fmtBRL(s.withdrawal)}</span> : <span className="text-muted-foreground">—</span>}</td>
                              <td className="py-2.5 px-2 text-green-400 tabular">{s.cdi != null ? s.cdi + "%" : <span className="text-muted-foreground">—</span>}</td>
                              <td className="py-2.5 px-2 text-blue-400 tabular">{s.ibov != null ? s.ibov + "%" : <span className="text-muted-foreground">—</span>}</td>
                              <td className="py-2.5 px-2 text-orange-400 tabular">{s.dolar != null ? s.dolar + "%" : <span className="text-muted-foreground">—</span>}</td>
                              <td className="py-2.5 px-2">
                                <div className="flex items-center gap-1">
                                  <button onClick={() => setModalEditSnap(s)}
                                    className="text-muted-foreground hover:text-gold transition-colors p-1" title="Editar">
                                    <IconEdit />
                                  </button>
                                  <button onClick={() => { if (confirm(`Remover snapshot ${s.month}?`)) deleteSnapMut.mutate(s.id); }}
                                    className="text-muted-foreground hover:text-red-400 transition-colors p-1" title="Remover">
                                    <IconTrash />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </main>

      <footer className="py-2 border-t border-border" />

      {/* ══ MODALS ══ */}

      {/* Admin change password */}
      {modalAdminPwd && <AdminPasswordModal onClose={() => setModalAdminPwd(false)} onSuccess={(m) => { showMsg(m); setModalAdminPwd(false); }} />}

      {/* Add client */}
      {modalAddClient && (
        <AddClientModal
          onClose={() => setModalAddClient(false)}
          onSuccess={(m) => { showMsg(m); qc.invalidateQueries({ queryKey: ["/api/admin/clients"] }); }}
        />
      )}

      {/* Edit client */}
      {modalEditClient && (
        <EditClientModal
          client={modalEditClient}
          onClose={() => setModalEditClient(null)}
          onSuccess={(m) => { showMsg(m); qc.invalidateQueries({ queryKey: ["/api/admin/clients"] }); setModalEditClient(null); }}
        />
      )}

      {/* Edit portfolio */}
      {modalEditPortfolio && portfolioData && (
        <EditPortfolioModal
          portfolio={portfolioData.portfolio}
          onClose={() => setModalEditPortfolio(false)}
          onSuccess={() => { showMsg("Portfólio atualizado!"); qc.invalidateQueries({ queryKey: ["/api/portfolio", selectedClient?.id] }); setModalEditPortfolio(false); }}
        />
      )}

      {/* Add asset */}
      {modalAddAsset && portfolioData && (
        <AddAssetModal
          portfolioId={portfolioData.portfolio.id}
          onClose={() => setModalAddAsset(false)}
          onSuccess={() => { showMsg("Ativo adicionado!"); qc.invalidateQueries({ queryKey: ["/api/portfolio", selectedClient?.id] }); }}
        />
      )}

      {/* Edit asset */}
      {modalEditAsset && (
        <EditAssetModal
          asset={modalEditAsset}
          onClose={() => setModalEditAsset(null)}
          onSuccess={() => { showMsg("Ativo atualizado!"); qc.invalidateQueries({ queryKey: ["/api/portfolio", selectedClient?.id] }); setModalEditAsset(null); }}
        />
      )}

      {/* Add snapshot */}
      {modalAddSnap && portfolioData && (
        <AddSnapshotModal
          portfolioId={portfolioData.portfolio.id}
          onClose={() => setModalAddSnap(false)}
          onSuccess={() => { showMsg("Snapshot adicionado!"); qc.invalidateQueries({ queryKey: ["/api/portfolio", selectedClient?.id] }); }}
        />
      )}

      {/* Edit snapshot */}
      {modalEditSnap && (
        <EditSnapshotModal
          snapshot={modalEditSnap}
          onClose={() => setModalEditSnap(null)}
          onSuccess={() => { showMsg("Snapshot atualizado!"); qc.invalidateQueries({ queryKey: ["/api/portfolio", selectedClient?.id] }); setModalEditSnap(null); }}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════
// MODAL SHELL
// ══════════════════════════════════════════════
function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl fade-up max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg">✕</button>
        </div>
        {children}
      </div>
    </div>
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

// ══════════════════════════════════════════════
// ADD CLIENT
// ══════════════════════════════════════════════
function AddClientModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (m: string) => void }) {
  const [name, setName] = useState(""); const [email, setEmail] = useState("");
  const [password, setPassword] = useState(""); const [phone, setPhone] = useState("");
  const [err, setErr] = useState(""); const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (!name || !email || !password) { setErr("Preencha todos os campos obrigatórios."); return; }
    if (password.length < 6) { setErr("Senha mínima de 6 caracteres."); return; }
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
        <Field label="Nome completo *" value={name} onChange={setName} placeholder="Ex: João Silva" />
        <Field label="E-mail *" value={email} onChange={setEmail} placeholder="joao@email.com" type="email" />
        <Field label="Senha inicial *" value={password} onChange={setPassword} placeholder="Mínimo 6 caracteres" type="password" />
        <Field label="Telefone" value={phone} onChange={setPhone} placeholder="+55 11 99999-9999" />
        {err && <p className="text-xs text-red-400">{err}</p>}
        <button type="submit" disabled={loading} className="btn-gold w-full py-2.5 rounded-lg text-sm font-semibold mt-2 disabled:opacity-60">
          {loading ? "Criando..." : "Criar Cliente"}
        </button>
      </form>
    </ModalShell>
  );
}

// ══════════════════════════════════════════════
// EDIT CLIENT
// ══════════════════════════════════════════════
function EditClientModal({ client, onClose, onSuccess }: { client: Client; onClose: () => void; onSuccess: (m: string) => void }) {
  const [name, setName] = useState(client.name);
  const [email, setEmail] = useState(client.email);
  const [phone, setPhone] = useState(client.phone ?? "");
  const [password, setPassword] = useState("");
  const [active, setActive] = useState(client.active);
  const [err, setErr] = useState(""); const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (!name || !email) { setErr("Nome e e-mail são obrigatórios."); return; }
    if (password && password.length < 6) { setErr("Nova senha mínima de 6 caracteres."); return; }
    setLoading(true);
    const body: any = { name, email, phone, active };
    if (password) body.password = password;
    const r = await fetch(`/api/admin/clients/${client.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const d = await r.json(); setLoading(false);
    if (!r.ok) { setErr(d.error || "Erro ao atualizar."); return; }
    onSuccess(`Cliente ${name} atualizado!`);
  }

  return (
    <ModalShell title={`Editar — ${client.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Nome completo *" value={name} onChange={setName} placeholder="Ex: João Silva" />
        <Field label="E-mail *" value={email} onChange={setEmail} placeholder="joao@email.com" type="email" />
        <Field label="Telefone" value={phone} onChange={setPhone} placeholder="+55 11 99999-9999" />
        <Field label="Nova senha (deixe em branco para não alterar)" value={password} onChange={setPassword} placeholder="Mínimo 6 caracteres" type="password" />
        {/* Active toggle */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-accent/30 border border-border">
          <div>
            <p className="text-sm font-medium">Status do cliente</p>
            <p className="text-xs text-muted-foreground">Clientes inativos não conseguem fazer login</p>
          </div>
          <button type="button" onClick={() => setActive(!active)}
            className={`relative w-11 h-6 rounded-full transition-colors ${active ? "bg-green-500" : "bg-muted"}`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${active ? "translate-x-5" : ""}`} />
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground text-center">
          Status atual: <span className={active ? "text-green-400 font-semibold" : "text-red-400 font-semibold"}>{active ? "Ativo" : "Inativo"}</span>
        </p>
        {err && <p className="text-xs text-red-400">{err}</p>}
        <button type="submit" disabled={loading} className="btn-gold w-full py-2.5 rounded-lg text-sm font-semibold mt-2 disabled:opacity-60">
          {loading ? "Salvando..." : "Salvar Alterações"}
        </button>
      </form>
    </ModalShell>
  );
}

// ══════════════════════════════════════════════
// EDIT PORTFOLIO
// ══════════════════════════════════════════════
function EditPortfolioModal({ portfolio, onClose, onSuccess }: { portfolio: Portfolio; onClose: () => void; onSuccess: () => void }) {
  const [initialValue, setInitialValue] = useState(String(portfolio.initialValue));
  const [goal, setGoal] = useState(String(portfolio.goal));
  const [note, setNote] = useState(portfolio.note ?? "");
  const [projectionRate, setProjectionRate] = useState(String(portfolio.projectionRate ?? 1));
  const [err, setErr] = useState(""); const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (!initialValue || !goal) { setErr("Valor inicial e meta são obrigatórios."); return; }
    setLoading(true);
    const r = await fetch(`/api/portfolio/${portfolio.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initialValue: parseFloat(initialValue), goal: parseFloat(goal), note, projectionRate: parseFloat(projectionRate) || 1 })
    });
    const d = await r.json(); setLoading(false);
    if (!r.ok) { setErr(d.error || "Erro."); return; }
    onSuccess();
  }

  return (
    <ModalShell title="Editar Portfólio" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Valor inicial investido (R$) *" value={initialValue} onChange={setInitialValue} placeholder="1650" type="number" />
        <Field label="Meta de patrimônio (R$) *" value={goal} onChange={setGoal} placeholder="200000" type="number" />
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Observação / nota</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Ex: Gestão patrimonial Box Capital Strategy"
            rows={3}
            className="w-full px-3 py-2.5 rounded-lg text-sm bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-yellow-600/50 resize-none transition-all" />
        </div>
        <div className="pt-2 border-t border-border">
          <p className="text-[11px] text-muted-foreground mb-2 font-medium">Projeção 2026</p>
          <Field label="Taxa de crescimento mensal (% ao mês)" value={projectionRate} onChange={setProjectionRate} placeholder="1" type="number" />
          <p className="text-[10px] text-muted-foreground/60 mt-1.5">
            Equivale a ~{((Math.pow(1 + (parseFloat(projectionRate) || 1) / 100, 12) - 1) * 100).toFixed(1)}% ao ano. Cada cliente pode ter uma taxa diferente.
          </p>
        </div>
        {err && <p className="text-xs text-red-400">{err}</p>}
        <button type="submit" disabled={loading} className="btn-gold w-full py-2.5 rounded-lg text-sm font-semibold mt-2 disabled:opacity-60">
          {loading ? "Salvando..." : "Salvar Portfólio"}
        </button>
      </form>
    </ModalShell>
  );
}

// ══════════════════════════════════════════════
// ADD ASSET
// ══════════════════════════════════════════════
function AddAssetModal({ portfolioId, onClose, onSuccess }: { portfolioId: number; onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState(""); const [symbol, setSymbol] = useState("");
  const [qty, setQty] = useState(""); const [avgPrice, setAvgPrice] = useState("");
  const [currPrice, setCurrPrice] = useState(""); const [color, setColor] = useState("#C9A84C");
  const [err, setErr] = useState(""); const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (!name || !symbol || !qty || !currPrice) { setErr("Preencha todos os campos obrigatórios."); return; }
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
          <Field label="Símbolo *" value={symbol} onChange={setSymbol} placeholder="BTC" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantidade *" value={qty} onChange={setQty} placeholder="1.08" type="number" />
          <Field label="Preço Atual (R$) *" value={currPrice} onChange={setCurrPrice} placeholder="84200" type="number" />
        </div>
        <Field label="Preço Médio (R$)" value={avgPrice} onChange={setAvgPrice} placeholder="70000" type="number" />
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Cor do ativo</label>
          <div className="flex items-center gap-3">
            <input type="color" value={color} onChange={e => setColor(e.target.value)}
              className="h-9 w-16 rounded-lg cursor-pointer bg-input border border-border" />
            <span className="text-xs text-muted-foreground">{color}</span>
          </div>
        </div>
        {err && <p className="text-xs text-red-400">{err}</p>}
        <button type="submit" disabled={loading} className="btn-gold w-full py-2.5 rounded-lg text-sm font-semibold mt-2 disabled:opacity-60">
          {loading ? "Salvando..." : "Adicionar Ativo"}
        </button>
      </form>
    </ModalShell>
  );
}

// ══════════════════════════════════════════════
// EDIT ASSET
// ══════════════════════════════════════════════
function EditAssetModal({ asset, onClose, onSuccess }: { asset: Asset; onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState(asset.name);
  const [symbol, setSymbol] = useState(asset.symbol);
  const [qty, setQty] = useState(String(asset.quantity));
  const [avgPrice, setAvgPrice] = useState(String(asset.avgPrice));
  const [currPrice, setCurrPrice] = useState(String(asset.currentPrice));
  const [color, setColor] = useState(asset.color);
  const [err, setErr] = useState(""); const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (!name || !symbol || !qty || !currPrice) { setErr("Preencha todos os campos obrigatórios."); return; }
    setLoading(true);
    const r = await fetch(`/api/assets/${asset.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, symbol: symbol.toUpperCase(), quantity: parseFloat(qty),
        avgPrice: parseFloat(avgPrice) || 0, currentPrice: parseFloat(currPrice), color })
    });
    const d = await r.json(); setLoading(false);
    if (!r.ok) { setErr(d.error || "Erro."); return; }
    onSuccess();
  }

  return (
    <ModalShell title={`Editar Ativo — ${asset.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome *" value={name} onChange={setName} placeholder="Bitcoin" />
          <Field label="Símbolo *" value={symbol} onChange={setSymbol} placeholder="BTC" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantidade *" value={qty} onChange={setQty} placeholder="1.08" type="number" />
          <Field label="Preço Atual (R$) *" value={currPrice} onChange={setCurrPrice} placeholder="84200" type="number" />
        </div>
        <Field label="Preço Médio (R$)" value={avgPrice} onChange={setAvgPrice} placeholder="70000" type="number" />
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Cor do ativo</label>
          <div className="flex items-center gap-3">
            <input type="color" value={color} onChange={e => setColor(e.target.value)}
              className="h-9 w-16 rounded-lg cursor-pointer bg-input border border-border" />
            <span className="text-xs text-muted-foreground">{color}</span>
          </div>
        </div>
        {err && <p className="text-xs text-red-400">{err}</p>}
        <button type="submit" disabled={loading} className="btn-gold w-full py-2.5 rounded-lg text-sm font-semibold mt-2 disabled:opacity-60">
          {loading ? "Salvando..." : "Salvar Alterações"}
        </button>
      </form>
    </ModalShell>
  );
}

// ══════════════════════════════════════════════
// ADD SNAPSHOT
// ══════════════════════════════════════════════
function AddSnapshotModal({ portfolioId, onClose, onSuccess }: { portfolioId: number; onClose: () => void; onSuccess: () => void }) {
  const [month, setMonth] = useState(""); const [value, setValue] = useState("");
  const [withdrawal, setWithdrawal] = useState("");
  const [cdi, setCdi] = useState(""); const [ibov, setIbov] = useState(""); const [dolar, setDolar] = useState("");
  const [err, setErr] = useState(""); const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (!month || !value) { setErr("Mês e valor são obrigatórios."); return; }
    setLoading(true);
    const body: any = { month, value: parseFloat(value), withdrawal: withdrawal ? parseFloat(withdrawal) : 0 };
    if (cdi)   body.cdi   = parseFloat(cdi);
    if (ibov)  body.ibov  = parseFloat(ibov);
    if (dolar) body.dolar = parseFloat(dolar);
    const r = await fetch(`/api/portfolio/${portfolioId}/snapshots`, { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json(); setLoading(false);
    if (!r.ok) { setErr(d.error || "Erro."); return; }
    onSuccess(); onClose();
  }

  return (
    <ModalShell title="Atualização Patrimonial" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Mês de referência *</label>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg text-sm bg-input border border-border text-foreground focus:outline-none focus:border-yellow-600/50 transition-all" />
        </div>
        <Field label="Patrimônio do cliente (R$) *" value={value} onChange={setValue} placeholder="43935" type="number" />
        <div className="p-3 rounded-lg border border-red-500/20 bg-red-500/5">
          <p className="text-[11px] text-red-400 font-medium mb-1.5">Saque realizado neste período</p>
          <Field label="Valor do saque (R$) — deixe em branco se não houve" value={withdrawal} onChange={setWithdrawal} placeholder="0" type="number" />
        </div>
        <div className="pt-2 border-t border-border">
          <p className="text-[11px] text-muted-foreground mb-2 font-medium">Benchmarks anuais (% do ano — preenchidos automaticamente)</p>
          <div className="grid grid-cols-3 gap-2">
            <Field label="CDI %" value={cdi} onChange={setCdi} placeholder="auto" type="number" />
            <Field label="IBOVESPA %" value={ibov} onChange={setIbov} placeholder="auto" type="number" />
            <Field label="Dólar %" value={dolar} onChange={setDolar} placeholder="auto" type="number" />
          </div>
          <p className="text-[10px] text-muted-foreground/60 mt-1.5">Deixe em branco para preenchimento automático via Banco Central.</p>
        </div>
        {err && <p className="text-xs text-red-400">{err}</p>}
        <button type="submit" disabled={loading} className="btn-gold w-full py-2.5 rounded-lg text-sm font-semibold mt-2 disabled:opacity-60">
          {loading ? "Salvando..." : "Salvar"}
        </button>
      </form>
    </ModalShell>
  );
}

// ══════════════════════════════════════════════
// EDIT SNAPSHOT
// ══════════════════════════════════════════════
function EditSnapshotModal({ snapshot, onClose, onSuccess }: { snapshot: Snapshot; onClose: () => void; onSuccess: () => void }) {
  const [month, setMonth] = useState(snapshot.month);
  const [value, setValue] = useState(String(snapshot.value));
  const [withdrawal, setWithdrawal] = useState(snapshot.withdrawal && snapshot.withdrawal > 0 ? String(snapshot.withdrawal) : "");
  const [cdi, setCdi] = useState(snapshot.cdi != null ? String(snapshot.cdi) : "");
  const [ibov, setIbov] = useState(snapshot.ibov != null ? String(snapshot.ibov) : "");
  const [dolar, setDolar] = useState(snapshot.dolar != null ? String(snapshot.dolar) : "");
  const [err, setErr] = useState(""); const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (!month || !value) { setErr("Mês e valor são obrigatórios."); return; }
    setLoading(true);
    const body: any = { month, value: parseFloat(value), withdrawal: withdrawal ? parseFloat(withdrawal) : 0 };
    body.cdi   = cdi   ? parseFloat(cdi)   : null;
    body.ibov  = ibov  ? parseFloat(ibov)  : null;
    body.dolar = dolar ? parseFloat(dolar) : null;
    const r = await fetch(`/api/snapshots/${snapshot.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    const d = await r.json(); setLoading(false);
    if (!r.ok) { setErr(d.error || "Erro."); return; }
    onSuccess();
  }

  return (
    <ModalShell title={`Editar Snapshot — ${snapshot.month}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Mês de referência *</label>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg text-sm bg-input border border-border text-foreground focus:outline-none focus:border-yellow-600/50 transition-all" />
        </div>
        <Field label="Patrimônio (R$) *" value={value} onChange={setValue} placeholder="43935" type="number" />
        <div className="p-3 rounded-lg border border-red-500/20 bg-red-500/5">
          <p className="text-[11px] text-red-400 font-medium mb-1.5">Saque realizado neste período</p>
          <Field label="Valor do saque (R$) — deixe em branco se não houve" value={withdrawal} onChange={setWithdrawal} placeholder="0" type="number" />
        </div>
        <div className="pt-2 border-t border-border">
          <p className="text-[11px] text-muted-foreground mb-2 font-medium">Benchmarks anuais (% do ano)</p>
          <div className="grid grid-cols-3 gap-2">
            <Field label="CDI %" value={cdi} onChange={setCdi} placeholder="10.82" type="number" />
            <Field label="IBOVESPA %" value={ibov} onChange={setIbov} placeholder="-10.36" type="number" />
            <Field label="Dólar %" value={dolar} onChange={setDolar} placeholder="27.44" type="number" />
          </div>
        </div>
        {err && <p className="text-xs text-red-400">{err}</p>}
        <button type="submit" disabled={loading} className="btn-gold w-full py-2.5 rounded-lg text-sm font-semibold mt-2 disabled:opacity-60">
          {loading ? "Salvando..." : "Salvar Alterações"}
        </button>
      </form>
    </ModalShell>
  );
}

// ── Admin Password Modal ──────────────────────────────────────────────────────
function AdminPasswordModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (m: string) => void }) {
  const [curPwd, setCurPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confPwd, setConfPwd] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!curPwd || !newPwd || !confPwd) { setErr("Preencha todos os campos."); return; }
    if (newPwd.length < 6) { setErr("Nova senha: mínimo 6 caracteres."); return; }
    if (newPwd !== confPwd) { setErr("As senhas não coincidem."); return; }
    setLoading(true);
    try {
      const r = await fetch("/api/admin/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: curPwd, newPassword: newPwd }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error ?? "Erro ao alterar senha."); return; }
      onSuccess("Senha do administrador alterada com sucesso.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell title="Alterar Minha Senha" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {[
          { label: "Senha atual",          val: curPwd,  set: setCurPwd },
          { label: "Nova senha",            val: newPwd,  set: setNewPwd },
          { label: "Confirmar nova senha",  val: confPwd, set: setConfPwd },
        ].map(f => (
          <div key={f.label}>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1">{f.label}</label>
            <input
              type="password"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-yellow-600/50 focus:ring-1 focus:ring-yellow-600/20"
              value={f.val}
              onChange={e => f.set(e.target.value)}
              placeholder="••••••"
            />
          </div>
        ))}
        {err && <p className="text-xs text-red-400">{err}</p>}
        <button type="submit" disabled={loading} className="btn-gold w-full py-2.5 rounded-lg text-sm font-semibold mt-1 disabled:opacity-60">
          {loading ? "Salvando..." : "Alterar Senha"}
        </button>
      </form>
    </ModalShell>
  );
}
