"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useGenerateFromIngredients } from "@/lib/api/recipes";

const TARGET_TYPES = [
  { value: "juice", label: "Juice" },
  { value: "smoothie", label: "Smoothie" },
  { value: "raw_meal", label: "Raw meal" },
  { value: "cooked_meal", label: "Cooked meal" },
] as const;

export default function GenerateRecipePage() {
  const router = useRouter();
  const generateMutation = useGenerateFromIngredients();
  const [ingredients, setIngredients] = useState("");
  const [targetType, setTargetType] = useState<(typeof TARGET_TYPES)[number]["value"]>("juice");
  const [servings, setServings] = useState(2);
  const [save, setSave] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const list = ingredients.split("\n").map((s) => s.trim()).filter(Boolean);
    const result = await generateMutation.mutateAsync({
      ingredients: list,
      target_type: targetType,
      servings,
      save,
    });
    if ("id" in result) {
      router.push(`/recipes/${result.id}`);
    }
  }

  const draft = generateMutation.data && !("id" in generateMutation.data) ? generateMutation.data : null;

  return (
    <div className="max-w-xl space-y-8">
      <Link href="/recipes" className="font-mono text-[10px] uppercase tracking-[0.15em]" style={{ color: "var(--sage)" }}>
        ← Back to recipes
      </Link>
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] mb-3" style={{ color: "var(--sage)" }}>
          AI Generator
        </p>
        <h1 className="font-display font-light" style={{ fontSize: "clamp(2rem,4vw,2.5rem)", color: "var(--deep-green)" }}>
          From <em className="italic" style={{ color: "var(--terracotta)" }}>ingredients</em>
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 p-5 rounded-[14px]" style={{ background: "white", border: "1px solid rgba(122,158,126,0.15)" }}>
        <label className="block space-y-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.15em]" style={{ color: "var(--sage)" }}>On-hand ingredients</span>
          <textarea
            value={ingredients}
            onChange={(e) => setIngredients(e.target.value)}
            rows={6}
            placeholder="spinach&#10;apple&#10;ginger"
            required
            className={inputClass}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.15em]" style={{ color: "var(--sage)" }}>Target type</span>
          <select value={targetType} onChange={(e) => setTargetType(e.target.value as typeof targetType)} className={inputClass}>
            {TARGET_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--deep-green)" }}>
          <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />
          Save to my recipes
        </label>
        <button
          type="submit"
          disabled={generateMutation.isPending}
          className="w-full py-3.5 rounded-lg font-mono text-[12px] uppercase tracking-[0.15em] disabled:opacity-50"
          style={{ background: "var(--deep-green)", color: "var(--cream)" }}
        >
          {generateMutation.isPending ? "Generating…" : "✦ Generate recipe"}
        </button>
      </form>

      {draft && (
        <div className="p-5 rounded-[14px] space-y-3" style={{ background: "rgba(168,197,160,0.12)", border: "1px solid rgba(122,158,126,0.2)" }}>
          <h2 className="font-display text-[1.1rem]" style={{ color: "var(--deep-green)" }}>{draft.name}</h2>
          <p className="font-display italic text-[0.9rem]" style={{ color: "var(--text-muted)" }}>{draft.description}</p>
          <p className="font-mono text-[10px]" style={{ color: "var(--sage)" }}>Preview only — enable “Save to my recipes” to keep it.</p>
        </div>
      )}
    </div>
  );
}

const inputClass =
  "w-full px-4 py-3 rounded-lg font-display text-[0.875rem] outline-none bg-[rgba(247,243,236,0.8)] border border-[rgba(122,158,126,0.3)] text-[var(--deep-green)]";
