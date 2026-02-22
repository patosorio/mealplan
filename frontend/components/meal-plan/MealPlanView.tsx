"use client";

import { useState } from "react";
import type { DayName, MealItem, MealPlan, MealSlot } from "@/lib/types";
import { DAYS } from "@/lib/types";
import { MealCard } from "./MealCard";
import { DayTabs } from "./DayTabs";
import { NutritionStrip } from "./NutritionStrip";

interface MealPlanViewProps {
  plan: MealPlan;
  onBookmark?: (meal: MealItem, day: DayName, slot: MealSlot) => Promise<void>;
  onRegenerate?: (day: DayName) => Promise<void>;
  onSavePlan?: () => Promise<void>;
  isRegenerating?: boolean;
  isSaving?: boolean;
  savedMealIds?: Map<string, string>;
}

export function MealPlanView({
  plan,
  onBookmark,
  onRegenerate,
  onSavePlan,
  isRegenerating = false,
  isSaving = false,
  savedMealIds,
}: MealPlanViewProps) {
  const [activeDay, setActiveDay] = useState<DayName>(DAYS[0]);

  const days = plan.plan_data.days;
  const dayPlan = days[activeDay];

  if (!dayPlan) {
    return (
      <p className="font-display italic text-center py-8" style={{ color: "var(--text-muted)" }}>
        No data for {activeDay}.
      </p>
    );
  }

  const weekLabel = new Date(plan.week_start + "T00:00:00").toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "long", year: "numeric" }
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] mb-1" style={{ color: "var(--sage)" }}>
            Week of {weekLabel}
          </p>
          <h2
            className="font-display font-light leading-tight"
            style={{ fontSize: "clamp(1.6rem,3vw,2.2rem)", color: "var(--deep-green)" }}
          >
            Your <em className="italic" style={{ color: "var(--terracotta)" }}>Personalised</em> Plan
          </h2>
        </div>

        {onSavePlan && (
          <button
            onClick={onSavePlan}
            disabled={isSaving}
            className="font-mono text-[11px] uppercase tracking-[0.15em] px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50"
            style={{
              border: "1px solid rgba(45,74,53,0.4)",
              color: "var(--deep-green)",
            }}
          >
            {isSaving ? "Saving…" : "Save Plan"}
          </button>
        )}
      </div>

      {/* Nutrition strip */}
      <NutritionStrip nutrition={plan.nutrition_avg} />

      {/* Day tabs */}
      <DayTabs
        activeDay={activeDay}
        onSelect={setActiveDay}
        onRegenerate={onRegenerate ? (day) => onRegenerate(day) : undefined}
        isRegenerating={isRegenerating}
      />

      {/* Meal cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {(["breakfast", "lunch", "dinner"] as MealSlot[]).map((slot) => {
          const meal = dayPlan[slot];
          if (!meal) return null;
          const key = `${plan.id}-${activeDay}-${slot}`;
          const savedRecipeId = savedMealIds?.get(key);
          return (
            <MealCard
              key={slot}
              meal={meal}
              slot={slot}
              day={activeDay}
              planId={plan.id}
              onBookmark={onBookmark}
              isBookmarked={!!savedRecipeId}
              savedRecipeId={savedRecipeId}
            />
          );
        })}
      </div>

      {/* Snacks */}
      {dayPlan.snacks.length > 0 && (
        <div
          className="px-5 py-4 rounded-[14px]"
          style={{ background: "rgba(168,197,160,0.12)", border: "1px solid rgba(168,197,160,0.2)" }}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] mb-2" style={{ color: "var(--sage)" }}>
            Snacks
          </p>
          <div className="flex flex-wrap gap-2">
            {dayPlan.snacks.map((snack, i) => (
              <span
                key={i}
                className="font-display text-[0.875rem] font-light italic"
                style={{ color: "var(--text-muted)" }}
              >
                {i > 0 && <span className="mr-2" style={{ color: "var(--raw-accent)" }}>·</span>}
                {snack}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
