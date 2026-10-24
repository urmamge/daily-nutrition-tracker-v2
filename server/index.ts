import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { streamSSE } from "hono/streaming";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import type { Food } from "../shared/types.ts";
import * as store from "./db.ts";
import { brandSuggestions, searchFoods } from "./openFoodFacts.ts";
import * as sync from "./sync.ts";

const PORT = Number(process.env.PORT ?? 5179);
const DEV = process.argv.includes("--dev");
// The window closing drops its event stream; shut down once nothing has reconnected for this long.
const IDLE_SHUTDOWN_MS = 15_000;

const app = new Hono();

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function parseFood(body: any): Food | string {
  const name = String(body?.name ?? "").trim();
  if (!name) return "Enter a food name.";
  const food: Food = {
    name,
    brand: String(body.brand ?? "").trim(),
    calories: num(body.calories ?? 0),
    protein: num(body.protein ?? 0),
    carbs: num(body.carbs ?? 0),
    fat: num(body.fat ?? 0),
    source: body.source === "Custom" ? "Custom" : "Open Food Facts",
  };
  if ([food.calories, food.protein, food.carbs, food.fat].some((v) => !(v >= 0)))
    return "Nutrition values must be non-negative numbers.";
  return food;
}

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 500);
});

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/day/:date", (c) => {
  const date = c.req.param("date");
  if (!store.isIsoDate(date)) return c.json({ error: "Invalid date." }, 400);
  return c.json(store.getDay(date));
});

app.post("/api/entries", async (c) => {
  const body = await c.req.json();
  const food = parseFood(body.food);
  if (typeof food === "string") return c.json({ error: food }, 400);
  const grams = num(body.grams);
  if (!(grams > 0)) return c.json({ error: "Enter a positive weight in grams." }, 400);
  if (!store.isIsoDate(body.date)) return c.json({ error: "Invalid date." }, 400);
  store.addEntry(food, grams, body.date);
  void sync.requestSync();
  return c.json({ ok: true });
});

app.delete("/api/entries/:id", (c) => {
  const removed = store.removeEntry(Number(c.req.param("id")));
  if (removed) void sync.requestSync();
  return c.json({ removed });
});

app.get("/api/custom-foods", (c) => c.json(store.listCustomFoods()));

app.post("/api/custom-foods", async (c) => {
  const food = parseFood(await c.req.json());
  if (typeof food === "string") return c.json({ error: food }, 400);
  return c.json({ saved: store.saveCustomFood(food) });
});

app.delete("/api/custom-foods/:id", (c) => c.json({ removed: store.removeCustomFood(Number(c.req.param("id"))) }));

app.get("/api/search", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  const brand = (c.req.query("brand") ?? "").trim();
  const page = Math.max(1, Math.floor(num(c.req.query("page") ?? 1)) || 1);
  if (!q && !brand) return c.json({ error: "Enter a food name or brand first." }, 400);
  try {
    return c.json(await searchFoods(q, brand, page));
  } catch (e) {
    return c.json({ error: `Could not search Open Food Facts. ${e instanceof Error ? e.message : e}` }, 502);
  }
});

app.get("/api/brands", async (c) => {
  const text = (c.req.query("text") ?? "").trim();
  if (text.length < 2) return c.json([]);
  try {
    return c.json(await brandSuggestions(text));
  } catch (e) {
    return c.json({ error: `Brand suggestions unavailable: ${e instanceof Error ? e.message : e}` }, 502);
  }
});

app.get("/api/history", (c) => {
  const weeks = Math.floor(num(c.req.query("weeks")));
  const end = c.req.query("end");
  if (!(weeks >= 1 && weeks <= 104) || !store.isIsoDate(end))
    return c.json({ error: "Choose 1–104 weeks and a valid end date." }, 400);
  return c.json(store.getHistory(weeks, end));
});

app.get("/api/export.csv", (c) => {
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", 'attachment; filename="calorie-history.csv"');
  return c.body(store.exportCsv());
});

app.get("/api/sync", async (c) => c.json(await sync.getSyncStatus()));

app.post("/api/sync/connect", async (c) => {
  const { url, anonKey, email, password } = await c.req.json();
  if (!(typeof url === "string" && url.trim().startsWith("https://") && anonKey && email && password))
    return c.json({ error: "Enter the HTTPS project URL, public key, account email, and password." }, 400);
  void sync.connect(url, String(anonKey).trim(), String(email).trim(), String(password));
  return c.json({ ok: true });
});

app.post("/api/sync/now", (c) => {
  void sync.requestSync();
  return c.json({ ok: true });
});

// ---- Live events + idle shutdown -----------------------------------------------------------

let openStreams = 0;
let idleTimer: NodeJS.Timeout | undefined;

function scheduleIdleShutdown(delay = IDLE_SHUTDOWN_MS) {
  if (DEV) return;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    if (openStreams > 0) return;
    if (sync.isSyncBusy()) console.log("Window closed; waiting for website sync to finish…");
    await sync.whenSyncIdle();
    if (openStreams === 0) process.exit(0);
  }, delay);
}

app.get("/api/events", (c) =>
  streamSSE(c, async (stream) => {
    openStreams++;
    clearTimeout(idleTimer);
    const send = (status: unknown) => stream.writeSSE({ event: "sync", data: JSON.stringify(status) });
    const off = sync.onSyncStatus((s) => void send(s));
    stream.onAbort(() => {
      off();
      openStreams--;
      if (openStreams === 0) scheduleIdleShutdown();
    });
    await send(await sync.getSyncStatus());
    while (!stream.aborted) {
      await stream.sleep(20_000);
      if (!stream.aborted) await stream.write(": keep-alive\n\n");
    }
  }),
);

// ---- Static frontend ------------------------------------------------------------------------

const distDir = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
app.use("/*", serveStatic({ root: relative(process.cwd(), distDir) }));
app.get("*", serveStatic({ path: join(relative(process.cwd(), distDir), "index.html") }));

serve({ fetch: app.fetch, port: PORT, hostname: "127.0.0.1" }, () => {
  console.log(`Daily Nutrition Tracker v2 running at http://127.0.0.1:${PORT}`);
  void sync.restoreSavedSession();
  // Exit if the window never connects (e.g. the browser failed to open).
  scheduleIdleShutdown(60_000);
});
