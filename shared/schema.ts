import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ── Users ─────────────────────────────────────────────────
export const users = sqliteTable("users", {
  id:        integer("id").primaryKey({ autoIncrement: true }),
  name:      text("name").notNull(),
  email:     text("email").notNull().unique(),
  password:  text("password").notNull(),           // bcrypt hash
  role:      text("role").notNull().default("client"), // "admin" | "client"
  phone:     text("phone"),
  active:    integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ── Portfolios ────────────────────────────────────────────
// One portfolio per client (the admin can manage it)
export const portfolios = sqliteTable("portfolios", {
  id:             integer("id").primaryKey({ autoIncrement: true }),
  userId:         integer("user_id").notNull().references(() => users.id),
  initialValue:   real("initial_value").notNull().default(0),
  goal:           real("goal").notNull().default(500000),
  note:           text("note"),
  projectionRate: real("projection_rate").default(1), // % monthly growth for 2026 projection
  updatedAt:      text("updated_at").notNull().default(new Date().toISOString()),
});

export const insertPortfolioSchema = createInsertSchema(portfolios).omit({ id: true, updatedAt: true });
export type InsertPortfolio = z.infer<typeof insertPortfolioSchema>;
export type Portfolio = typeof portfolios.$inferSelect;

// ── Assets (positions inside a portfolio) ─────────────────
export const assets = sqliteTable("assets", {
  id:          integer("id").primaryKey({ autoIncrement: true }),
  portfolioId: integer("portfolio_id").notNull().references(() => portfolios.id),
  name:        text("name").notNull(),
  symbol:      text("symbol").notNull(),
  quantity:    real("quantity").notNull().default(0),
  avgPrice:    real("avg_price").notNull().default(0),
  currentPrice:real("current_price").notNull().default(0),
  color:       text("color").notNull().default("#C9A84C"),
});

export const insertAssetSchema = createInsertSchema(assets).omit({ id: true });
export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type Asset = typeof assets.$inferSelect;

// ── Monthly snapshots (for the evolution chart) ───────────
export const snapshots = sqliteTable("snapshots", {
  id:          integer("id").primaryKey({ autoIncrement: true }),
  portfolioId: integer("portfolio_id").notNull().references(() => portfolios.id),
  month:       text("month").notNull(),  // "2025-01"
  value:       real("value").notNull(),
  // Benchmark comparison (annual % returns for the year of this snapshot)
  cdi:         real("cdi"),         // CDI annual return %
  ibov:        real("ibov"),        // IBOVESPA annual return %
  dolar:       real("dolar"),       // USD/BRL annual return %
});

export const insertSnapshotSchema = createInsertSchema(snapshots).omit({ id: true });
export type InsertSnapshot = z.infer<typeof insertSnapshotSchema>;
export type Snapshot = typeof snapshots.$inferSelect;
