from __future__ import annotations

from typing import Literal

RawCookedRatio = Literal[
    "100_raw",
    "80_20",
    "70_30",
    "50_50",
    "30_70",
    "100_cooked",
]

DietType = Literal[
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
]

DAY_ORDER: tuple[str, ...] = (
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
)


def days_for_plan(plan_days: int) -> list[str]:
    return list(DAY_ORDER[:plan_days])
