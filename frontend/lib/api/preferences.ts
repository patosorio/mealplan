import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface UserPreferences {
  id: string;
  user_id: string;
  diet_type: string;
  calories_target: number;
  excluded_ingredients: string[];
  preferences_text: string | null;
  updated_at: string;
}

export interface UserPreferencesUpdate {
  diet_type?: string;
  calories_target?: number;
  excluded_ingredients?: string[];
  preferences_text?: string | null;
}

export function usePreferences() {
  return useQuery({
    queryKey: ["preferences"],
    queryFn: () => apiFetch<UserPreferences>("/users/preferences"),
  });
}

export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UserPreferencesUpdate) =>
      apiFetch<UserPreferences>("/users/preferences", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["preferences"] });
    },
  });
}
