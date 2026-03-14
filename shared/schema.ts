import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = sqliteTable("users", {
  id:        integer("id").primaryKey({ autoIncrement: true }),
  name:      text("name").notNull(),
  email:     text("email").notNull().unique(),
  password:  text("password").notNull(),
  role:      text("role").notNull().default("client"),
  phone:     text("phone"),
  active:    integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const portfolios = sqliteTable("portfolios", {
  id:           integer("id").primaryKey({ autoIncrement: true }),
  userId:       integer("user_id").notNull().references(() => users.id),
  initialValue: real("initial_value").notNull().default(0),
  goal:         real("goal").notNull().default(500000),
  note:         text("note"),
  updatedAt:    text("updated_at").notNull().default(new Date().toISOString()),
});

export const insertPortfolioSchema = createInsertSchema(portfolios).omit({ id: true, updatedAt: true });
export type InsertPortfolio = z.infer<typeof insertPortfolioSchema>;
export type Portfolio = typeof portfolios.$inferSelect;

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

export const snapshots = sqliteTable("snapshots", {
  id:          integer("id").primaryKey({ autoIncrement: true }),
  portfolioId: integer("portfolio_id").notNull().references(() => portfolios.id),
  month:       text("month").notNull(),
  value:       real("value").notNull(),
});

export const insertSnapshotSchema = createInsertSchema(snapshots).omit({ id: true });
export type InsertSnapshot = z.infer<typeof insertSnapshotSchema>;
export type Snapshot = typeof snapshots.$inferSelect;
