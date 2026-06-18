"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRecipes, useDeleteRecipe } from "@/lib/api/recipes";
import type { Recipe } from "@/lib/api/recipes";
import { getRecipeType } from "@/lib/recipe-utils";

const TYPE_CHIPS = [
  { value: "", label: "All" },
  { value: "raw", label: "Raw" },
  { value: "cooked", label: "Cooked" },
  { value: "juice", label: "Juice" },
] as const;

// Tags that map directly to type chips — excluded from Row 2
const TYPE_TAG_NAMES = new Set(["raw", "cooked", "juice", "raw vegan"]);

export default function RecipesPage() {
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState("");

  const { data: allRecipes, isLoading } = useRecipes();
  const deleteMutation = useDeleteRecipe();

  // Derive unique tags sorted by frequency, excluding type tags handled in Row 1
  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    (allRecipes ?? []).forEach((r) => {
      r.tags.forEach((t) => {
        if (!TYPE_TAG_NAMES.has(t.toLowerCase())) {
          counts.set(t, (counts.get(t) ?? 0) + 1);
        }
      });
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag)
      .slice(0, 20);
  }, [allRecipes]);

  const displayRecipes = useMemo(() => {
    return (allRecipes ?? []).filter((r) => {
      const matchesType = !typeFilter || getRecipeType(r) === typeFilter;
      const matchesTags =
        activeTags.length === 0 || activeTags.some((tag) => r.tags?.includes(tag));
      return matchesType && matchesTags;
    });
  }, [allRecipes, typeFilter, activeTags]);

  function toggleTag(tag: string) {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  function clearAllFilters() {
    setActiveTags([]);
    setTypeFilter("");
  }

  const hasActiveFilters = activeTags.length > 0 || !!typeFilter;

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] mb-3" style={{ color: "var(--sage)" }}>
            My Recipes
          </p>
          <h1
            className="font-display font-light leading-tight"
            style={{ fontSize: "clamp(2rem,4vw,3rem)", color: "var(--deep-green)" }}
          >
            Your saved <em className="italic" style={{ color: "var(--terracotta)" }}>favourites</em>
          </h1>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap">
          <Link
            href="/recipes/new"
            className="inline-flex items-center px-4 py-2.5 rounded-lg font-mono text-[10px] uppercase tracking-[0.15em] transition-opacity hover:opacity-80"
            style={{ border: "1px solid rgba(45,74,53,0.25)", color: "var(--deep-green)" }}
          >
            Create
          </Link>
          <Link
            href="/recipes/generate"
            className="inline-flex items-center px-4 py-2.5 rounded-lg font-mono text-[10px] uppercase tracking-[0.15em] transition-opacity hover:opacity-80"
            style={{ border: "1px solid rgba(45,74,53,0.25)", color: "var(--deep-green)" }}
          >
            From ingredients
          </Link>
          <Link
            href="/recipes/import"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-mono text-[10px] uppercase tracking-[0.15em] transition-opacity hover:opacity-80"
            style={{ background: "var(--deep-green)", color: "var(--cream)" }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Import
          </Link>
        </div>
      </div>

      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      {(allRecipes ?? []).length > 0 && (
        <div className="space-y-2.5">
          {/* Row 1 — Type chips (mutually exclusive) */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {TYPE_CHIPS.map(({ value, label }) => {
              const active = typeFilter === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTypeFilter(value)}
                  className="font-mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 rounded-full transition-colors"
                  style={{
                    background: active ? "var(--deep-green)" : "transparent",
                    color: active ? "var(--cream)" : "var(--sage)",
                    border: `1px solid ${active ? "var(--deep-green)" : "rgba(122,158,126,0.4)"}`,
                  }}
                >
                  {label}
                </button>
              );
            })}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="font-mono text-[9px] uppercase tracking-[0.12em] ml-1 transition-opacity hover:opacity-70"
                style={{ color: "var(--terracotta)" }}
              >
                Clear
              </button>
            )}
          </div>

          {/* Row 2 — Tag chips (multi-select, OR logic) */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((tag) => {
                const active = activeTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className="font-mono text-[9px] uppercase tracking-[0.1em] px-2.5 py-1 rounded-full transition-colors"
                    style={{
                      background: active ? "rgba(122,158,126,0.2)" : "transparent",
                      color: active ? "var(--deep-green)" : "var(--sage)",
                      border: `1px solid ${active ? "rgba(122,158,126,0.5)" : "rgba(122,158,126,0.25)"}`,
                      fontWeight: active ? 500 : 400,
                    }}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          )}

          {/* Result count */}
          {hasActiveFilters && (
            <p className="font-mono text-[9px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              {displayRecipes.length} result{displayRecipes.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      )}

      {/* Results */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-pulse">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 rounded-[14px]" style={{ background: "rgba(122,158,126,0.1)" }} />
          ))}
        </div>
      ) : displayRecipes.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center h-48 rounded-[14px] gap-3"
          style={{ border: "1px dashed rgba(122,158,126,0.3)" }}
        >
          <p className="font-display italic" style={{ color: "var(--text-muted)" }}>
            {hasActiveFilters
              ? "No recipes match the active filters."
              : "No saved recipes yet. Bookmark meals from your plan!"}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="font-mono text-[10px] uppercase tracking-[0.15em] transition-opacity hover:opacity-70"
              style={{ color: "var(--sage)" }}
            >
              Clear filters
            </button>
          )}
          {!hasActiveFilters && (
            <Link
              href="/recipes/import"
              className="font-mono text-[10px] uppercase tracking-[0.15em] transition-opacity hover:opacity-70"
              style={{ color: "var(--sage)" }}
            >
              + Import your own recipe
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayRecipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              activeTags={activeTags}
              onTagClick={toggleTag}
              onDelete={() => deleteMutation.mutate(recipe.id)}
              isDeleting={deleteMutation.isPending && deleteMutation.variables === recipe.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RecipeCard({
  recipe,
  activeTags,
  onTagClick,
  onDelete,
  isDeleting,
}: {
  recipe: Recipe;
  activeTags: string[];
  onTagClick: (tag: string) => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const isJuice = recipe.tags.includes("juice") || recipe.tags.includes("cold-pressed");
  const isRaw = !isJuice && (recipe.tags.includes("raw") || recipe.tags.includes("raw vegan"));

  const accentColor = isJuice
    ? "rgba(232,213,163,0.25)"
    : isRaw
    ? "rgba(168,197,160,0.1)"
    : "white";

  return (
    <div
      className="relative p-5 rounded-[14px] space-y-3 hover:shadow-md transition-shadow"
      style={{ background: accentColor, border: "1px solid rgba(122,158,126,0.15)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/recipes/${recipe.id}`} className="flex-1 min-w-0">
          <h3
            className="font-display font-light text-[1rem] leading-snug hover:underline underline-offset-2"
            style={{ color: "var(--deep-green)" }}
          >
            {recipe.name}
          </h3>
        </Link>
        <button
          onClick={onDelete}
          disabled={isDeleting}
          aria-label="Delete recipe"
          className="flex-shrink-0 p-1.5 rounded-md transition-colors disabled:opacity-50"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--terracotta)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)";
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" />
          </svg>
        </button>
      </div>

      {recipe.description && (
        <p
          className="font-display italic text-[0.8rem] leading-relaxed line-clamp-2"
          style={{ color: "var(--text-muted)" }}
        >
          {recipe.description}
        </p>
      )}

      {/* Clickable tags */}
      <div className="flex flex-wrap gap-1.5">
        {recipe.tags.slice(0, 5).map((tag) => {
          const active = activeTags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => onTagClick(tag)}
              className="font-mono text-[9px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full transition-colors"
              style={{
                background: active ? "rgba(122,158,126,0.3)" : "rgba(168,197,160,0.2)",
                color: active ? "var(--deep-green)" : "var(--sage)",
                border: `1px solid ${active ? "rgba(122,158,126,0.4)" : "transparent"}`,
                fontWeight: active ? 500 : 400,
              }}
            >
              {tag}
            </button>
          );
        })}
      </div>

      {recipe.prep_minutes && (
        <p className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>
          {recipe.prep_minutes} min prep
        </p>
      )}
    </div>
  );
}
