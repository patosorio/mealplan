"use client";

import Link from "next/link";
import { useState } from "react";
import type { DayName, MealItem, MealSlot } from "@/lib/types";

interface MealCardProps {
  meal: MealItem;
  slot: MealSlot;
  day: DayName;
  planId: string;
  onBookmark?: (meal: MealItem, day: DayName, slot: MealSlot) => Promise<void>;
  isBookmarked?: boolean;
  savedRecipeId?: string;
}

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

export function MealCard({
  meal,
  slot,
  day,
  planId,
  onBookmark,
  isBookmarked = false,
  savedRecipeId,
}: MealCardProps) {
  const [bookmarking, setBookmarking] = useState(false);
  const [bookmarked, setBookmarked] = useState(isBookmarked);
  const [justSaved, setJustSaved] = useState(false);

  async function handleBookmark() {
    if (bookmarked || !onBookmark) return;
    setBookmarking(true);
    try {
      await onBookmark(meal, day, slot);
      setBookmarked(true);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch (err) {
      // 409 = already in recipes — treat as success
      if (err instanceof Error && err.message.includes("409")) {
        setBookmarked(true);
      }
    } finally {
      setBookmarking(false);
    }
  }

  const isRaw = meal.type === "raw";

  return (
    <div
      className="relative p-5 rounded-[14px] transition-shadow hover:shadow-md"
      style={{
        background: "rgba(247,243,236,0.6)",
        border: "1px solid rgba(122,158,126,0.15)",
      }}
    >
      {/* Meal slot label + type dot */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--sage)" }}>
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{
              backgroundColor: isRaw ? "var(--raw-accent)" : "var(--cooked-accent)",
            }}
          />
          {SLOT_LABELS[slot]}
        </div>

        {/* Bookmark button */}
        {onBookmark && (
          <button
            onClick={handleBookmark}
            disabled={bookmarked || bookmarking}
            aria-label={bookmarked ? "Saved to recipes" : "Save to my recipes"}
            className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-all disabled:cursor-default"
            style={{
              color: justSaved
                ? "var(--deep-green)"
                : bookmarked
                ? "var(--terracotta)"
                : "var(--sage)",
              opacity: bookmarking ? 0.6 : 1,
            }}
          >
            <BookmarkIcon filled={bookmarked} />
            {bookmarking ? "Saving…" : justSaved ? "Saved!" : bookmarked ? "Saved" : "Save"}
          </button>
        )}
      </div>

      {/* Meal name */}
      <h3
        className="font-display text-[1.1rem] font-light leading-snug mb-2"
        style={{ color: "var(--deep-green)" }}
      >
        {meal.name}
      </h3>

      {/* Description */}
      <p
        className="font-display text-[0.875rem] font-light leading-relaxed italic mb-3"
        style={{ color: "var(--text-muted)" }}
      >
        {meal.description}
      </p>

      {/* View recipe link — appears once saved */}
      {savedRecipeId && (
        <Link
          href={`/recipes/${savedRecipeId}`}
          className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] transition-opacity hover:opacity-70"
          style={{ color: "var(--sage)" }}
        >
          View recipe
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </Link>
      )}

      {/* Footer: tags + prep time */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex flex-wrap gap-1.5">
          {meal.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="font-mono text-[9px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full"
              style={{
                background: isRaw
                  ? "rgba(168,197,160,0.2)"
                  : "rgba(212,149,106,0.15)",
                color: isRaw ? "var(--deep-green)" : "var(--warm-brown)",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
        <span
          className="font-mono text-[10px] tracking-wide flex-shrink-0"
          style={{ color: "var(--text-muted)" }}
        >
          {meal.prep_minutes} min
        </span>
      </div>
    </div>
  );
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}
