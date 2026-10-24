import type { DayLog, Food, HistoryResult, SearchResult, SyncStatus } from "../shared/types.ts";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

export const api = {
  day: (date: string) => request<DayLog>(`/day/${date}`),
  addEntry: (food: Food, grams: number, date: string) => request<{ ok: true }>("/entries", post({ food, grams, date })),
  removeEntry: (id: number) => request<{ removed: boolean }>(`/entries/${id}`, { method: "DELETE" }),
  customFoods: () => request<Food[]>("/custom-foods"),
  saveCustomFood: (food: Food) => request<{ saved: boolean }>("/custom-foods", post(food)),
  removeCustomFood: (id: number) => request<{ removed: boolean }>(`/custom-foods/${id}`, { method: "DELETE" }),
  search: (q: string, brand: string, page: number) =>
    request<SearchResult>(`/search?${new URLSearchParams({ q, brand, page: String(page) })}`),
  brands: (text: string) => request<string[]>(`/brands?${new URLSearchParams({ text })}`),
  history: (weeks: number, end: string) => request<HistoryResult>(`/history?${new URLSearchParams({ weeks: String(weeks), end })}`),
  syncStatus: () => request<SyncStatus>("/sync"),
  syncConnect: (url: string, anonKey: string, email: string, password: string) =>
    request<{ ok: true }>("/sync/connect", post({ url, anonKey, email, password })),
  syncNow: () => request<{ ok: true }>("/sync/now", { method: "POST" }),
};
