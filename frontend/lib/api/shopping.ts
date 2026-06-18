import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface ShoppingList {
  id: string;
  user_id: string;
  meal_plan_id: string | null;
  items: ShoppingListItem[];
  plan_snapshot?: {
    plan_name?: string | null;
    week_start?: string;
    scheduled_week?: string | null;
    diet_type?: string;
  } | null;
  created_at: string;
  updated_at: string;
}

export interface ShoppingListItem {
  name: string;
  qty: string | null;
  category: string | null;
  checked: boolean;
}

const SHOPPING_PLAN_KEY = "nouri:active-shopping-plan";

export function getStoredShoppingPlanId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SHOPPING_PLAN_KEY);
}

export function setStoredShoppingPlanId(planId: string | null) {
  if (typeof window === "undefined") return;
  if (planId) localStorage.setItem(SHOPPING_PLAN_KEY, planId);
  else localStorage.removeItem(SHOPPING_PLAN_KEY);
}

export function useShoppingListByPlan(mealPlanId: string | null) {
  return useQuery({
    queryKey: ["shopping", "by-plan", mealPlanId],
    queryFn: () =>
      apiFetch<ShoppingList>(`/shopping?meal_plan_id=${encodeURIComponent(mealPlanId!)}`),
    enabled: !!mealPlanId,
    retry: false,
  });
}

export function useShoppingList(id: string | null) {
  return useQuery({
    queryKey: ["shopping", id],
    queryFn: () => apiFetch<ShoppingList>(`/shopping/${id}`),
    enabled: !!id,
  });
}

export function useGenerateShoppingList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (meal_plan_id: string) =>
      apiFetch<ShoppingList>("/shopping/generate", {
        method: "POST",
        body: JSON.stringify({ meal_plan_id }),
      }),
    onSuccess: (data) => {
      qc.setQueryData(["shopping", data.id], data);
      if (data.meal_plan_id) {
        qc.setQueryData(["shopping", "by-plan", data.meal_plan_id], data);
        setStoredShoppingPlanId(data.meal_plan_id);
      }
    },
  });
}

export function useToggleShoppingItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      listId,
      itemIdx,
      checked,
    }: {
      listId: string;
      itemIdx: number;
      checked: boolean;
    }) =>
      apiFetch<ShoppingList>(`/shopping/${listId}/items/${itemIdx}`, {
        method: "PATCH",
        body: JSON.stringify({ checked }),
      }),
    onSuccess: (data) => {
      qc.setQueryData(["shopping", data.id], data);
      if (data.meal_plan_id) {
        qc.setQueryData(["shopping", "by-plan", data.meal_plan_id], data);
      }
    },
  });
}

export function useDeleteShoppingList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (listId: string) =>
      apiFetch<void>(`/shopping/${listId}`, { method: "DELETE" }),
    onSuccess: (_, listId) => {
      qc.removeQueries({ queryKey: ["shopping", listId] });
    },
  });
}
