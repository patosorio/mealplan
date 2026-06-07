import type { Recipe } from "@/lib/api/recipes";
import type { DayName, DayPlan, MealItem, MealSlot } from "@/lib/types";
import { DAYS } from "@/lib/types";

export interface DayScheduleEntry {
  label: string;
  name: string;
  type: "raw" | "cooked" | "juice";
  kind: "meal" | "juice" | "extra" | "snack";
  description?: string;
  tags?: string[];
  prep_minutes?: number;
  ingredients?: string[];
}

const SLOT_LABELS: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  morning_juice: "Morning juice",
  morning_snack: "Morning snack",
  afternoon_snack: "Afternoon snack",
  evening_tea: "Evening tea",
};

const SLOT_PRIORITY: Record<string, number> = {
  morning_juice: 10,
  morning_snack: 15,
  breakfast: 20,
  lunch: 40,
  afternoon_snack: 55,
  dinner: 60,
  evening_tea: 75,
  snacks: 90,
};

function juiceTimePriority(juice: MealItem): number {
  const haystack = [juice.name, ...(juice.tags ?? [])].join(" ").toLowerCase();
  if (/(^|\s|_)(morning|breakfast)/i.test(haystack)) return 10;
  if (/(pre.?lunch|before.?lunch)/i.test(haystack)) return 30;
  if (/afternoon/i.test(haystack)) return 50;
  if (/(evening|night|dinner)/i.test(haystack)) return 70;
  return 99;
}

function juiceLabel(juice: MealItem, index: number): string {
  const tag = (juice.tags ?? []).find((t) =>
    /morning|pre.?lunch|afternoon|evening/i.test(t)
  );
  if (tag) return tag.replace(/_/g, " ");
  return `Juice ${index + 1}`;
}

/** Chronological meal/juice/extra entries for one day of a plan. */
export function getDayScheduleEntries(dayPlan: DayPlan | null | undefined): DayScheduleEntry[] {
  if (!dayPlan) return [];

  const items: { priority: number; entry: DayScheduleEntry }[] = [];

  for (const slot of ["breakfast", "lunch", "dinner"] as MealSlot[]) {
    const meal = dayPlan[slot];
    if (meal) {
      items.push({
        priority: SLOT_PRIORITY[slot],
        entry: {
          label: SLOT_LABELS[slot],
          name: meal.name,
          type: meal.type,
          kind: "meal",
          description: meal.description,
          tags: meal.tags,
          prep_minutes: meal.prep_minutes,
          ingredients: meal.ingredients,
        },
      });
    }
  }

  (dayPlan.juices ?? []).forEach((juice, i) => {
    items.push({
      priority: juiceTimePriority(juice),
      entry: {
        label: juiceLabel(juice, i),
        name: juice.name,
        type: "juice",
        kind: "juice",
        description: juice.description,
        tags: juice.tags,
        prep_minutes: juice.prep_minutes,
        ingredients: juice.ingredients,
      },
    });
  });

  (dayPlan.extras ?? []).forEach((extra) => {
    items.push({
      priority: SLOT_PRIORITY[extra.slot] ?? 80,
      entry: {
        label: SLOT_LABELS[extra.slot] ?? extra.slot.replace(/_/g, " "),
        name: extra.name,
        type: extra.type,
        kind: "extra",
        description: extra.description,
        prep_minutes: extra.prep_minutes,
      },
    });
  });

  if (dayPlan.snacks?.length) {
    items.push({
      priority: SLOT_PRIORITY.snacks,
      entry: {
        label: "Snacks",
        name: dayPlan.snacks.join(" · "),
        type: "raw",
        kind: "snack",
      },
    });
  }

  return items.sort((a, b) => a.priority - b.priority).map((i) => i.entry);
}

/** Map a calendar date within a week to monday–sunday. */
export function dateToDayName(weekStartMonday: string, dateStr: string): DayName {
  const start = new Date(weekStartMonday + "T12:00:00").getTime();
  const d = new Date(dateStr + "T12:00:00").getTime();
  const index = Math.round((d - start) / 86_400_000);
  return DAYS[Math.max(0, Math.min(6, index))];
}

/** Monday of the current week (local time). */
export function getMondayOfWeek(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Default week start: this Monday, or next Monday if today is Thu–Sun. */
export function getDefaultWeekStart(): string {
  const today = new Date();
  const day = today.getDay();
  const monday = getMondayOfWeek(today);
  if (day === 0 || day >= 4) {
    monday.setDate(monday.getDate() + 7);
  }
  return formatDateISO(monday);
}

/** Snap any date to the Monday of that week. */
export function snapToMonday(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return formatDateISO(getMondayOfWeek(d));
}

export function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatWeekLabel(weekStart: string): string {
  return new Date(weekStart + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function buildSavedRecipeState(planId: string, recipes: Recipe[]) {
  const savedMealIds = new Map<string, string>();
  const savedJuiceKeys = new Set<string>();

  for (const r of recipes) {
    if (!r.origin_day || !r.origin_meal) continue;
    if (r.origin_meal.startsWith("juice_")) {
      savedJuiceKeys.add(`${planId}-${r.origin_day}-${r.origin_meal}`);
    } else {
      savedMealIds.set(`${planId}-${r.origin_day}-${r.origin_meal}`, r.id);
    }
  }

  return { savedMealIds, savedJuiceKeys };
}
