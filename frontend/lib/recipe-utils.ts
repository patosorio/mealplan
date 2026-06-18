import type { Recipe } from "@/lib/api/recipes";
import type { RecipeIngredient } from "@/lib/types";

export type RecipeTypeFilter = "raw" | "cooked" | "juice";

/** Resolve meal type — uses the stored type field first, then falls back to heuristics for legacy records. */
export function getRecipeType(r: Recipe): "raw" | "cooked" | "juice" | null {
  if (r.type) return r.type;
  // fallback for legacy records without type set
  if (r.origin_meal?.startsWith("juice_") || r.tags?.includes("juice")) return "juice";
  if (r.tags?.includes("raw")) return "raw";
  if (r.tags?.includes("cooked")) return "cooked";
  return null;
}

export function recipeMatchesTypeFilter(
  recipe: Recipe,
  typeFilter: RecipeTypeFilter | "all"
): boolean {
  if (typeFilter === "all") return true;
  return getRecipeType(recipe) === typeFilter;
}

/** Scale a quantity string by ratio (e.g. 2 servings → 4 = ratio 2). */
export function scaleAmount(amount: string, ratio: number): string {
  if (ratio === 1 || !amount.trim()) return amount;

  const fractionMatch = amount.match(/^(\d+)\/(\d+)\s*(.*)$/);
  if (fractionMatch) {
    const num = (parseInt(fractionMatch[1], 10) / parseInt(fractionMatch[2], 10)) * ratio;
    const rest = fractionMatch[3];
    return `${formatQuantity(num)}${rest ? ` ${rest}` : ""}`.trim();
  }

  const rangeMatch = amount.match(/^([\d.]+)\s*[-–]\s*([\d.]+)\s*(.*)$/);
  if (rangeMatch) {
    const low = parseFloat(rangeMatch[1]) * ratio;
    const high = parseFloat(rangeMatch[2]) * ratio;
    const rest = rangeMatch[3];
    return `${formatQuantity(low)}–${formatQuantity(high)}${rest ? ` ${rest}` : ""}`.trim();
  }

  const numMatch = amount.match(/^([\d.]+)\s*(.*)$/);
  if (numMatch) {
    const scaled = parseFloat(numMatch[1]) * ratio;
    const rest = numMatch[2];
    return `${formatQuantity(scaled)}${rest ? ` ${rest}` : ""}`.trim();
  }

  return amount;
}

function formatQuantity(n: number): string {
  if (Number.isInteger(n)) return String(n);
  const rounded = Math.round(n * 100) / 100;
  return String(rounded);
}

export function scaledIngredients(
  ingredients: RecipeIngredient[],
  baseServings: number,
  targetServings: number
): RecipeIngredient[] {
  const ratio = targetServings / Math.max(baseServings, 1);
  return ingredients.map((ing) => ({
    ...ing,
    amount: scaleAmount(ing.amount, ratio),
  }));
}

export function formatJuiceVolume(sizeOz?: number | null, sizeMl?: number | null): string | null {
  if (sizeOz) {
    const ml = sizeMl ?? Math.round(sizeOz * 29.57);
    return `${sizeOz}oz / ${ml}ml`;
  }
  if (sizeMl) return `${sizeMl}ml`;
  return null;
}
