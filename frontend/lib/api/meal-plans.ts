import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type {
  ApprovePlanRequest,
  GeneratePlanRequest,
  GeneratedMeal,
  MealPlan,
  PatchGeneratedMealRequest,
  PatchMealPlanRequest,
  PlanStatus,
  SaveFromPlanRequest,
  SaveFromPlanResponse,
  SchedulePlanRequest,
} from "@/lib/types";
import { auth } from "@/lib/firebase";
import { syncPlanToCalendar } from "@/lib/calendar";
import { useToast } from "@/lib/toast";

// ── Query keys ────────────────────────────────────────────────────────────────

export const mealPlanKeys = {
  all: ["meal-plans"] as const,
  list: () => [...mealPlanKeys.all, "list"] as const,
  detail: (id: string) => [...mealPlanKeys.all, id] as const,
  meals: (planId: string) => [...mealPlanKeys.all, planId, "meals"] as const,
  bookmarked: () => ["generated-meals", "saved"] as const,
};

// ── Queries ───────────────────────────────────────────────────────────────────

export function useMealPlanHistory(status?: PlanStatus) {
  return useQuery({
    queryKey: status ? [...mealPlanKeys.list(), status] : mealPlanKeys.list(),
    queryFn: () =>
      apiFetch<MealPlan[]>(
        status ? `/meal-plans?status=${encodeURIComponent(status)}` : "/meal-plans"
      ),
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
      qc.invalidateQueries({ queryKey: mealPlanKeys.meals(data.id) });
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
  const { toast } = useToast();

  return useMutation({
    mutationFn: (planId: string) =>
      apiFetch<void>(`/meal-plans/${planId}`, { method: "DELETE" }),
    onMutate: async (planId) => {
      await qc.cancelQueries({ queryKey: mealPlanKeys.all });
      const snapshots = qc.getQueriesData<MealPlan[]>({ queryKey: mealPlanKeys.all });
      qc.setQueriesData<MealPlan[]>({ queryKey: mealPlanKeys.all }, (old) =>
        Array.isArray(old) ? old.filter((p) => p.id !== planId) : old
      );
      qc.removeQueries({ queryKey: mealPlanKeys.detail(planId) });
      return { snapshots };
    },
    onSuccess: () => {
      toast("Plan removed.");
      qc.invalidateQueries({ queryKey: mealPlanKeys.all });
    },
    onError: (_err, _id, ctx) => {
      ctx?.snapshots?.forEach(([key, data]) => qc.setQueryData(key, data));
      toast("Could not remove plan.", "error");
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
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: mealPlanKeys.bookmarked() });
      qc.invalidateQueries({ queryKey: ["recipes"] });
      qc.invalidateQueries({ queryKey: mealPlanKeys.meals(variables.meal_plan_id) });
    },
  });
}

// ── Phase 7 mutations ─────────────────────────────────────────────────────────

export function usePatchMealPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, body }: { planId: string; body: PatchMealPlanRequest }) =>
      apiFetch<MealPlan>(`/meal-plans/${planId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: mealPlanKeys.detail(data.id) });
      qc.invalidateQueries({ queryKey: mealPlanKeys.meals(data.id) });
      qc.invalidateQueries({ queryKey: mealPlanKeys.list() });
    },
  });
}

export function useApprovePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, body }: { planId: string; body: ApprovePlanRequest }) =>
      apiFetch<MealPlan>(`/meal-plans/${planId}/approve`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: mealPlanKeys.detail(data.id) });
      qc.invalidateQueries({ queryKey: mealPlanKeys.meals(data.id) });
      qc.invalidateQueries({ queryKey: mealPlanKeys.list() });
    },
  });
}

export function useClonePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, body }: { planId: string; body: SchedulePlanRequest }) =>
      apiFetch<MealPlan>(`/meal-plans/${planId}/clone`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mealPlanKeys.list() });
    },
  });
}

export function useSchedulePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ planId, body }: { planId: string; body: SchedulePlanRequest }) => {
      const plan = await apiFetch<MealPlan>(`/meal-plans/${planId}/schedule`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      const uid = auth.currentUser?.uid;
      if (uid) {
        await syncPlanToCalendar(uid, plan, body.scheduled_week);
      }
      return plan;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: mealPlanKeys.detail(data.id) });
      qc.invalidateQueries({ queryKey: mealPlanKeys.list() });
    },
  });
}

export function usePatchGeneratedMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      planId,
      mealId,
      body,
    }: {
      planId: string;
      mealId: string;
      body: PatchGeneratedMealRequest;
    }) =>
      apiFetch<GeneratedMeal>(`/meal-plans/${planId}/meals/${mealId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: mealPlanKeys.meals(variables.planId) });
    },
  });
}

export function useSwapMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, mealId }: { planId: string; mealId: string }) =>
      apiFetch<GeneratedMeal>(`/meal-plans/${planId}/meals/${mealId}/swap`, {
        method: "POST",
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: mealPlanKeys.meals(variables.planId) });
    },
  });
}
