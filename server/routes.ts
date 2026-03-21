import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { storage } from "./storage";

const PgSession = connectPgSimple(session);
// Railway internal URL uses no SSL; external URLs (neon, supabase) need SSL
const dbUrl = process.env.DATABASE_URL || "";
const needsSsl = dbUrl.includes("neon.tech") || dbUrl.includes("supabase") || dbUrl.includes("amazonaws");
const sessionPool = new Pool({
  connectionString: dbUrl,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
});

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
    store: new PgSession({
      pool: sessionPool,
      tableName: "user_sessions",
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || "box-capital-secret-2026",
    resave: true,
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
    // Save session explicitly before responding to ensure it's persisted
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: "Erro ao salvar sessão" });
      res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
    });
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
      if (e.message?.includes("UNIQUE")) return res.status(409).json({ error: "E-mail já cadastrado" });
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
    if (password)             updates.password = bcrypt.hashSync(password, 10);
    try {
      const updated = await storage.updateUser(id, updates);
      res.json(updated);
    } catch (e: any) {
      if (e.message?.includes("UNIQUE")) return res.status(409).json({ error: "E-mail já cadastrado" });
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
    const hash = bcrypt.hashSync(newPassword, 10);
    await storage.updateUser(parseInt(req.params.id), { password: hash } as any);
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
    const { goal, note, initialValue } = req.body;
    const updated = await storage.updatePortfolio(parseInt(req.params.id), { goal, note, initialValue });
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

  // ── SNAPSHOTS (admin only) ─────────────────────────────
  app.post("/api/portfolio/:portfolioId/snapshots", requireAdmin, async (req, res) => {
    const data = { ...req.body, portfolioId: parseInt(req.params.portfolioId) };
    const snap = await storage.upsertSnapshot(data);
    res.json(snap);
  });

  app.patch("/api/snapshots/:id", requireAdmin, async (req, res) => {
    const { month, value, cdi, ibov, dolar } = req.body;
    const snap = await storage.updateSnapshot(parseInt(req.params.id), { month, value, cdi, ibov, dolar });
    res.json(snap);
  });

  app.delete("/api/snapshots/:id", requireAdmin, async (_req, res) => {
    await storage.deleteSnapshot(parseInt(_req.params.id));
    res.json({ ok: true });
  });
}
