import dayjs from "dayjs";
import { notifications } from "@mantine/notifications";
import type { Food, Nutrients } from "../shared/types.ts";

export const MACROS = [
  { key: "protein", label: "Protein", color: "blue", kcalPerGram: 4 },
  { key: "carbs", label: "Carbs", color: "orange", kcalPerGram: 4 },
  { key: "fat", label: "Fat", color: "pink", kcalPerGram: 9 },
] as const satisfies readonly { key: keyof Nutrients; label: string; color: string; kcalPerGram: number }[];

export const fmtKcal = (n: number) => Math.round(n).toLocaleString("en-GB");
export const fmtG = (n: number) => n.toFixed(1);

export const todayIso = () => dayjs().format("YYYY-MM-DD");
export const shiftDate = (iso: string, days: number) => dayjs(iso).add(days, "day").format("YYYY-MM-DD");

export function dayLabel(iso: string): string {
  const diff = dayjs().startOf("day").diff(dayjs(iso), "day");
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff === -1) return "Tomorrow";
  return dayjs(iso).format("dddd D MMMM");
}

export const foodKey = (f: Pick<Food, "name" | "brand">) => `${f.name.toLowerCase()}|${(f.brand ?? "").toLowerCase()}`;

export function notifyError(e: unknown, title = "Something went wrong") {
  notifications.show({ color: "red", title, message: e instanceof Error ? e.message : String(e) });
}
