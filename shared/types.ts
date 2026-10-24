export interface Nutrients {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** A food with nutrients per 100 g. `id` is set for saved custom foods. */
export interface Food extends Nutrients {
  id?: number;
  name: string;
  brand: string;
  source: "Open Food Facts" | "Custom";
}

export interface Entry extends Nutrients {
  id: number;
  date: string;
  food_name: string;
  grams: number;
}

export interface DayLog {
  date: string;
  entries: Entry[];
  totals: Nutrients;
}

export interface SearchResult {
  foods: Food[];
  page: number;
  hasMore: boolean;
}

export interface HistoryDay extends Nutrients {
  date: string;
  entries: number;
}

export interface HistoryResult {
  start: string | null;
  end: string;
  activeDays: number;
  averages: Nutrients | null;
  days: HistoryDay[];
}

export interface SyncStatus {
  connected: boolean;
  busy: boolean;
  message: string;
  error: string | null;
  savedUrl: string;
  savedAnonKey: string;
}

export const ZERO: Nutrients = { calories: 0, protein: 0, carbs: 0, fat: 0 };

export function nutrientsFromPer100(food: Nutrients, grams: number): Nutrients {
  const factor = grams / 100;
  return {
    calories: (food.calories || 0) * factor,
    protein: (food.protein || 0) * factor,
    carbs: (food.carbs || 0) * factor,
    fat: (food.fat || 0) * factor,
  };
}
