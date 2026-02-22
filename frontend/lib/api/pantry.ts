import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface PantryItem {
  id: string;
  user_id: string;
  name: string;
  quantity: string | null;
  category: string | null;
  added_at: string;
}

export interface PantryItemCreate {
  name: string;
  quantity?: string;
  category?: string;
}

export function usePantry() {
  return useQuery({
    queryKey: ["pantry"],
    queryFn: () => apiFetch<PantryItem[]>("/pantry"),
  });
}

export function useAddPantryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PantryItemCreate) =>
      apiFetch<PantryItem>("/pantry", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pantry"] });
    },
  });
}

export function useDeletePantryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/pantry/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pantry"] });
    },
  });
}

export function useClearPantry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ deleted: number }>("/pantry", { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pantry"] });
    },
  });
}
