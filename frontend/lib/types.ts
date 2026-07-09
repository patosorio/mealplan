// ── API response types (mirrors backend schemas) ─────────────────────────────

import type { DietType } from "@/lib/diet-types";

export type { DietType };
export type MealType = "raw" | "cooked" | "juice";
export type MealSlot = "breakfast" | "lunch" | "dinner";
export type ExtraSlot = "morning_juice" | "morning_snack" | "afternoon_snack" | "evening_tea";
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
  recipe_id?: string | null;
  ingredients?: string[];
  nutrition?: NutritionAvg;
  size_oz?: number | null;
  size_ml?: number | null;
}

// ── Phase 8 types ─────────────────────────────────────────────────────────────

export interface ExtraItem {
  slot: ExtraSlot;
  name: string;
  type: MealType;
  description: string;
  prep_minutes: number;
}

export interface JuiceEntry {
  label: string;
  size_oz: 8 | 16 | 24 | 32;
  size_label: string;
}

export interface JuicingConfig {
  juices: JuiceEntry[];
  solid_meals: MealSlot[];
}

export interface DayPlan {
  breakfast: MealItem | null;
  lunch: MealItem | null;
  dinner: MealItem | null;
  juices: MealItem[];
  extras: ExtraItem[];
  snacks: string[];
  nutrition?: NutritionAvg;
}

export interface NutritionAvg {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

export type PlanStatus = "draft" | "reviewing" | "approved";
export type ApprovalStatus = "pending" | "accepted" | "swapped";

export interface MealPlan {
  id: string;
  user_id: string;
  week_start: string;
  diet_type: DietType;
  plan_data: {
    days: Record<DayName, DayPlan>;
    nutrition_by_day?: Partial<Record<DayName, NutritionAvg>>;
  };
  nutrition_avg: NutritionAvg;
  created_at: string;
  // Phase 7
  status: PlanStatus;
  name: string | null;
  scheduled_week: string | null;
  approved_at: string | null;
  plan_days?: number;
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
  // Phase 7
  approval_status: ApprovalStatus;
  edited_manually: boolean;
}

export type RecipeUsagePolicyMode = "balanced" | "prefer_saved" | "prefer_new";

export interface RecipeUsagePolicy {
  mode: RecipeUsagePolicyMode;
  flexible_repeat_slots: string[];
  ingredient_coherence: boolean;
}

export interface GeneratePlanRequest {
  diet_type: DietType;
  calories_target: number;
  meals_per_day: MealSlot[];
  use_own_recipes: boolean;
  use_pantry: boolean;
  exclude_ingredients: string[];
  preferences_text?: string;
  week_start: string;
  plan_days?: number;
  raw_cooked_ratio?: string;
  recipe_usage_policy?: RecipeUsagePolicy;
  // Phase 8 — optional
  extras?: ExtraSlot[];
  juicing_config?: JuicingConfig | null;
}

export interface SaveFromPlanRequest {
  meal_plan_id: string;
  day: string;
  meal_type: string;
  juice_index?: number;
  recipe_id?: string | null;
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
  servings?: number | null;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  source: string;
  created_at: string;
}

export interface RecipeDraft {
  name: string;
  description: string;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  tags: string[];
  diet_type: string | null;
  prep_minutes: number | null;
  servings: number | null;
  extraction_confidence: "high" | "medium" | "low";
  input_interpretation: string;
}

export interface RecipeImportConfirmRequest {
  name: string;
  description: string;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  tags: string[];
  diet_type: string | null;
  prep_minutes: number | null;
  servings: number | null;
}

// ── Phase 7 request types ─────────────────────────────────────────────────────

export interface PatchMealPlanRequest {
  name?: string;
  status?: PlanStatus;
  scheduled_week?: string;
}

export interface ApprovePlanRequest {
  name: string;
  accept_all?: boolean;
}

export interface SchedulePlanRequest {
  scheduled_week: string;
}

export interface PatchGeneratedMealRequest {
  action: "accept" | "edit";
  name?: string;
  description?: string;
}
