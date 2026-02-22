"use client";

import { useState } from "react";
import type { DayName, MealItem, MealSlot } from "@/lib/types";
import { GenerateForm } from "@/components/meal-plan/GenerateForm";
import { MealPlanView } from "@/components/meal-plan/MealPlanView";
import { LoadingSkeleton } from "@/components/meal-plan/LoadingSkeleton";
import {
  useGeneratePlan,
  useSavePlan,
  useRegenerateDay,
  useSaveFromPlan,
} from "@/lib/api/meal-plans";
import type { GeneratePlanRequest } from "@/lib/types";

export default function MealPlanPage() {
  const generateMutation = useGeneratePlan();
  const savePlanMutation = useSavePlan();
  const regenerateDayMutation = useRegenerateDay();
  const saveFromPlanMutation = useSaveFromPlan();

  const [savedMealIds, setSavedMealIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const plan = generateMutation.data;

  async function handleGenerate(request: GeneratePlanRequest) {
    setError(null);
    try {
      await generateMutation.mutateAsync(request);
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
    await saveFromPlanMutation.mutateAsync({
      meal_plan_id: plan.id,
      day,
      meal_type: slot,
    });
    setSavedMealIds((prev) => new Set([...prev, key]));
  }

  // Use the regenerated plan data if available
  const activePlan = regenerateDayMutation.data ?? generateMutation.data;

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] mb-3" style={{ color: "var(--sage)" }}>
          Weekly Meal Plan
        </p>
        <h1
          className="font-display font-light leading-tight"
          style={{ fontSize: "clamp(2rem,4vw,3rem)", color: "var(--deep-green)" }}
        >
          What shall we <em className="italic" style={{ color: "var(--terracotta)" }}>cook</em> this week?
        </h1>
      </div>

      {/* Error */}
      {error && (
        <div
          className="px-5 py-3 rounded-lg font-mono text-[11px] tracking-wide"
          style={{ background: "rgba(196,122,74,0.1)", color: "var(--terracotta)", border: "1px solid rgba(196,122,74,0.3)" }}
        >
          {error}
        </div>
      )}

      {/* Save success toast */}
      {saveSuccess && (
        <div
          className="px-5 py-3 rounded-lg font-mono text-[11px] tracking-wide flex items-center gap-2"
          style={{ background: "rgba(122,158,126,0.12)", color: "var(--deep-green)", border: "1px solid rgba(122,158,126,0.3)" }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Plan saved — find it in{" "}
          <a href="/history" className="underline underline-offset-2" style={{ color: "var(--sage)" }}>
            History
          </a>
        </div>
      )}

      {/* Content layout */}
      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        {/* Generate form sidebar */}
        <div
          className="p-6 rounded-[14px] h-fit"
          style={{ background: "white", border: "1px solid rgba(122,158,126,0.15)" }}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] mb-5" style={{ color: "var(--sage)" }}>
            Generate Plan
          </p>
          <GenerateForm
            onSubmit={handleGenerate}
            isLoading={generateMutation.isPending}
          />
        </div>

        {/* Plan display */}
        <div>
          {generateMutation.isPending && <LoadingSkeleton />}

          {!generateMutation.isPending && activePlan && (
            <MealPlanView
              plan={activePlan}
              onBookmark={handleBookmark}
              onRegenerate={handleRegenerate}
              onSavePlan={handleSavePlan}
              isRegenerating={regenerateDayMutation.isPending}
              isSaving={savePlanMutation.isPending}
              savedMealIds={savedMealIds}
            />
          )}

          {!generateMutation.isPending && !activePlan && (
            <div
              className="flex flex-col items-center justify-center h-64 rounded-[14px] gap-3"
              style={{ border: "1px dashed rgba(122,158,126,0.3)" }}
            >
              <span className="text-2xl" style={{ color: "var(--raw-accent)" }}>✦</span>
              <p className="font-display italic text-center" style={{ color: "var(--text-muted)", fontSize: "1rem" }}>
                Fill in the form and generate your personalised plan.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
