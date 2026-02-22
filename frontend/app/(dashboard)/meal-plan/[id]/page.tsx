"use client";

import Link from "next/link";
import { use, useState } from "react";
import type { DayName, MealItem, MealSlot } from "@/lib/types";
import { useMealPlan, useSaveFromPlan } from "@/lib/api/meal-plans";
import { MealPlanView } from "@/components/meal-plan/MealPlanView";
import { LoadingSkeleton } from "@/components/meal-plan/LoadingSkeleton";

export default function SavedPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: plan, isLoading, error } = useMealPlan(id);
  const saveFromPlanMutation = useSaveFromPlan();
  const [savedMealIds, setSavedMealIds] = useState<Map<string, string>>(new Map());

  async function handleBookmark(_meal: MealItem, day: DayName, slot: MealSlot) {
    const saved = await saveFromPlanMutation.mutateAsync({
      meal_plan_id: id,
      day,
      meal_type: slot,
    });
    setSavedMealIds((prev) => new Map([...prev, [`${id}-${day}-${slot}`, saved.id]]));
  }

  if (isLoading) {
    return (
      <div className="space-y-8">
        <BackLink />
        <LoadingSkeleton />
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="space-y-8">
        <BackLink />
        <div
          className="px-5 py-3 rounded-lg font-mono text-[11px] tracking-wide"
          style={{
            background: "rgba(196,122,74,0.1)",
            color: "var(--terracotta)",
            border: "1px solid rgba(196,122,74,0.3)",
          }}
        >
          Could not load this plan. It may have been deleted.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <BackLink />
          <p
            className="font-mono text-[11px] uppercase tracking-[0.2em] mt-4 mb-3"
            style={{ color: "var(--sage)" }}
          >
            Saved Plan
          </p>
          <h1
            className="font-display font-light leading-tight"
            style={{ fontSize: "clamp(2rem,4vw,3rem)", color: "var(--deep-green)" }}
          >
            Your <em className="italic" style={{ color: "var(--terracotta)" }}>saved</em> week
          </h1>
        </div>
      </div>

      <MealPlanView
        plan={plan}
        onBookmark={handleBookmark}
        savedMealIds={savedMealIds}
      />
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/history"
      className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] transition-opacity hover:opacity-70"
      style={{ color: "var(--sage)" }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <polyline points="15 18 9 12 15 6" />
      </svg>
      Back to history
    </Link>
  );
}
