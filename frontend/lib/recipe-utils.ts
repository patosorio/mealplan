import type { Recipe } from "@/lib/api/recipes";

export type RecipeTypeFilter = "raw" | "cooked" | "juice";

/** Resolve meal type for filtering — uses origin_meal, tags, and name heuristics. */
export function getRecipeType(recipe: Recipe): RecipeTypeFilter | null {
  if (recipe.origin_meal?.startsWith("juice_")) return "juice";
  if (recipe.tags.some((t) => t.toLowerCase() === "juice")) return "juice";

  const lowerTags = recipe.tags.map((t) => t.toLowerCase());
  if (lowerTags.some((t) => t === "raw" || t.includes("raw vegan"))) return "raw";
  if (lowerTags.some((t) => t === "cooked" || t === "warm")) return "cooked";

  return null;
}

export function recipeMatchesTypeFilter(
  recipe: Recipe,
  typeFilter: RecipeTypeFilter | "all"
): boolean {
  if (typeFilter === "all") return true;
  return getRecipeType(recipe) === typeFilter;
}
