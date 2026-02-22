// ── API response types (mirrors backend schemas) ─────────────────────────────

export type MealType = "raw" | "cooked";
export type MealSlot = "breakfast" | "lunch" | "dinner";
export type DayName =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export const DAYS: DayName[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export interface MealItem {
  name: string;
  type: MealType;
  description: string;
  tags: string[];
  prep_minutes: number;
  source: "generated" | "user_recipe" | "corpus";
}

export interface DayPlan {
  breakfast: MealItem;
  lunch: MealItem;
  dinner: MealItem;
  snacks: string[];
}

export interface NutritionAvg {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

export interface MealPlan {
  id: string;
  user_id: string;
  week_start: string;
  diet_type: string;
  plan_data: { days: Record<DayName, DayPlan> };
  nutrition_avg: NutritionAvg;
  created_at: string;
}

export interface GeneratedMeal {
  id: string;
  user_id: string;
  meal_plan_id: string;
  day: string;
  meal_type: string;
  name: string;
  type: MealType;
  description: string | null;
  tags: string[];
  prep_minutes: number | null;
  saved: boolean;
  created_at: string;
}

export interface GeneratePlanRequest {
  diet_type: string;
  calories_target: number;
  meals_per_day: MealSlot[];
  use_own_recipes: boolean;
  use_pantry: boolean;
  exclude_ingredients: string[];
  preferences_text?: string;
  week_start: string;
}

export interface SaveFromPlanRequest {
  meal_plan_id: string;
  day: string;
  meal_type: string;
}

export interface SaveFromPlanResponse {
  id: string;
  name: string;
  source: string;
  origin_plan_id: string | null;
  origin_day: string | null;
  origin_meal: string | null;
  created_at: string;
}

export interface RecipeIngredient {
  name: string;
  amount: string;
  notes: string;
}

export interface RecipeStep {
  step: number;
  instruction: string;
}

export interface RecipeExpanded {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  diet_type: string | null;
  prep_minutes: number | null;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  source: string;
  created_at: string;
}
