import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiFetchForm } from "@/lib/api";
import type { RecipeDraft, RecipeExpanded, RecipeImportConfirmRequest } from "@/lib/types";

export interface Recipe {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  ingredients: unknown[];
  steps: unknown[];
  tags: string[];
  diet_type: string | null;
  prep_minutes: number | null;
  source: string;
  origin_plan_id: string | null;
  origin_day: string | null;
  origin_meal: string | null;
  created_at: string;
  updated_at: string;
}

export { type RecipeExpanded };

export function useRecipes() {
  return useQuery({
    queryKey: ["recipes"],
    queryFn: () => apiFetch<Recipe[]>("/recipes"),
  });
}

export function useSearchRecipes(query: string) {
  return useQuery({
    queryKey: ["recipes", "search", query],
    queryFn: () =>
      apiFetch<Recipe[]>(
        `/recipes/search?q=${encodeURIComponent(query)}`
      ),
    enabled: query.trim().length > 0,
  });
}

export function useExpandRecipe(id: string) {
  return useQuery({
    queryKey: ["recipes", id, "expand"],
    queryFn: () => apiFetch<RecipeExpanded>(`/recipes/${id}/expand`),
    enabled: !!id,
    staleTime: Infinity,
  });
}

export function useDeleteRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/recipes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
    },
  });
}

export async function extractRecipe(
  text?: string,
  image?: File,
): Promise<RecipeDraft> {
  const form = new FormData();
  if (text) form.append("text", text);
  if (image) form.append("image", image);
  return apiFetchForm<RecipeDraft>("/recipes/import/extract", form);
}

export function useConfirmRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (draft: RecipeImportConfirmRequest) =>
      apiFetch<RecipeExpanded>("/recipes/import/confirm", {
        method: "POST",
        body: JSON.stringify(draft),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
    },
  });
}
