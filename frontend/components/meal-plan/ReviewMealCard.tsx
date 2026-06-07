"use client";

import { useState } from "react";
import type { GeneratedMeal } from "@/lib/types";

interface ReviewMealCardProps {
  meal: GeneratedMeal;
  onAccept: (mealId: string) => Promise<void>;
  onSwap: (mealId: string) => Promise<void>;
  onEdit: (mealId: string, name: string, description: string) => Promise<void>;
}

const SLOT_LABELS: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

function slotLabel(mealType: string): string {
  if (mealType in SLOT_LABELS) return SLOT_LABELS[mealType];
  if (mealType.startsWith("juice_")) {
    const n = parseInt(mealType.split("_")[1], 10);
    return isNaN(n) ? "Juice" : `Juice ${n + 1}`;
  }
  return mealType;
}

export function ReviewMealCard({ meal, onAccept, onSwap, onEdit }: ReviewMealCardProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(meal.name);
  const [editDesc, setEditDesc] = useState(meal.description ?? "");
  const [busy, setBusy] = useState<"accept" | "swap" | "edit" | null>(null);

  const isAccepted = meal.approval_status === "accepted";
  const isSwapped = meal.approval_status === "swapped";
  const isJuice = meal.type === "juice" || meal.meal_type.startsWith("juice_");
  const isRaw = meal.type === "raw";

  async function handleAccept() {
    if (isAccepted || busy) return;
    setBusy("accept");
    try {
      await onAccept(meal.id);
    } finally {
      setBusy(null);
    }
  }

  async function handleSwap() {
    if (busy) return;
    setBusy("swap");
    try {
      await onSwap(meal.id);
    } finally {
      setBusy(null);
    }
  }

  async function handleEditSave() {
    if (busy) return;
    setBusy("edit");
    try {
      await onEdit(meal.id, editName, editDesc);
      setEditing(false);
    } finally {
      setBusy(null);
    }
  }

  if (isSwapped) {
    return (
      <div
        className="relative p-5 rounded-[14px] opacity-40"
        style={{ background: "rgba(247,243,236,0.4)", border: "1px solid rgba(122,158,126,0.1)" }}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] mb-2" style={{ color: "var(--text-muted)" }}>
          {slotLabel(meal.meal_type)} — swapped
        </p>
        <p className="font-display text-[0.9rem] font-light italic line-through" style={{ color: "var(--text-muted)" }}>
          {meal.name}
        </p>
      </div>
    );
  }

  // Card colours differ for juices vs solid meals
  const cardBg = isAccepted
    ? isJuice ? "rgba(232,213,163,0.2)" : "rgba(168,197,160,0.12)"
    : isJuice ? "rgba(232,213,163,0.1)" : "rgba(247,243,236,0.6)";
  const cardBorder = isAccepted
    ? isJuice ? "1px solid rgba(232,213,163,0.5)" : "1px solid rgba(122,158,126,0.4)"
    : isJuice ? "1px solid rgba(232,213,163,0.3)" : "1px solid rgba(122,158,126,0.15)";
  const labelColor = isJuice ? "#8b7035" : "var(--sage)";
  const dotColor = isJuice ? "#e8d5a3" : isRaw ? "var(--raw-accent)" : "var(--cooked-accent)";
  const tagBg = isJuice
    ? "rgba(232,213,163,0.3)"
    : isRaw ? "rgba(168,197,160,0.2)" : "rgba(212,149,106,0.15)";
  const tagColor = isJuice ? "#8b7035" : isRaw ? "var(--deep-green)" : "var(--warm-brown)";

  return (
    <div
      className="relative p-5 rounded-[14px] transition-shadow"
      style={{ background: cardBg, border: cardBorder }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div
          className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em]"
          style={{ color: labelColor }}
        >
          {isJuice ? (
            <span className="text-sm leading-none">🥤</span>
          ) : (
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: dotColor }}
            />
          )}
          {slotLabel(meal.meal_type)}
          {meal.edited_manually && (
            <span className="ml-1 text-[9px]" style={{ color: "var(--terracotta)" }}>edited</span>
          )}
        </div>

        {isAccepted && (
          <span
            className="font-mono text-[9px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full"
            style={{ background: "rgba(122,158,126,0.2)", color: "var(--deep-green)" }}
          >
            ✓ Accepted
          </span>
        )}
      </div>

      {/* Edit form or display */}
      {editing ? (
        <div className="space-y-3 mb-4">
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg font-display text-[0.95rem] font-light focus:outline-none"
            style={{
              background: "rgba(247,243,236,0.8)",
              border: "1px solid rgba(122,158,126,0.3)",
              color: "var(--deep-green)",
            }}
            placeholder="Name"
          />
          <textarea
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 rounded-lg font-display text-[0.875rem] font-light italic focus:outline-none resize-none"
            style={{
              background: "rgba(247,243,236,0.8)",
              border: "1px solid rgba(122,158,126,0.3)",
              color: "var(--text-muted)",
            }}
            placeholder="Description"
          />
          <div className="flex gap-2">
            <button
              onClick={handleEditSave}
              disabled={!editName.trim() || !!busy}
              className="font-mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              style={{ background: "var(--deep-green)", color: "var(--cream)" }}
            >
              {busy === "edit" ? "Saving…" : "Save & Accept"}
            </button>
            <button
              onClick={() => { setEditing(false); setEditName(meal.name); setEditDesc(meal.description ?? ""); }}
              className="font-mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 rounded-lg transition-colors"
              style={{ border: "1px solid rgba(122,158,126,0.3)", color: "var(--sage)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <h3
            className="font-display text-[1.05rem] font-light leading-snug mb-2"
            style={{ color: "var(--deep-green)" }}
          >
            {meal.name}
          </h3>
          {meal.description && (
            <p
              className="font-display text-[0.875rem] font-light leading-relaxed italic mb-3"
              style={{ color: "var(--text-muted)" }}
            >
              {meal.description}
            </p>
          )}
        </>
      )}

      {/* Tags + prep time */}
      {!editing && (
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <div className="flex flex-wrap gap-1.5">
            {meal.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="font-mono text-[9px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full"
                style={{ background: tagBg, color: tagColor }}
              >
                {tag}
              </span>
            ))}
          </div>
          {meal.prep_minutes && (
            <span className="font-mono text-[10px] tracking-wide" style={{ color: "var(--text-muted)" }}>
              {meal.prep_minutes} min
            </span>
          )}
        </div>
      )}

      {/* Action buttons */}
      {!editing && !isAccepted && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleAccept}
            disabled={!!busy}
            className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            style={{ background: "var(--deep-green)", color: "var(--cream)" }}
          >
            <CheckIcon />
            {busy === "accept" ? "Accepting…" : "Accept"}
          </button>
          <button
            onClick={() => setEditing(true)}
            disabled={!!busy}
            className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            style={{ border: "1px solid rgba(122,158,126,0.3)", color: "var(--sage)" }}
          >
            <PenIcon />
            Edit
          </button>
          {/* Juices can't be AI-swapped — only solid meals can */}
          {!isJuice && (
            <button
              onClick={handleSwap}
              disabled={!!busy}
              className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              style={{ border: "1px solid rgba(196,122,74,0.3)", color: "var(--terracotta)" }}
            >
              <SwapIcon />
              {busy === "swap" ? "Swapping…" : "Swap"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function PenIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function SwapIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}
