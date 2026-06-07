"use client";

import { useEffect, useState } from "react";
import type { DayName, MealItem, MealSlot } from "@/lib/types";
import { GenerateForm } from "@/components/meal-plan/GenerateForm";
import { WeeklyPlanGrid } from "@/components/meal-plan/WeeklyPlanGrid";
import { LoadingSkeleton } from "@/components/meal-plan/LoadingSkeleton";
import {
  useGeneratePlan,
  useSavePlan,
  useRegenerateDay,
  useSaveFromPlan,
} from "@/lib/api/meal-plans";
import { useRecipes } from "@/lib/api/recipes";
import { buildSavedRecipeState } from "@/lib/meal-plan-utils";
import type { GeneratePlanRequest } from "@/lib/types";

export default function MealPlanPage() {
  const generateMutation = useGeneratePlan();
  const savePlanMutation = useSavePlan();
  const regenerateDayMutation = useRegenerateDay();
  const saveFromPlanMutation = useSaveFromPlan();

  const [savedMealIds, setSavedMealIds] = useState<Map<string, string>>(new Map());
  const [savedJuiceKeys, setSavedJuiceKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const plan = generateMutation.data;
  const { data: planRecipes } = useRecipes(plan?.id);

  useEffect(() => {
    if (!plan?.id || !planRecipes) return;
    const { savedMealIds, savedJuiceKeys } = buildSavedRecipeState(plan.id, planRecipes);
    setSavedMealIds(savedMealIds);
    setSavedJuiceKeys(savedJuiceKeys);
  }, [plan?.id, planRecipes]);

  async function handleGenerate(request: GeneratePlanRequest) {
    setError(null);
    try {
      await generateMutation.mutateAsync(request);
      setSavedMealIds(new Map());
      setSavedJuiceKeys(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed. Please try again.");
    }
  }

  async function handleSavePlan() {
    if (!plan) return;
    try {
      await savePlanMutation.mutateAsync(plan.id);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      setError("Failed to save plan.");
    }
  }

  async function handleRegenerate(day: DayName) {
    if (!plan) return;
    try {
      await regenerateDayMutation.mutateAsync({ planId: plan.id, day });
    } catch {
      setError("Failed to regenerate day. Please try again.");
    }
  }

  async function handleBookmark(meal: MealItem, day: DayName, slot: MealSlot) {
    if (!plan) return;
    const key = `${plan.id}-${day}-${slot}`;
    const saved = await saveFromPlanMutation.mutateAsync({
      meal_plan_id: plan.id,
      day,
      meal_type: slot,
    });
    setSavedMealIds((prev) => new Map([...prev, [key, saved.id]]));
    return saved as unknown as void;
  }

  async function handleBookmarkJuice(day: DayName, juiceIndex: number) {
    if (!plan) return;
    await saveFromPlanMutation.mutateAsync({
      meal_plan_id: plan.id,
      day,
      meal_type: "juice",
      juice_index: juiceIndex,
    });
    setSavedJuiceKeys((prev) => new Set([...prev, `${plan.id}-${day}-juice_${juiceIndex}`]));
  }

  const activePlan = regenerateDayMutation.data ?? generateMutation.data;

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden">
      {/* Compact header row */}
      <div className="no-print flex items-center justify-between gap-4 flex-shrink-0">
        <div className="flex items-baseline gap-3">
          <h1
            className="font-display font-light"
            style={{ fontSize: "clamp(1.4rem,2.5vw,1.9rem)", color: "var(--deep-green)" }}
          >
            What shall we <em className="italic" style={{ color: "var(--terracotta)" }}>cook</em> this week?
          </h1>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] hidden sm:inline" style={{ color: "var(--sage)" }}>
            Weekly Plan
          </span>
        </div>
      </div>

      {/* Error / success toasts */}
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

      {/* Two-column layout — fills remaining height */}
      <div className="flex gap-5 flex-1 min-h-0">
        {/* Sidebar — scrolls internally */}
        <div
          className="no-print w-[232px] flex-shrink-0 overflow-y-auto rounded-[14px] p-5"
          style={{ background: "white", border: "1px solid rgba(122,158,126,0.15)" }}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] mb-4" style={{ color: "var(--sage)" }}>
            Generate Plan
          </p>
          <GenerateForm onSubmit={handleGenerate} isLoading={generateMutation.isPending} />
        </div>

        {/* Main content — scrolls internally */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {generateMutation.isPending && <LoadingSkeleton />}

          {!generateMutation.isPending && activePlan && (
            <div
              className="p-5 rounded-[14px] print:p-0 print:border-0 print:bg-transparent"
              style={{ background: "white", border: "1px solid rgba(122,158,126,0.15)" }}
            >
              <WeeklyPlanGrid
                plan={activePlan}
                onBookmark={handleBookmark}
                onBookmarkJuice={handleBookmarkJuice}
                onRegenerate={handleRegenerate}
                onSavePlan={handleSavePlan}
                isRegenerating={regenerateDayMutation.isPending}
                isSaving={savePlanMutation.isPending}
                savedMealIds={savedMealIds}
                savedJuiceKeys={savedJuiceKeys}
              />
            </div>
          )}

          {!generateMutation.isPending && !activePlan && (
            <div
              className="flex flex-col items-center justify-center rounded-[14px] h-full gap-3"
              style={{ border: "1px dashed rgba(122,158,126,0.2)", minHeight: "200px" }}
            >
              <span style={{ color: "var(--raw-accent)", opacity: 0.4, fontSize: "1.5rem" }}>✦</span>
              <p
                className="font-display italic text-center max-w-xs"
                style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}
              >
                Configure your plan in the sidebar, then generate.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
