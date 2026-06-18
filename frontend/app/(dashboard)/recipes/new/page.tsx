"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCreateRecipe } from "@/lib/api/recipes";
import type { RecipeIngredient, RecipeStep } from "@/lib/types";

export default function NewRecipePage() {
  const router = useRouter();
  const createMutation = useCreateRecipe();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prepMinutes, setPrepMinutes] = useState<number | "">("");
  const [servings, setServings] = useState(2);
  const [ingredientLines, setIngredientLines] = useState("1 cup spinach\n1 banana");
  const [stepLines, setStepLines] = useState("Blend until smooth.");
  const [tags, setTags] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ingredients: RecipeIngredient[] = ingredientLines
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [amount, ...rest] = line.split(/\s+/);
        const namePart = rest.join(" ");
        return { name: namePart || line, amount: namePart ? amount : "as needed", notes: "" };
      });

    const steps: RecipeStep[] = stepLines
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((instruction, i) => ({ step: i + 1, instruction }));

    const recipe = await createMutation.mutateAsync({
      name: name.trim(),
      description: description.trim(),
      ingredients,
      steps,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      prep_minutes: prepMinutes === "" ? null : Number(prepMinutes),
      servings,
    });
    router.push(`/recipes/${recipe.id}`);
  }

  return (
    <div className="max-w-xl space-y-8">
      <Link href="/recipes" className="font-mono text-[10px] uppercase tracking-[0.15em]" style={{ color: "var(--sage)" }}>
        ← Back to recipes
      </Link>
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] mb-3" style={{ color: "var(--sage)" }}>
          Create
        </p>
        <h1 className="font-display font-light" style={{ fontSize: "clamp(2rem,4vw,2.5rem)", color: "var(--deep-green)" }}>
          New <em className="italic" style={{ color: "var(--terracotta)" }}>recipe</em>
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 p-5 rounded-[14px]" style={{ background: "white", border: "1px solid rgba(122,158,126,0.15)" }}>
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
        </Field>
        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={inputClass} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Prep (min)">
            <input type="number" value={prepMinutes} onChange={(e) => setPrepMinutes(e.target.value ? parseInt(e.target.value, 10) : "")} className={inputClass} />
          </Field>
          <Field label="Servings">
            <input type="number" min={1} value={servings} onChange={(e) => setServings(parseInt(e.target.value, 10) || 2)} className={inputClass} />
          </Field>
        </div>
        <Field label="Ingredients" hint="one per line: amount then name">
          <textarea value={ingredientLines} onChange={(e) => setIngredientLines(e.target.value)} rows={5} className={inputClass} />
        </Field>
        <Field label="Steps" hint="one per line">
          <textarea value={stepLines} onChange={(e) => setStepLines(e.target.value)} rows={4} className={inputClass} />
        </Field>
        <Field label="Tags" hint="comma-separated">
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="raw, quick, breakfast" className={inputClass} />
        </Field>
        <button
          type="submit"
          disabled={!name.trim() || createMutation.isPending}
          className="w-full py-3.5 rounded-lg font-mono text-[12px] uppercase tracking-[0.15em] disabled:opacity-50"
          style={{ background: "var(--deep-green)", color: "var(--cream)" }}
        >
          {createMutation.isPending ? "Saving…" : "Save recipe"}
        </button>
      </form>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.15em]" style={{ color: "var(--sage)" }}>{label}</span>
      {children}
      {hint && <span className="block font-mono text-[9px]" style={{ color: "var(--text-muted)" }}>{hint}</span>}
    </label>
  );
}

const inputClass =
  "w-full px-4 py-3 rounded-lg font-display text-[0.875rem] outline-none bg-[rgba(247,243,236,0.8)] border border-[rgba(122,158,126,0.3)] text-[var(--deep-green)]";
