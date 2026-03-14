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
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="fade-up w-full max-w-sm bg-card border rounded-2xl p-10 shadow-2xl"
        style={{ borderColor: "rgba(201,168,76,0.18)" }}>
        <div className="flex flex-col items-center gap-3 mb-8">
          <svg className="w-14 h-14" viewBox="0 0 48 48" fill="none">
            <rect x="4" y="4" width="40" height="40" rx="2" stroke="#C9A84C" strokeWidth="2" fill="none"/>
            <path d="M14 14 L34 14 L34 34 L14 34 Z" stroke="#C9A84C" strokeWidth="1.5" fill="none"/>
            <path d="M4 4 L14 14" stroke="#C9A84C" strokeWidth="1.5"/>
            <path d="M34 14 L44 4" stroke="#C9A84C" strokeWidth="1.5"/>
            <path d="M14 34 L4 44" stroke="#C9A84C" strokeWidth="1.5"/>
            <path d="M34 34 L44 44" stroke="#C9A84C" strokeWidth="1.5"/>
          </svg>
          <div className="flex flex-col items-center leading-tight gap-0.5">
            <span className="text-2xl font-bold text-gold tracking-widest">BOX</span>
            <span className="text-base font-semibold text-foreground tracking-[0.2em]">CAPITAL</span>
            <span className="text-xs text-muted-foreground tracking-[0.28em] uppercase font-medium">Strategy</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">E-mail</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="w-full px-3 py-2.5 rounded-lg text-sm bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-yellow-600/50 transition-all"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Senha</label>
            <input
              type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2.5 rounded-lg text-sm bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-yellow-600/50 transition-all"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button type="submit" disabled={loading}
            className="btn-gold w-full py-2.5 rounded-lg text-sm font-semibold mt-1 disabled:opacity-60">
            {loading ? "Entrando..." : "Acessar Conta"}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground mt-6">
          \u00a9 2026 Box Capital Strategy.
        </p>
      </div>
    </div>
  );
}
