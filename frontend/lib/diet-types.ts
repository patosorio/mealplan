/** Canonical diet types — keep in sync with backend schemas/enums.py */
export const DIET_TYPES = [
  "raw_vegan_80_20",
  "raw_vegan_100",
  "whole_food_plant_based",
  "vegan",
  "vegan_keto",
  "keto_plant_based",
  "pescatarian_keto",
  "no_pork",
  "flexitarian",
  "mediterranean",
] as const;

export type DietType = (typeof DIET_TYPES)[number];

export const DIET_OPTIONS: { value: DietType; label: string }[] = [
  { value: "raw_vegan_80_20", label: "Raw Vegan" },
  { value: "raw_vegan_100", label: "Raw Vegan (strict)" },
  { value: "whole_food_plant_based", label: "Whole Food Plant-Based" },
  { value: "vegan", label: "Vegan" },
  { value: "vegan_keto", label: "Vegan Keto" },
  { value: "keto_plant_based", label: "Keto Plant-Based" },
  { value: "pescatarian_keto", label: "Pescatarian Keto" },
  { value: "no_pork", label: "No Pork" },
  { value: "flexitarian", label: "Flexitarian" },
  { value: "mediterranean", label: "Mediterranean" },
];

export function dietLabel(value: string): string {
  return DIET_OPTIONS.find((o) => o.value === value)?.label ?? value.replace(/_/g, " ");
}

/** Keep in sync with backend schemas/enums.py RawCookedRatio */
export const RAW_COOKED_RATIOS = [
  "100_raw",
  "80_20",
  "70_30",
  "50_50",
  "30_70",
  "100_cooked",
] as const;

export type RawCookedRatio = (typeof RAW_COOKED_RATIOS)[number];

export const RAW_COOKED_OPTIONS: { value: RawCookedRatio; label: string }[] = [
  { value: "100_raw",    label: "100% Raw" },
  { value: "80_20",      label: "80/20 Raw" },
  { value: "70_30",      label: "70/30 Raw" },
  { value: "50_50",      label: "50/50" },
  { value: "30_70",      label: "70/30 Cooked" },
  { value: "100_cooked", label: "100% Cooked" },
];
