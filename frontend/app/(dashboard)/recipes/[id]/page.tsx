"use client";

import Link from "next/link";
import { use } from "react";
import { useExpandRecipe } from "@/lib/api/recipes";
import type { RecipeIngredient, RecipeStep } from "@/lib/types";

export default function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: recipe, isLoading, error } = useExpandRecipe(id);

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
          {/* Header */}
          <div className="space-y-3">
            <p
              className="font-mono text-[11px] uppercase tracking-[0.2em]"
              style={{ color: "var(--sage)" }}
            >
              Saved Recipe
            </p>
            <h1
              className="font-display font-light leading-tight"
              style={{ fontSize: "clamp(1.8rem,4vw,2.8rem)", color: "var(--deep-green)" }}
            >
              {recipe.name}
            </h1>
            {recipe.description && (
              <p
                className="font-display italic text-[0.95rem] leading-relaxed"
                style={{ color: "var(--text-muted)" }}
              >
                {recipe.description}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              {recipe.prep_minutes && (
                <span
                  className="font-mono text-[10px] uppercase tracking-[0.12em]"
                  style={{ color: "var(--text-muted)" }}
                >
                  {recipe.prep_minutes} min prep
                </span>
              )}
              {recipe.diet_type && (
                <span
                  className="font-mono text-[9px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(196,122,74,0.12)", color: "var(--terracotta)" }}
                >
                  {recipe.diet_type}
                </span>
              )}
              {recipe.tags.slice(0, 5).map((tag) => (
                <span
                  key={tag}
                  className="font-mono text-[9px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(168,197,160,0.2)", color: "var(--deep-green)" }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {recipe.ingredients.length === 0 && recipe.steps.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center h-32 rounded-[14px] gap-2"
              style={{ border: "1px dashed rgba(122,158,126,0.3)" }}
            >
              <p
                className="font-display italic text-[0.85rem]"
                style={{ color: "var(--text-muted)" }}
              >
                Recipe details couldn't be generated right now.
              </p>
              <p
                className="font-mono text-[10px] uppercase tracking-wide"
                style={{ color: "var(--text-muted)" }}
              >
                Try again later
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Ingredients */}
              {recipe.ingredients.length > 0 && (
                <section className="space-y-4">
                  <h2
                    className="font-mono text-[11px] uppercase tracking-[0.2em]"
                    style={{ color: "var(--sage)" }}
                  >
                    Ingredients
                    <span
                      className="ml-2 normal-case tracking-normal"
                      style={{ color: "var(--text-muted)" }}
                    >
                      — 2 servings
                    </span>
                  </h2>
                  <ul
                    className="rounded-[14px] divide-y overflow-hidden"
                    style={{
                      border: "1px solid rgba(122,158,126,0.15)",
                      background: "white",
                      divideColor: "rgba(122,158,126,0.1)",
                    }}
                  >
                    {recipe.ingredients.map((ing: RecipeIngredient, i: number) => (
                      <li key={i} className="flex items-baseline gap-3 px-5 py-3">
                        <span
                          className="font-mono text-[11px] shrink-0 w-20 text-right"
                          style={{ color: "var(--terracotta)" }}
                        >
                          {ing.amount}
                        </span>
                        <span
                          className="font-display text-[0.9rem]"
                          style={{ color: "var(--deep-green)" }}
                        >
                          {ing.name}
                          {ing.notes && (
                            <span
                              className="ml-1.5 italic text-[0.8rem]"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {ing.notes}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Steps */}
              {recipe.steps.length > 0 && (
                <section className="space-y-4">
                  <h2
                    className="font-mono text-[11px] uppercase tracking-[0.2em]"
                    style={{ color: "var(--sage)" }}
                  >
                    Method
                  </h2>
                  <ol className="space-y-3">
                    {recipe.steps.map((step: RecipeStep) => (
                      <li key={step.step} className="flex gap-4">
                        <span
                          className="font-mono text-[11px] shrink-0 w-6 pt-0.5 text-right"
                          style={{ color: "var(--sage)" }}
                        >
                          {step.step}.
                        </span>
                        <p
                          className="font-display text-[0.9rem] leading-relaxed"
                          style={{ color: "var(--deep-green)" }}
                        >
                          {step.instruction}
                        </p>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/recipes"
      className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] transition-opacity hover:opacity-70"
      style={{ color: "var(--sage)" }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <polyline points="15 18 9 12 15 6" />
      </svg>
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
        <div className="h-4 w-full rounded" style={{ background: "rgba(122,158,126,0.1)" }} />
        <div className="h-4 w-4/5 rounded" style={{ background: "rgba(122,158,126,0.1)" }} />
      </div>
      <div className="space-y-3">
        <div className="h-3 w-24 rounded" style={{ background: "rgba(122,158,126,0.2)" }} />
        <div className="rounded-[14px] overflow-hidden" style={{ border: "1px solid rgba(122,158,126,0.15)" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-10 border-b"
              style={{ background: i % 2 === 0 ? "white" : "rgba(122,158,126,0.04)", borderColor: "rgba(122,158,126,0.1)" }}
            />
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <div className="h-3 w-16 rounded" style={{ background: "rgba(122,158,126,0.2)" }} />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-4">
            <div className="h-4 w-4 rounded shrink-0 mt-0.5" style={{ background: "rgba(122,158,126,0.15)" }} />
            <div
              className="h-4 rounded"
              style={{ background: "rgba(122,158,126,0.1)", width: `${65 + (i % 3) * 10}%` }}
            />
          </div>
        ))}
      </div>
      <p
        className="font-mono text-[10px] uppercase tracking-[0.15em] text-center pt-2"
        style={{ color: "var(--sage)" }}
      >
        Generating recipe…
      </p>
    </div>
  );
}
