import type { NutritionAvg } from "@/lib/types";

interface NutritionStripProps {
  nutrition: NutritionAvg;
}

const STATS: {
  key: keyof NutritionAvg;
  label: string;
  unit: string;
}[] = [
  { key: "calories", label: "Avg kcal", unit: "" },
  { key: "protein_g", label: "Protein", unit: "g" },
  { key: "carbs_g", label: "Carbs", unit: "g" },
  { key: "fat_g", label: "Fat", unit: "g" },
  { key: "fiber_g", label: "Fibre", unit: "g" },
];

export function NutritionStrip({ nutrition }: NutritionStripProps) {
  return (
    <div
      className="rounded-[14px] px-6 py-4 flex items-center justify-between gap-4 flex-wrap"
      style={{ background: "var(--deep-green)" }}
    >
      {STATS.map(({ key, label, unit }) => (
        <div key={key} className="flex flex-col items-center gap-0.5 min-w-[60px]">
          <span
            className="font-display text-[1.4rem] font-light leading-none"
            style={{ color: "var(--pale-gold)" }}
          >
            {Math.round(nutrition[key] as number)}
            {unit}
          </span>
          <span
            className="font-mono text-[9px] uppercase tracking-[0.18em]"
            style={{ color: "rgba(232,213,163,0.6)" }}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
