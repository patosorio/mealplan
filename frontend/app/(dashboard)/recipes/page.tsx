"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRecipes, useSearchRecipes, useDeleteRecipe } from "@/lib/api/recipes";
import type { Recipe } from "@/lib/api/recipes";
import {
  getRecipeType,
  recipeMatchesTypeFilter,
  type RecipeTypeFilter,
} from "@/lib/recipe-utils";

type TypeFilter = "all" | RecipeTypeFilter;

export default function RecipesPage() {
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const { data: allRecipes, isLoading: loadingAll } = useRecipes();
  const { data: searchResults, isFetching: searching } = useSearchRecipes(activeQuery);
  const deleteMutation = useDeleteRecipe();

  // Base results from search OR full list
  const baseRecipes: Recipe[] = activeQuery ? (searchResults ?? []) : (allRecipes ?? []);

  // Derive unique tags across all recipes (not search-filtered — always shows full tag set)
  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    (allRecipes ?? []).forEach((r) => {
      r.tags.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1));
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag)
      .slice(0, 24);
  }, [allRecipes]);

  // Derive available meal types from saved recipes (dynamic, not hardcoded)
  const availableTypes = useMemo((): TypeFilter[] => {
    const seen = new Set<RecipeTypeFilter>();
    (allRecipes ?? []).forEach((r) => {
      const t = getRecipeType(r);
      if (t) seen.add(t);
    });
    return ["all", ...(["raw", "cooked", "juice"] as RecipeTypeFilter[]).filter((t) => seen.has(t))];
  }, [allRecipes]);

  // Apply client-side filters on top of the base list
  const displayRecipes = useMemo(() => {
    let list = baseRecipes;
    if (typeFilter !== "all") {
      list = list.filter((r) => recipeMatchesTypeFilter(r, typeFilter));
    }
    if (activeTags.length > 0) {
      list = list.filter((r) => activeTags.every((t) => r.tags.includes(t)));
    }
    return list;
  }, [baseRecipes, typeFilter, activeTags]);

  const isLoading = loadingAll || (!!activeQuery && searching);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setActiveQuery(query.trim());
  }

  function clearSearch() {
    setQuery("");
    setActiveQuery("");
  }

  function toggleTag(tag: string) {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  function clearAllFilters() {
    setActiveTags([]);
    setTypeFilter("all");
    clearSearch();
  }

  const hasActiveFilters = activeTags.length > 0 || typeFilter !== "all" || !!activeQuery;

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
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
        <Link
          href="/recipes/import"
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-mono text-[10px] uppercase tracking-[0.15em] transition-opacity hover:opacity-80 mt-1"
          style={{ background: "var(--deep-green)", color: "var(--cream)" }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Recipe
        </Link>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search recipes…"
          className="flex-1 px-4 py-3 rounded-lg font-display text-[0.9rem] outline-none"
          style={{ background: "white", border: "1px solid rgba(122,158,126,0.3)", color: "var(--deep-green)" }}
        />
        {activeQuery ? (
          <button
            type="button"
            onClick={clearSearch}
            className="px-4 py-3 rounded-lg font-mono text-[11px] uppercase tracking-[0.15em]"
            style={{ border: "1px solid rgba(122,158,126,0.3)", color: "var(--sage)" }}
          >
            Clear
          </button>
        ) : (
          <button
            type="submit"
            disabled={!query.trim()}
            className="px-5 py-3 rounded-lg font-mono text-[11px] uppercase tracking-[0.15em] disabled:opacity-50"
            style={{ background: "var(--deep-green)", color: "var(--cream)" }}
          >
            Search
          </button>
        )}
      </form>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      {(allRecipes ?? []).length > 0 && (
        <div className="space-y-3">
          {/* Type filter */}
          {availableTypes.length > 1 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] mr-1" style={{ color: "var(--text-muted)" }}>
                Type
              </span>
              {availableTypes.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setTypeFilter(type)}
                  className="font-mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 rounded-full transition-colors"
                  style={{
                    background: typeFilter === type ? "var(--deep-green)" : "rgba(122,158,126,0.1)",
                    color: typeFilter === type ? "var(--cream)" : "var(--sage)",
                    border: `1px solid ${typeFilter === type ? "var(--deep-green)" : "rgba(122,158,126,0.2)"}`,
                  }}
                >
                  {type === "all" ? "All" : type}
                </button>
              ))}
            </div>
          )}

          {/* Tag filter pills */}
          {allTags.length > 0 && (
            <div className="flex items-start gap-2 flex-wrap">
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] mt-1.5 mr-1 flex-shrink-0" style={{ color: "var(--text-muted)" }}>
                Tags
              </span>
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
                        background: active ? "rgba(122,158,126,0.25)" : "rgba(247,243,236,0.9)",
                        color: active ? "var(--deep-green)" : "var(--sage)",
                        border: `1px solid ${active ? "rgba(122,158,126,0.4)" : "rgba(122,158,126,0.2)"}`,
                        fontWeight: active ? 500 : 400,
                      }}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Clear filters row */}
          {hasActiveFilters && (
            <div className="flex items-center gap-3">
              <p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                {searching
                  ? "Searching…"
                  : `${displayRecipes.length} result${displayRecipes.length !== 1 ? "s" : ""}`}
                {activeQuery && ` for "${activeQuery}"`}
                {activeTags.length > 0 && ` · ${activeTags.length} tag${activeTags.length > 1 ? "s" : ""}`}
                {typeFilter !== "all" && ` · ${typeFilter}`}
              </p>
              <button
                type="button"
                onClick={clearAllFilters}
                className="font-mono text-[10px] uppercase tracking-[0.12em] transition-opacity hover:opacity-70"
                style={{ color: "var(--terracotta)" }}
              >
                Clear all
              </button>
            </div>
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
