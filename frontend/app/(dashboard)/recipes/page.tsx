"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRecipes, useDeleteRecipe } from "@/lib/api/recipes";
import type { Recipe } from "@/lib/api/recipes";
import { getRecipeType } from "@/lib/recipe-utils";

// ── Constants ────────────────────────────────────────────────────────────────

const TYPE_CHIPS = [
  { value: "", label: "All" },
  { value: "raw", label: "Raw" },
  { value: "cooked", label: "Cooked" },
  { value: "juice", label: "Juice" },
] as const;

const JUICE_COLOURS = [
  { tag: "green",  bg: "#4a7c59", label: "Green"  },
  { tag: "orange", bg: "#e8843a", label: "Orange" },
  { tag: "yellow", bg: "#d4a843", label: "Yellow" },
  { tag: "red",    bg: "#c0392b", label: "Red"    },
  { tag: "purple", bg: "#7d4e9e", label: "Purple" },
  { tag: "pink",   bg: "#e8789a", label: "Pink"   },
] as const;

const COLOUR_TAG_NAMES = new Set(["green", "orange", "yellow", "red", "purple", "pink", "white"]);
const TYPE_TAG_NAMES   = new Set(["raw", "cooked", "juice", "raw vegan"]);

// ── Page ─────────────────────────────────────────────────────────────────────

export default function RecipesPage() {
  const [activeTags,      setActiveTags]      = useState<string[]>([]);
  const [typeFilter,      setTypeFilter]      = useState("");
  const [tagSearch,       setTagSearch]       = useState("");
  const [drawerOpen,      setDrawerOpen]      = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  const { data: allRecipes, isLoading } = useRecipes();
  const deleteMutation = useDeleteRecipe();

  // Non-colour, non-type tags, sorted by frequency
  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    (allRecipes ?? []).forEach((r) => {
      r.tags.forEach((t) => {
        const lower = t.toLowerCase();
        if (!TYPE_TAG_NAMES.has(lower) && !COLOUR_TAG_NAMES.has(lower)) {
          counts.set(t, (counts.get(t) ?? 0) + 1);
        }
      });
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
  }, [allRecipes]);

  const tagSuggestions = useMemo(() => {
    if (!tagSearch.trim()) return [];
    const q = tagSearch.toLowerCase();
    return allTags.filter(
      (t) => t.toLowerCase().includes(q) && !activeTags.includes(t)
    );
  }, [tagSearch, allTags, activeTags]);

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

  function addTagFromSearch(tag: string) {
    setActiveTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    setTagSearch("");
    tagInputRef.current?.focus();
  }

  function clearAllFilters() {
    setActiveTags([]);
    setTypeFilter("");
    setTagSearch("");
  }

  const hasActiveFilters = activeTags.length > 0 || !!typeFilter;
  const activeFilterCount = (typeFilter ? 1 : 0) + activeTags.length;
  const showColours = typeFilter === "" || typeFilter === "juice";

  // ── Filter panel (shared between sidebar and drawer) ─────────────────────

  const filterPanel = (
    <div className="space-y-5">
      {/* Section 1 — Type */}
      <div className="space-y-2">
        <p
          className="font-display font-light text-[0.7rem] uppercase tracking-[0.18em]"
          style={{ color: "var(--text-muted)" }}
        >
          Type
        </p>
        <div className="flex flex-wrap gap-1.5">
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
        </div>
      </div>

      {/* Section 2 — Colour (juice / all) */}
      {showColours && (
        <div className="space-y-2">
          <p
            className="font-display font-light text-[0.7rem] uppercase tracking-[0.18em]"
            style={{ color: "var(--text-muted)" }}
          >
            Colour
          </p>
          <div className="flex gap-2.5 flex-wrap">
            {JUICE_COLOURS.map(({ tag, bg, label }) => {
              const active = activeTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  aria-label={label}
                  title={label}
                  onClick={() => toggleTag(tag)}
                  className="transition-transform hover:scale-110"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: bg,
                    flexShrink: 0,
                    outline: active ? `3px solid ${bg}` : "none",
                    outlineOffset: active ? 2 : 0,
                    boxShadow: active ? "0 0 0 2px white, 0 0 0 4px " + bg : "none",
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Section 3 — Tags (searchable) */}
      <div className="space-y-2">
        <p
          className="font-display font-light text-[0.7rem] uppercase tracking-[0.18em]"
          style={{ color: "var(--text-muted)" }}
        >
          Tags
        </p>

        {/* Search input + dropdown */}
        <div className="relative">
          <input
            ref={tagInputRef}
            type="text"
            value={tagSearch}
            onChange={(e) => setTagSearch(e.target.value)}
            placeholder="Search tags…"
            className="w-full font-mono text-[10px] px-3 py-2 rounded-lg outline-none transition-colors"
            style={{
              background: "rgba(122,158,126,0.07)",
              border: "1px solid rgba(122,158,126,0.25)",
              color: "var(--deep-green)",
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setTagSearch("");
              if (e.key === "Enter" && tagSuggestions.length > 0) {
                addTagFromSearch(tagSuggestions[0]);
              }
            }}
          />
          {tagSuggestions.length > 0 && (
            <div
              className="absolute z-20 left-0 right-0 top-full mt-1 rounded-lg overflow-hidden shadow-lg"
              style={{
                background: "var(--cream)",
                border: "1px solid rgba(122,158,126,0.25)",
                maxHeight: 180,
                overflowY: "auto",
              }}
            >
              {tagSuggestions.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addTagFromSearch(tag);
                  }}
                  className="w-full text-left font-mono text-[10px] px-3 py-2 transition-colors hover:bg-sage/10"
                  style={{ color: "var(--deep-green)" }}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected tag chips */}
        {activeTags.filter((t) => !COLOUR_TAG_NAMES.has(t.toLowerCase())).length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {activeTags
              .filter((t) => !COLOUR_TAG_NAMES.has(t.toLowerCase()))
              .map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] px-2.5 py-1 rounded-full"
                  style={{
                    background: "rgba(122,158,126,0.15)",
                    color: "var(--deep-green)",
                    border: "1px solid rgba(122,158,126,0.4)",
                  }}
                >
                  {tag}
                  <button
                    type="button"
                    aria-label={`Remove ${tag}`}
                    onClick={() => toggleTag(tag)}
                    className="leading-none opacity-60 hover:opacity-100"
                  >
                    ×
                  </button>
                </span>
              ))}
          </div>
        )}
      </div>

      {/* Clear all */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={clearAllFilters}
          className="font-mono text-[9px] uppercase tracking-[0.12em] transition-opacity hover:opacity-70"
          style={{ color: "var(--terracotta)" }}
        >
          Clear all
        </button>
      )}
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────

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
          {/* Mobile filter button */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg font-mono text-[10px] uppercase tracking-[0.15em] transition-opacity hover:opacity-80 md:hidden"
            style={{ border: "1px solid rgba(45,74,53,0.25)", color: "var(--deep-green)" }}
          >
            Filter
            {activeFilterCount > 0 && (
              <span
                className="inline-flex items-center justify-center rounded-full font-mono text-[9px]"
                style={{
                  background: "var(--deep-green)",
                  color: "var(--cream)",
                  width: 18,
                  height: 18,
                  lineHeight: 1,
                }}
              >
                {activeFilterCount}
              </span>
            )}
          </button>

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

      {/* Body: sidebar + grid */}
      <div className="flex gap-8 items-start">
        {/* Desktop filter sidebar */}
        {(allRecipes ?? []).length > 0 && (
          <aside
            className="hidden md:block shrink-0 sticky top-4"
            style={{ width: 200 }}
          >
            {filterPanel}
          </aside>
        )}

        {/* Recipe grid */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* Result count */}
          {hasActiveFilters && !isLoading && (
            <p className="font-mono text-[9px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              {displayRecipes.length} result{displayRecipes.length !== 1 ? "s" : ""}
            </p>
          )}

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
      </div>

      {/* ── Mobile filter drawer ───────────────────────────────────────────── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.35)" }}
            onClick={() => setDrawerOpen(false)}
          />

          {/* Drawer */}
          <div
            className="absolute bottom-0 left-0 right-0 rounded-t-2xl overflow-y-auto"
            style={{
              background: "var(--cream)",
              maxHeight: "85vh",
              animation: "slideUp 0.25s ease-out",
            }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ background: "rgba(45,74,53,0.2)" }} />
            </div>

            <div className="px-6 pt-3 pb-4">
              <div className="flex items-center justify-between mb-5">
                <p
                  className="font-display font-light text-[1.1rem]"
                  style={{ color: "var(--deep-green)" }}
                >
                  Filters
                </p>
                {hasActiveFilters && (
                  <span
                    className="font-mono text-[9px] uppercase tracking-wide px-2 py-1 rounded-full"
                    style={{
                      background: "rgba(45,74,53,0.1)",
                      color: "var(--deep-green)",
                    }}
                  >
                    {activeFilterCount} active
                  </span>
                )}
              </div>

              {filterPanel}
            </div>

            {/* Done button */}
            <div
              className="sticky bottom-0 px-6 py-4"
              style={{
                background: "var(--cream)",
                borderTop: "1px solid rgba(122,158,126,0.15)",
              }}
            >
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="w-full py-3 rounded-xl font-mono text-[10px] uppercase tracking-[0.15em] transition-opacity hover:opacity-80"
                style={{ background: "var(--deep-green)", color: "var(--cream)" }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── RecipeCard ────────────────────────────────────────────────────────────────

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
