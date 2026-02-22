"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { extractRecipe, useConfirmRecipe } from "@/lib/api/recipes";
import type { RecipeDraft, RecipeImportConfirmRequest, RecipeIngredient, RecipeStep } from "@/lib/types";

const VALID_TAGS = [
  "raw", "cooked", "high-protein", "high-fiber", "quick", "weeknight",
  "meal-prep", "gluten-free", "nut-free", "soy-free", "oil-free", "budget-friendly",
  "breakfast", "lunch", "dinner", "snack", "dessert", "smoothie", "salad", "soup", "bowl",
];

// ── Phase 1 — Input ───────────────────────────────────────────────────────────

function InputPhase({
  onExtracted,
}: {
  onExtracted: (draft: RecipeDraft) => void;
}) {
  const [text, setText] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setImage(file);
    setPreview(URL.createObjectURL(file));
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() && !image) return;
    setLoading(true);
    setError(null);
    try {
      const draft = await extractRecipe(text.trim() || undefined, image ?? undefined);
      onExtracted(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className="relative rounded-xl cursor-pointer transition-colors"
        style={{
          border: `2px dashed ${dragging ? "rgba(122,158,126,0.6)" : "rgba(122,158,126,0.3)"}`,
          background: dragging ? "rgba(122,158,126,0.04)" : "white",
          minHeight: "11rem",
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="sr-only"
          onChange={onFileChange}
        />

        {preview ? (
          <div className="flex items-center gap-4 p-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Recipe preview"
              className="w-24 h-24 object-cover rounded-lg shrink-0"
              style={{ border: "1px solid rgba(122,158,126,0.2)" }}
            />
            <div className="space-y-1">
              <p className="font-display text-[0.9rem]" style={{ color: "var(--deep-green)" }}>
                {image?.name}
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setImage(null);
                  setPreview(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                className="font-mono text-[10px] uppercase tracking-wide transition-opacity hover:opacity-70"
                style={{ color: "var(--terracotta)" }}
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-44 gap-3 px-6 text-center">
            <svg
              width="28" height="28" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth={1.2}
              style={{ color: "rgba(122,158,126,0.5)" }}
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <p className="font-display italic text-[0.85rem]" style={{ color: "var(--text-muted)" }}>
              Drop a photo or screenshot here, or click to upload
            </p>
            <p className="font-mono text-[9px] uppercase tracking-[0.15em]" style={{ color: "rgba(122,158,126,0.5)" }}>
              JPEG · PNG · GIF · WEBP · max 5 MB
            </p>
          </div>
        )}
      </div>

      {/* Text input */}
      <div className="space-y-1.5">
        <label
          htmlFor="recipe-text"
          className="font-mono text-[10px] uppercase tracking-[0.15em]"
          style={{ color: "var(--sage)" }}
        >
          Or paste / type
        </label>
        <textarea
          id="recipe-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="Paste a recipe, describe a dish, or share a URL..."
          className="w-full px-4 py-3 rounded-lg font-display text-[0.9rem] outline-none resize-none"
          style={{
            background: "white",
            border: "1px solid rgba(122,158,126,0.3)",
            color: "var(--deep-green)",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(122,158,126,0.6)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(122,158,126,0.3)"; }}
        />
      </div>

      {error && (
        <p
          className="font-mono text-[11px] px-4 py-3 rounded-lg"
          style={{ background: "rgba(196,122,74,0.1)", color: "var(--terracotta)", border: "1px solid rgba(196,122,74,0.25)" }}
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || (!text.trim() && !image)}
        className="w-full py-3.5 rounded-lg font-mono text-[11px] uppercase tracking-[0.15em] transition-opacity disabled:opacity-40"
        style={{ background: "var(--deep-green)", color: "var(--cream)" }}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <LoadingDots />
            Reading your recipe…
          </span>
        ) : (
          "Extract Recipe"
        )}
      </button>
    </form>
  );
}

// ── Phase 2 — Review & Confirm ────────────────────────────────────────────────

function ReviewPhase({
  initial,
  onBack,
}: {
  initial: RecipeDraft;
  onBack: () => void;
}) {
  const router = useRouter();
  const confirm = useConfirmRecipe();

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [prepMinutes, setPrepMinutes] = useState<number | "">(initial.prep_minutes ?? "");
  const [dietType, setDietType] = useState<string>(initial.diet_type ?? "plant-based");
  const [tags, setTags] = useState<string[]>(initial.tags);
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>(initial.ingredients);
  const [steps, setSteps] = useState<RecipeStep[]>(initial.steps);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);

  const confidence = initial.extraction_confidence;
  const confidenceStyle =
    confidence === "high"
      ? { color: "var(--sage)", background: "rgba(168,197,160,0.2)" }
      : { color: "var(--terracotta)", background: "rgba(196,122,74,0.1)" };

  async function handleSave() {
    const body: RecipeImportConfirmRequest = {
      name,
      description,
      ingredients,
      steps,
      tags,
      diet_type: dietType || null,
      prep_minutes: prepMinutes === "" ? null : Number(prepMinutes),
    };
    await confirm.mutateAsync(body);
    router.push("/recipes");
  }

  // ── Ingredients helpers ──

  function updateIngredient(i: number, field: keyof RecipeIngredient, value: string) {
    setIngredients((prev) => prev.map((ing, idx) => idx === i ? { ...ing, [field]: value } : ing));
  }

  function removeIngredient(i: number) {
    setIngredients((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addIngredient() {
    setIngredients((prev) => [...prev, { name: "", amount: "", notes: "" }]);
  }

  // ── Steps helpers ──

  function updateStep(i: number, value: string) {
    setSteps((prev) => prev.map((s, idx) => idx === i ? { ...s, instruction: value } : s));
  }

  function removeStep(i: number) {
    setSteps((prev) =>
      prev
        .filter((_, idx) => idx !== i)
        .map((s, idx) => ({ ...s, step: idx + 1 }))
    );
  }

  function addStep() {
    setSteps((prev) => [...prev, { step: prev.length + 1, instruction: "" }]);
  }

  function moveStep(i: number, dir: -1 | 1) {
    const next = [...steps];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setSteps(next.map((s, idx) => ({ ...s, step: idx + 1 })));
  }

  return (
    <div className="space-y-8">
      {/* Confidence banner */}
      {confidence === "low" && (
        <div
          className="px-4 py-3 rounded-lg font-mono text-[11px] tracking-wide"
          style={{ background: "rgba(196,122,74,0.1)", color: "var(--terracotta)", border: "1px solid rgba(196,122,74,0.25)" }}
        >
          We had to guess a few things — please review carefully
        </div>
      )}

      {/* Confidence badge + interpretation */}
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="font-mono text-[9px] uppercase tracking-[0.15em] px-2.5 py-1 rounded-full"
          style={confidenceStyle}
        >
          {confidence} confidence
        </span>
        <p className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>
          {initial.input_interpretation}
        </p>
      </div>

      {/* Recipe name */}
      <div className="space-y-1">
        <label className="font-mono text-[10px] uppercase tracking-[0.15em]" style={{ color: "var(--sage)" }}>
          Recipe name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full font-display font-light outline-none bg-transparent"
          style={{ fontSize: "clamp(1.6rem,3.5vw,2.4rem)", color: "var(--deep-green)", borderBottom: "1px solid rgba(122,158,126,0.3)" }}
          onFocus={(e) => { e.currentTarget.style.borderBottomColor = "rgba(122,158,126,0.6)"; }}
          onBlur={(e) => { e.currentTarget.style.borderBottomColor = "rgba(122,158,126,0.3)"; }}
        />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <label className="font-mono text-[10px] uppercase tracking-[0.15em]" style={{ color: "var(--sage)" }}>
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full px-4 py-3 rounded-lg font-display italic text-[0.9rem] leading-relaxed outline-none resize-none"
          style={{ background: "white", border: "1px solid rgba(122,158,126,0.2)", color: "var(--deep-green)" }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(122,158,126,0.5)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(122,158,126,0.2)"; }}
        />
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap gap-4">
        <div className="space-y-1.5">
          <label className="font-mono text-[10px] uppercase tracking-[0.15em]" style={{ color: "var(--sage)" }}>
            Prep time (min)
          </label>
          <input
            type="number"
            min={0}
            value={prepMinutes}
            onChange={(e) => setPrepMinutes(e.target.value === "" ? "" : Number(e.target.value))}
            className="w-24 px-3 py-2 rounded-lg font-mono text-[0.85rem] outline-none"
            style={{ background: "white", border: "1px solid rgba(122,158,126,0.2)", color: "var(--deep-green)" }}
          />
        </div>
        <div className="space-y-1.5">
          <label className="font-mono text-[10px] uppercase tracking-[0.15em]" style={{ color: "var(--sage)" }}>
            Diet type
          </label>
          <select
            value={dietType}
            onChange={(e) => setDietType(e.target.value)}
            className="px-3 py-2 rounded-lg font-mono text-[0.85rem] outline-none"
            style={{ background: "white", border: "1px solid rgba(122,158,126,0.2)", color: "var(--deep-green)" }}
          >
            <option value="raw_vegan">raw vegan</option>
            <option value="vegan">vegan</option>
            <option value="plant-based">plant-based</option>
          </select>
        </div>
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <label className="font-mono text-[10px] uppercase tracking-[0.15em]" style={{ color: "var(--sage)" }}>
          Tags
        </label>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full"
              style={{ background: "rgba(122,158,126,0.1)", color: "var(--sage)" }}
            >
              {tag}
              <button
                type="button"
                onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
                aria-label={`Remove ${tag}`}
                className="leading-none opacity-60 hover:opacity-100 transition-opacity"
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => setTagPickerOpen((v) => !v)}
            className="font-mono text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full transition-colors"
            style={{ border: "1px dashed rgba(122,158,126,0.4)", color: "var(--sage)" }}
          >
            + Add
          </button>
        </div>
        {tagPickerOpen && (
          <div
            className="flex flex-wrap gap-1.5 p-3 rounded-xl"
            style={{ background: "white", border: "1px solid rgba(122,158,126,0.2)" }}
          >
            {VALID_TAGS.filter((t) => !tags.includes(t)).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTags((prev) => [...prev, t]);
                  setTagPickerOpen(false);
                }}
                className="font-mono text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full transition-colors hover:opacity-80"
                style={{ background: "rgba(122,158,126,0.1)", color: "var(--sage)" }}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Ingredients */}
      <section className="space-y-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em]" style={{ color: "var(--sage)" }}>
          Ingredients
          <span className="ml-1.5 normal-case tracking-normal font-normal" style={{ color: "var(--text-muted)" }}>
            — 2 servings
          </span>
        </h2>
        <div
          className="rounded-[14px] overflow-hidden divide-y"
          style={{ border: "1px solid rgba(122,158,126,0.15)", background: "white" }}
        >
          {ingredients.map((ing, i) => (
            <div key={i} className="flex items-center gap-2 px-4 py-2.5">
              <input
                value={ing.amount}
                onChange={(e) => updateIngredient(i, "amount", e.target.value)}
                placeholder="Amount"
                className="w-20 shrink-0 font-mono text-[11px] outline-none bg-transparent text-right"
                style={{ color: "var(--terracotta)" }}
              />
              <input
                value={ing.name}
                onChange={(e) => updateIngredient(i, "name", e.target.value)}
                placeholder="Ingredient"
                className="flex-1 font-display text-[0.88rem] outline-none bg-transparent"
                style={{ color: "var(--deep-green)" }}
              />
              <input
                value={ing.notes}
                onChange={(e) => updateIngredient(i, "notes", e.target.value)}
                placeholder="Note"
                className="w-28 font-display italic text-[0.8rem] outline-none bg-transparent"
                style={{ color: "var(--text-muted)" }}
              />
              <button
                type="button"
                onClick={() => removeIngredient(i)}
                aria-label="Remove ingredient"
                className="shrink-0 p-1 transition-opacity opacity-30 hover:opacity-70"
                style={{ color: "var(--terracotta)" }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addIngredient}
          className="font-mono text-[10px] uppercase tracking-[0.15em] transition-opacity hover:opacity-70"
          style={{ color: "var(--sage)" }}
        >
          + Add ingredient
        </button>
      </section>

      {/* Steps */}
      <section className="space-y-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em]" style={{ color: "var(--sage)" }}>
          Method
        </h2>
        <ol className="space-y-2">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3 items-start">
              <span
                className="font-mono text-[11px] shrink-0 w-5 pt-2.5 text-right"
                style={{ color: "var(--sage)" }}
              >
                {s.step}.
              </span>
              <textarea
                value={s.instruction}
                onChange={(e) => updateStep(i, e.target.value)}
                rows={2}
                className="flex-1 px-3 py-2 rounded-lg font-display text-[0.88rem] leading-relaxed outline-none resize-none"
                style={{ background: "white", border: "1px solid rgba(122,158,126,0.15)", color: "var(--deep-green)" }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(122,158,126,0.4)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(122,158,126,0.15)"; }}
              />
              <div className="flex flex-col gap-0.5 pt-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => moveStep(i, -1)}
                  disabled={i === 0}
                  aria-label="Move step up"
                  className="p-1 rounded opacity-40 hover:opacity-80 disabled:opacity-20 transition-opacity"
                  style={{ color: "var(--sage)" }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => moveStep(i, 1)}
                  disabled={i === steps.length - 1}
                  aria-label="Move step down"
                  className="p-1 rounded opacity-40 hover:opacity-80 disabled:opacity-20 transition-opacity"
                  style={{ color: "var(--sage)" }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => removeStep(i)}
                  aria-label="Remove step"
                  className="p-1 rounded opacity-30 hover:opacity-70 transition-opacity"
                  style={{ color: "var(--terracotta)" }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={addStep}
          className="font-mono text-[10px] uppercase tracking-[0.15em] transition-opacity hover:opacity-70"
          style={{ color: "var(--sage)" }}
        >
          + Add step
        </button>
      </section>

      {/* Error */}
      {confirm.isError && (
        <p
          className="font-mono text-[11px] px-4 py-3 rounded-lg"
          style={{ background: "rgba(196,122,74,0.1)", color: "var(--terracotta)", border: "1px solid rgba(196,122,74,0.25)" }}
        >
          {confirm.error instanceof Error ? confirm.error.message : "Could not save recipe. Please try again."}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 py-3.5 rounded-lg font-mono text-[11px] uppercase tracking-[0.15em] transition-opacity hover:opacity-70"
          style={{ border: "1px solid rgba(122,158,126,0.3)", color: "var(--sage)" }}
        >
          ← Try Again
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={confirm.isPending || !name.trim()}
          className="flex-[2] py-3.5 rounded-lg font-mono text-[11px] uppercase tracking-[0.15em] transition-opacity disabled:opacity-40"
          style={{ background: "var(--deep-green)", color: "var(--cream)" }}
        >
          {confirm.isPending ? (
            <span className="flex items-center justify-center gap-2">
              <LoadingDots />
              Saving…
            </span>
          ) : (
            "✦ Save Recipe"
          )}
        </button>
      </div>
    </div>
  );
}

// ── Loading dots ──────────────────────────────────────────────────────────────

function LoadingDots() {
  return (
    <span className="inline-flex gap-0.5 items-center">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1 h-1 rounded-full animate-bounce"
          style={{
            background: "currentColor",
            animationDelay: `${i * 0.15}s`,
            animationDuration: "0.8s",
          }}
        />
      ))}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RecipeImportPage() {
  const [draft, setDraft] = useState<RecipeDraft | null>(null);

  return (
    <div className="max-w-2xl space-y-8">
      {/* Header */}
      <div>
        <Link
          href="/recipes"
          className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] transition-opacity hover:opacity-70 mb-6"
          style={{ color: "var(--sage)" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to recipes
        </Link>

        <p
          className="font-mono text-[11px] uppercase tracking-[0.2em] mb-3"
          style={{ color: "var(--sage)" }}
        >
          {draft ? "Review & confirm" : "Import a Recipe"}
        </p>
        <h1
          className="font-display font-light leading-tight"
          style={{ fontSize: "clamp(1.8rem,4vw,2.8rem)", color: "var(--deep-green)" }}
        >
          {draft
            ? <>Review your <em className="italic" style={{ color: "var(--terracotta)" }}>recipe</em></>
            : <>Add a recipe <em className="italic" style={{ color: "var(--terracotta)" }}>from anywhere</em></>
          }
        </h1>
        {!draft && (
          <p className="font-display italic text-[0.9rem] mt-2" style={{ color: "var(--text-muted)" }}>
            Drop a photo, paste a URL, describe a dish — Claude will do the rest.
          </p>
        )}
      </div>

      {draft ? (
        <ReviewPhase initial={draft} onBack={() => setDraft(null)} />
      ) : (
        <InputPhase onExtracted={setDraft} />
      )}
    </div>
  );
}
