import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "@shared/schema";
import type { User, InsertUser, Portfolio, InsertPortfolio, Asset, InsertAsset, Snapshot, InsertSnapshot } from "@shared/schema";
import bcrypt from "bcryptjs";

const sqlite = new Database("box_capital.db");
const db = drizzle(sqlite, { schema });

// ── Create tables ──────────────────────────────────────────
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'client',
    phone TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS portfolios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    initial_value REAL NOT NULL DEFAULT 0,
    goal REAL NOT NULL DEFAULT 500000,
    note TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio_id INTEGER NOT NULL REFERENCES portfolios(id),
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 0,
    avg_price REAL NOT NULL DEFAULT 0,
    current_price REAL NOT NULL DEFAULT 0,
    color TEXT NOT NULL DEFAULT '#C9A84C'
  );
  CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio_id INTEGER NOT NULL REFERENCES portfolios(id),
    month TEXT NOT NULL,
    value REAL NOT NULL,
    cdi REAL,
    ibov REAL,
    dolar REAL
  );
`);

// ── Seed admin if not exists ───────────────────────────────
const adminExists = sqlite.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get();
if (!adminExists) {
  const hash = bcrypt.hashSync("admin123", 10);
  sqlite.prepare("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'admin')")
    .run("Douglas Veiga", "admin@boxcapital.com", hash);
}

// ── IStorage interface ─────────────────────────────────────
export interface IStorage {
  // Auth
  getUserByEmail(email: string): Promise<User | null>;
  getUserById(id: number): Promise<User | null>;
  // Users (admin)
  getAllClients(): Promise<User[]>;
  createUser(data: InsertUser & { password: string }): Promise<User>;
  updateUser(id: number, data: Partial<InsertUser> & { password?: string }): Promise<User>;
  deleteUser(id: number): Promise<void>;
  // Portfolio
  getPortfolioByUserId(userId: number): Promise<Portfolio | null>;
  createPortfolio(data: InsertPortfolio): Promise<Portfolio>;
  updatePortfolio(id: number, data: Partial<InsertPortfolio>): Promise<Portfolio>;
  // Assets
  getAssetsByPortfolioId(portfolioId: number): Promise<Asset[]>;
  createAsset(data: InsertAsset): Promise<Asset>;
  updateAsset(id: number, data: Partial<InsertAsset>): Promise<Asset>;
  deleteAsset(id: number): Promise<void>;
  // Snapshots
  getSnapshotsByPortfolioId(portfolioId: number): Promise<Snapshot[]>;
  upsertSnapshot(data: InsertSnapshot): Promise<Snapshot>;
  deleteSnapshot(id: number): Promise<void>;
}

// ── Row mappers (snake_case → camelCase) ──────────────────
function mapUser(r: any): User {
  return { id: r.id, name: r.name, email: r.email, password: r.password, role: r.role, phone: r.phone, active: !!r.active, createdAt: r.created_at };
}
function mapPortfolio(r: any): Portfolio {
  return { id: r.id, userId: r.user_id, initialValue: r.initial_value, goal: r.goal, note: r.note, updatedAt: r.updated_at };
}
function mapAsset(r: any): Asset {
  return { id: r.id, portfolioId: r.portfolio_id, name: r.name, symbol: r.symbol, quantity: r.quantity, avgPrice: r.avg_price, currentPrice: r.current_price, color: r.color };
}
function mapSnapshot(r: any): Snapshot {
  return { id: r.id, portfolioId: r.portfolio_id, month: r.month, value: r.value, cdi: r.cdi ?? null, ibov: r.ibov ?? null, dolar: r.dolar ?? null };
}

class SqliteStorage implements IStorage {
  async getUserByEmail(email: string) {
    const r = sqlite.prepare("SELECT * FROM users WHERE email=?").get(email) as any;
    return r ? mapUser(r) : null;
  }
  async getUserById(id: number) {
    const r = sqlite.prepare("SELECT * FROM users WHERE id=?").get(id) as any;
    return r ? mapUser(r) : null;
  }
  async getAllClients() {
    return (sqlite.prepare("SELECT * FROM users WHERE role='client' ORDER BY name").all() as any[]).map(mapUser);
  }
  async createUser(data: InsertUser & { password: string }) {
    const hash = bcrypt.hashSync(data.password, 10);
    const r = sqlite.prepare(
      "INSERT INTO users (name, email, password, role, phone) VALUES (?,?,?,?,?) RETURNING *"
    ).get(data.name, data.email, hash, data.role ?? "client", data.phone ?? null) as any;
    return mapUser(r);
  }
  async updateUser(id: number, data: Partial<InsertUser> & { password?: string }) {
    const snakeData: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      snakeData[k.replace(/([A-Z])/g, '_$1').toLowerCase()] = v;
    }
    const fields = Object.keys(snakeData).map(k => `${k}=?`).join(",");
    const values = [...Object.values(snakeData), id];
    const r = sqlite.prepare(`UPDATE users SET ${fields} WHERE id=? RETURNING *`).get(...values) as any;
    return mapUser(r);
  }
  async deleteUser(id: number) {
    sqlite.prepare("DELETE FROM assets WHERE portfolio_id IN (SELECT id FROM portfolios WHERE user_id=?)").run(id);
    sqlite.prepare("DELETE FROM snapshots WHERE portfolio_id IN (SELECT id FROM portfolios WHERE user_id=?)").run(id);
    sqlite.prepare("DELETE FROM portfolios WHERE user_id=?").run(id);
    sqlite.prepare("DELETE FROM users WHERE id=?").run(id);
  }
  async getPortfolioByUserId(userId: number) {
    const r = sqlite.prepare("SELECT * FROM portfolios WHERE user_id=?").get(userId) as any;
    return r ? mapPortfolio(r) : null;
  }
  async createPortfolio(data: InsertPortfolio) {
    const r = sqlite.prepare(
      "INSERT INTO portfolios (user_id, initial_value, goal, note) VALUES (?,?,?,?) RETURNING *"
    ).get(data.userId, data.initialValue ?? 0, data.goal ?? 500000, data.note ?? null) as any;
    return mapPortfolio(r);
  }
  async updatePortfolio(id: number, data: Partial<InsertPortfolio>) {
    const snakeData: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      snakeData[k.replace(/([A-Z])/g, '_$1').toLowerCase()] = v;
    }
    const set = Object.keys(snakeData).map(k => `${k}=?`).join(",");
    const r = sqlite.prepare(`UPDATE portfolios SET ${set}, updated_at=datetime('now') WHERE id=? RETURNING *`)
      .get(...Object.values(snakeData), id) as any;
    return mapPortfolio(r);
  }
  async getAssetsByPortfolioId(portfolioId: number) {
    return (sqlite.prepare("SELECT * FROM assets WHERE portfolio_id=? ORDER BY name").all(portfolioId) as any[]).map(mapAsset);
  }
  async createAsset(data: InsertAsset) {
    const r = sqlite.prepare(
      "INSERT INTO assets (portfolio_id, name, symbol, quantity, avg_price, current_price, color) VALUES (?,?,?,?,?,?,?) RETURNING *"
    ).get(data.portfolioId, data.name, data.symbol, data.quantity ?? 0, data.avgPrice ?? 0, data.currentPrice ?? 0, data.color ?? "#C9A84C") as any;
    return mapAsset(r);
  }
  async updateAsset(id: number, data: Partial<InsertAsset>) {
    const snakeData: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      snakeData[k.replace(/([A-Z])/g, '_$1').toLowerCase()] = v;
    }
    const set = Object.keys(snakeData).map(k => `${k}=?`).join(",");
    const r = sqlite.prepare(`UPDATE assets SET ${set} WHERE id=? RETURNING *`)
      .get(...Object.values(snakeData), id) as any;
    return mapAsset(r);
  }
  async deleteAsset(id: number) {
    sqlite.prepare("DELETE FROM assets WHERE id=?").run(id);
  }
  async getSnapshotsByPortfolioId(portfolioId: number) {
    return (sqlite.prepare("SELECT * FROM snapshots WHERE portfolio_id=? ORDER BY month").all(portfolioId) as any[]).map(mapSnapshot);
  }
  async upsertSnapshot(data: InsertSnapshot) {
    const existing = sqlite.prepare("SELECT id FROM snapshots WHERE portfolio_id=? AND month=?").get(data.portfolioId, data.month) as { id: number } | undefined;
    if (existing) {
      const r = sqlite.prepare("UPDATE snapshots SET value=?, cdi=?, ibov=?, dolar=? WHERE id=? RETURNING *")
        .get(data.value, data.cdi ?? null, data.ibov ?? null, data.dolar ?? null, existing.id) as any;
      return mapSnapshot(r);
    }
    const r = sqlite.prepare("INSERT INTO snapshots (portfolio_id, month, value, cdi, ibov, dolar) VALUES (?,?,?,?,?,?) RETURNING *")
      .get(data.portfolioId, data.month, data.value, data.cdi ?? null, data.ibov ?? null, data.dolar ?? null) as any;
    return mapSnapshot(r);
  }
  async deleteSnapshot(id: number) {
    sqlite.prepare("DELETE FROM snapshots WHERE id=?").run(id);
  }
}

export const storage = new SqliteStorage();
