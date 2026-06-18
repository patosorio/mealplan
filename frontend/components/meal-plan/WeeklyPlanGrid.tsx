"use client";

import { useState } from "react";
import Link from "next/link";
import { activeDaysFromPlan, juiceSlotKey, mealSlotKey } from "@/lib/meal-plan-utils";
import { getDayNutrition, sumWeeklyNutrition } from "@/lib/nutrition-utils";
import type { DayName, ExtraItem, MealItem, MealPlan, MealSlot, NutritionAvg } from "@/lib/types";

interface WeeklyPlanGridProps {
  plan: MealPlan;
  onBookmark?: (meal: MealItem, day: DayName, slot: MealSlot) => Promise<void>;
  onBookmarkJuice?: (day: DayName, juiceIndex: number) => Promise<void>;
  onRegenerate?: (day: DayName) => Promise<void>;
  onSavePlan?: () => Promise<void>;
  isRegenerating?: boolean;
  isSaving?: boolean;
  savedMealIds?: Map<string, string>;
  savedJuiceKeys?: Set<string>;
  revealedDayCount?: number;
}

const DAY_SHORT: Record<DayName, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

const EXTRA_SLOT_LABELS: Record<string, string> = {
  morning_juice: "Morning Juice",
  morning_snack: "Morning Snack",
  afternoon_snack: "Afternoon Snack",
  evening_tea: "Evening Tea",
};

type CellKey = { day: DayName; slotType: "meal" | "juice" | "extra"; slot: string; index?: number };

export function WeeklyPlanGrid({
  plan,
  onBookmark,
  onBookmarkJuice,
  onRegenerate,
  onSavePlan,
  isRegenerating = false,
  isSaving = false,
  savedMealIds,
  savedJuiceKeys,
  revealedDayCount,
}: WeeklyPlanGridProps) {
  const [selected, setSelected] = useState<CellKey | null>(null);
  const [bookmarkingKey, setBookmarkingKey] = useState<string | null>(null);

  const days = plan.plan_data.days;
  const activeDays = activeDaysFromPlan(plan);
  const weeklyTotals = sumWeeklyNutrition(plan);
  const revealCount = revealedDayCount ?? activeDays.length;

  function isSlotSaved(day: DayName, slotType: "meal" | "juice" | "extra", slot: string, index?: number): boolean {
    if (slotType === "juice" && index != null) {
      return savedJuiceKeys?.has(juiceSlotKey(plan.id, day, index)) ?? false;
    }
    if (slotType === "meal") {
      return savedMealIds?.has(mealSlotKey(plan.id, day, slot)) ?? false;
    }
    return false;
  }

  // Determine row structure
  const solidSlots = (["breakfast", "lunch", "dinner"] as MealSlot[]).filter((slot) =>
    activeDays.some((d) => days[d]?.[slot] != null)
  );
  const maxJuices = Math.max(0, ...activeDays.map((d) => (days[d]?.juices ?? []).length));
  const extraSlots = [
    ...new Set(
      activeDays.flatMap((d) => (days[d]?.extras ?? []).map((e: ExtraItem) => e.slot))
    ),
  ];

  // Chronologically-ordered rows
  const rows = buildRows(days as Record<string, DayPlan>, activeDays, solidSlots, maxJuices, extraSlots);

  const weekLabel = new Date(plan.week_start + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Detail panel state — dismiss if selected day is not yet revealed
  const selDayIdx = selected?.day ? activeDays.indexOf(selected.day) : -1;
  const selDayRevealed = selDayIdx >= 0 && selDayIdx < revealCount;
  const selDay = selDayRevealed ? selected?.day : null;
  const selDayPlan = selDay ? days[selDay] : null;
  let detailMeal: MealItem | null = null;
  let detailExtra: ExtraItem | null = null;

  if (selected && selDayPlan) {
    if (selected.slotType === "meal" && selDayPlan[selected.slot as MealSlot]) {
      detailMeal = selDayPlan[selected.slot as MealSlot] as MealItem;
    } else if (selected.slotType === "juice" && selected.index != null) {
      detailMeal = selDayPlan.juices?.[selected.index] ?? null;
    } else if (selected.slotType === "extra") {
      detailExtra = (selDayPlan.extras ?? []).find(
        (e: ExtraItem) => e.slot === selected.slot
      ) ?? null;
    }
  }

  async function handleBookmark() {
    if (!selected || !selDay) return;
    const bKey = `${selDay}-${selected.slot}-${selected.index ?? ""}`;
    setBookmarkingKey(bKey);
    try {
      if (selected.slotType === "juice" && selected.index != null && onBookmarkJuice) {
        await onBookmarkJuice(selDay, selected.index);
      } else if (selected.slotType === "meal" && detailMeal && onBookmark) {
        await onBookmark(detailMeal, selDay, selected.slot as MealSlot);
      }
    } catch {
      // 409 = already saved — OK
    } finally {
      setBookmarkingKey(null);
    }
  }

  const isMealSaved =
    (selected && selDay
      ? isSlotSaved(
          selDay,
          selected.slotType === "juice" ? "juice" : selected.slotType === "meal" ? "meal" : "extra",
          selected.slot,
          selected.index
        )
      : false) || detailMeal?.source === "user_recipe";
  const savedRecipeId =
    selected?.slotType === "meal" && selDay
      ? savedMealIds?.get(mealSlotKey(plan.id, selDay, selected.slot))
      : undefined;

  return (
    <div className="space-y-4">
      {/* Interactive header — hidden when printing */}
      <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--sage)" }}>
            Week of {weekLabel}
          </p>
          <p className="font-display text-[0.8rem] font-light italic mt-0.5" style={{ color: "var(--text-muted)" }}>
            Click any meal for details
          </p>
        </div>
        <div className="flex flex-col gap-2 w-full sm:w-auto sm:items-end">
          {weeklyTotals && (
            <div className="overflow-x-auto max-w-full -mx-1 px-1">
              <div className="flex items-center gap-2 flex-nowrap min-w-max pb-0.5">
                {[
                  { label: "Cal", value: weeklyTotals.calories },
                  { label: "Protein", value: `${weeklyTotals.protein_g}g` },
                  { label: "Carbs", value: `${weeklyTotals.carbs_g}g` },
                  { label: "Fat", value: `${weeklyTotals.fat_g}g` },
                  { label: "Fibre", value: `${weeklyTotals.fiber_g}g` },
                ].map(({ label, value }) => (
                  <span
                    key={label}
                    className="font-mono text-[10px] uppercase tracking-[0.1em] px-2.5 py-1 rounded-full whitespace-nowrap"
                    style={{ background: "rgba(122,158,126,0.1)", color: "var(--sage)" }}
                  >
                    {label} {value}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
          {onSavePlan && (
            <button
              onClick={onSavePlan}
              disabled={isSaving}
              className="font-mono text-[10px] uppercase tracking-[0.15em] px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
              style={{ border: "1px solid rgba(45,74,53,0.35)", color: "var(--deep-green)" }}
            >
              {isSaving ? "Saving…" : "Save Plan"}
            </button>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="font-mono text-[10px] uppercase tracking-[0.15em] px-3 py-2 rounded-lg transition-colors"
            style={{ border: "1px solid rgba(122,158,126,0.35)", color: "var(--sage)" }}
          >
            Print / PDF
          </button>
          </div>
        </div>
      </div>

      {/* Grid + detail panel */}
      <div className="flex flex-col xl:flex-row gap-4 items-start">
        {/* Printable weekly grid only */}
        <div id="meal-plan-print" className="meal-plan-print flex-1 min-w-0 w-full">
          <div className="meal-plan-print-header">
            <p
              className="font-display text-[1.1rem] font-light"
              style={{ color: "var(--deep-green)" }}
            >
              Nouri
              {plan.name ? ` · ${plan.name}` : ""}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] mt-1" style={{ color: "var(--sage)" }}>
              Week of {weekLabel}
              {weeklyTotals && (
                <span style={{ color: "var(--text-muted)" }}>
                  {" "}
                  · {weeklyTotals.calories} kcal total · {weeklyTotals.protein_g}g protein ·{" "}
                  {weeklyTotals.fiber_g}g fibre
                </span>
              )}
            </p>
          </div>

          <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full border-collapse" style={{ minWidth: `${Math.max(560, activeDays.length * 88 + 72)}px` }}>
            <thead>
              <tr>
                {/* Row label column */}
                <th className="w-[72px]" />
                {activeDays.map((day, dayIdx) => {
                  const revealed = dayIdx < revealCount;
                  return (
                    <th key={day} className="pb-2 px-1">
                      {/* Day headers are always visible — unrevealed days show a pulse dot */}
                      <div className="flex flex-col items-center gap-1">
                        <span
                          className="font-mono text-[10px] uppercase tracking-[0.18em]"
                          style={{ color: "var(--sage)" }}
                        >
                          {DAY_SHORT[day]}
                        </span>
                        {revealed ? (
                          onRegenerate && (
                            <button
                              onClick={() => onRegenerate(day)}
                              disabled={isRegenerating}
                              title="Regenerate day"
                              className="no-print opacity-0 hover:opacity-100 transition-opacity font-mono text-[9px] px-1.5 py-0.5 rounded"
                              style={{ color: "var(--text-muted)" }}
                            >
                              ↺
                            </button>
                          )
                        ) : (
                          <span
                            className="w-1 h-1 rounded-full animate-pulse"
                            style={{ background: "var(--sage)", opacity: 0.4 }}
                          />
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const key =
                  row.kind === "meal"
                    ? row.slot
                    : row.kind === "juice"
                    ? `juice_${row.index}`
                    : row.kind === "extra"
                    ? row.slot
                    : "snacks";

                return (
                  <tr key={key}>
                    <td className="pr-2 py-1 align-middle w-[72px]">
                      {rowLabel(row)}
                    </td>

                    {activeDays.map((day, dayIdx) => {
                      const revealed = dayIdx < revealCount;

                      // Unrevealed columns show a skeleton placeholder — not invisible content
                      if (!revealed) {
                        return (
                          <td key={day} className="p-0.5">
                            <RevealingCell />
                          </td>
                        );
                      }

                      // ── Snacks row ──────────────────────────────────────
                      if (row.kind === "snacks") {
                        const snacks: string[] = days[day]?.snacks ?? [];
                        return (
                          <td key={day} className="px-0.5 pt-3 pb-1 align-top">
                            {snacks.length > 0 ? (
                              <p
                                className="font-display text-[0.7rem] font-light italic leading-snug line-clamp-2"
                                style={{ color: "var(--text-muted)" }}
                              >
                                {snacks.join(" · ")}
                              </p>
                            ) : (
                              <span style={{ color: "var(--text-muted)", opacity: 0.3, fontSize: "0.7rem" }}>—</span>
                            )}
                          </td>
                        );
                      }

                      // ── Meal row ────────────────────────────────────────
                      if (row.kind === "meal") {
                        const meal = days[day]?.[row.slot] as MealItem | null;
                        const isSelected =
                          selected?.day === day &&
                          selected?.slot === row.slot &&
                          selected?.slotType === "meal";
                        return (
                          <td key={day} className="p-0.5">
                            {meal ? (
                              <MealCell
                                meal={meal}
                                isSelected={isSelected}
                                onClick={() =>
                                  setSelected(
                                    isSelected ? null : { day, slotType: "meal", slot: row.slot }
                                  )
                                }
                              />
                            ) : (
                              <EmptyCell />
                            )}
                          </td>
                        );
                      }

                      // ── Juice row ───────────────────────────────────────
                      if (row.kind === "juice") {
                        const juice = (days[day]?.juices ?? [])[row.index] as MealItem | undefined;
                        const isSelected =
                          selected?.day === day &&
                          selected?.slotType === "juice" &&
                          selected?.index === row.index;
                        return (
                          <td key={day} className="p-0.5">
                            {juice ? (
                              <JuiceCell
                                juice={juice}
                                isSelected={isSelected}
                                onClick={() =>
                                  setSelected(
                                    isSelected
                                      ? null
                                      : { day, slotType: "juice", slot: `juice_${row.index}`, index: row.index }
                                  )
                                }
                              />
                            ) : (
                              <EmptyCell />
                            )}
                          </td>
                        );
                      }

                      // ── Extra row ───────────────────────────────────────
                      const extra = (days[day]?.extras ?? []).find(
                        (e: ExtraItem) => e.slot === row.slot
                      ) as ExtraItem | undefined;
                      const isSelected =
                        selected?.day === day &&
                        selected?.slotType === "extra" &&
                        selected?.slot === row.slot;
                      return (
                        <td key={day} className="p-0.5">
                          {extra ? (
                            <ExtraCell
                              extra={extra}
                              isSelected={isSelected}
                              onClick={() =>
                                setSelected(
                                  isSelected ? null : { day, slotType: "extra", slot: row.slot }
                                )
                              }
                            />
                          ) : (
                            <EmptyCell />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              <tr>
                <td className="pr-2 pt-3 align-top w-[72px]">
                  <span className="font-mono text-[8px] uppercase tracking-[0.12em]" style={{ color: "var(--sage)" }}>
                    Daily
                  </span>
                </td>
                {activeDays.map((day, dayIdx) => {
                  const revealed = dayIdx < revealCount;
                  const n = revealed ? getDayNutrition(plan, day) : null;
                  return (
                    <td key={`nutrition-${day}`} className="px-0.5 pt-2 pb-1 align-top">
                      {!revealed ? (
                        <div
                          className="rounded-lg animate-pulse"
                          style={{ height: "36px", background: "rgba(122,158,126,0.06)" }}
                        />
                      ) : n ? (
                        <DayNutritionStrip nutrition={n} />
                      ) : (
                        <span className="text-[0.65rem]" style={{ color: "var(--text-muted)", opacity: 0.4 }}>—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
          </div>
        </div>

        {/* Detail panel — screen only */}
        {selected && (detailMeal || detailExtra) && (
          <div
            className="no-print w-full xl:w-[220px] flex-shrink-0 p-4 rounded-[14px] space-y-3 xl:sticky xl:top-4"
            style={{
              background: selected.slotType === "juice"
                ? "rgba(232,213,163,0.15)"
                : "rgba(247,243,236,0.9)",
              border: selected.slotType === "juice"
                ? "1px solid rgba(232,213,163,0.4)"
                : "1px solid rgba(122,158,126,0.2)",
            }}
          >
            {/* Close */}
            <div className="flex items-center justify-between">
              <span
                className="font-mono text-[9px] uppercase tracking-[0.15em]"
                style={{
                  color: selected.slotType === "juice"
                    ? "#8b7035"
                    : "var(--sage)",
                }}
              >
                {selected.slotType === "juice"
                  ? `🥤 ${DAY_SHORT[selected.day]}`
                  : selected.slotType === "extra"
                  ? `${EXTRA_SLOT_LABELS[selected.slot] ?? selected.slot} · ${DAY_SHORT[selected.day]}`
                  : `${selected.slot} · ${DAY_SHORT[selected.day]}`}
              </span>
              <button
                onClick={() => setSelected(null)}
                className="p-1 rounded transition-opacity hover:opacity-60"
                style={{ color: "var(--text-muted)" }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Name */}
            <h4
              className="font-display text-[0.95rem] font-light leading-snug"
              style={{ color: "var(--deep-green)" }}
            >
              {detailMeal?.name ?? detailExtra?.name}
            </h4>

            {/* Description */}
            <p
              className="font-display text-[0.78rem] font-light italic leading-relaxed"
              style={{ color: "var(--text-muted)" }}
            >
              {detailMeal?.description ?? detailExtra?.description}
            </p>

            {/* Tags */}
            {(detailMeal?.tags ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {(detailMeal?.tags ?? []).slice(0, 4).map((tag) => (
                  <span
                    key={tag}
                    className="font-mono text-[8px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-full"
                    style={{
                      background: selected.slotType === "juice"
                        ? "rgba(232,213,163,0.3)"
                        : detailMeal?.type === "raw"
                        ? "rgba(168,197,160,0.2)"
                        : "rgba(212,149,106,0.15)",
                      color: selected.slotType === "juice"
                        ? "#8b7035"
                        : detailMeal?.type === "raw"
                        ? "var(--deep-green)"
                        : "var(--warm-brown)",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Prep time */}
            {(detailMeal?.prep_minutes ?? detailExtra?.prep_minutes) && (
              <p className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>
                {detailMeal?.prep_minutes ?? detailExtra?.prep_minutes} min
              </p>
            )}

            {/* Save to recipes — hidden when already saved or from user's own recipes */}
            {!isMealSaved && (onBookmark || onBookmarkJuice) && selected.slotType !== "extra" ? (
              <button
                onClick={handleBookmark}
                disabled={!!bookmarkingKey}
                className="w-full flex items-center justify-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] py-2 rounded-lg transition-colors"
                style={{
                  background: "rgba(45,74,53,0.08)",
                  color: "var(--sage)",
                  border: "1px solid rgba(122,158,126,0.2)",
                }}
              >
                <BookmarkIcon filled={false} />
                {bookmarkingKey ? "Saving…" : "Save to Recipes"}
              </button>
            ) : null}

            {/* View recipe link */}
            {savedRecipeId && (
              <Link
                href={`/recipes/${savedRecipeId}`}
                className="block text-center font-mono text-[10px] uppercase tracking-[0.12em] transition-opacity hover:opacity-70"
                style={{ color: "var(--sage)" }}
              >
                View recipe →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Row ordering ──────────────────────────────────────────────────────────────

/**
 * Detect which time-of-day a juice belongs to by inspecting its name + tags.
 * Returns a sort priority so rows appear in chronological order:
 *   morning (before breakfast=20) → 10
 *   pre-lunch (after breakfast, before lunch=40) → 30
 *   afternoon (after lunch, before dinner=60) → 50
 *   evening (after dinner) → 70
 */
function juiceTimePriority(juice: MealItem | undefined): number {
  if (!juice) return 99;
  const haystack = [juice.name, ...(juice.tags ?? [])].join(" ").toLowerCase();
  if (/(^|\s|_)(morning|breakfast)/i.test(haystack)) return 10;
  if (/(pre.?lunch|before.?lunch)/i.test(haystack)) return 30;
  if (/afternoon/i.test(haystack)) return 50;
  if (/(evening|night|dinner)/i.test(haystack)) return 70;
  return 99; // unknown — put at end
}

const SLOT_PRIORITY: Record<string, number> = {
  morning_snack: 15,
  breakfast: 20,
  lunch: 40,
  afternoon_snack: 55,
  dinner: 60,
  morning_juice: 10, // extra slot
  evening_tea: 75,
  snacks: 90,
};

type RowDef =
  | { kind: "meal"; slot: MealSlot }
  | { kind: "juice"; index: number; label: string; priority: number }
  | { kind: "extra"; slot: string }
  | { kind: "snacks" };

function buildRows(
  days: Record<string, DayPlan>,
  activeDays: DayName[],
  solidSlots: MealSlot[],
  maxJuices: number,
  extraSlots: string[],
): RowDef[] {
  const rows: RowDef[] = [];

  // Solid meals
  for (const slot of solidSlots) {
    rows.push({ kind: "meal", slot, });
  }

  // Juices — detect time priority from the first day that has this juice
  for (let i = 0; i < maxJuices; i++) {
    const sample = activeDays.map((d) => (days[d]?.juices ?? [])[i]).find(Boolean);
    const priority = juiceTimePriority(sample);
    const label = sample
      ? (sample.tags ?? []).find((t) =>
          /morning|pre.?lunch|afternoon|evening/i.test(t)
        ) ?? `Juice ${i + 1}`
      : `Juice ${i + 1}`;
    rows.push({ kind: "juice", index: i, label, priority });
  }

  // Extras
  for (const slot of extraSlots) {
    rows.push({ kind: "extra", slot });
  }

  // Snacks
  if (activeDays.some((d) => (days[d]?.snacks ?? []).length > 0)) {
    rows.push({ kind: "snacks" });
  }

  // Sort by time-of-day priority
  rows.sort((a, b) => {
    const pa =
      a.kind === "meal"
        ? SLOT_PRIORITY[a.slot] ?? 50
        : a.kind === "juice"
        ? a.priority
        : a.kind === "extra"
        ? SLOT_PRIORITY[a.slot] ?? 80
        : 90; // snacks
    const pb =
      b.kind === "meal"
        ? SLOT_PRIORITY[b.slot] ?? 50
        : b.kind === "juice"
        ? b.priority
        : b.kind === "extra"
        ? SLOT_PRIORITY[b.slot] ?? 80
        : 90;
    return pa - pb;
  });

  return rows;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function rowLabel(row: RowDef): React.ReactNode {
  if (row.kind === "meal") {
    return (
      <span
        className="font-mono text-[9px] uppercase tracking-[0.15em]"
        style={{ color: "var(--text-muted)" }}
      >
        {row.slot.slice(0, 5)}
      </span>
    );
  }
  if (row.kind === "juice") {
    const label = row.label.replace(/_/g, "-");
    return (
      <span
        className="font-mono text-[9px] uppercase tracking-[0.13em] leading-snug"
        style={{ color: "#8b7035" }}
      >
        🥤 {label}
      </span>
    );
  }
  if (row.kind === "extra") {
    const short = EXTRA_SLOT_LABELS[row.slot]?.split(" ")[0] ?? row.slot;
    return (
      <span
        className="font-mono text-[9px] uppercase tracking-[0.13em]"
        style={{ color: "var(--sage)" }}
      >
        {short}
      </span>
    );
  }
  return (
    <span className="font-mono text-[9px] uppercase tracking-[0.15em]" style={{ color: "var(--text-muted)" }}>
      Snacks
    </span>
  );
}

// ── Re-export DayPlan type alias for internal use ────────────────────────────
type DayPlan = {
  breakfast?: MealItem | null;
  lunch?: MealItem | null;
  dinner?: MealItem | null;
  juices?: MealItem[];
  extras?: ExtraItem[];
  snacks?: string[];
  [key: string]: unknown;
};

function MealCell({
  meal,
  isSelected,
  onClick,
}: {
  meal: MealItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  const isRaw = meal.type === "raw";
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-2 rounded-lg transition-all"
      style={{
        background: isSelected
          ? "rgba(45,74,53,0.12)"
          : isRaw
          ? "rgba(168,197,160,0.1)"
          : "rgba(247,243,236,0.8)",
        border: `1px solid ${isSelected ? "rgba(45,74,53,0.35)" : "rgba(122,158,126,0.15)"}`,
        minHeight: "72px",
      }}
    >
      <div className="flex items-start gap-1.5 mb-1.5">
        <span
          className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: isRaw ? "var(--raw-accent)" : "var(--cooked-accent)" }}
        />
        <p
          className="font-display text-[0.75rem] font-light leading-snug line-clamp-2 flex-1"
          style={{ color: "var(--deep-green)" }}
        >
          {meal.name}
        </p>
      </div>
      <div className="flex items-center gap-2" style={{ paddingLeft: "14px" }}>
        <p className="font-mono text-[9px]" style={{ color: "var(--text-muted)" }}>
          {meal.prep_minutes}m
        </p>
        {meal.source === "user_recipe" && (
          <span
            className="font-display text-[8px] px-1 rounded"
            style={{ background: "rgba(45,74,53,0.1)", color: "var(--deep-green)" }}
          >
            ★ your recipe
          </span>
        )}
      </div>
    </button>
  );
}

function JuiceCell({
  juice,
  isSelected,
  onClick,
}: {
  juice: MealItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-2 rounded-lg transition-all"
      style={{
        background: isSelected ? "rgba(232,213,163,0.3)" : "rgba(232,213,163,0.15)",
        border: `1px solid ${isSelected ? "rgba(232,213,163,0.6)" : "rgba(232,213,163,0.3)"}`,
        minHeight: "72px",
      }}
    >
      <p
        className="font-display text-[0.75rem] font-light leading-snug line-clamp-2 mb-1.5"
        style={{ color: "#8b7035" }}
      >
        {juice.name}
      </p>
      <p className="font-mono text-[9px]" style={{ color: "#a8924a" }}>
        {juice.prep_minutes}m
      </p>
    </button>
  );
}

function ExtraCell({
  extra,
  isSelected,
  onClick,
}: {
  extra: ExtraItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-2 rounded-lg transition-all"
      style={{
        background: isSelected ? "rgba(122,158,126,0.15)" : "rgba(168,197,160,0.08)",
        border: `1px solid ${isSelected ? "rgba(122,158,126,0.35)" : "rgba(122,158,126,0.12)"}`,
        minHeight: "72px",
      }}
    >
      <p
        className="font-display text-[0.75rem] font-light leading-snug line-clamp-2 mb-1.5"
        style={{ color: "var(--deep-green)" }}
      >
        {extra.name}
      </p>
      <p className="font-mono text-[9px]" style={{ color: "var(--text-muted)" }}>
        {extra.prep_minutes}m
      </p>
    </button>
  );
}

function EmptyCell() {
  return (
    <div
      className="w-full rounded-lg"
      style={{
        minHeight: "72px",
        background: "rgba(122,158,126,0.03)",
        border: "1px dashed rgba(122,158,126,0.1)",
      }}
    />
  );
}

/** Skeleton shown for a day column that hasn't been revealed yet. */
function RevealingCell() {
  return (
    <div
      className="w-full rounded-lg animate-pulse"
      style={{
        minHeight: "72px",
        background: "rgba(122,158,126,0.08)",
        border: "1px solid rgba(122,158,126,0.1)",
      }}
    />
  );
}

function DayNutritionStrip({ nutrition }: { nutrition: NutritionAvg }) {
  return (
    <div
      className="rounded-lg px-1.5 py-1.5 space-y-0.5"
      style={{ background: "rgba(122,158,126,0.08)", border: "1px solid rgba(122,158,126,0.12)" }}
    >
      <p className="font-mono text-[8px] leading-tight" style={{ color: "var(--deep-green)" }}>
        {nutrition.calories} kcal
      </p>
      <p className="font-mono text-[7px] leading-tight" style={{ color: "var(--text-muted)" }}>
        P{nutrition.protein_g} · C{nutrition.carbs_g} · F{nutrition.fat_g} · Fi{nutrition.fiber_g}
      </p>
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
