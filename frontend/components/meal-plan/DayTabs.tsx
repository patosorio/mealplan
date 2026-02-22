"use client";

import type { DayName } from "@/lib/types";
import { DAYS } from "@/lib/types";

interface DayTabsProps {
  activeDay: DayName;
  onSelect: (day: DayName) => void;
  onRegenerate?: (day: DayName) => void;
  isRegenerating?: boolean;
}

const DAY_SHORT: Record<DayName, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

export function DayTabs({
  activeDay,
  onSelect,
  onRegenerate,
  isRegenerating = false,
}: DayTabsProps) {
  return (
    <div className="flex items-center justify-between gap-1">
      <div className="flex gap-1 flex-wrap">
        {DAYS.map((day) => {
          const isActive = day === activeDay;
          return (
            <button
              key={day}
              onClick={() => onSelect(day)}
              className="font-mono text-[10px] uppercase tracking-[0.15em] px-3 py-2 rounded-lg transition-all"
              style={{
                background: isActive ? "var(--deep-green)" : "transparent",
                color: isActive ? "var(--cream)" : "var(--sage)",
                border: isActive ? "1px solid transparent" : "1px solid rgba(122,158,126,0.3)",
              }}
            >
              {DAY_SHORT[day]}
            </button>
          );
        })}
      </div>

      {onRegenerate && (
        <button
          onClick={() => onRegenerate(activeDay)}
          disabled={isRegenerating}
          className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] px-3 py-2 rounded-lg transition-all disabled:opacity-50"
          style={{
            border: "1px solid rgba(196,122,74,0.4)",
            color: "var(--terracotta)",
          }}
          title={`Regenerate ${activeDay}`}
        >
          <RefreshIcon spinning={isRegenerating} />
          {isRegenerating ? "Generating…" : "Regenerate"}
        </button>
      )}
    </div>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      style={{
        animation: spinning ? "spin 1s linear infinite" : "none",
      }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <path d="M23 4v6h-6M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}
