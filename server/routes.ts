import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import session from "express-session";
import { Store } from "express-session";
import { getPool } from "./storage";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import https from "https";
import http from "http";

// ── Benchmark fetcher (CDI / IBOV / Dólar) ─────────────────
function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BoxCapital/1.0)",
        "Accept": "application/json",
      }
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("Invalid JSON: " + data.slice(0, 200))); }
      });
    });
    req.on("error", reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

// Returns { cdi, ibov, dolar } for a given year (all as % annual)
async function fetchBenchmarks(year: number): Promise<{ cdi: number | null; ibov: number | null; dolar: number | null }> {
  const result = { cdi: null as number | null, ibov: null as number | null, dolar: null as number | null };

  // ── CDI: série 12 BCB (% diário acumulado → anual) ────
  try {
    const cdiData = await fetchJson(
      `https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=01/01/${year}&dataFinal=31/12/${year}`
    );
    if (Array.isArray(cdiData) && cdiData.length > 0) {
      let acc = 1.0;
      for (const d of cdiData) acc *= (1 + parseFloat(d.valor) / 100);
      result.cdi = parseFloat(((acc - 1) * 100).toFixed(2));
    }
  } catch (e) { console.error("CDI fetch error:", e); }

  // ── Dólar: PTAX BCB (primeiro dia útil vs último dia útil do ano) ──
  try {
    const pad = (n: number) => String(n).padStart(2, "0");
    // First business day of the year
    const startUrl = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@dataInicial='${pad(1)}-${pad(2)}-${year}'&@dataFinalCotacao='${pad(1)}-${pad(10)}-${year}'&$top=1&$orderby=dataHoraCotacao%20asc&$format=json&$select=cotacaoVenda,dataHoraCotacao`;
    // Last business day of the year
    const endUrl   = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@dataInicial='12-${pad(26)}-${year}'&@dataFinalCotacao='12-${pad(31)}-${year}'&$top=10&$format=json&$select=cotacaoVenda,dataHoraCotacao`;

    const [startData, endData] = await Promise.all([fetchJson(startUrl), fetchJson(endUrl)]);
    const startVals = startData?.value ?? [];
    const endVals   = endData?.value   ?? [];
    if (startVals.length > 0 && endVals.length > 0) {
      const startRate = parseFloat(startVals[0].cotacaoVenda);
      const endRate   = parseFloat(endVals[endVals.length - 1].cotacaoVenda);
      result.dolar = parseFloat((((endRate - startRate) / startRate) * 100).toFixed(2));
    }
  } catch (e) { console.error("Dólar fetch error:", e); }

  // ── IBOV: Yahoo Finance (primeiro vs último fechamento do ano) ──
  try {
    const periodStart = Math.floor(new Date(`${year}-01-01T00:00:00Z`).getTime() / 1000);
    const periodEnd   = Math.floor(new Date(`${year}-12-31T23:59:59Z`).getTime() / 1000);
    const ibovData = await fetchJson(
      `https://query2.finance.yahoo.com/v8/finance/chart/%5EBVSP?period1=${periodStart}&period2=${periodEnd}&interval=1mo`
    );
    const closes = ibovData?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    const valid = closes.filter((c: any) => c !== null && c !== undefined);
    if (valid.length >= 2) {
      const first = valid[0];
      const last  = valid[valid.length - 1];
      result.ibov = parseFloat((((last - first) / first) * 100).toFixed(2));
    }
  } catch (e) { console.error("IBOV fetch error:", e); }

  return result;
}

// ── Custom PostgreSQL session store ────────────────────────
// Bypasses connect-pg-simple entirely — uses the pool directly.
class PgSessionStore extends Store {
  private pool = getPool();
  private ready = false;

  constructor() {
    super();
    this.pool.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        sid TEXT PRIMARY KEY,
        sess JSONB NOT NULL,
        expire TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS user_sessions_expire_idx ON user_sessions (expire);
    `)
      .then(() => { this.ready = true; })
      .catch(err => console.error("Session table init error:", err));
  }

  get(sid: string, callback: (err: any, session?: session.SessionData | null) => void) {
    this.pool.query(
      "SELECT sess FROM user_sessions WHERE sid=$1 AND expire > NOW()",
      [sid]
    )
      .then(({ rows }) => {
        if (rows.length === 0) return callback(null, null);
        callback(null, rows[0].sess as session.SessionData);
      })
      .catch(err => callback(err));
  }

  set(sid: string, sessionData: session.SessionData, callback?: (err?: any) => void) {
    const expire = (sessionData.cookie?.expires)
      ? new Date(sessionData.cookie.expires)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    this.pool.query(
      `INSERT INTO user_sessions (sid, sess, expire)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (sid) DO UPDATE
       SET sess = EXCLUDED.sess, expire = EXCLUDED.expire`,
      [sid, JSON.stringify(sessionData), expire]
    )
      .then(() => callback?.())
      .catch(err => callback?.(err));
  }

  destroy(sid: string, callback?: (err?: any) => void) {
    this.pool.query("DELETE FROM user_sessions WHERE sid=$1", [sid])
      .then(() => callback?.())
      .catch(err => callback?.(err));
  }

  // Periodically clean expired sessions
  touch(sid: string, session: session.SessionData, callback?: () => void) {
    const expire = (session.cookie?.expires)
      ? new Date(session.cookie.expires)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    this.pool.query(
      "UPDATE user_sessions SET expire=$2 WHERE sid=$1",
      [sid, expire]
    )
      .then(() => callback?.())
      .catch(() => callback?.());
  }
}

declare module "express-session" {
  interface SessionData { userId: number; role: string; }
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) return res.status(401).json({ error: "Não autenticado" });
  next();
}
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId || req.session.role !== "admin")
    return res.status(403).json({ error: "Sem permissão" });
  next();
}

export function registerRoutes(httpServer: Server, app: Express) {
  // ── Session middleware ──────────────────────────────────
  // Trust Railway's reverse proxy so secure cookies work over HTTPS
  app.set("trust proxy", 1);

  app.use(session({
    store: new PgSessionStore(),
    secret: process.env.SESSION_SECRET || "box-capital-secret-2026",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "none",
      secure: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 dias
    },
  }));

  // ── AUTH ────────────────────────────────────────────────
  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Dados inválidos" });
    const user = await storage.getUserByEmail(email.toLowerCase().trim());
    if (!user || !user.active) return res.status(401).json({ error: "E-mail ou senha incorretos" });
    const ok = bcrypt.compareSync(password, user.password);
    if (!ok) return res.status(401).json({ error: "E-mail ou senha incorretos" });
    req.session.userId = user.id;
    req.session.role   = user.role;
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    const user = await storage.getUserById(req.session.userId!);
    if (!user) return res.status(401).json({ error: "Sessão inválida" });
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  });

  // ── ADMIN — clientes ────────────────────────────────────
  app.get("/api/admin/clients", requireAdmin, async (_req, res) => {
    const clients = await storage.getAllClients();
    res.json(clients.map(c => ({ id: c.id, name: c.name, email: c.email, phone: c.phone, active: c.active, createdAt: c.createdAt })));
  });

  app.post("/api/admin/clients", requireAdmin, async (req, res) => {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "Nome, e-mail e senha são obrigatórios" });
    try {
      const user = await storage.createUser({ name, email: email.toLowerCase(), password, role: "client", phone, active: true });
      // Create empty portfolio
      await storage.createPortfolio({ userId: user.id, initialValue: 0, goal: 500000, note: null });
      res.json({ id: user.id, name: user.name, email: user.email });
    } catch (e: any) {
      if (e.message?.includes("UNIQUE") || e.code === "23505") return res.status(409).json({ error: "E-mail já cadastrado" });
      res.status(500).json({ error: "Erro ao criar cliente" });
    }
  });

  app.patch("/api/admin/clients/:id", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    const { name, email, phone, active, password } = req.body;
    const updates: any = {};
    if (name !== undefined)   updates.name   = name;
    if (email !== undefined)  updates.email  = email.toLowerCase().trim();
    if (phone !== undefined)  updates.phone  = phone;
    if (active !== undefined) updates.active = active;
    if (password)             updates.password = password; // storage.updateUser handles hashing
    try {
      const updated = await storage.updateUser(id, updates);
      res.json(updated);
    } catch (e: any) {
      if (e.message?.includes("UNIQUE") || e.code === "23505") return res.status(409).json({ error: "E-mail já cadastrado" });
      res.status(500).json({ error: "Erro ao atualizar cliente" });
    }
  });

  app.delete("/api/admin/clients/:id", requireAdmin, async (req, res) => {
    await storage.deleteUser(parseInt(req.params.id));
    res.json({ ok: true });
  });

  // ── ADMIN — password reset ──────────────────────────────
  app.post("/api/admin/clients/:id/reset-password", requireAdmin, async (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: "Senha mínima de 6 caracteres" });
    // Pass plain text — storage.updateUser handles hashing internally
    await storage.updateUser(parseInt(req.params.id), { password: newPassword } as any);
    res.json({ ok: true });
  });

  // ── PORTFOLIO — get (admin or owner) ───────────────────
  app.get("/api/portfolio/:userId", requireAuth, async (req, res) => {
    const targetId = parseInt(req.params.userId);
    if (req.session.role !== "admin" && req.session.userId !== targetId)
      return res.status(403).json({ error: "Sem permissão" });
    const portfolio = await storage.getPortfolioByUserId(targetId);
    if (!portfolio) return res.status(404).json({ error: "Portfólio não encontrado" });
    const assets = await storage.getAssetsByPortfolioId(portfolio.id);
    const snapshots = await storage.getSnapshotsByPortfolioId(portfolio.id);
    res.json({ portfolio, assets, snapshots });
  });

  app.patch("/api/portfolio/:id", requireAdmin, async (req, res) => {
    const { goal, note, initialValue, projectionRate } = req.body;
    const updated = await storage.updatePortfolio(parseInt(req.params.id), { goal, note, initialValue, projectionRate });
    res.json(updated);
  });

  // ── ASSETS (admin only) ─────────────────────────────────
  app.post("/api/portfolio/:portfolioId/assets", requireAdmin, async (req, res) => {
    const data = { ...req.body, portfolioId: parseInt(req.params.portfolioId) };
    const asset = await storage.createAsset(data);
    res.json(asset);
  });

  app.patch("/api/assets/:id", requireAdmin, async (req, res) => {
    const updated = await storage.updateAsset(parseInt(req.params.id), req.body);
    res.json(updated);
  });

  app.delete("/api/assets/:id", requireAdmin, async (_req, res) => {
    await storage.deleteAsset(parseInt(_req.params.id));
    res.json({ ok: true });
  });

  // ── BENCHMARKS (public cache endpoint) ──────────────────
  app.get("/api/benchmarks/:year", requireAuth, async (req, res) => {
    const year = parseInt(req.params.year);
    if (isNaN(year) || year < 2000 || year > 2100)
      return res.status(400).json({ error: "Ano inválido" });
    try {
      const data = await fetchBenchmarks(year);
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: "Erro ao buscar benchmarks" });
    }
  });

  // ── CLIENT — self-service profile + goal ─────────────────────
  // Update own name
  app.patch("/api/client/profile", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "Nome inválido" });
    const updated = await storage.updateUser(userId, { name: name.trim() } as any);
    res.json({ id: updated.id, name: updated.name, email: updated.email });
  });

  // Change own password
  app.patch("/api/client/password", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 6)
      return res.status(400).json({ error: "Senha mínima de 6 caracteres" });
    const user = await storage.getUserById(userId);
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
    const ok = bcrypt.compareSync(currentPassword, user.password);
    if (!ok) return res.status(401).json({ error: "Senha atual incorreta" });
    // Update password directly — storage.updateUser re-hashes, so pass plain text
    await storage.updateUser(userId, { password: newPassword } as any);
    res.json({ ok: true });
  });

  // Update own portfolio goal
  app.patch("/api/client/goal", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const { goal } = req.body;
    const goalNum = parseFloat(goal);
    if (isNaN(goalNum) || goalNum <= 0) return res.status(400).json({ error: "Meta inválida" });
    const portfolio = await storage.getPortfolioByUserId(userId);
    if (!portfolio) return res.status(404).json({ error: "Portfólio não encontrado" });
    const updated = await storage.updatePortfolio(portfolio.id, { goal: goalNum });
    res.json(updated);
  });

  // ── SNAPSHOTS (admin only) ─────────────────────────────
  app.post("/api/portfolio/:portfolioId/snapshots", requireAdmin, async (req, res) => {
    const portfolioId = parseInt(req.params.portfolioId);
    const body = req.body;

    // Auto-fetch benchmarks if not provided and month ends in -12 (annual snapshot)
    let { cdi, ibov, dolar } = body;
    if ((cdi === undefined || cdi === null) && body.month) {
      const yearStr = body.month.split("-")[0];
      const year = parseInt(yearStr);
      if (!isNaN(year) && year >= 2000 && year <= new Date().getFullYear()) {
        try {
          const benchmarks = await fetchBenchmarks(year);
          cdi   = cdi   ?? benchmarks.cdi;
          ibov  = ibov  ?? benchmarks.ibov;
          dolar = dolar ?? benchmarks.dolar;
        } catch (e) {
          console.error("Auto-benchmark fetch failed:", e);
        }
      }
    }

    const data = { ...body, portfolioId, cdi, ibov, dolar, withdrawal: body.withdrawal ?? 0 };
    const snap = await storage.upsertSnapshot(data);
    res.json(snap);
  });

  app.patch("/api/snapshots/:id", requireAdmin, async (req, res) => {
    const { month, value, cdi, ibov, dolar, withdrawal } = req.body;
    const snap = await storage.updateSnapshot(parseInt(req.params.id), { month, value, cdi, ibov, dolar, withdrawal: withdrawal ?? 0 } as any);
    res.json(snap);
  });

  app.delete("/api/snapshots/:id", requireAdmin, async (_req, res) => {
    await storage.deleteSnapshot(parseInt(_req.params.id));
    res.json({ ok: true });
  });
}
