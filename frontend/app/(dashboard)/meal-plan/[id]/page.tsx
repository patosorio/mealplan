"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import type { DayName, MealItem, MealPlan, MealSlot } from "@/lib/types";
import { DAYS } from "@/lib/types";
import { activeDaysFromPlan, buildSavedRecipeState } from "@/lib/meal-plan-utils";
import { auth } from "@/lib/firebase";
import { syncPlanToCalendar } from "@/lib/calendar";
import {
  useMealPlan,
  usePlanMeals,
  useSaveFromPlan,
  useSavePlan,
  usePatchMealPlan,
  useApprovePlan,
  usePatchGeneratedMeal,
  useSwapMeal,
} from "@/lib/api/meal-plans";
import { useRecipes } from "@/lib/api/recipes";
import { WeeklyPlanGrid } from "@/components/meal-plan/WeeklyPlanGrid";
import { buildGridConfigFromPlan } from "@/lib/types/grid";
import { ReviewMealCard } from "@/components/meal-plan/ReviewMealCard";
import { ApprovePlanModal } from "@/components/meal-plan/ApprovePlanModal";
import { LoadingSkeleton } from "@/components/meal-plan/LoadingSkeleton";

export default function SavedPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: plan, isLoading, error } = useMealPlan(id);
  const { data: allMeals, isLoading: mealsLoading } = usePlanMeals(id);
  const { data: planRecipes } = useRecipes(id);

  const saveFromPlanMutation = useSaveFromPlan();
  const savePlanMutation = useSavePlan();
  const patchPlanMutation = usePatchMealPlan();
  const approvePlanMutation = useApprovePlan();
  const patchMealMutation = usePatchGeneratedMeal();
  const swapMealMutation = useSwapMeal();

  const [savedMealIds, setSavedMealIds] = useState<Map<string, string>>(new Map());
  const [savedJuiceKeys, setSavedJuiceKeys] = useState<Set<string>>(new Set());
  const [activeDay, setActiveDay] = useState<DayName>(DAYS[0]);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approveAcceptAll, setApproveAcceptAll] = useState(false);

  useEffect(() => {
    if (!planRecipes) return;
    const { savedMealIds: meals, savedJuiceKeys: juices } = buildSavedRecipeState(
      id,
      planRecipes
    );
    setSavedMealIds(meals);
    setSavedJuiceKeys(juices);
  }, [id, planRecipes]);

  useEffect(() => {
    if (!plan) return;
    // Backfill generated_meals when bookmarking happened before Save Plan
    savePlanMutation.mutate(plan.id);
  }, [plan?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!plan?.scheduled_week) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    void syncPlanToCalendar(uid, plan, plan.scheduled_week);
  }, [plan?.id, plan?.approved_at, plan?.plan_data, plan?.name, plan?.scheduled_week]);

  async function handleBookmark(meal: MealItem, day: DayName, slot: MealSlot) {
    const saved = await saveFromPlanMutation.mutateAsync({
      planId: id,
      day,
      mealType: slot,
      recipeId: meal.recipe_id ?? null,
    });
    setSavedMealIds((prev) => new Map([...prev, [`${id}-${day}-${slot}`, saved.id]]));
  }

  async function handleBookmarkJuice(day: DayName, juiceIndex: number, recipeId?: string | null) {
    await saveFromPlanMutation.mutateAsync({
      planId: id,
      day,
      mealType: "juice",
      juiceIndex,
      recipeId: recipeId ?? null,
    });
    setSavedJuiceKeys((prev) => new Set([...prev, `${id}-${day}-juice_${juiceIndex}`]));
  }

  async function handleEnterReview() {
    await savePlanMutation.mutateAsync(id);
    await patchPlanMutation.mutateAsync({ planId: id, body: { status: "reviewing" } });
  }

  async function handleExitReview() {
    await patchPlanMutation.mutateAsync({ planId: id, body: { status: "draft" } });
  }

  async function handleAcceptMeal(mealId: string) {
    await patchMealMutation.mutateAsync({
      planId: id,
      mealId,
      body: { action: "accept" },
    });
  }

  async function handleSwapMeal(mealId: string) {
    await swapMealMutation.mutateAsync({ planId: id, mealId });
  }

  async function handleEditMeal(mealId: string, name: string, description: string) {
    await patchMealMutation.mutateAsync({
      planId: id,
      mealId,
      body: { action: "edit", name, description },
    });
  }

  async function handleApprovePlan(name: string) {
    await approvePlanMutation.mutateAsync({
      planId: id,
      body: { name, accept_all: approveAcceptAll },
    });
    setShowApproveModal(false);
    setApproveAcceptAll(false);
  }

  function openApproveModal(acceptAll: boolean) {
    setApproveAcceptAll(acceptAll);
    setShowApproveModal(true);
  }

  if (isLoading || mealsLoading) {
    return (
      <div className="space-y-8">
        <BackLink />
        <LoadingSkeleton />
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="space-y-8">
        <BackLink />
        <div
          className="px-5 py-3 rounded-lg font-mono text-[11px] tracking-wide"
          style={{
            background: "rgba(196,122,74,0.1)",
            color: "var(--terracotta)",
            border: "1px solid rgba(196,122,74,0.3)",
          }}
        >
          Could not load this plan. It may have been deleted.
        </div>
      </div>
    );
  }

  // Meals for the active day in review mode
  const dayMeals = (allMeals ?? []).filter(
    (m) => m.day === activeDay && m.approval_status !== "swapped"
  );
  const totalActiveMeals = (allMeals ?? []).filter((m) => m.approval_status !== "swapped");
  const allAccepted =
    totalActiveMeals.length > 0 &&
    totalActiveMeals.every((m) => m.approval_status === "accepted");

  const isApproved = plan.status === "approved";
  const inReview = plan.status === "reviewing" && !isApproved;
  const planDays = activeDaysFromPlan(plan);
  const hasReviewableMeals = planHasReviewableMeals(plan);

  return (
    <>
      {showApproveModal && (
        <ApprovePlanModal
          acceptAll={approveAcceptAll}
          onApprove={handleApprovePlan}
          onClose={() => {
            setShowApproveModal(false);
            setApproveAcceptAll(false);
          }}
        />
      )}

      <div className="space-y-8">
        {/* Page header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <BackLink />
            <p
              className="font-mono text-[11px] uppercase tracking-[0.2em] mt-4 mb-1"
              style={{ color: "var(--sage)" }}
            >
              {isApproved ? "Approved Plan" : inReview ? "Review Mode" : "Saved Plan"}
            </p>
            <h1
              className="font-display font-light leading-tight"
              style={{ fontSize: "clamp(2rem,4vw,3rem)", color: "var(--deep-green)" }}
            >
              {plan.name ? (
                <>
                  <em className="italic" style={{ color: "var(--terracotta)" }}>{plan.name}</em>
                </>
              ) : (
                <>
                  Your <em className="italic" style={{ color: "var(--terracotta)" }}>saved</em> week
                </>
              )}
            </h1>
          </div>

          {/* Status badge */}
          <StatusBadge status={plan.status} />
        </div>

        {/* Review mode banner */}
        {inReview && (
          <div
            className="flex items-center justify-between gap-4 px-5 py-4 rounded-[14px] flex-wrap"
            style={{ background: "rgba(168,197,160,0.15)", border: "1px solid rgba(122,158,126,0.25)" }}
          >
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.15em] mb-0.5" style={{ color: "var(--deep-green)" }}>
                Review mode active
              </p>
              <p className="font-display text-[0.875rem] font-light italic" style={{ color: "var(--text-muted)" }}>
                Accept, edit or swap each meal — then approve when ready.
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={handleExitReview}
                disabled={patchPlanMutation.isPending}
                className="font-mono text-[11px] uppercase tracking-[0.15em] px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50"
                style={{ border: "1px solid rgba(122,158,126,0.4)", color: "var(--sage)" }}
              >
                Exit review
              </button>
              {allAccepted ? (
                <button
                  onClick={() => openApproveModal(false)}
                  className="font-mono text-[11px] uppercase tracking-[0.15em] px-4 py-2.5 rounded-lg transition-colors"
                  style={{ background: "var(--deep-green)", color: "var(--cream)" }}
                >
                  ✦ Approve Plan
                </button>
              ) : (
                <button
                  onClick={() => openApproveModal(true)}
                  className="font-mono text-[11px] uppercase tracking-[0.15em] px-4 py-2.5 rounded-lg transition-colors"
                  style={{ background: "var(--deep-green)", color: "var(--cream)" }}
                >
                  ✦ Approve All
                </button>
              )}
            </div>
          </div>
        )}

        {inReview ? (
          <div className="space-y-6">
            <div className="flex gap-2 flex-wrap">
              {planDays.map((day) => {
                const dayActiveMeals = (allMeals ?? []).filter(
                  (m) => m.day === day && m.approval_status !== "swapped"
                );
                const dayAllAccepted =
                  dayActiveMeals.length > 0 &&
                  dayActiveMeals.every((m) => m.approval_status === "accepted");
                return (
                  <button
                    key={day}
                    onClick={() => setActiveDay(day)}
                    className="font-mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 rounded-lg transition-colors"
                    style={{
                      background:
                        activeDay === day
                          ? "var(--deep-green)"
                          : dayAllAccepted
                          ? "rgba(168,197,160,0.25)"
                          : "transparent",
                      color:
                        activeDay === day
                          ? "var(--cream)"
                          : dayAllAccepted
                          ? "var(--deep-green)"
                          : "var(--sage)",
                      border:
                        activeDay === day
                          ? "1px solid var(--deep-green)"
                          : "1px solid rgba(122,158,126,0.25)",
                    }}
                  >
                    {day.slice(0, 3)}
                    {dayAllAccepted && " ✓"}
                  </button>
                );
              })}
            </div>

            {/* Meal cards for active day */}
            <div className="grid gap-4 md:grid-cols-3">
              {dayMeals.length === 0 ? (
                <p className="font-display italic col-span-3 py-4" style={{ color: "var(--text-muted)" }}>
                  No meals for {activeDay} in this plan.
                </p>
              ) : (
                dayMeals.map((meal) => (
                  <ReviewMealCard
                    key={meal.id}
                    meal={meal}
                    onAccept={handleAcceptMeal}
                    onSwap={handleSwapMeal}
                    onEdit={handleEditMeal}
                  />
                ))
              )}
            </div>
          </div>
        ) : (
          /* Standard plan view — weekly grid with print */
          <div
            className="p-4 sm:p-5 rounded-[14px] print:p-0 print:border-0 print:bg-transparent overflow-x-auto"
            style={{ background: "white", border: "1px solid rgba(122,158,126,0.15)" }}
          >
            <WeeklyPlanGrid
              gridConfig={buildGridConfigFromPlan(plan)}
              plan={plan}
              weekStart={plan.week_start}
              onBookmark={handleBookmark}
              onBookmarkJuice={handleBookmarkJuice}
              savedMealIds={savedMealIds}
              savedJuiceKeys={savedJuiceKeys}
              revealedDayCount={activeDaysFromPlan(plan).length}
            />
          </div>
        )}

        {/* Review / quick approve actions */}
        {!inReview && !isApproved && hasReviewableMeals && (
          <div className="pt-2 flex gap-3 flex-wrap">
            <button
              onClick={handleEnterReview}
              disabled={patchPlanMutation.isPending}
              className="font-mono text-[11px] uppercase tracking-[0.15em] px-5 py-3 rounded-lg transition-colors disabled:opacity-50"
              style={{ border: "1px solid rgba(45,74,53,0.3)", color: "var(--deep-green)" }}
            >
              {patchPlanMutation.isPending ? "Opening review…" : "Review meals →"}
            </button>
            <button
              onClick={() => openApproveModal(true)}
              disabled={approvePlanMutation.isPending}
              className="font-mono text-[11px] uppercase tracking-[0.15em] px-5 py-3 rounded-lg transition-colors disabled:opacity-50"
              style={{ background: "var(--deep-green)", color: "var(--cream)" }}
            >
              ✦ Approve All
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function planHasReviewableMeals(plan: MealPlan): boolean {
  return activeDaysFromPlan(plan).some((day) => {
    const dp = plan.plan_data.days[day];
    if (!dp) return false;
    return (
      dp.breakfast != null ||
      dp.lunch != null ||
      dp.dinner != null ||
      (dp.juices?.length ?? 0) > 0 ||
      (dp.extras?.length ?? 0) > 0
    );
  });
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; bg: string; color: string }> = {
    draft: { label: "Draft", bg: "rgba(122,158,126,0.1)", color: "var(--sage)" },
    reviewing: { label: "In Review", bg: "rgba(232,213,163,0.3)", color: "#8b7035" },
    approved: { label: "Approved ✓", bg: "rgba(168,197,160,0.25)", color: "var(--deep-green)" },
  };
  const c = config[status] ?? config.draft;
  return (
    <span
      className="self-start font-mono text-[10px] uppercase tracking-[0.15em] px-3 py-1.5 rounded-full"
      style={{ background: c.bg, color: c.color }}
    >
      {c.label}
    </span>
  );
}

function BackLink() {
  return (
    <Link
      href="/history"
      className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] transition-opacity hover:opacity-70"
      style={{ color: "var(--sage)" }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <polyline points="15 18 9 12 15 6" />
      </svg>
      Back to history
    </Link>
  );
}
