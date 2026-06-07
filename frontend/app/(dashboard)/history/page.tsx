"use client";

import Link from "next/link";
import { useState } from "react";
import { useMealPlanHistory, useDeletePlan, useClonePlan, useSchedulePlan } from "@/lib/api/meal-plans";
import type { MealPlan, PlanStatus } from "@/lib/types";
import { snapToMonday } from "@/lib/meal-plan-utils";

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
  const cloneMutation = useClonePlan();
  const scheduleMutation = useSchedulePlan();
  const [showClonePicker, setShowClonePicker] = useState(false);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [cloneWeek, setCloneWeek] = useState("");
  const [scheduleWeek, setScheduleWeek] = useState("");

  const weekLabel = new Date(plan.week_start + "T00:00:00").toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "long", year: "numeric" }
  );
  const diet = plan.diet_type.replace(/_/g, " ");

  async function handleClone() {
    if (!cloneWeek) return;
    await cloneMutation.mutateAsync({
      planId: plan.id,
      body: { scheduled_week: snapToMonday(cloneWeek) },
    });
    setShowClonePicker(false);
    setCloneWeek("");
  }

  async function handleSchedule() {
    if (!scheduleWeek) return;
    await scheduleMutation.mutateAsync({
      planId: plan.id,
      body: { scheduled_week: snapToMonday(scheduleWeek) },
    });
    setShowSchedulePicker(false);
    setScheduleWeek("");
  }

  return (
    <div
      className="rounded-[14px] transition-shadow hover:shadow-sm overflow-hidden"
      style={{ background: "white", border: "1px solid rgba(122,158,126,0.15)" }}
    >
      <div className="flex items-center justify-between px-5 py-4 flex-wrap gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p
              className="font-display font-light text-[1rem]"
              style={{ color: "var(--deep-green)" }}
            >
              {plan.name ?? `Week of ${weekLabel}`}
            </p>
            <PlanStatusBadge status={plan.status} />
          </div>
          <p
            className="font-mono text-[10px] uppercase tracking-[0.12em]"
            style={{ color: "var(--sage)" }}
          >
            {plan.name ? `Week of ${weekLabel} · ` : ""}{diet} · {plan.nutrition_avg.calories} kcal avg
          </p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right hidden sm:block">
            <p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Protein {plan.nutrition_avg.protein_g}g
            </p>
            <p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Fibre {plan.nutrition_avg.fiber_g}g
            </p>
          </div>

          {/* Schedule — any saved plan */}
          <button
            onClick={() => {
              setScheduleWeek(plan.scheduled_week ?? plan.week_start);
              setShowSchedulePicker((v) => !v);
              setShowClonePicker(false);
            }}
            className="font-mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 rounded-lg transition-colors"
            style={{ border: "1px solid rgba(122,158,126,0.4)", color: "var(--sage)" }}
          >
            Schedule
          </button>

          {/* Use again — approved plans only */}
          {plan.status === "approved" && (
            <button
              onClick={() => {
                setShowClonePicker((v) => !v);
                setShowSchedulePicker(false);
              }}
              className="font-mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 rounded-lg transition-colors"
              style={{ border: "1px solid rgba(168,197,160,0.5)", color: "var(--deep-green)" }}
            >
              Use again
            </button>
          )}

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

      {/* Schedule week picker */}
      {showSchedulePicker && (
        <div
          className="px-5 py-4 flex items-center gap-3 flex-wrap"
          style={{ borderTop: "1px solid rgba(122,158,126,0.12)", background: "rgba(247,243,236,0.5)" }}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--sage)" }}>
            Assign to calendar week starting:
          </p>
          <input
            type="date"
            value={scheduleWeek}
            onChange={(e) => setScheduleWeek(snapToMonday(e.target.value))}
            className="font-mono text-[11px] px-3 py-1.5 rounded-lg focus:outline-none"
            style={{ border: "1px solid rgba(122,158,126,0.3)", color: "var(--deep-green)", background: "white" }}
          />
          <button
            onClick={handleSchedule}
            disabled={!scheduleWeek || scheduleMutation.isPending}
            className="font-mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            style={{ background: "var(--deep-green)", color: "var(--cream)" }}
          >
            {scheduleMutation.isPending ? "Scheduling…" : "Schedule"}
          </button>
          <Link
            href="/calendar"
            className="font-mono text-[10px] uppercase tracking-[0.12em]"
            style={{ color: "var(--sage)" }}
          >
            View calendar →
          </Link>
          <button
            onClick={() => setShowSchedulePicker(false)}
            className="font-mono text-[10px] uppercase tracking-[0.12em]"
            style={{ color: "var(--text-muted)" }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Clone week picker */}
      {showClonePicker && (
        <div
          className="px-5 py-4 flex items-center gap-3 flex-wrap"
          style={{ borderTop: "1px solid rgba(122,158,126,0.12)", background: "rgba(247,243,236,0.5)" }}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--sage)" }}>
            Clone to week starting:
          </p>
          <input
            type="date"
            value={cloneWeek}
            onChange={(e) => setCloneWeek(snapToMonday(e.target.value))}
            className="font-mono text-[11px] px-3 py-1.5 rounded-lg focus:outline-none"
            style={{ border: "1px solid rgba(122,158,126,0.3)", color: "var(--deep-green)", background: "white" }}
          />
          <button
            onClick={handleClone}
            disabled={!cloneWeek || cloneMutation.isPending}
            className="font-mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            style={{ background: "var(--deep-green)", color: "var(--cream)" }}
          >
            {cloneMutation.isPending ? "Cloning…" : "Clone"}
          </button>
          <button
            onClick={() => setShowClonePicker(false)}
            className="font-mono text-[10px] uppercase tracking-[0.12em]"
            style={{ color: "var(--text-muted)" }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

const STATUS_CONFIG: Record<PlanStatus, { label: string; bg: string; color: string }> = {
  draft: { label: "Draft", bg: "rgba(122,158,126,0.1)", color: "var(--sage)" },
  reviewing: { label: "In Review", bg: "rgba(232,213,163,0.3)", color: "#8b7035" },
  approved: { label: "Approved ✓", bg: "rgba(168,197,160,0.25)", color: "var(--deep-green)" },
};

function PlanStatusBadge({ status }: { status: PlanStatus }) {
  const c = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return (
    <span
      className="font-mono text-[9px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full"
      style={{ background: c.bg, color: c.color }}
    >
      {c.label}
    </span>
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
