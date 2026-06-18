"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase";
import { subscribeToCalendarWeeks, type CalendarWeekDoc } from "@/lib/calendar";
import { useMealPlanHistory } from "@/lib/api/meal-plans";
import {
  dateToDayName,
  formatWeekLabel,
  getDayScheduleEntries,
  getDefaultWeekStart,
  snapToMonday,
  type DayScheduleEntry,
} from "@/lib/meal-plan-utils";

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const TYPE_DOT: Record<string, string> = {
  raw: "var(--raw-accent)",
  cooked: "var(--cooked-accent)",
  juice: "#d4a843",
};

interface SelectedMeal {
  dateStr: string;
  dayLabel: string;
  entry: DayScheduleEntry;
}

export default function CalendarPage() {
  const [weekStart, setWeekStart] = useState(getDefaultWeekStart);
  const [firestoreWeeks, setFirestoreWeeks] = useState<Record<string, CalendarWeekDoc>>({});
  const [selected, setSelected] = useState<SelectedMeal | null>(null);
  const { data: allPlans } = useMealPlanHistory();

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    return subscribeToCalendarWeeks(uid, setFirestoreWeeks);
  }, []);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const scheduled = firestoreWeeks[weekStart] ?? null;
  const fallbackPlan = allPlans?.find((p) => p.scheduled_week === weekStart);

  const activePlan = scheduled
    ? allPlans?.find((p) => p.id === scheduled.plan_id)
    : fallbackPlan;

  function prevWeek() {
    setWeekStart((w) => addDays(w, -7));
    setSelected(null);
  }

  function nextWeek() {
    setWeekStart((w) => addDays(w, 7));
    setSelected(null);
  }

  function handleWeekChange(value: string) {
    setWeekStart(snapToMonday(value));
    setSelected(null);
  }

  function isSameSelection(dateStr: string, entry: DayScheduleEntry) {
    return (
      selected?.dateStr === dateStr &&
      selected.entry.label === entry.label &&
      selected.entry.name === entry.name
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] mb-3" style={{ color: "var(--sage)" }}>
            Calendar
          </p>
          <h1
            className="font-display font-light leading-tight"
            style={{ fontSize: "clamp(2rem,4vw,3rem)", color: "var(--deep-green)" }}
          >
            Your meal <em className="italic" style={{ color: "var(--terracotta)" }}>schedule</em>
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={prevWeek}
            className="font-mono text-[10px] uppercase tracking-[0.12em] px-3 py-2 rounded-lg"
            style={{ border: "1px solid rgba(122,158,126,0.3)", color: "var(--sage)" }}
          >
            ← Prev
          </button>
          <input
            type="date"
            value={weekStart}
            onChange={(e) => handleWeekChange(e.target.value)}
            className="font-mono text-[11px] px-3 py-2 rounded-lg outline-none"
            style={{ border: "1px solid rgba(122,158,126,0.3)", color: "var(--deep-green)", background: "white" }}
          />
          <button
            type="button"
            onClick={nextWeek}
            className="font-mono text-[10px] uppercase tracking-[0.12em] px-3 py-2 rounded-lg"
            style={{ border: "1px solid rgba(122,158,126,0.3)", color: "var(--sage)" }}
          >
            Next →
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="font-mono text-[10px] uppercase tracking-[0.15em]" style={{ color: "var(--text-muted)" }}>
          Week of {formatWeekLabel(weekStart)}
        </p>
        {activePlan && (
          <Link
            href={`/meal-plan/${activePlan.id}`}
            className="font-mono text-[10px] uppercase tracking-[0.12em] transition-opacity hover:opacity-70"
            style={{ color: "var(--sage)" }}
          >
            {activePlan.name ?? "View full plan"} →
          </Link>
        )}
      </div>

      {!activePlan ? (
        <div
          className="text-center py-12 rounded-[14px]"
          style={{ border: "1px dashed rgba(122,158,126,0.25)" }}
        >
          <p className="font-display italic mb-3" style={{ color: "var(--text-muted)" }}>
            No plan scheduled for this week.
          </p>
          <Link
            href="/history"
            className="font-mono text-[10px] uppercase tracking-[0.12em] px-4 py-2 rounded-lg inline-block"
            style={{ border: "1px solid rgba(122,158,126,0.3)", color: "var(--deep-green)" }}
          >
            Schedule from History →
          </Link>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-4 items-start">
          <div
            className="flex-1 min-w-0 rounded-[14px] overflow-x-auto"
            style={{ background: "white", border: "1px solid rgba(122,158,126,0.15)" }}
          >
            <div className="grid grid-cols-7 min-w-[720px] divide-x" style={{ borderColor: "rgba(122,158,126,0.12)" }}>
              {weekDays.map((dateStr) => {
                const dayName = dateToDayName(weekStart, dateStr);
                const dayPlan = activePlan.plan_data.days[dayName];
                const entries = getDayScheduleEntries(dayPlan);
                const label = new Date(dateStr + "T00:00:00").toLocaleDateString("en-GB", {
                  weekday: "short",
                  day: "numeric",
                });

                return (
                  <div key={dateStr} className="flex flex-col min-h-[280px]">
                    <div
                      className="px-2 py-2 text-center"
                      style={{ borderBottom: "1px solid rgba(122,158,126,0.12)", background: "rgba(247,243,236,0.5)" }}
                    >
                      <p className="font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: "var(--sage)" }}>
                        {label}
                      </p>
                    </div>

                    <div className="flex-1 p-2 space-y-1.5">
                      {entries.length === 0 ? (
                        <p className="font-display italic text-[0.7rem] px-1 py-2" style={{ color: "var(--text-muted)" }}>
                          No meals
                        </p>
                      ) : (
                        entries.map((entry, i) => (
                          <ScheduleMealRow
                            key={`${dayName}-${entry.label}-${i}`}
                            entry={entry}
                            isSelected={isSameSelection(dateStr, entry)}
                            onSelect={() =>
                              setSelected(
                                isSameSelection(dateStr, entry)
                                  ? null
                                  : { dateStr, dayLabel: label, entry }
                              )
                            }
                          />
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <CalendarMealDetailPanel selected={selected} onClose={() => setSelected(null)} />
        </div>
      )}
    </div>
  );
}

function ScheduleMealRow({
  entry,
  isSelected,
  onSelect,
}: {
  entry: DayScheduleEntry;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const dotColor = TYPE_DOT[entry.type] ?? "var(--sage)";

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full text-left rounded-md px-2 py-1.5 transition-all"
      style={{
        background: isSelected
          ? "rgba(45,74,53,0.12)"
          : entry.kind === "juice"
          ? "rgba(232,213,163,0.2)"
          : entry.kind === "snack"
          ? "rgba(122,158,126,0.06)"
          : "rgba(122,158,126,0.08)",
        border: isSelected
          ? "1px solid rgba(45,74,53,0.35)"
          : "1px solid rgba(122,158,126,0.12)",
        boxShadow: isSelected ? "0 0 0 1px rgba(45,74,53,0.08)" : undefined,
      }}
    >
      <div className="flex items-center gap-1 mb-0.5">
        <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: dotColor }} />
        <span
          className="font-mono text-[7px] uppercase tracking-[0.12em] truncate"
          style={{ color: entry.kind === "juice" ? "#8b7035" : "var(--text-muted)" }}
        >
          {entry.label}
        </span>
      </div>
      <p
        className="font-display text-[0.68rem] leading-snug line-clamp-2 pl-2"
        style={{ color: "var(--deep-green)" }}
      >
        {entry.name}
      </p>
    </button>
  );
}

function CalendarMealDetailPanel({
  selected,
  onClose,
}: {
  selected: SelectedMeal | null;
  onClose: () => void;
}) {
  const entry = selected?.entry;
  const isJuice = entry?.kind === "juice";

  return (
    <div
      className="w-full lg:w-[280px] flex-shrink-0 rounded-[14px] p-5 space-y-4 lg:sticky lg:top-4 min-h-[200px]"
      style={{
        background: selected
          ? isJuice
            ? "rgba(232,213,163,0.15)"
            : "rgba(247,243,236,0.95)"
          : "rgba(247,243,236,0.5)",
        border: selected
          ? isJuice
            ? "1px solid rgba(232,213,163,0.4)"
            : "1px solid rgba(122,158,126,0.25)"
          : "1px dashed rgba(122,158,126,0.25)",
      }}
    >
      {!selected || !entry ? (
        <div className="flex flex-col items-center justify-center text-center py-6 gap-2">
          <span style={{ color: "var(--sage)", opacity: 0.5, fontSize: "1.25rem" }}>✦</span>
          <p className="font-display italic text-[0.85rem]" style={{ color: "var(--text-muted)" }}>
            Click any meal in the week to preview its recipe here.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p
                className="font-mono text-[9px] uppercase tracking-[0.15em] mb-1"
                style={{ color: isJuice ? "#8b7035" : "var(--sage)" }}
              >
                {entry.label} · {selected.dayLabel}
              </p>
              <h3
                className="font-display text-[1.05rem] font-light leading-snug"
                style={{ color: "var(--deep-green)" }}
              >
                {entry.name}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close detail"
              className="p-1 rounded transition-opacity hover:opacity-60 flex-shrink-0"
              style={{ color: "var(--text-muted)" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {entry.description && (
            <p
              className="font-display text-[0.82rem] font-light italic leading-relaxed"
              style={{ color: "var(--text-muted)" }}
            >
              {entry.description}
            </p>
          )}

          {(entry.tags ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {(entry.tags ?? []).slice(0, 6).map((tag) => (
                <span
                  key={tag}
                  className="font-mono text-[8px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-full"
                  style={{
                    background: isJuice
                      ? "rgba(232,213,163,0.3)"
                      : entry.type === "raw"
                      ? "rgba(168,197,160,0.2)"
                      : "rgba(212,149,106,0.15)",
                    color: isJuice ? "#8b7035" : entry.type === "raw" ? "var(--deep-green)" : "var(--warm-brown)",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {entry.prep_minutes != null && entry.prep_minutes > 0 && (
            <p className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>
              {entry.prep_minutes} min prep
            </p>
          )}

          {(entry.ingredients ?? []).length > 0 && (
            <div className="space-y-1.5">
              <p className="font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: "var(--sage)" }}>
                Ingredients
              </p>
              <ul className="space-y-0.5">
                {(entry.ingredients ?? []).map((item) => (
                  <li
                    key={item}
                    className="font-display text-[0.78rem] font-light leading-snug pl-3 relative before:content-['·'] before:absolute before:left-0"
                    style={{ color: "var(--deep-green)" }}
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {entry.kind === "snack" && !entry.description && (
            <p className="font-display text-[0.82rem] font-light italic" style={{ color: "var(--text-muted)" }}>
              {entry.name}
            </p>
          )}
        </>
      )}
    </div>
  );
}
