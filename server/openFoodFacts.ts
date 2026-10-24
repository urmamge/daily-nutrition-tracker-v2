import type { Food, SearchResult } from "../shared/types.ts";

const API_BASE = "https://world.openfoodfacts.org/cgi/search.pl";
// Newer Open Food Facts search service, used as a fallback and for brand autocomplete.
const SEARCH_API = "https://search.openfoodfacts.org";
const PAGE_SIZE = 100;
const USER_AGENT = "DailyNutritionTracker/2.0 (desktop app)";

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`Open Food Facts returned ${res.status}`);
  return res.json();
}

function query(params: Record<string, string | number>): string {
  return new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
}

function toNumber(...values: unknown[]): number {
  for (const v of values) {
    if (v === null || v === undefined || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function toFood(p: any): Food | null {
  const name = String(p.product_name ?? "").trim();
  if (!name) return null;
  const n = p.nutriments ?? {};
  let kcal: number | null = n["energy-kcal_100g"] ?? null;
  if (kcal == null && n.energy_100g != null) kcal = Number(n.energy_100g) / 4.184;
  if (kcal == null || !Number.isFinite(Number(kcal))) return null;
  return {
    name,
    brand: Array.isArray(p.brands) ? p.brands.join(", ") : String(p.brands ?? ""),
    calories: Number(kcal),
    protein: toNumber(n.proteins_100g),
    carbs: toNumber(n.carbohydrates_100g),
    fat: toNumber(n.fat_100g),
    source: "Open Food Facts",
  };
}

async function classicSearch(q: string, brand: string, page: number): Promise<{ products: any[]; hasMore: boolean }> {
  const params: Record<string, string | number> = {
    action: "process",
    json: 1,
    page_size: PAGE_SIZE,
    page,
    fields: "product_name,brands,nutriments,code",
  };
  if (q) Object.assign(params, { search_terms: q, search_simple: 1 });
  if (brand) Object.assign(params, { tagtype_0: "brands", tag_contains_0: "contains", tag_0: brand });
  const payload = await getJson(`${API_BASE}?${query(params)}`);
  const products: any[] = payload.products ?? [];
  const pageCount = Number(payload.page_count);
  return { products, hasMore: payload.page_count != null && Number.isFinite(pageCount) ? page < pageCount : products.length === PAGE_SIZE };
}

async function newSearch(q: string, brand: string, page: number): Promise<{ products: any[]; hasMore: boolean }> {
  const terms = [q, brand && `brands:"${brand.replace(/["\\]/g, "")}"`].filter(Boolean).join(" ");
  const payload = await getJson(
    `${SEARCH_API}/search?${query({ q: terms, page, page_size: PAGE_SIZE, fields: "product_name,brands,nutriments,code" })}`,
  );
  return { products: payload.hits ?? [], hasMore: page < Number(payload.page_count ?? 0) };
}

export async function searchFoods(q: string, brand: string, page: number): Promise<SearchResult> {
  let result;
  try {
    result = await classicSearch(q, brand, page);
  } catch (classicError) {
    try {
      result = await newSearch(q, brand, page);
    } catch {
      throw classicError;
    }
  }
  const foods = result.products.map(toFood).filter((f): f is Food => f !== null);
  return { foods, page, hasMore: result.hasMore };
}

const suggestionCache = new Map<string, string[]>();

export async function brandSuggestions(text: string): Promise<string[]> {
  const key = text.toLowerCase();
  const cached = suggestionCache.get(key);
  if (cached) return cached;
  const payload = await getJson(`${SEARCH_API}/autocomplete?${query({ q: text, taxonomy_names: "brand", size: 20 })}`);
  const brands = new Set<string>();
  for (const o of payload.options ?? []) if (o.text) brands.add(String(o.text).trim());
  const result = [...brands].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  suggestionCache.set(key, result);
  return result;
}
