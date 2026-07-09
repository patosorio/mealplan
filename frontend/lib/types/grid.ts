import type { DayName, MealPlan } from "@/lib/types"

export type GridRowType = "meal" | "juice" | "extra"

export type GridRow = {
  id: string
  label: string
  type: GridRowType
  slotIndex?: number
}

export type GridConfig = {
  days: DayName[]
  rows: GridRow[]
}

const ALL_DAYS: DayName[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

// Canonical day-part order — every slot type maps to a priority number.
// Gaps are intentional so juice labels that don't match a known pattern
// can still land in a reasonable position.
//
// morning juice  →  5
// morning snack  → 10
// breakfast      → 20
// pre-lunch juice→ 30
// lunch          → 40
// afternoon snack→ 50
// afternoon juice→ 55
// dinner         → 60
// evening juice  → 70
// evening tea    → 80
const SLOT_PRIORITY: Record<string, number> = {
  breakfast: 20,
  lunch: 40,
  dinner: 60,
  morning_juice: 5,   // extra slot (non-juicing mode)
  morning_snack: 10,
  afternoon_snack: 50,
  evening_tea: 80,
}

// Maps a juice label string to its chronological priority.
function juiceLabelPriority(label: string): number {
  const l = label.toLowerCase()
  if (/morning/.test(l)) return 5
  if (/pre.?lunch|prelunch/.test(l)) return 30
  if (/afternoon/.test(l)) return 55
  if (/evening/.test(l)) return 70
  return 65 // unknown → place after dinner
}

const MEAL_LABELS: Record<string, string> = {
  breakfast: "BREAK",
  lunch: "LUNCH",
  dinner: "DINNE",
}

export function buildGridConfig(params: {
  planDays: number
  meals: string[]
  extras: string[]
  juicingEnabled: boolean
  juiceLabels: string[]
}): GridConfig {
  const days = ALL_DAYS.slice(0, params.planDays)

  type SortableRow = GridRow & { priority: number }
  const rows: SortableRow[] = []

  // Juice rows in juicing mode — interleaved by label priority
  if (params.juicingEnabled) {
    params.juiceLabels.forEach((label, i) => {
      rows.push({
        id: `juice_${i}`,
        label: label.toUpperCase(),
        type: "juice",
        slotIndex: i,
        priority: juiceLabelPriority(label),
      })
    })
  }

  // Morning juice as extra (non-juicing mode)
  if (!params.juicingEnabled && params.extras.includes("morning_juice")) {
    rows.push({ id: "morning_juice", label: "MORNING", type: "extra", priority: SLOT_PRIORITY.morning_juice })
  }

  if (params.extras.includes("morning_snack")) {
    rows.push({ id: "morning_snack", label: "SNACK AM", type: "extra", priority: SLOT_PRIORITY.morning_snack })
  }

  params.meals.forEach((meal) => {
    if (MEAL_LABELS[meal]) {
      rows.push({ id: meal, label: MEAL_LABELS[meal], type: "meal", priority: SLOT_PRIORITY[meal] ?? 50 })
    }
  })

  if (params.extras.includes("afternoon_snack")) {
    rows.push({ id: "afternoon_snack", label: "SNACK PM", type: "extra", priority: SLOT_PRIORITY.afternoon_snack })
  }

  if (params.extras.includes("evening_tea")) {
    rows.push({ id: "evening_tea", label: "EVE TEA", type: "extra", priority: SLOT_PRIORITY.evening_tea })
  }

  // Sort everything into canonical day-part order
  rows.sort((a, b) => a.priority - b.priority)

  // Strip the internal priority field before returning
  const sortedRows: GridRow[] = rows.map(({ priority: _p, ...row }) => row)

  if (sortedRows.length === 0) {
    return {
      days,
      rows: [
        { id: "breakfast", label: "BREAK", type: "meal" },
        { id: "lunch", label: "LUNCH", type: "meal" },
        { id: "dinner", label: "DINNE", type: "meal" },
      ],
    }
  }

  return { days, rows: sortedRows }
}

/**
 * Derives a GridConfig from a fully populated MealPlan.
 * Used on the saved-plan detail page where form state is not available.
 */
export function buildGridConfigFromPlan(plan: MealPlan): GridConfig {
  const days = plan.plan_data.days;
  const dayValues = Object.values(days);

  const meals: string[] = [];
  const extraSlots = new Set<string>();
  let maxJuices = 0;

  dayValues.forEach((day) => {
    if (day?.breakfast && !meals.includes("breakfast")) meals.push("breakfast");
    if (day?.lunch && !meals.includes("lunch")) meals.push("lunch");
    if (day?.dinner && !meals.includes("dinner")) meals.push("dinner");
    maxJuices = Math.max(maxJuices, day?.juices?.length ?? 0);
    day?.extras?.forEach((e) => extraSlots.add(e.slot));
  });

  // Infer juice labels from the first day that has juices
  const juiceLabels: string[] = [];
  if (maxJuices > 0) {
    const firstWithJuices = dayValues.find((d) => (d?.juices?.length ?? 0) > 0);
    if (firstWithJuices?.juices) {
      firstWithJuices.juices.slice(0, maxJuices).forEach((j, i) => {
        const tag = (j.tags ?? []).find((t) => /morning|pre.?lunch|afternoon|evening/i.test(t));
        juiceLabels[i] = tag ?? `Juice ${i + 1}`;
      });
    }
  }

  return buildGridConfig({
    planDays: plan.plan_days ?? Object.keys(days).length,
    meals: meals.length > 0 ? meals : ["breakfast", "lunch", "dinner"],
    extras: [...extraSlots],
    juicingEnabled: maxJuices > 0,
    juiceLabels,
  });
}
