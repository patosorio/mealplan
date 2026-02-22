"use client";

import { useState } from "react";
import type { GeneratePlanRequest, MealSlot } from "@/lib/types";

interface GenerateFormProps {
  onSubmit: (request: GeneratePlanRequest) => void;
  isLoading?: boolean;
}

const DIET_OPTIONS = [
  { value: "raw_vegan_80_20", label: "Raw Vegan 80/20" },
  { value: "whole_food_plant_based", label: "Whole Food Plant-Based" },
  { value: "raw_vegan_100", label: "Raw Vegan 100%" },
  { value: "vegan", label: "Vegan" },
];

function getMonday(): string {
  const today = new Date();
  const day = today.getDay();
  const diff = today.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(today.setDate(diff));
  return monday.toISOString().split("T")[0];
}

export function GenerateForm({ onSubmit, isLoading = false }: GenerateFormProps) {
  const [dietType, setDietType] = useState("raw_vegan_80_20");
  const [caloriesTarget, setCaloriesTarget] = useState(1800);
  const [excludeText, setExcludeText] = useState("");
  const [preferencesText, setPreferencesText] = useState("");
  const [useOwnRecipes, setUseOwnRecipes] = useState(true);
  const [usePantry, setUsePantry] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (caloriesTarget < 1000 || caloriesTarget > 4000) {
      errs.calories = "Calorie target must be between 1000 and 4000.";
    }
    if (preferencesText.length > 500) {
      errs.preferences = "Notes must be 500 characters or fewer.";
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

    onSubmit({
      diet_type: dietType,
      calories_target: caloriesTarget,
      meals_per_day: ["breakfast", "lunch", "dinner"] as MealSlot[],
      use_own_recipes: useOwnRecipes,
      use_pantry: usePantry,
      exclude_ingredients: excludeIngredients,
      preferences_text: preferencesText.trim() || undefined,
      week_start: getMonday(),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Diet type */}
      <div className="space-y-1.5">
        <label className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--sage)" }}>
          Diet Style
        </label>
        <select
          value={dietType}
          onChange={(e) => setDietType(e.target.value)}
          className="w-full px-4 py-3 rounded-lg font-display text-[0.9rem] outline-none transition-colors"
          style={{
            background: "rgba(247,243,236,0.8)",
            border: "1px solid rgba(122,158,126,0.3)",
            color: "var(--deep-green)",
          }}
        >
          {DIET_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Calorie target */}
      <div className="space-y-1.5">
        <label className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--sage)" }}>
          Daily Calories
        </label>
        <input
          type="number"
          value={caloriesTarget}
          onChange={(e) => setCaloriesTarget(parseInt(e.target.value, 10) || 1800)}
          min={1000}
          max={4000}
          step={50}
          className="w-full px-4 py-3 rounded-lg font-display text-[0.9rem] outline-none"
          style={{
            background: "rgba(247,243,236,0.8)",
            border: `1px solid ${errors.calories ? "var(--terracotta)" : "rgba(122,158,126,0.3)"}`,
            color: "var(--deep-green)",
          }}
        />
        {errors.calories && (
          <p className="font-mono text-[10px]" style={{ color: "var(--terracotta)" }}>
            {errors.calories}
          </p>
        )}
      </div>

      {/* Exclude ingredients */}
      <div className="space-y-1.5">
        <label className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--sage)" }}>
          Exclude Ingredients
          <span className="ml-1 normal-case opacity-60">(comma-separated)</span>
        </label>
        <input
          type="text"
          value={excludeText}
          onChange={(e) => setExcludeText(e.target.value)}
          placeholder="e.g. nuts, seeds, avocado"
          className="w-full px-4 py-3 rounded-lg font-display text-[0.9rem] outline-none"
          style={{
            background: "rgba(247,243,236,0.8)",
            border: "1px solid rgba(122,158,126,0.3)",
            color: "var(--deep-green)",
          }}
        />
      </div>

      {/* Preferences text */}
      <div className="space-y-1.5">
        <label className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--sage)" }}>
          Any other notes?
        </label>
        <textarea
          value={preferencesText}
          onChange={(e) => setPreferencesText(e.target.value)}
          placeholder="e.g. I love Thai flavours, prefer quick breakfasts…"
          rows={2}
          maxLength={500}
          className="w-full px-4 py-3 rounded-lg font-display text-[0.9rem] outline-none resize-none"
          style={{
            background: "rgba(247,243,236,0.8)",
            border: `1px solid ${errors.preferences ? "var(--terracotta)" : "rgba(122,158,126,0.3)"}`,
            color: "var(--deep-green)",
          }}
        />
        {errors.preferences && (
          <p className="font-mono text-[10px]" style={{ color: "var(--terracotta)" }}>
            {errors.preferences}
          </p>
        )}
      </div>

      {/* Toggles */}
      <div className="flex gap-4">
        <ToggleOption
          label="Use my recipes"
          checked={useOwnRecipes}
          onChange={setUseOwnRecipes}
        />
        <ToggleOption
          label="Use my pantry"
          checked={usePantry}
          onChange={setUsePantry}
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-4 rounded-lg font-mono text-[12px] uppercase tracking-[0.15em] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: "var(--deep-green)",
          color: "var(--cream)",
        }}
        onMouseEnter={(e) => {
          if (!isLoading) (e.currentTarget as HTMLButtonElement).style.background = "#3d5e47";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "var(--deep-green)";
        }}
      >
        {isLoading ? "Generating…" : "✦ Generate My Meal Plan"}
      </button>
    </form>
  );
}

function ToggleOption({
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
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span
        className="w-8 h-4 rounded-full relative transition-colors"
        style={{ background: checked ? "var(--sage)" : "rgba(122,158,126,0.3)" }}
      >
        <span
          className="absolute top-0.5 w-3 h-3 rounded-full transition-all"
          style={{
            background: checked ? "var(--cream)" : "var(--sage)",
            left: checked ? "calc(100% - 14px)" : "2px",
          }}
        />
      </span>
      <span className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--sage)" }}>
        {label}
      </span>
    </label>
  );
}
