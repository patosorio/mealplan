import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

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
