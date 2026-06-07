import type { DayName, NutritionAvg } from "@/lib/types";

interface NutritionStripProps {
  nutrition: NutritionAvg;
  dailyNutrition?: NutritionAvg | null;
  mode?: "weekly" | "daily";
  onModeChange?: (mode: "weekly" | "daily") => void;
  activeDay?: DayName;
}

const STATS: {
  key: keyof NutritionAvg;
  labelWeekly: string;
  labelDaily: string;
  unit: string;
}[] = [
  { key: "calories", labelWeekly: "Avg kcal", labelDaily: "kcal", unit: "" },
  { key: "protein_g", labelWeekly: "Protein", labelDaily: "Protein", unit: "g" },
  { key: "carbs_g", labelWeekly: "Carbs", labelDaily: "Carbs", unit: "g" },
  { key: "fat_g", labelWeekly: "Fat", labelDaily: "Fat", unit: "g" },
  { key: "fiber_g", labelWeekly: "Fibre", labelDaily: "Fibre", unit: "g" },
];

export function NutritionStrip({
  nutrition,
  dailyNutrition,
  mode = "weekly",
  onModeChange,
  activeDay,
}: NutritionStripProps) {
  const display = mode === "daily" && dailyNutrition ? dailyNutrition : nutrition;
  const canToggle = !!dailyNutrition && !!onModeChange;

  return (
    <div
      className="rounded-[14px] px-6 py-4 flex items-center justify-between gap-4 flex-wrap"
      style={{ background: "var(--deep-green)" }}
    >
      <div className="flex items-center gap-4 flex-wrap flex-1">
        {STATS.map(({ key, labelWeekly, labelDaily, unit }) => (
          <div key={key} className="flex flex-col items-center gap-0.5 min-w-[60px]">
            <span
              className="font-display text-[1.4rem] font-light leading-none"
              style={{ color: "var(--pale-gold)" }}
            >
              {Math.round(display[key] as number)}
              {unit}
            </span>
            <span
              className="font-mono text-[9px] uppercase tracking-[0.18em]"
              style={{ color: "rgba(232,213,163,0.6)" }}
            >
              {mode === "daily" ? labelDaily : labelWeekly}
            </span>
          </div>
        ))}
      </div>

      {canToggle && (
        <div className="flex flex-col items-end gap-1">
          <div
            className="flex rounded-lg p-0.5"
            style={{ background: "rgba(255,255,255,0.1)" }}
          >
            {(["weekly", "daily"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onModeChange(m)}
                className="font-mono text-[9px] uppercase tracking-[0.12em] px-2.5 py-1 rounded-md transition-colors"
                style={{
                  background: mode === m ? "rgba(247,243,236,0.15)" : "transparent",
                  color: mode === m ? "var(--cream)" : "rgba(232,213,163,0.6)",
                }}
              >
                {m === "weekly" ? "Week avg" : "Day"}
              </button>
            ))}
          </div>
          {mode === "daily" && activeDay && (
            <span className="font-mono text-[8px] uppercase tracking-[0.1em]" style={{ color: "rgba(232,213,163,0.5)" }}>
              {activeDay}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
