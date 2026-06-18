import { activeDaysFromPlan } from "@/lib/meal-plan-utils";
import type { DayName, MealPlan, NutritionAvg } from "@/lib/types";

export function getDayNutrition(plan: MealPlan, day: DayName): NutritionAvg | null {
  const fromMap = plan.plan_data.nutrition_by_day?.[day];
  if (fromMap) return fromMap;
  const dayPlan = plan.plan_data.days[day];
  if (dayPlan && "nutrition" in dayPlan && dayPlan.nutrition) {
    return dayPlan.nutrition as NutritionAvg;
  }
  return null;
}

/** Sum per-day nutrition across active plan days (weekly totals, not averages). */
export function sumWeeklyNutrition(plan: MealPlan): NutritionAvg | null {
  const days = activeDaysFromPlan(plan);
  let hasAny = false;
  const totals: NutritionAvg = {
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
  };

  for (const day of days) {
    const n = getDayNutrition(plan, day);
    if (!n) continue;
    hasAny = true;
    totals.calories += n.calories;
    totals.protein_g += n.protein_g;
    totals.carbs_g += n.carbs_g;
    totals.fat_g += n.fat_g;
    totals.fiber_g += n.fiber_g;
  }

  return hasAny ? totals : plan.nutrition_avg;
}
