import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type {
  GeneratePlanRequest,
  GeneratedMeal,
  MealPlan,
  SaveFromPlanRequest,
  SaveFromPlanResponse,
} from "@/lib/types";

// ── Query keys ────────────────────────────────────────────────────────────────

export const mealPlanKeys = {
  all: ["meal-plans"] as const,
  list: () => [...mealPlanKeys.all, "list"] as const,
  detail: (id: string) => [...mealPlanKeys.all, id] as const,
  meals: (planId: string) => [...mealPlanKeys.all, planId, "meals"] as const,
  bookmarked: () => ["generated-meals", "saved"] as const,
};

// ── Queries ───────────────────────────────────────────────────────────────────

export function useMealPlanHistory() {
  return useQuery({
    queryKey: mealPlanKeys.list(),
    queryFn: () => apiFetch<MealPlan[]>("/meal-plans"),
  });
}

export function useMealPlan(id: string | null) {
  return useQuery({
    queryKey: mealPlanKeys.detail(id ?? ""),
    queryFn: () => apiFetch<MealPlan>(`/meal-plans/${id}`),
    enabled: !!id,
  });
}

export function usePlanMeals(planId: string | null) {
  return useQuery({
    queryKey: mealPlanKeys.meals(planId ?? ""),
    queryFn: () => apiFetch<GeneratedMeal[]>(`/meal-plans/${planId}/meals`),
    enabled: !!planId,
  });
}

export function useBookmarkedMeals() {
  return useQuery({
    queryKey: mealPlanKeys.bookmarked(),
    queryFn: () => apiFetch<GeneratedMeal[]>("/generated-meals?saved=true"),
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useGeneratePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GeneratePlanRequest) =>
      apiFetch<MealPlan>("/meal-plans/generate", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mealPlanKeys.list() });
    },
  });
}

export function useSavePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) =>
      apiFetch<MealPlan>(`/meal-plans/${planId}/save`, { method: "POST" }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: mealPlanKeys.detail(data.id) });
      qc.invalidateQueries({ queryKey: mealPlanKeys.list() });
    },
  });
}

export function useRegenerateDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, day }: { planId: string; day: string }) =>
      apiFetch<MealPlan>(`/meal-plans/${planId}/regenerate-day?day=${day}`, {
        method: "POST",
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: mealPlanKeys.detail(data.id) });
    },
  });
}

export function useDeletePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) =>
      apiFetch<void>(`/meal-plans/${planId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mealPlanKeys.list() });
    },
  });
}

export function useSaveFromPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveFromPlanRequest) =>
      apiFetch<SaveFromPlanResponse>("/recipes/save-from-plan", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mealPlanKeys.bookmarked() });
    },
  });
}
