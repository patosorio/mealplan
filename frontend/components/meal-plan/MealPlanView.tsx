"use client";

import { useState } from "react";
import type { DayName, ExtraItem, MealItem, MealPlan, MealSlot } from "@/lib/types";
import { DAYS } from "@/lib/types";
import { MealCard } from "./MealCard";
import { DayTabs } from "./DayTabs";
import { NutritionStrip } from "./NutritionStrip";

interface MealPlanViewProps {
  plan: MealPlan;
  onBookmark?: (meal: MealItem, day: DayName, slot: MealSlot) => Promise<void>;
  onBookmarkJuice?: (day: DayName, juiceIndex: number) => Promise<void>;
  onRegenerate?: (day: DayName) => Promise<void>;
  onSavePlan?: () => Promise<void>;
  isRegenerating?: boolean;
  isSaving?: boolean;
  savedMealIds?: Map<string, string>;
  savedJuiceKeys?: Set<string>;
}

const EXTRA_SLOT_LABELS: Record<string, string> = {
  morning_juice: "Morning Juice",
  morning_snack: "Morning Snack",
  afternoon_snack: "Afternoon Snack",
  evening_tea: "Evening Tea",
};

export function MealPlanView({
  plan,
  onBookmark,
  onBookmarkJuice,
  onRegenerate,
  onSavePlan,
  isRegenerating = false,
  isSaving = false,
  savedMealIds,
  savedJuiceKeys,
}: MealPlanViewProps) {
  const [activeDay, setActiveDay] = useState<DayName>(DAYS[0]);
  const [nutritionMode, setNutritionMode] = useState<"weekly" | "daily">("weekly");

  const days = plan.plan_data.days;
  const dayPlan = days[activeDay];
  const dailyNutrition = plan.plan_data.nutrition_by_day?.[activeDay] ?? null;

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

  const hasJuices = dayPlan.juices && dayPlan.juices.length > 0;
  const hasExtras = dayPlan.extras && dayPlan.extras.length > 0;
  const solidMeals = (["breakfast", "lunch", "dinner"] as MealSlot[]).filter(
    (slot) => dayPlan[slot] != null
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
            style={{ border: "1px solid rgba(45,74,53,0.4)", color: "var(--deep-green)" }}
          >
            {isSaving ? "Saving…" : "Save Plan"}
          </button>
        )}
      </div>

      {/* Nutrition strip */}
      <NutritionStrip
        nutrition={plan.nutrition_avg}
        dailyNutrition={dailyNutrition}
        mode={nutritionMode}
        onModeChange={dailyNutrition ? setNutritionMode : undefined}
        activeDay={activeDay}
      />

      {/* Day tabs */}
      <DayTabs
        activeDay={activeDay}
        onSelect={setActiveDay}
        onRegenerate={onRegenerate ? (day) => onRegenerate(day) : undefined}
        isRegenerating={isRegenerating}
      />

      {/* ── Juicing mode banner ─────────────────────────────────────────── */}
      {hasJuices && solidMeals.length === 0 && (
        <div
          className="px-4 py-3 rounded-[14px] flex items-center gap-2"
          style={{ background: "rgba(232,213,163,0.2)", border: "1px solid rgba(232,213,163,0.4)" }}
        >
          <span className="text-base">🥤</span>
          <p className="font-mono text-[10px] uppercase tracking-[0.15em]" style={{ color: "#8b7035" }}>
            Juice day — no solid meals
          </p>
        </div>
      )}

      {/* ── Juice slots ────────────────────────────────────────────────── */}
      {hasJuices && (
        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: "#8b7035" }}>
            Juices
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {dayPlan.juices.map((juice, i) => (
              <JuiceCard
                key={i}
                juice={juice}
                juiceIndex={i}
                day={activeDay}
                planId={plan.id}
                onBookmark={onBookmarkJuice}
                isSaved={savedJuiceKeys?.has(`${plan.id}-${activeDay}-juice_${i}`)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Solid meal cards ────────────────────────────────────────────── */}
      {solidMeals.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          {solidMeals.map((slot) => {
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
      )}

      {/* ── Extras ─────────────────────────────────────────────────────── */}
      {hasExtras && (
        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--sage)" }}>
            Add-ons
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {dayPlan.extras.map((extra, i) => (
              <ExtraCard key={i} extra={extra} />
            ))}
          </div>
        </div>
      )}

      {/* ── Snacks ─────────────────────────────────────────────────────── */}
      {dayPlan.snacks && dayPlan.snacks.length > 0 && (
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

function JuiceCard({
  juice,
  juiceIndex,
  day,
  planId,
  onBookmark,
  isSaved = false,
}: {
  juice: MealItem;
  juiceIndex: number;
  day: DayName;
  planId: string;
  onBookmark?: (day: DayName, juiceIndex: number) => Promise<void>;
  isSaved?: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(isSaved);
  const [justSaved, setJustSaved] = useState(false);

  async function handleSave() {
    if (saved || !onBookmark) return;
    setSaving(true);
    try {
      await onBookmark(day, juiceIndex);
      setSaved(true);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch (err) {
      if (err instanceof Error && err.message.includes("409")) setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="p-4 rounded-[14px]"
      style={{ background: "rgba(232,213,163,0.15)", border: "1px solid rgba(232,213,163,0.35)" }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.15em]" style={{ color: "#8b7035" }}>
          <span>🥤</span>
          Juice
        </div>
        {onBookmark && (
          <button
            onClick={handleSave}
            disabled={saved || saving}
            aria-label={saved ? "Saved" : "Save to recipes"}
            className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.1em] transition-all disabled:cursor-default"
            style={{
              color: justSaved ? "var(--deep-green)" : saved ? "var(--terracotta)" : "#8b7035",
              opacity: saving ? 0.6 : 1,
            }}
          >
            <BookmarkIcon filled={saved} />
            {saving ? "…" : justSaved ? "Saved!" : saved ? "Saved" : "Save"}
          </button>
        )}
      </div>
      <h4 className="font-display text-[1rem] font-light leading-snug mb-1" style={{ color: "var(--deep-green)" }}>
        {juice.name}
      </h4>
      <p className="font-display text-[0.8rem] font-light italic leading-relaxed" style={{ color: "var(--text-muted)" }}>
        {juice.description}
      </p>
      <div className="flex flex-wrap gap-1 mt-2">
        {juice.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="font-mono text-[9px] uppercase tracking-[0.1em] px-2 py-0.5 rounded-full"
            style={{ background: "rgba(232,213,163,0.3)", color: "#8b7035" }}
          >
            {tag}
          </span>
        ))}
      </div>
      {juice.prep_minutes > 0 && (
        <p className="font-mono text-[10px] mt-2" style={{ color: "var(--text-muted)" }}>
          {juice.prep_minutes} min
        </p>
      )}
    </div>
  );
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ExtraCard({ extra }: { extra: ExtraItem }) {
  const isJuice = extra.type === "juice";
  const EXTRA_SLOT_LABELS_MAP: Record<string, string> = {
    morning_juice: "Morning Juice",
    morning_snack: "Morning Snack",
    afternoon_snack: "Afternoon Snack",
    evening_tea: "Evening Tea",
  };
  return (
    <div
      className="p-4 rounded-[14px]"
      style={{
        background: isJuice ? "rgba(232,213,163,0.12)" : "rgba(168,197,160,0.1)",
        border: `1px solid ${isJuice ? "rgba(232,213,163,0.3)" : "rgba(168,197,160,0.2)"}`,
      }}
    >
      <p
        className="font-mono text-[10px] uppercase tracking-[0.15em] mb-2"
        style={{ color: isJuice ? "#8b7035" : "var(--sage)" }}
      >
        {EXTRA_SLOT_LABELS_MAP[extra.slot] ?? extra.slot}
      </p>
      <h4
        className="font-display text-[0.95rem] font-light leading-snug mb-1"
        style={{ color: "var(--deep-green)" }}
      >
        {extra.name}
      </h4>
      <p
        className="font-display text-[0.8rem] font-light italic leading-relaxed"
        style={{ color: "var(--text-muted)" }}
      >
        {extra.description}
      </p>
      {extra.prep_minutes > 0 && (
        <p className="font-mono text-[10px] mt-2" style={{ color: "var(--text-muted)" }}>
          {extra.prep_minutes} min
        </p>
      )}
    </div>
  );
}
