"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { DayName, ExtraItem, MealItem, MealPlan, MealSlot } from "@/lib/types";
import { DAYS } from "@/lib/types";
import { GenerateForm } from "@/components/meal-plan/GenerateForm";
import type { FormGridConfig } from "@/components/meal-plan/GenerateForm";
import { WeeklyPlanGrid } from "@/components/meal-plan/WeeklyPlanGrid";
import {
  mealPlanKeys,
  useGeneratePlan,
  useSavePlan,
  useRegenerateDay,
  useSaveFromPlan,
} from "@/lib/api/meal-plans";
import { useRecipes } from "@/lib/api/recipes";
import { buildSavedRecipeState } from "@/lib/meal-plan-utils";
import { buildGridConfig, type GridConfig } from "@/lib/types/grid";
import type { GeneratePlanRequest } from "@/lib/types";

export default function MealPlanPage() {
  const qc = useQueryClient();
  const generateMutation = useGeneratePlan();
  const savePlanMutation = useSavePlan();
  const regenerateDayMutation = useRegenerateDay();
  const saveFromPlanMutation = useSaveFromPlan();

  const [currentPlan, setCurrentPlan] = useState<MealPlan | null>(null);
  const [savedMealIds, setSavedMealIds] = useState<Map<string, string>>(new Map());
  const [savedJuiceKeys, setSavedJuiceKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [formConfig, setFormConfig] = useState<FormGridConfig>({
    planDays: 7,
    meals: ["breakfast", "lunch", "dinner"],
    extras: [],
    juicingEnabled: false,
    juiceLabels: [],
  });

  const handleConfigChange = useCallback((config: FormGridConfig) => {
    setFormConfig(config);
  }, []);

  const finalPlan = regenerateDayMutation.data ?? currentPlan ?? null;

  const gridConfig = useMemo<GridConfig>(() => {
    if (finalPlan?.plan_data?.days) {
      const dayKeys = Object.keys(finalPlan.plan_data.days) as DayName[];
      const orderedDays = DAYS.filter((d) => dayKeys.includes(d));
      const firstDay = finalPlan.plan_data.days[orderedDays[0]];
      const juiceLabels =
        firstDay?.juices?.map((j: MealItem) => {
          const tag = j.tags?.find((t: string) =>
            ["morning", "afternoon", "pre_lunch", "evening"].includes(t),
          );
          return tag ?? j.name.split("—")[0].trim();
        }) ?? [];

      return buildGridConfig({
        planDays: orderedDays.length,
        meals: ["breakfast", "lunch", "dinner"].filter(
          (m) => firstDay?.[m as keyof typeof firstDay] !== null,
        ),
        extras: firstDay?.extras?.map((e: ExtraItem) => e.slot) ?? [],
        juicingEnabled: (firstDay?.juices?.length ?? 0) > 0,
        juiceLabels,
      });
    }

    return buildGridConfig({
      planDays: formConfig.planDays,
      meals: formConfig.meals,
      extras: formConfig.extras,
      juicingEnabled: formConfig.juicingEnabled,
      juiceLabels: formConfig.juiceLabels,
    });
  }, [finalPlan, formConfig]);

  const { data: planRecipes } = useRecipes(finalPlan?.id);

  useEffect(() => {
    if (!finalPlan?.id || !planRecipes) return;
    const { savedMealIds, savedJuiceKeys } = buildSavedRecipeState(finalPlan.id, planRecipes);
    setSavedMealIds(savedMealIds);
    setSavedJuiceKeys(savedJuiceKeys);
  }, [finalPlan?.id, planRecipes]);

  async function handleGenerate(request: GeneratePlanRequest) {
    setError(null);
    setCurrentPlan(null);
    setSavedMealIds(new Map());
    setSavedJuiceKeys(new Set());

    try {
      const plan = await generateMutation.mutateAsync(request);
      setCurrentPlan(plan);
      qc.invalidateQueries({ queryKey: mealPlanKeys.list() });
    } catch {
      setError("Generation failed. Please try again.");
    }
  }

  async function handleSavePlan() {
    if (!finalPlan) return;
    try {
      await savePlanMutation.mutateAsync(finalPlan.id);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      setError("Failed to save plan.");
    }
  }

  async function handleRegenerate(day: DayName) {
    if (!finalPlan) return;
    try {
      await regenerateDayMutation.mutateAsync({ planId: finalPlan.id, day });
    } catch {
      setError("Failed to regenerate day. Please try again.");
    }
  }

  async function handleBookmark(meal: MealItem, day: DayName, slot: MealSlot) {
    if (!finalPlan) return;
    const key = `${finalPlan.id}-${day}-${slot}`;
    const saved = await saveFromPlanMutation.mutateAsync({
      planId: finalPlan.id,
      day,
      mealType: slot,
      recipeId: meal.recipe_id ?? null,
    });
    setSavedMealIds((prev) => new Map([...prev, [key, saved.id]]));
    return saved as unknown as void;
  }

  async function handleBookmarkJuice(day: DayName, juiceIndex: number, recipeId?: string | null) {
    if (!finalPlan) return;
    await saveFromPlanMutation.mutateAsync({
      planId: finalPlan.id,
      day,
      mealType: "juice",
      juiceIndex,
      recipeId: recipeId ?? null,
    });
    setSavedJuiceKeys((prev) => new Set([...prev, `${finalPlan.id}-${day}-juice_${juiceIndex}`]));
  }

  return (
    <div className="flex flex-col gap-3 md:h-full md:overflow-hidden">
      <div className="no-print flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 flex-shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 min-w-0">
          <h1
            className="font-display font-light leading-tight"
            style={{ fontSize: "clamp(1.4rem,2.5vw,1.9rem)", color: "var(--deep-green)" }}
          >
            What shall we <em className="italic" style={{ color: "var(--terracotta)" }}>cook</em> this week?
          </h1>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--sage)" }}>
            Weekly Plan
          </span>
        </div>
      </div>

      {error && (
        <div
          className="no-print flex-shrink-0 px-4 py-2.5 rounded-lg font-mono text-[11px] tracking-wide"
          style={{ background: "rgba(196,122,74,0.1)", color: "var(--terracotta)", border: "1px solid rgba(196,122,74,0.3)" }}
        >
          {error}
        </div>
      )}
      {saveSuccess && (
        <div
          className="no-print flex-shrink-0 px-4 py-2.5 rounded-lg font-mono text-[11px] tracking-wide flex items-center gap-2"
          style={{ background: "rgba(122,158,126,0.12)", color: "var(--deep-green)", border: "1px solid rgba(122,158,126,0.3)" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Plan saved —{" "}
          <a href="/history" className="underline underline-offset-2" style={{ color: "var(--sage)" }}>
            view in History
          </a>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-5 flex-1 min-h-0">
        <div
          className="no-print w-full md:w-[232px] flex-shrink-0 overflow-y-auto rounded-[14px] p-5"
          style={{ background: "white", border: "1px solid rgba(122,158,126,0.15)" }}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] mb-4" style={{ color: "var(--sage)" }}>
            Generate Plan
          </p>
          <GenerateForm
            onSubmit={handleGenerate}
            isLoading={generateMutation.isPending}
            onConfigChange={handleConfigChange}
          />
        </div>

        <div className="flex-1 min-w-0 overflow-y-auto">
          <div
            className="p-4 sm:p-5 rounded-[14px] print:p-0 print:border-0 print:bg-transparent overflow-x-auto"
            style={{ background: "white", border: "1px solid rgba(122,158,126,0.15)" }}
          >
            <WeeklyPlanGrid
              gridConfig={gridConfig}
              plan={finalPlan}
              weekStart={finalPlan?.week_start ?? ""}
              isGenerating={generateMutation.isPending}
              onBookmark={finalPlan?.id ? handleBookmark : undefined}
              onBookmarkJuice={finalPlan?.id ? handleBookmarkJuice : undefined}
              onRegenerate={finalPlan?.id ? handleRegenerate : undefined}
              onSavePlan={finalPlan?.id ? handleSavePlan : undefined}
              isRegenerating={regenerateDayMutation.isPending}
              isSaving={savePlanMutation.isPending}
              savedMealIds={savedMealIds}
              savedJuiceKeys={savedJuiceKeys}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
