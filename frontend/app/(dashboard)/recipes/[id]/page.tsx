"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useExpandRecipe, useUpdateRecipe } from "@/lib/api/recipes";
import { scaledIngredients } from "@/lib/recipe-utils";
import type { RecipeIngredient, RecipeStep } from "@/lib/types";

export default function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: recipe, isLoading, error } = useExpandRecipe(id);
  const updateMutation = useUpdateRecipe();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editIngredients, setEditIngredients] = useState<RecipeIngredient[]>([]);
  const [editSteps, setEditSteps] = useState<RecipeStep[]>([]);
  const [editPrepMinutes, setEditPrepMinutes] = useState<number | "">("");
  const [editServings, setEditServings] = useState<number>(2);
  const [editTags, setEditTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const baseServings = recipe?.servings ?? 2;
  const [servings, setServings] = useState<number | null>(null);
  const targetServings = servings ?? baseServings;
  const displayIngredients = recipe
    ? scaledIngredients(recipe.ingredients, baseServings, targetServings)
    : [];

  function startEdit() {
    if (!recipe) return;
    setEditName(recipe.name);
    setEditDescription(recipe.description ?? "");
    setEditIngredients(recipe.ingredients.map((i) => ({ ...i })));
    setEditSteps(recipe.steps.map((s) => ({ ...s })));
    setEditPrepMinutes(recipe.prep_minutes ?? "");
    setEditServings(recipe.servings ?? 2);
    setEditTags([...(recipe.tags ?? [])]);
    setTagInput("");
    setEditing(true);
  }

  async function handleSaveEdit() {
    if (!recipe) return;
    const steps = editSteps.map((s, i) => ({ ...s, step: i + 1 }));
    await updateMutation.mutateAsync({
      id: recipe.id,
      body: {
        name: editName.trim(),
        description: editDescription.trim(),
        ingredients: editIngredients.filter((i) => i.name.trim()),
        steps: steps.filter((s) => s.instruction.trim()),
        prep_minutes: editPrepMinutes === "" ? null : Number(editPrepMinutes),
        servings: editServings,
        tags: editTags,
      },
    });
    setEditing(false);
  }

  function updateIngredient(index: number, patch: Partial<RecipeIngredient>) {
    setEditIngredients((prev) =>
      prev.map((ing, i) => (i === index ? { ...ing, ...patch } : ing))
    );
  }

  function addIngredient() {
    setEditIngredients((prev) => [...prev, { name: "", amount: "", notes: "" }]);
  }

  function removeIngredient(index: number) {
    setEditIngredients((prev) => prev.filter((_, i) => i !== index));
  }

  function updateStep(index: number, instruction: string) {
    setEditSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, instruction } : s))
    );
  }

  function addStep() {
    setEditSteps((prev) => [...prev, { step: prev.length + 1, instruction: "" }]);
  }

  function removeStep(index: number) {
    setEditSteps((prev) => prev.filter((_, i) => i !== index));
  }

  function moveStep(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= editSteps.length) return;
    setEditSteps((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function commitTag(raw: string) {
    const tag = raw.trim().toLowerCase().replace(/,+$/, "");
    if (tag && !editTags.includes(tag)) {
      setEditTags((prev) => [...prev, tag]);
    }
    setTagInput("");
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitTag(tagInput);
    } else if (e.key === "Backspace" && tagInput === "" && editTags.length > 0) {
      setEditTags((prev) => prev.slice(0, -1));
    }
  }

  function removeTag(tag: string) {
    setEditTags((prev) => prev.filter((t) => t !== tag));
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <BackLink />

      {isLoading && <RecipeSkeleton />}

      {error && (
        <div
          className="px-5 py-3 rounded-lg font-mono text-[11px] tracking-wide"
          style={{
            background: "rgba(196,122,74,0.1)",
            color: "var(--terracotta)",
            border: "1px solid rgba(196,122,74,0.3)",
          }}
        >
          Could not load this recipe.
        </div>
      )}

      {recipe && (
        <>
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em]" style={{ color: "var(--sage)" }}>
                Saved Recipe
              </p>
              {!editing && (
                <button
                  type="button"
                  onClick={startEdit}
                  className="font-mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 rounded-lg"
                  style={{ border: "1px solid rgba(122,158,126,0.3)", color: "var(--sage)" }}
                >
                  Edit
                </button>
              )}
            </div>

            {editing ? (
              <div className="space-y-6 p-5 rounded-[14px]" style={{ background: "white", border: "1px solid rgba(122,158,126,0.15)" }}>
                <Field label="Name">
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} className={inputClass} />
                </Field>
                <Field label="Description">
                  <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={3} className={inputClass} />
                </Field>
                <div className="space-y-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.15em]" style={{ color: "var(--sage)" }}>Tags</span>
                  <div
                    className="flex flex-wrap gap-1.5 min-h-[44px] px-3 py-2 rounded-lg cursor-text"
                    style={{ background: "rgba(247,243,236,0.8)", border: "1px solid rgba(122,158,126,0.3)" }}
                    onClick={() => document.getElementById("tag-input")?.focus()}
                  >
                    {editTags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(168,197,160,0.25)", color: "var(--deep-green)", border: "1px solid rgba(122,158,126,0.3)" }}
                      >
                        {tag}
                        <button type="button" onClick={() => removeTag(tag)} className="ml-0.5 hover:opacity-70" aria-label={`Remove tag ${tag}`} style={{ color: "var(--sage)" }}>×</button>
                      </span>
                    ))}
                    <input
                      id="tag-input"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                      onBlur={() => tagInput.trim() && commitTag(tagInput)}
                      placeholder={editTags.length === 0 ? "Type a tag and press Enter or comma…" : ""}
                      className="flex-1 min-w-[120px] bg-transparent outline-none font-display text-[0.8rem]"
                      style={{ color: "var(--deep-green)" }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Prep (min)">
                    <input type="number" value={editPrepMinutes} onChange={(e) => setEditPrepMinutes(e.target.value ? parseInt(e.target.value, 10) : "")} className={inputClass} />
                  </Field>
                  <Field label="Servings">
                    <input type="number" min={1} value={editServings} onChange={(e) => setEditServings(parseInt(e.target.value, 10) || 2)} className={inputClass} />
                  </Field>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-[0.15em]" style={{ color: "var(--sage)" }}>Ingredients</span>
                    <button type="button" onClick={addIngredient} className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--terracotta)" }}>+ Add</button>
                  </div>
                  {editIngredients.map((ing, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <input placeholder="Amount" value={ing.amount} onChange={(e) => updateIngredient(i, { amount: e.target.value })} className={`${inputClass} w-24 shrink-0`} />
                      <input placeholder="Ingredient" value={ing.name} onChange={(e) => updateIngredient(i, { name: e.target.value })} className={`${inputClass} flex-1`} />
                      <button type="button" onClick={() => removeIngredient(i)} aria-label="Remove ingredient" className="p-2 shrink-0" style={{ color: "var(--text-muted)" }}>×</button>
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-[0.15em]" style={{ color: "var(--sage)" }}>Method</span>
                    <button type="button" onClick={addStep} className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--terracotta)" }}>+ Add step</button>
                  </div>
                  {editSteps.map((step, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <span className="font-mono text-[11px] w-6 pt-3 shrink-0" style={{ color: "var(--sage)" }}>{i + 1}.</span>
                      <textarea value={step.instruction} onChange={(e) => updateStep(i, e.target.value)} rows={2} className={`${inputClass} flex-1`} />
                      <div className="flex flex-col gap-1 shrink-0">
                        <button type="button" disabled={i === 0} onClick={() => moveStep(i, -1)} className="text-xs disabled:opacity-30" style={{ color: "var(--sage)" }}>↑</button>
                        <button type="button" disabled={i === editSteps.length - 1} onClick={() => moveStep(i, 1)} className="text-xs disabled:opacity-30" style={{ color: "var(--sage)" }}>↓</button>
                        <button type="button" onClick={() => removeStep(i)} className="text-xs" style={{ color: "var(--text-muted)" }}>×</button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={handleSaveEdit} disabled={updateMutation.isPending || !editName.trim()} className="font-mono text-[10px] uppercase tracking-[0.12em] px-4 py-2.5 rounded-lg disabled:opacity-50" style={{ background: "var(--deep-green)", color: "var(--cream)" }}>
                    {updateMutation.isPending ? "Saving…" : "Save changes"}
                  </button>
                  <button type="button" onClick={() => setEditing(false)} className="font-mono text-[10px] uppercase tracking-[0.12em] px-4 py-2.5 rounded-lg" style={{ border: "1px solid rgba(122,158,126,0.3)", color: "var(--sage)" }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h1 className="font-display font-light leading-tight" style={{ fontSize: "clamp(1.8rem,4vw,2.8rem)", color: "var(--deep-green)" }}>
                  {recipe.name}
                </h1>
                {recipe.description && (
                  <p className="font-display italic text-[0.95rem] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                    {recipe.description}
                  </p>
                )}
              </>
            )}

            {!editing && (
              <div className="flex flex-wrap items-center gap-3 pt-1">
                {recipe.prep_minutes != null && (
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
                    {recipe.prep_minutes} min prep
                  </span>
                )}
                {recipe.diet_type && (
                  <span className="font-mono text-[9px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full" style={{ background: "rgba(196,122,74,0.12)", color: "var(--terracotta)" }}>
                    {recipe.diet_type}
                  </span>
                )}
                {recipe.tags.slice(0, 5).map((tag) => (
                  <span key={tag} className="font-mono text-[9px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full" style={{ background: "rgba(168,197,160,0.2)", color: "var(--deep-green)" }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {!editing && recipe.ingredients.length === 0 && recipe.steps.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 rounded-[14px] gap-2" style={{ border: "1px dashed rgba(122,158,126,0.3)" }}>
              <p className="font-display italic text-[0.85rem]" style={{ color: "var(--text-muted)" }}>
                Recipe details couldn&apos;t be generated right now.
              </p>
            </div>
          ) : !editing ? (
            <div className="space-y-8">
              {recipe.ingredients.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <h2 className="font-mono text-[11px] uppercase tracking-[0.2em]" style={{ color: "var(--sage)" }}>
                      Ingredients
                      <span className="ml-2 normal-case tracking-normal" style={{ color: "var(--text-muted)" }}>
                        — {targetServings} serving{targetServings === 1 ? "" : "s"}
                      </span>
                    </h2>
                    <ServingsControl targetServings={targetServings} onChange={setServings} />
                  </div>
                  <ul className="rounded-[14px] overflow-hidden" style={{ border: "1px solid rgba(122,158,126,0.15)", background: "white" }}>
                    {displayIngredients.map((ing, i) => (
                      <li key={i} className="flex items-baseline gap-3 px-5 py-3 border-b last:border-b-0" style={{ borderColor: "rgba(122,158,126,0.1)" }}>
                        <span className="font-mono text-[11px] shrink-0 w-20 text-right" style={{ color: "var(--terracotta)" }}>{ing.amount}</span>
                        <span className="font-display text-[0.9rem]" style={{ color: "var(--deep-green)" }}>
                          {ing.name}
                          {ing.notes && <span className="ml-1.5 italic text-[0.8rem]" style={{ color: "var(--text-muted)" }}>{ing.notes}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {recipe.steps.length > 0 && (
                <section className="space-y-4">
                  <h2 className="font-mono text-[11px] uppercase tracking-[0.2em]" style={{ color: "var(--sage)" }}>Method</h2>
                  <ol className="space-y-3">
                    {recipe.steps.map((step) => (
                      <li key={step.step} className="flex gap-4">
                        <span className="font-mono text-[11px] shrink-0 w-6 pt-0.5 text-right" style={{ color: "var(--sage)" }}>{step.step}.</span>
                        <p className="font-display text-[0.9rem] leading-relaxed" style={{ color: "var(--deep-green)" }}>{step.instruction}</p>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function ServingsControl({ targetServings, onChange }: { targetServings: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => onChange(Math.max(1, targetServings - 1))} className="w-8 h-8 rounded-lg font-mono text-sm" style={{ border: "1px solid rgba(122,158,126,0.3)", color: "var(--deep-green)" }}>−</button>
      <span className="font-mono text-[11px] w-6 text-center" style={{ color: "var(--deep-green)" }}>{targetServings}</span>
      <button type="button" onClick={() => onChange(targetServings + 1)} className="w-8 h-8 rounded-lg font-mono text-sm" style={{ border: "1px solid rgba(122,158,126,0.3)", color: "var(--deep-green)" }}>+</button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.15em]" style={{ color: "var(--sage)" }}>{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full px-4 py-3 rounded-lg font-display text-[0.875rem] outline-none bg-[rgba(247,243,236,0.8)] border border-[rgba(122,158,126,0.3)] text-[var(--deep-green)]";

function BackLink() {
  return (
    <Link href="/recipes" className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] transition-opacity hover:opacity-70" style={{ color: "var(--sage)" }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="15 18 9 12 15 6" /></svg>
      Back to recipes
    </Link>
  );
}

function RecipeSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="space-y-3">
        <div className="h-3 w-20 rounded" style={{ background: "rgba(122,158,126,0.2)" }} />
        <div className="h-8 w-2/3 rounded" style={{ background: "rgba(122,158,126,0.15)" }} />
      </div>
      <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-center pt-2" style={{ color: "var(--sage)" }}>Loading recipe…</p>
    </div>
  );
}
