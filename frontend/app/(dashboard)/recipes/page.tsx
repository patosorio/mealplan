"use client";

import Link from "next/link";
import { useState } from "react";
import { useRecipes, useSearchRecipes, useDeleteRecipe } from "@/lib/api/recipes";
import type { Recipe } from "@/lib/api/recipes";

export default function RecipesPage() {
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");

  const { data: allRecipes, isLoading: loadingAll } = useRecipes();
  const { data: searchResults, isFetching: searching } = useSearchRecipes(activeQuery);
  const deleteMutation = useDeleteRecipe();

  const displayRecipes = activeQuery ? (searchResults ?? []) : (allRecipes ?? []);
  const isLoading = loadingAll || (!!activeQuery && searching);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setActiveQuery(query.trim());
  }

  function clearSearch() {
    setQuery("");
    setActiveQuery("");
  }

  return (
    <div className="space-y-8">
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

      {activeQuery && (
        <p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          {searching ? "Searching…" : `${displayRecipes.length} result${displayRecipes.length !== 1 ? "s" : ""} for "${activeQuery}"`}
        </p>
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
            {activeQuery ? "No recipes found for that search." : "No saved recipes yet. Bookmark meals from your plan!"}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayRecipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
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
  onDelete,
  isDeleting,
}: {
  recipe: Recipe;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  return (
    <div
      className="relative p-5 rounded-[14px] space-y-3 hover:shadow-md transition-shadow"
      style={{ background: "white", border: "1px solid rgba(122,158,126,0.15)" }}
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
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14H6L5 6" />
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

      <div className="flex flex-wrap gap-1.5">
        {recipe.tags.slice(0, 4).map((tag) => (
          <span
            key={tag}
            className="font-mono text-[9px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full"
            style={{ background: "rgba(168,197,160,0.2)", color: "var(--deep-green)" }}
          >
            {tag}
          </span>
        ))}
      </div>

      {recipe.prep_minutes && (
        <p className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>
          {recipe.prep_minutes} min prep
        </p>
      )}
    </div>
  );
}
