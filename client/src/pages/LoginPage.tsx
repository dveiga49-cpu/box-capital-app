import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";

export default function LoginPage() {
  const [, nav] = useLocation();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email || !password) { setError("Preencha e-mail e senha."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Erro ao entrar."); return; }
      await qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      nav(data.role === "admin" ? "/admin" : "/dashboard");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Grid BG */}
      <div className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "linear-gradient(rgba(201,168,76,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(201,168,76,0.04) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 20%, transparent 100%)"
        }} />
      <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[500px] h-[500px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse, rgba(201,168,76,0.07) 0%, transparent 65%)" }} />

      <div className="fade-up w-full max-w-sm bg-card border rounded-2xl p-10 shadow-2xl"
        style={{ borderColor: "rgba(201,168,76,0.18)" }}>
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <svg className="w-14 h-14" viewBox="0 0 48 48" fill="none" style={{ filter: "drop-shadow(0 0 12px rgba(201,168,76,0.3))" }}>
            <rect x="4" y="4" width="40" height="40" rx="2" stroke="#C9A84C" strokeWidth="2" fill="none"/>
            <path d="M14 14 L34 14 L34 34 L14 34 Z" stroke="#C9A84C" strokeWidth="1.5" fill="none"/>
            <path d="M4 4 L14 14" stroke="#C9A84C" strokeWidth="1.5"/>
            <path d="M34 14 L44 4" stroke="#C9A84C" strokeWidth="1.5"/>
            <path d="M14 34 L4 44" stroke="#C9A84C" strokeWidth="1.5"/>
            <path d="M34 34 L44 44" stroke="#C9A84C" strokeWidth="1.5"/>
          </svg>
          <div className="flex flex-col items-center leading-tight gap-0.5">
            <span className="text-2xl font-bold text-gold tracking-widest" style={{ fontFamily: "Georgia, serif" }}>BOX</span>
            <span className="text-base font-semibold text-foreground tracking-[0.2em]">CAPITAL</span>
            <span className="text-xs text-muted-foreground tracking-[0.28em] uppercase font-medium">Strategy</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">E-mail</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              </span>
              <input
                data-testid="input-email"
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-yellow-600/50 focus:ring-2 focus:ring-yellow-600/10 transition-all"
              />
            </div>
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Senha</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </span>
              <input
                data-testid="input-password"
                type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-2.5 rounded-lg text-sm bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-yellow-600/50 focus:ring-2 focus:ring-yellow-600/10 transition-all"
              />
              <button type="button" onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-gold transition-colors">
                {showPw
                  ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
          </div>

          {error && <p className="text-xs text-red-400 -mt-1">{error}</p>}

          <button data-testid="button-submit" type="submit" disabled={loading}
            className="btn-gold w-full py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 mt-1 disabled:opacity-60">
            {loading
              ? <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="spin"><circle cx="12" cy="12" r="10" strokeDasharray="40" strokeDashoffset="30"/></svg> Entrando...</>
              : "Acessar Conta"
            }
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground mt-6">
          © 2026 Box Capital Strategy. Todos os direitos reservados.
        </p>
      </div>
    </div>
  );
}
