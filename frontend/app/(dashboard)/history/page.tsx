"use client";

import Link from "next/link";
import { useMealPlanHistory, useDeletePlan } from "@/lib/api/meal-plans";
import type { MealPlan } from "@/lib/types";

export default function HistoryPage() {
  const { data: plans, isLoading, error } = useMealPlanHistory();
  const deleteMutation = useDeletePlan();

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 rounded-[14px]" style={{ background: "rgba(122,158,126,0.1)" }} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="font-mono text-[11px]" style={{ color: "var(--terracotta)" }}>
        Failed to load history. Please refresh.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] mb-3" style={{ color: "var(--sage)" }}>
          Plan History
        </p>
        <h1
          className="font-display font-light leading-tight"
          style={{ fontSize: "clamp(2rem,4vw,3rem)", color: "var(--deep-green)" }}
        >
          Your past <em className="italic" style={{ color: "var(--terracotta)" }}>plans</em>
        </h1>
      </div>

      {!plans || plans.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center h-48 rounded-[14px] gap-3"
          style={{ border: "1px dashed rgba(122,158,126,0.3)" }}
        >
          <p className="font-display italic" style={{ color: "var(--text-muted)" }}>
            No saved plans yet.
          </p>
          <Link href="/meal-plan">
            <span
              className="font-mono text-[10px] uppercase tracking-[0.15em] px-4 py-2 rounded-lg"
              style={{ background: "var(--deep-green)", color: "var(--cream)" }}
            >
              Generate your first plan
            </span>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => (
            <PlanHistoryCard
              key={plan.id}
              plan={plan}
              onDelete={() => deleteMutation.mutate(plan.id)}
              isDeleting={deleteMutation.isPending && deleteMutation.variables === plan.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PlanHistoryCard({
  plan,
  onDelete,
  isDeleting,
}: {
  plan: MealPlan;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const weekLabel = new Date(plan.week_start + "T00:00:00").toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "long", year: "numeric" }
  );
  const diet = plan.diet_type.replace(/_/g, " ");

  return (
    <div
      className="flex items-center justify-between px-5 py-4 rounded-[14px] transition-shadow hover:shadow-sm"
      style={{ background: "white", border: "1px solid rgba(122,158,126,0.15)" }}
    >
      <div className="space-y-1">
        <p
          className="font-display font-light text-[1rem]"
          style={{ color: "var(--deep-green)" }}
        >
          Week of {weekLabel}
        </p>
        <p
          className="font-mono text-[10px] uppercase tracking-[0.12em]"
          style={{ color: "var(--sage)" }}
        >
          {diet} · {plan.nutrition_avg.calories} kcal avg
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right hidden sm:block">
          <p
            className="font-mono text-[10px] uppercase tracking-wide"
            style={{ color: "var(--text-muted)" }}
          >
            Protein {plan.nutrition_avg.protein_g}g
          </p>
          <p
            className="font-mono text-[10px] uppercase tracking-wide"
            style={{ color: "var(--text-muted)" }}
          >
            Fibre {plan.nutrition_avg.fiber_g}g
          </p>
        </div>

        <Link href={`/meal-plan/${plan.id}`}>
          <span
            className="font-mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 rounded-lg transition-colors"
            style={{ border: "1px solid rgba(45,74,53,0.25)", color: "var(--deep-green)" }}
          >
            View
          </span>
        </Link>

        <button
          onClick={onDelete}
          disabled={isDeleting}
          aria-label="Delete plan"
          className="p-2 rounded-lg transition-colors disabled:opacity-50"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--terracotta)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)";
          }}
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}
