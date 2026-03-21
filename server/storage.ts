import { Pool } from "pg";
import bcrypt from "bcryptjs";
import type { User, InsertUser, Portfolio, InsertPortfolio, Asset, InsertAsset, Snapshot, InsertSnapshot } from "@shared/schema";

// ── PostgreSQL connection ──────────────────────────────────
const dbUrl = process.env.DATABASE_URL || "";
const needsSsl = dbUrl.includes("neon.tech") || dbUrl.includes("supabase") || dbUrl.includes("amazonaws");
const pool = new Pool({
  connectionString: dbUrl,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
});

// ── Create tables + migrate ────────────────────────────────
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'client',
      phone TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS portfolios (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      initial_value REAL NOT NULL DEFAULT 0,
      goal REAL NOT NULL DEFAULT 500000,
      note TEXT,
      projection_rate REAL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS assets (
      id SERIAL PRIMARY KEY,
      portfolio_id INTEGER NOT NULL REFERENCES portfolios(id),
      name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      avg_price REAL NOT NULL DEFAULT 0,
      current_price REAL NOT NULL DEFAULT 0,
      color TEXT NOT NULL DEFAULT '#C9A84C'
    );
    CREATE TABLE IF NOT EXISTS snapshots (
      id SERIAL PRIMARY KEY,
      portfolio_id INTEGER NOT NULL REFERENCES portfolios(id),
      month TEXT NOT NULL,
      value REAL NOT NULL,
      cdi REAL,
      ibov REAL,
      dolar REAL
    );
  `);

  // Seed admin if not exists
  const { rows } = await pool.query("SELECT id FROM users WHERE role='admin' LIMIT 1");
  if (rows.length === 0) {
    const hash = bcrypt.hashSync("admin123", 10);
    await pool.query(
      "INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, 'admin')",
      ["Douglas Veiga", "admin@boxcapital.com", hash]
    );
    console.log("Admin user created.");
  }
}

// Run init (non-blocking — server starts, DB initializes in background)
initDb().catch(err => console.error("DB init error:", err));

// ── IStorage interface ─────────────────────────────────────
export interface IStorage {
  getUserByEmail(email: string): Promise<User | null>;
  getUserById(id: number): Promise<User | null>;
  getAllClients(): Promise<User[]>;
  createUser(data: InsertUser & { password: string }): Promise<User>;
  updateUser(id: number, data: Partial<InsertUser> & { password?: string }): Promise<User>;
  deleteUser(id: number): Promise<void>;
  getPortfolioByUserId(userId: number): Promise<Portfolio | null>;
  createPortfolio(data: InsertPortfolio): Promise<Portfolio>;
  updatePortfolio(id: number, data: Partial<InsertPortfolio>): Promise<Portfolio>;
  getAssetsByPortfolioId(portfolioId: number): Promise<Asset[]>;
  createAsset(data: InsertAsset): Promise<Asset>;
  updateAsset(id: number, data: Partial<InsertAsset>): Promise<Asset>;
  deleteAsset(id: number): Promise<void>;
  getSnapshotsByPortfolioId(portfolioId: number): Promise<Snapshot[]>;
  upsertSnapshot(data: InsertSnapshot): Promise<Snapshot>;
  updateSnapshot(id: number, data: Partial<InsertSnapshot>): Promise<Snapshot>;
  deleteSnapshot(id: number): Promise<void>;
}

// ── Row mappers ────────────────────────────────────────────
function mapUser(r: any): User {
  return { id: r.id, name: r.name, email: r.email, password: r.password, role: r.role, phone: r.phone ?? null, active: r.active, createdAt: r.created_at };
}
function mapPortfolio(r: any): Portfolio {
  return { id: r.id, userId: r.user_id, initialValue: parseFloat(r.initial_value), goal: parseFloat(r.goal), note: r.note ?? null, projectionRate: r.projection_rate ?? 1, updatedAt: r.updated_at };
}
function mapAsset(r: any): Asset {
  return { id: r.id, portfolioId: r.portfolio_id, name: r.name, symbol: r.symbol, quantity: parseFloat(r.quantity), avgPrice: parseFloat(r.avg_price), currentPrice: parseFloat(r.current_price), color: r.color };
}
function mapSnapshot(r: any): Snapshot {
  return { id: r.id, portfolioId: r.portfolio_id, month: r.month, value: parseFloat(r.value), cdi: r.cdi != null ? parseFloat(r.cdi) : null, ibov: r.ibov != null ? parseFloat(r.ibov) : null, dolar: r.dolar != null ? parseFloat(r.dolar) : null };
}

// ── PostgreSQL Storage ─────────────────────────────────────
class PgStorage implements IStorage {
  async getUserByEmail(email: string) {
    const { rows } = await pool.query("SELECT * FROM users WHERE email=$1", [email]);
    return rows[0] ? mapUser(rows[0]) : null;
  }
  async getUserById(id: number) {
    const { rows } = await pool.query("SELECT * FROM users WHERE id=$1", [id]);
    return rows[0] ? mapUser(rows[0]) : null;
  }
  async getAllClients() {
    const { rows } = await pool.query("SELECT * FROM users WHERE role='client' ORDER BY name");
    return rows.map(mapUser);
  }
  async createUser(data: InsertUser & { password: string }) {
    const hash = bcrypt.hashSync(data.password, 10);
    const { rows } = await pool.query(
      "INSERT INTO users (name, email, password, role, phone) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [data.name, data.email, hash, data.role ?? "client", data.phone ?? null]
    );
    return mapUser(rows[0]);
  }
  async updateUser(id: number, data: Partial<InsertUser> & { password?: string }) {
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      const col = k.replace(/([A-Z])/g, "_$1").toLowerCase();
      if (col === "password") {
        fields.push(`password=$${i++}`);
        values.push(bcrypt.hashSync(v as string, 10));
      } else {
        fields.push(`${col}=$${i++}`);
        values.push(v);
      }
    }
    values.push(id);
    const { rows } = await pool.query(
      `UPDATE users SET ${fields.join(",")} WHERE id=$${i} RETURNING *`,
      values
    );
    return mapUser(rows[0]);
  }
  async deleteUser(id: number) {
    await pool.query("DELETE FROM assets WHERE portfolio_id IN (SELECT id FROM portfolios WHERE user_id=$1)", [id]);
    await pool.query("DELETE FROM snapshots WHERE portfolio_id IN (SELECT id FROM portfolios WHERE user_id=$1)", [id]);
    await pool.query("DELETE FROM portfolios WHERE user_id=$1", [id]);
    await pool.query("DELETE FROM users WHERE id=$1", [id]);
  }
  async getPortfolioByUserId(userId: number) {
    const { rows } = await pool.query("SELECT * FROM portfolios WHERE user_id=$1", [userId]);
    return rows[0] ? mapPortfolio(rows[0]) : null;
  }
  async createPortfolio(data: InsertPortfolio) {
    const { rows } = await pool.query(
      "INSERT INTO portfolios (user_id, initial_value, goal, note, projection_rate) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [data.userId, data.initialValue ?? 0, data.goal ?? 500000, data.note ?? null, data.projectionRate ?? 1]
    );
    return mapPortfolio(rows[0]);
  }
  async updatePortfolio(id: number, data: Partial<InsertPortfolio>) {
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      fields.push(`${k.replace(/([A-Z])/g, "_$1").toLowerCase()}=$${i++}`);
      values.push(v);
    }
    fields.push(`updated_at=NOW()`);
    values.push(id);
    const { rows } = await pool.query(
      `UPDATE portfolios SET ${fields.join(",")} WHERE id=$${i} RETURNING *`,
      values
    );
    return mapPortfolio(rows[0]);
  }
  async getAssetsByPortfolioId(portfolioId: number) {
    const { rows } = await pool.query("SELECT * FROM assets WHERE portfolio_id=$1 ORDER BY name", [portfolioId]);
    return rows.map(mapAsset);
  }
  async createAsset(data: InsertAsset) {
    const { rows } = await pool.query(
      "INSERT INTO assets (portfolio_id, name, symbol, quantity, avg_price, current_price, color) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *",
      [data.portfolioId, data.name, data.symbol, data.quantity ?? 0, data.avgPrice ?? 0, data.currentPrice ?? 0, data.color ?? "#C9A84C"]
    );
    return mapAsset(rows[0]);
  }
  async updateAsset(id: number, data: Partial<InsertAsset>) {
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      fields.push(`${k.replace(/([A-Z])/g, "_$1").toLowerCase()}=$${i++}`);
      values.push(v);
    }
    values.push(id);
    const { rows } = await pool.query(
      `UPDATE assets SET ${fields.join(",")} WHERE id=$${i} RETURNING *`,
      values
    );
    return mapAsset(rows[0]);
  }
  async deleteAsset(id: number) {
    await pool.query("DELETE FROM assets WHERE id=$1", [id]);
  }
  async getSnapshotsByPortfolioId(portfolioId: number) {
    const { rows } = await pool.query("SELECT * FROM snapshots WHERE portfolio_id=$1 ORDER BY month", [portfolioId]);
    return rows.map(mapSnapshot);
  }
  async upsertSnapshot(data: InsertSnapshot) {
    const { rows: existing } = await pool.query(
      "SELECT id FROM snapshots WHERE portfolio_id=$1 AND month=$2",
      [data.portfolioId, data.month]
    );
    if (existing.length > 0) {
      const { rows } = await pool.query(
        "UPDATE snapshots SET value=$1, cdi=$2, ibov=$3, dolar=$4 WHERE id=$5 RETURNING *",
        [data.value, data.cdi ?? null, data.ibov ?? null, data.dolar ?? null, existing[0].id]
      );
      return mapSnapshot(rows[0]);
    }
    const { rows } = await pool.query(
      "INSERT INTO snapshots (portfolio_id, month, value, cdi, ibov, dolar) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
      [data.portfolioId, data.month, data.value, data.cdi ?? null, data.ibov ?? null, data.dolar ?? null]
    );
    return mapSnapshot(rows[0]);
  }
  async updateSnapshot(id: number, data: Partial<InsertSnapshot>) {
    const { rows } = await pool.query(
      "UPDATE snapshots SET month=$1, value=$2, cdi=$3, ibov=$4, dolar=$5 WHERE id=$6 RETURNING *",
      [data.month, data.value, data.cdi ?? null, data.ibov ?? null, data.dolar ?? null, id]
    );
    return mapSnapshot(rows[0]);
  }
  async deleteSnapshot(id: number) {
    await pool.query("DELETE FROM snapshots WHERE id=$1", [id]);
  }
}

export const storage = new PgStorage();
