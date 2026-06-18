"use client";

import { useState } from "react";
import type { ExtraSlot, GeneratePlanRequest, JuiceEntry, JuicingConfig, MealSlot, RecipeUsagePolicyMode } from "@/lib/types";
import { DIET_OPTIONS, RAW_COOKED_OPTIONS, type DietType, type RawCookedRatio } from "@/lib/diet-types";
import {
  formatWeekLabel,
  getDefaultWeekStart,
  snapToMonday,
} from "@/lib/meal-plan-utils";

interface GenerateFormProps {
  onSubmit: (request: GeneratePlanRequest) => void;
  isLoading?: boolean;
}

const EXTRA_OPTIONS: { slot: ExtraSlot; label: string; hint: string }[] = [
  { slot: "morning_juice", label: "Morning juice", hint: "cold-pressed" },
  { slot: "morning_snack", label: "Morning snack", hint: "light raw" },
  { slot: "afternoon_snack", label: "Afternoon snack", hint: "sustaining" },
  { slot: "evening_tea", label: "Evening tea", hint: "herbal" },
];

const JUICE_SIZE_OPTIONS: { oz: 8 | 16 | 24 | 32; label: string }[] = [
  { oz: 8, label: "8oz / 250ml" },
  { oz: 16, label: "16oz / 500ml" },
  { oz: 24, label: "24oz / 750ml" },
  { oz: 32, label: "32oz / 1L" },
];

const JUICE_LABEL_PRESETS = ["Morning", "Pre-lunch", "Afternoon", "Evening"];

type Tab = "setup" | "extras" | "juicing";

function emptyJuice(): JuiceEntry {
  return { label: "Morning", size_oz: 16, size_label: "16oz / 500ml" };
}

export function GenerateForm({ onSubmit, isLoading = false }: GenerateFormProps) {
  const [tab, setTab] = useState<Tab>("setup");

  // Setup tab state
  const [dietType, setDietType] = useState<DietType>("raw_vegan_80_20");
  const [rawCookedRatio, setRawCookedRatio] = useState<RawCookedRatio>("80_20");
  const [weekStart, setWeekStart] = useState(getDefaultWeekStart);
  const [planDays, setPlanDays] = useState(7);
  const [caloriesTarget, setCaloriesTarget] = useState(1800);
  const [excludeText, setExcludeText] = useState("");
  const [preferencesText, setPreferencesText] = useState("");
  const [recipeMode, setRecipeMode] = useState<RecipeUsagePolicyMode>("balanced");
  const [repeatSlots, setRepeatSlots] = useState<string[]>([]);
  const [usePantry, setUsePantry] = useState(true);

  // Extras tab state
  const [selectedExtras, setSelectedExtras] = useState<ExtraSlot[]>([]);

  // Juicing tab state
  const [juicingMode, setJuicingMode] = useState(false);
  const [juices, setJuices] = useState<JuiceEntry[]>([emptyJuice()]);
  const [solidMeals, setSolidMeals] = useState<MealSlot[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});

  function toggleExtra(slot: ExtraSlot) {
    setSelectedExtras((prev) =>
      prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot]
    );
  }

  function toggleSolidMeal(meal: MealSlot) {
    setSolidMeals((prev) =>
      prev.includes(meal) ? prev.filter((m) => m !== meal) : [...prev, meal]
    );
  }

  function addJuice() {
    setJuices((prev) => [...prev, emptyJuice()]);
  }

  function removeJuice(i: number) {
    setJuices((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateJuice(i: number, patch: Partial<JuiceEntry>) {
    setJuices((prev) =>
      prev.map((j, idx) => {
        if (idx !== i) return j;
        const updated = { ...j, ...patch };
        if (patch.size_oz) {
          updated.size_label =
            JUICE_SIZE_OPTIONS.find((o) => o.oz === patch.size_oz)?.label ?? updated.size_label;
        }
        return updated;
      })
    );
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (caloriesTarget < 1000 || caloriesTarget > 4000) {
      errs.calories = "Must be 1000–4000 kcal.";
    }
    if (preferencesText.length > 500) {
      errs.preferences = "Max 500 characters.";
    }
    if (juicingMode && juices.length === 0) {
      errs.juices = "Add at least one juice.";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const excludeIngredients = excludeText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 30);

    const juicingConfig: JuicingConfig | null = juicingMode
      ? { juices, solid_meals: solidMeals }
      : null;

    onSubmit({
      diet_type: dietType,
      raw_cooked_ratio: rawCookedRatio,
      calories_target: caloriesTarget,
      meals_per_day: juicingMode
        ? solidMeals
        : (["breakfast", "lunch", "dinner"] as MealSlot[]),
      use_own_recipes: recipeMode !== "prefer_new",
      use_pantry: usePantry,
      exclude_ingredients: excludeIngredients,
      preferences_text: preferencesText.trim() || undefined,
      week_start: weekStart,
      plan_days: planDays,
      recipe_usage_policy: {
        mode: recipeMode,
        flexible_repeat_slots: repeatSlots,
        ingredient_coherence: true,
      },
      extras: selectedExtras.length > 0 ? selectedExtras : undefined,
      juicing_config: juicingConfig,
    });
  }

  // Indicator dots for tabs with active choices
  const extrasActive = selectedExtras.length > 0;
  const juicingActive = juicingMode;

  const TABS: { id: Tab; label: string; dot?: boolean }[] = [
    { id: "setup", label: "Setup" },
    { id: "extras", label: "Add-ons", dot: extrasActive },
    { id: "juicing", label: "Juicing", dot: juicingActive },
  ];

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Tab strip */}
      <div
        className="flex rounded-lg p-0.5 gap-0.5"
        style={{ background: "rgba(122,158,126,0.1)" }}
      >
        {TABS.map(({ id, label, dot }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className="flex-1 relative py-2 rounded-md font-mono text-[10px] uppercase tracking-[0.12em] transition-all"
            style={{
              background: tab === id ? "white" : "transparent",
              color: tab === id ? "var(--deep-green)" : "var(--sage)",
              boxShadow: tab === id ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            }}
          >
            {label}
            {dot && (
              <span
                className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
                style={{ background: "var(--terracotta)" }}
              />
            )}
          </button>
        ))}
      </div>

      {/* ── Setup tab ──────────────────────────────────────────────────── */}
      {tab === "setup" && (
        <div className="space-y-4">
          <Field label="Diet Style">
            <select
              value={dietType}
              onChange={(e) => setDietType(e.target.value as DietType)}
              className="w-full px-4 py-3 rounded-lg font-display text-[0.875rem] outline-none transition-colors"
              style={inputStyle}
            >
              {DIET_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Raw / Cooked Ratio">
            <select
              value={rawCookedRatio}
              onChange={(e) => setRawCookedRatio(e.target.value as RawCookedRatio)}
              className="w-full px-4 py-3 rounded-lg font-display text-[0.875rem] outline-none transition-colors"
              style={inputStyle}
            >
              {RAW_COOKED_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Plan week" hint="starts Monday">
            <input
              type="date"
              value={weekStart}
              onChange={(e) => setWeekStart(snapToMonday(e.target.value))}
              className="w-full px-4 py-3 rounded-lg font-display text-[0.875rem] outline-none transition-colors"
              style={inputStyle}
            />
            <p className="font-mono text-[9px] tracking-wide mt-1" style={{ color: "var(--text-muted)" }}>
              Week of {formatWeekLabel(weekStart)}
            </p>
          </Field>

          <Field label="Plan length" hint="4–7 days">
            <select
              value={planDays}
              onChange={(e) => setPlanDays(parseInt(e.target.value, 10))}
              className="w-full px-4 py-3 rounded-lg font-display text-[0.875rem] outline-none transition-colors"
              style={inputStyle}
            >
              {[4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>{n} days</option>
              ))}
            </select>
          </Field>

          <Field label="Daily Calories" error={errors.calories}>
            <input
              type="number"
              value={caloriesTarget}
              onChange={(e) => setCaloriesTarget(parseInt(e.target.value, 10) || 1800)}
              min={1000}
              max={4000}
              step={50}
              className="w-full px-4 py-3 rounded-lg font-display text-[0.875rem] outline-none"
              style={{ ...inputStyle, borderColor: errors.calories ? "var(--terracotta)" : "rgba(122,158,126,0.3)" }}
            />
          </Field>

          <Field label="Exclude Ingredients" hint="comma-separated">
            <input
              type="text"
              value={excludeText}
              onChange={(e) => setExcludeText(e.target.value)}
              placeholder="nuts, seeds, avocado…"
              className="w-full px-4 py-3 rounded-lg font-display text-[0.875rem] outline-none"
              style={inputStyle}
            />
          </Field>

          <Field label="Notes" error={errors.preferences}>
            <textarea
              value={preferencesText}
              onChange={(e) => setPreferencesText(e.target.value)}
              placeholder="Thai flavours, quick breakfasts…"
              rows={2}
              maxLength={500}
              className="w-full px-4 py-3 rounded-lg font-display text-[0.875rem] outline-none resize-none"
              style={{ ...inputStyle, borderColor: errors.preferences ? "var(--terracotta)" : "rgba(122,158,126,0.3)" }}
            />
          </Field>

          {/* Recipe usage policy */}
          <div className="space-y-2 pt-1">
            <label className="block font-display text-[0.8rem] font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              Recipes
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setRecipeMode("prefer_new")}
                className="p-3 rounded-lg border text-center transition-colors font-display"
                style={{
                  borderColor: recipeMode === "prefer_new" ? "rgba(122,158,126,0.6)" : "rgba(122,158,126,0.2)",
                  background: recipeMode === "prefer_new" ? "rgba(122,158,126,0.15)" : "transparent",
                  color: recipeMode === "prefer_new" ? "var(--deep-green)" : "var(--text-muted)",
                }}
              >
                <div className="text-[0.8rem]">New recipes</div>
                <div className="text-[0.65rem] opacity-0 mt-0.5">·</div>
              </button>
              <button
                type="button"
                onClick={() => setRecipeMode("balanced")}
                className="p-3 rounded-lg border text-center transition-colors font-display"
                style={{
                  borderColor: recipeMode === "balanced" ? "rgba(122,158,126,0.6)" : "rgba(122,158,126,0.2)",
                  background: recipeMode === "balanced" ? "rgba(122,158,126,0.15)" : "transparent",
                  color: recipeMode === "balanced" ? "var(--deep-green)" : "var(--text-muted)",
                }}
              >
                <div className="text-[0.8rem]">Mix</div>
                <div className="text-[0.65rem] opacity-70 mt-0.5">(rec.)</div>
              </button>
              <button
                type="button"
                onClick={() => setRecipeMode("prefer_saved")}
                className="p-3 rounded-lg border text-center transition-colors font-display"
                style={{
                  borderColor: recipeMode === "prefer_saved" ? "rgba(122,158,126,0.6)" : "rgba(122,158,126,0.2)",
                  background: recipeMode === "prefer_saved" ? "rgba(122,158,126,0.15)" : "transparent",
                  color: recipeMode === "prefer_saved" ? "var(--deep-green)" : "var(--text-muted)",
                }}
              >
                <div className="text-[0.8rem]">My recipes</div>
                <div className="text-[0.65rem] opacity-0 mt-0.5">·</div>
              </button>
            </div>

            {/* Repeat slots — always mounted; invisible when prefer_new */}
            <div className="min-h-[5.75rem] pt-1">
              <div
                className="space-y-1"
                style={{
                  visibility: recipeMode !== "prefer_new" ? "visible" : "hidden",
                  pointerEvents: recipeMode !== "prefer_new" ? "auto" : "none",
                }}
              >
                <label className="block font-display text-[0.75rem]" style={{ color: "var(--text-muted)" }}>
                  Okay to occasionally reuse in:
                </label>
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      { value: "breakfast", label: "Breakfast" },
                      { value: "morning_juice", label: "Morning juice" },
                      { value: "lunch", label: "Lunch" },
                      { value: "dinner", label: "Dinner" },
                      { value: "snack", label: "Snack" },
                    ] as { value: string; label: string }[]
                  ).map(({ value, label }) => {
                    const active = repeatSlots.includes(value);
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() =>
                          setRepeatSlots((prev) =>
                            active ? prev.filter((s) => s !== value) : [...prev, value]
                          )
                        }
                        className="px-2 py-1 rounded-full font-display text-[0.72rem] transition-colors"
                        style={{
                          background: active ? "var(--green-mid)" : "rgba(122,158,126,0.1)",
                          color: active ? "#fff" : "var(--text-muted)",
                          border: active ? "1px solid var(--green-mid)" : "1px solid transparent",
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <p className="font-mono text-[9px] leading-relaxed mt-0.5" style={{ color: "var(--text-muted)", opacity: 0.7 }}>
                  Claude may reuse a saved recipe in these slots but won&apos;t repeat it every day.
                </p>
              </div>
            </div>
          </div>

          <Toggle label="My pantry" checked={usePantry} onChange={setUsePantry} />
        </div>
      )}

      {/* ── Add-ons tab ─────────────────────────────────────────────────── */}
      {tab === "extras" && (
        <div className="space-y-3">
          <p className="font-display text-[0.85rem] font-light italic" style={{ color: "var(--text-muted)" }}>
            Add structured snacks or drinks alongside your meals.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {EXTRA_OPTIONS.map(({ slot, label, hint }) => {
              const active = selectedExtras.includes(slot);
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => toggleExtra(slot)}
                  className="flex flex-col items-start p-3 rounded-lg transition-colors text-left"
                  style={{
                    background: active ? "rgba(122,158,126,0.15)" : "rgba(247,243,236,0.8)",
                    border: `1px solid ${active ? "rgba(122,158,126,0.4)" : "rgba(122,158,126,0.2)"}`,
                  }}
                >
                  <span
                    className="font-mono text-[10px] uppercase tracking-[0.12em]"
                    style={{ color: active ? "var(--deep-green)" : "var(--sage)" }}
                  >
                    {label}
                  </span>
                  <span
                    className="font-display text-[0.75rem] font-light italic mt-0.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {hint}
                  </span>
                  {active && (
                    <span
                      className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.1em]"
                      style={{ color: "var(--terracotta)" }}
                    >
                      ✓ On
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {selectedExtras.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedExtras([])}
              className="font-mono text-[10px] uppercase tracking-[0.12em] transition-opacity hover:opacity-70"
              style={{ color: "var(--text-muted)" }}
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {/* ── Juicing tab ─────────────────────────────────────────────────── */}
      {tab === "juicing" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.15em]" style={{ color: "#8b7035" }}>
                Juicing Mode
              </p>
              <p className="font-display text-[0.8rem] font-light italic mt-0.5" style={{ color: "var(--text-muted)" }}>
                Replace meals with a juice schedule
              </p>
            </div>
            <Toggle label="" checked={juicingMode} onChange={setJuicingMode} />
          </div>

          {juicingMode && (
            <>
              <div className="space-y-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
                  Juice schedule
                </p>
                {juices.map((juice, i) => (
                  <div key={i} className="flex items-center gap-1.5 flex-wrap">
                    <select
                      value={JUICE_LABEL_PRESETS.includes(juice.label) ? juice.label : "__custom"}
                      onChange={(e) => {
                        if (e.target.value !== "__custom") updateJuice(i, { label: e.target.value });
                        else updateJuice(i, { label: "" });
                      }}
                      className="px-2.5 py-2 rounded-lg font-mono text-[10px] uppercase tracking-[0.1em] outline-none"
                      style={{ background: "rgba(247,243,236,0.9)", border: "1px solid rgba(232,213,163,0.5)", color: "#8b7035" }}
                    >
                      {JUICE_LABEL_PRESETS.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                      <option value="__custom">Custom…</option>
                    </select>

                    {!JUICE_LABEL_PRESETS.includes(juice.label) && (
                      <input
                        value={juice.label}
                        onChange={(e) => updateJuice(i, { label: e.target.value })}
                        placeholder="Label"
                        className="w-20 px-2.5 py-2 rounded-lg font-mono text-[10px] outline-none"
                        style={{ background: "rgba(247,243,236,0.9)", border: "1px solid rgba(232,213,163,0.5)", color: "#8b7035" }}
                      />
                    )}

                    <select
                      value={juice.size_oz}
                      onChange={(e) => updateJuice(i, { size_oz: parseInt(e.target.value) as 8 | 16 | 24 | 32 })}
                      className="px-2.5 py-2 rounded-lg font-mono text-[10px] outline-none"
                      style={{ background: "rgba(247,243,236,0.9)", border: "1px solid rgba(232,213,163,0.5)", color: "#8b7035" }}
                    >
                      {JUICE_SIZE_OPTIONS.map((o) => (
                        <option key={o.oz} value={o.oz}>{o.label}</option>
                      ))}
                    </select>

                    {juices.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeJuice(i)}
                        className="p-1.5 rounded-md transition-opacity hover:opacity-60"
                        style={{ color: "var(--text-muted)" }}
                      >
                        <XIcon />
                      </button>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addJuice}
                  className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-opacity hover:opacity-70 mt-1"
                  style={{ color: "#8b7035" }}
                >
                  <PlusIcon /> Add juice
                </button>

                {errors.juices && (
                  <p className="font-mono text-[10px]" style={{ color: "var(--terracotta)" }}>{errors.juices}</p>
                )}
              </div>

              <div className="space-y-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
                  Keep solid meals?
                </p>
                <div className="flex gap-1.5">
                  {(["breakfast", "lunch", "dinner"] as MealSlot[]).map((meal) => {
                    const active = solidMeals.includes(meal);
                    return (
                      <button
                        key={meal}
                        type="button"
                        onClick={() => toggleSolidMeal(meal)}
                        className="font-mono text-[10px] uppercase tracking-[0.1em] px-3 py-1.5 rounded-lg transition-colors"
                        style={{
                          background: active ? "rgba(45,74,53,0.12)" : "transparent",
                          border: `1px solid ${active ? "rgba(45,74,53,0.3)" : "rgba(122,158,126,0.2)"}`,
                          color: active ? "var(--deep-green)" : "var(--sage)",
                        }}
                      >
                        {meal.slice(0, 5)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Submit — always visible */}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-3.5 rounded-lg font-mono text-[11px] uppercase tracking-[0.15em] transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-1"
        style={{ background: "var(--deep-green)", color: "var(--cream)" }}
        onMouseEnter={(e) => {
          if (!isLoading) (e.currentTarget as HTMLButtonElement).style.background = "#3d5e47";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "var(--deep-green)";
        }}
      >
        {isLoading ? "Generating…" : "✦ Generate My Plan"}
      </button>
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  background: "rgba(247,243,236,0.8)",
  border: "1px solid rgba(122,158,126,0.3)",
  color: "var(--deep-green)",
};

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="font-mono text-[10px] uppercase tracking-[0.15em]" style={{ color: "var(--sage)" }}>
        {label}
        {hint && <span className="ml-1 normal-case opacity-60">({hint})</span>}
      </label>
      {children}
      {error && (
        <p className="font-mono text-[10px]" style={{ color: "var(--terracotta)" }}>{error}</p>
      )}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
      <span
        className="w-8 h-4 rounded-full relative transition-colors flex-shrink-0"
        style={{ background: checked ? "var(--sage)" : "rgba(122,158,126,0.3)" }}
      >
        <span
          className="absolute top-0.5 w-3 h-3 rounded-full transition-all"
          style={{ background: checked ? "var(--cream)" : "var(--sage)", left: checked ? "calc(100% - 14px)" : "2px" }}
        />
      </span>
      {label && (
        <span className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--sage)" }}>
          {label}
        </span>
      )}
    </label>
  );
}

function PlusIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
