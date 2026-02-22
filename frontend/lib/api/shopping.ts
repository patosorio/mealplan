import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface ShoppingList {
  id: string;
  user_id: string;
  meal_plan_id: string | null;
  items: ShoppingListItem[];
  created_at: string;
  updated_at: string;
}

export interface ShoppingListItem {
  name: string;
  qty: string | null;
  category: string | null;
  checked: boolean;
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
