"use client";

import { useEffect, useState } from "react";
import { usePreferences, useUpdatePreferences } from "@/lib/api/preferences";

const DIET_OPTIONS = [
  { value: "raw_vegan_80_20", label: "Raw Vegan 80/20" },
  { value: "whole_food_plant_based", label: "Whole Food Plant-Based" },
  { value: "raw_vegan_100", label: "Raw Vegan 100%" },
  { value: "vegan", label: "Vegan" },
];

export default function PreferencesPage() {
  const { data: prefs, isLoading } = usePreferences();
  const updateMutation = useUpdatePreferences();

  const [dietType, setDietType] = useState("raw_vegan_80_20");
  const [caloriesTarget, setCaloriesTarget] = useState(1800);
  const [excludeText, setExcludeText] = useState("");
  const [preferencesText, setPreferencesText] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (prefs) {
      setDietType(prefs.diet_type);
      setCaloriesTarget(prefs.calories_target);
      setExcludeText(prefs.excluded_ingredients.join(", "));
      setPreferencesText(prefs.preferences_text ?? "");
    }
  }, [prefs]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const excluded = excludeText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      await updateMutation.mutateAsync({
        diet_type: dietType,
        calories_target: caloriesTarget,
        excluded_ingredients: excluded,
        preferences_text: preferencesText.trim() || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Failed to save preferences. Please try again.");
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse max-w-lg">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 rounded-lg" style={{ background: "rgba(122,158,126,0.1)" }} />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-8">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] mb-3" style={{ color: "var(--sage)" }}>
          Settings
        </p>
        <h1
          className="font-display font-light leading-tight"
          style={{ fontSize: "clamp(2rem,4vw,3rem)", color: "var(--deep-green)" }}
        >
          Your <em className="italic" style={{ color: "var(--terracotta)" }}>preferences</em>
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Diet type */}
        <Field label="Diet Style">
          <select
            value={dietType}
            onChange={(e) => setDietType(e.target.value)}
            className="w-full px-4 py-3 rounded-lg font-display text-[0.9rem] outline-none"
            style={{ background: "white", border: "1px solid rgba(122,158,126,0.3)", color: "var(--deep-green)" }}
          >
            {DIET_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>

        {/* Calorie target */}
        <Field label="Daily Calorie Target">
          <input
            type="number"
            value={caloriesTarget}
            onChange={(e) => setCaloriesTarget(parseInt(e.target.value, 10) || 1800)}
            min={1000}
            max={4000}
            step={50}
            className="w-full px-4 py-3 rounded-lg font-display text-[0.9rem] outline-none"
            style={{ background: "white", border: "1px solid rgba(122,158,126,0.3)", color: "var(--deep-green)" }}
          />
        </Field>

        {/* Excluded ingredients */}
        <Field label="Exclude Ingredients" hint="comma-separated">
          <input
            type="text"
            value={excludeText}
            onChange={(e) => setExcludeText(e.target.value)}
            placeholder="e.g. nuts, gluten, soy"
            className="w-full px-4 py-3 rounded-lg font-display text-[0.9rem] outline-none"
            style={{ background: "white", border: "1px solid rgba(122,158,126,0.3)", color: "var(--deep-green)" }}
          />
        </Field>

        {/* Preferences text */}
        <Field label="Any notes for the AI?">
          <textarea
            value={preferencesText}
            onChange={(e) => setPreferencesText(e.target.value)}
            placeholder="e.g. I love spicy food, prefer quick meals under 20 min…"
            rows={3}
            maxLength={500}
            className="w-full px-4 py-3 rounded-lg font-display text-[0.9rem] outline-none resize-none"
            style={{ background: "white", border: "1px solid rgba(122,158,126,0.3)", color: "var(--deep-green)" }}
          />
        </Field>

        {error && (
          <p className="font-mono text-[10px]" style={{ color: "var(--terracotta)" }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={updateMutation.isPending}
          className="w-full py-3.5 rounded-lg font-mono text-[12px] uppercase tracking-[0.15em] transition-colors disabled:opacity-50"
          style={{ background: saved ? "rgba(45,74,53,0.8)" : "var(--deep-green)", color: "var(--cream)" }}
        >
          {updateMutation.isPending ? "Saving…" : saved ? "✓ Saved" : "Save Preferences"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--sage)" }}>
        {label}
        {hint && <span className="ml-1 normal-case opacity-60">({hint})</span>}
      </label>
      {children}
    </div>
  );
}
