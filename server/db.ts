import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { DayLog, Entry, Food, HistoryResult, Nutrients } from "../shared/types.ts";
import { nutrientsFromPer100 } from "../shared/types.ts";

// v2 keeps its own data folder so it never touches the original app's database.
export const APP_DIR = process.env.NUTRITION_DATA_DIR ?? join(homedir(), ".calorie_tracker_v2");
mkdirSync(APP_DIR, { recursive: true });

const db = new DatabaseSync(join(APP_DIR, "calories.db"));

// Same schema as the original Python app, so its database can be imported as-is.
db.exec(`CREATE TABLE IF NOT EXISTS foods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, brand TEXT DEFAULT '',
    calories REAL NOT NULL DEFAULT 0, protein REAL NOT NULL DEFAULT 0,
    carbs REAL NOT NULL DEFAULT 0, fat REAL NOT NULL DEFAULT 0,
    source TEXT DEFAULT 'Custom'
)`);
db.exec(`CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL, food_id INTEGER,
    food_name TEXT NOT NULL, grams REAL NOT NULL,
    calories REAL NOT NULL, protein REAL NOT NULL,
    carbs REAL NOT NULL, fat REAL NOT NULL, sync_id TEXT,
    FOREIGN KEY(food_id) REFERENCES foods(id)
)`);
const entryColumns = db.prepare("PRAGMA table_info(entries)").all().map((r) => r.name);
if (!entryColumns.includes("sync_id")) db.exec("ALTER TABLE entries ADD COLUMN sync_id TEXT");
for (const row of db.prepare("SELECT id FROM entries WHERE sync_id IS NULL").all()) {
  db.prepare("UPDATE entries SET sync_id=? WHERE id=?").run(randomUUID(), row.id as number);
}
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS entries_sync_id ON entries(sync_id)");
db.exec("CREATE TABLE IF NOT EXISTS pending_sync_deletions (sync_id TEXT PRIMARY KEY)");
db.exec(`CREATE TABLE IF NOT EXISTS custom_foods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE,
    brand TEXT NOT NULL DEFAULT '' COLLATE NOCASE,
    calories REAL NOT NULL DEFAULT 0,
    protein REAL NOT NULL DEFAULT 0,
    carbs REAL NOT NULL DEFAULT 0,
    fat REAL NOT NULL DEFAULT 0,
    UNIQUE(name, brand)
)`);

const DAY_MS = 86_400_000;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS);
}

export function getDay(date: string): DayLog {
  const entries = db
    .prepare("SELECT id,date,food_name,grams,calories,protein,carbs,fat FROM entries WHERE date=? ORDER BY id DESC")
    .all(date) as unknown as Entry[];
  const totals: Nutrients = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const e of entries) {
    totals.calories += e.calories;
    totals.protein += e.protein;
    totals.carbs += e.carbs;
    totals.fat += e.fat;
  }
  return { date, entries, totals };
}

export function addEntry(food: Food, grams: number, date: string): void {
  const vals = nutrientsFromPer100(food, grams);
  db.exec("BEGIN");
  try {
    const { lastInsertRowid } = db
      .prepare("INSERT INTO foods(name,brand,calories,protein,carbs,fat,source) VALUES(?,?,?,?,?,?,?)")
      .run(food.name, food.brand ?? "", food.calories, food.protein, food.carbs, food.fat, food.source ?? "Open Food Facts");
    db.prepare(
      `INSERT INTO entries(date,food_id,food_name,grams,calories,protein,carbs,fat,sync_id)
       VALUES(?,?,?,?,?,?,?,?,?)`,
    ).run(date, lastInsertRowid, food.name, grams, vals.calories, vals.protein, vals.carbs, vals.fat, randomUUID());
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function removeEntry(id: number): boolean {
  const row = db.prepare("SELECT sync_id FROM entries WHERE id=?").get(id);
  if (!row) return false;
  if (row.sync_id) db.prepare("INSERT OR IGNORE INTO pending_sync_deletions(sync_id) VALUES(?)").run(row.sync_id as string);
  db.prepare("DELETE FROM entries WHERE id=?").run(id);
  return true;
}

export function listCustomFoods(): Food[] {
  return db
    .prepare(
      `SELECT id, name, brand, calories, protein, carbs, fat FROM custom_foods
       ORDER BY name COLLATE NOCASE, brand COLLATE NOCASE`,
    )
    .all()
    .map((r) => ({ ...(r as unknown as Food), source: "Custom" as const }));
}

/** Returns false when a food with the same name and brand is already saved. */
export function saveCustomFood(food: Food): boolean {
  const { changes } = db
    .prepare(
      `INSERT OR IGNORE INTO custom_foods (name, brand, calories, protein, carbs, fat)
       VALUES(?,?,?,?,?,?)`,
    )
    .run(food.name, food.brand ?? "", food.calories, food.protein, food.carbs, food.fat);
  return Number(changes) > 0;
}

export function removeCustomFood(id: number): boolean {
  return Number(db.prepare("DELETE FROM custom_foods WHERE id=?").run(id).changes) > 0;
}

export function getHistory(weeks: number, end: string): HistoryResult {
  let start = addDays(end, -(weeks * 7 - 1));
  const first = db.prepare("SELECT MIN(date) AS d FROM entries").get()?.d as string | null;
  if (first && first > start) start = first;
  const activeDays = Math.max(0, daysBetween(start, end) + 1);

  const rows = db
    .prepare(
      `SELECT date, SUM(calories) calories, SUM(protein) protein, SUM(carbs) carbs,
       SUM(fat) fat, COUNT(*) entries FROM entries
       WHERE date BETWEEN ? AND ? GROUP BY date`,
    )
    .all(start, end);
  const byDate = new Map(rows.map((r) => [r.date as string, r]));

  const sums: Nutrients = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const days = [];
  for (let offset = 0; offset < activeDays; offset++) {
    const date = addDays(end, -offset);
    const r = byDate.get(date);
    const day = {
      date,
      calories: Number(r?.calories ?? 0),
      protein: Number(r?.protein ?? 0),
      carbs: Number(r?.carbs ?? 0),
      fat: Number(r?.fat ?? 0),
      entries: Number(r?.entries ?? 0),
    };
    sums.calories += day.calories;
    sums.protein += day.protein;
    sums.carbs += day.carbs;
    sums.fat += day.fat;
    days.push(day);
  }

  return {
    start: activeDays ? start : null,
    end,
    activeDays,
    averages: activeDays
      ? {
          calories: sums.calories / activeDays,
          protein: sums.protein / activeDays,
          carbs: sums.carbs / activeDays,
          fat: sums.fat / activeDays,
        }
      : null,
    days,
  };
}

function csvCell(value: unknown): string {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportCsv(): string {
  const rows = db
    .prepare("SELECT date,food_name,grams,calories,protein,carbs,fat FROM entries ORDER BY date,id")
    .all();
  const lines = [["Date", "Food", "Weight (g)", "Calories (kcal)", "Protein (g)", "Carbs (g)", "Fat (g)"]];
  for (const r of rows) lines.push([r.date, r.food_name, r.grams, r.calories, r.protein, r.carbs, r.fat].map(String));
  // BOM so Excel opens it as UTF-8, matching the original export.
  return "﻿" + lines.map((l) => l.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export interface SyncEntry extends Nutrients {
  sync_id: string;
  date: string;
  food_name: string;
  grams: number;
}

export function syncSnapshot(): { entries: SyncEntry[]; deletions: string[] } {
  return {
    entries: db
      .prepare("SELECT sync_id,date,food_name,grams,calories,protein,carbs,fat FROM entries")
      .all()
      .map((r) => ({ ...r }) as unknown as SyncEntry),
    deletions: db.prepare("SELECT sync_id FROM pending_sync_deletions").all().map((r) => r.sync_id as string),
  };
}

export function clearPendingDeletions(syncIds: string[]): void {
  const stmt = db.prepare("DELETE FROM pending_sync_deletions WHERE sync_id=?");
  for (const id of syncIds) stmt.run(id);
}
