import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiFetchForm } from "@/lib/api";
import { useToast } from "@/lib/toast";
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
  type: "raw" | "cooked" | "juice" | null;
  origin_plan_id: string | null;
  origin_day: string | null;
  origin_meal: string | null;
  created_at: string;
  updated_at: string;
}

export { type RecipeExpanded };

export function useRecipes(originPlanId?: string) {
  return useQuery({
    queryKey: originPlanId ? ["recipes", "by-plan", originPlanId] : ["recipes"],
    queryFn: () =>
      apiFetch<Recipe[]>(
        originPlanId
          ? `/recipes?origin_plan_id=${encodeURIComponent(originPlanId)}`
          : "/recipes"
      ),
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
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/recipes/${id}`, { method: "DELETE" }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["recipes"] });
      const snapshots = qc.getQueriesData<Recipe[]>({ queryKey: ["recipes"] });
      qc.setQueriesData<Recipe[]>({ queryKey: ["recipes"] }, (old) =>
        Array.isArray(old) ? old.filter((r) => r.id !== id) : old
      );
      return { snapshots };
    },
    onSuccess: (_data, id) => {
      toast("Recipe removed.");
      qc.invalidateQueries({ queryKey: ["recipes"] });
      qc.removeQueries({ queryKey: ["recipes", id] });
    },
    onError: (_err, _id, ctx) => {
      ctx?.snapshots?.forEach(([key, data]) => qc.setQueryData(key, data));
      toast("Could not remove recipe.", "error");
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

export interface RecipeCreateRequest {
  name: string;
  description?: string;
  ingredients: RecipeImportConfirmRequest["ingredients"];
  steps: RecipeImportConfirmRequest["steps"];
  tags?: string[];
  diet_type?: string | null;
  prep_minutes?: number | null;
  servings?: number | null;
}

export interface RecipeUpdateRequest {
  name?: string;
  description?: string;
  ingredients?: RecipeImportConfirmRequest["ingredients"];
  steps?: RecipeImportConfirmRequest["steps"];
  tags?: string[];
  diet_type?: string | null;
  prep_minutes?: number | null;
  servings?: number | null;
}

export function useCreateRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RecipeCreateRequest) =>
      apiFetch<Recipe>("/recipes", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
    },
  });
}

export function useUpdateRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: RecipeUpdateRequest }) =>
      apiFetch<Recipe>(`/recipes/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
      qc.invalidateQueries({ queryKey: ["recipes", id, "expand"] });
    },
  });
}

export function useGenerateFromIngredients() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      ingredients: string[];
      target_type: "juice" | "smoothie" | "raw_meal" | "cooked_meal";
      servings?: number;
      save?: boolean;
    }) =>
      apiFetch<RecipeDraft | Recipe>("/recipes/generate-from-ingredients", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
    },
  });
}
