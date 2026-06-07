from schemas.meal_plan import (
    ApprovePlanRequest,
    DayMeals,
    DayPlan,
    ExtraItem,
    ExtraSlot,
    GeneratePlanRequest,
    GeneratedMealRead,
    JuiceEntry,
    JuicingConfig,
    MealItem,
    MealPlanRead,
    MealPlanResponse,
    NutritionAvg,
    PatchGeneratedMealRequest,
    PatchMealPlanRequest,
    SchedulePlanRequest,
)
from schemas.pantry import (
    GenerateShoppingListRequest,
    PantryItemCreate,
    PantryItemRead,
    PantryItemUpdate,
    ShoppingItem,
    ShoppingItemToggle,
    ShoppingListRead,
)
from schemas.recipe import (
    RecipeDraft,
    RecipeExpandedRead,
    RecipeImportConfirmRequest,
    RecipeIngredient,
    RecipeRead,
    RecipeStep,
    SaveFromPlanRequest,
    SaveFromPlanResponse,
)
from schemas.signals import UserSignalCreate, UserTasteProfileRead
from schemas.user import UserPreferencesRead, UserPreferencesUpdate, UserProfile

__all__ = [
    # meal_plan
    "ApprovePlanRequest",
    "DayMeals",
    "DayPlan",
    "ExtraItem",
    "ExtraSlot",
    "GeneratePlanRequest",
    "GeneratedMealRead",
    "JuiceEntry",
    "JuicingConfig",
    "MealItem",
    "MealPlanRead",
    "MealPlanResponse",
    "NutritionAvg",
    "PatchGeneratedMealRequest",
    "PatchMealPlanRequest",
    "SchedulePlanRequest",
    # pantry
    "GenerateShoppingListRequest",
    "PantryItemCreate",
    "PantryItemRead",
    "PantryItemUpdate",
    "ShoppingItem",
    "ShoppingItemToggle",
    "ShoppingListRead",
    # recipe
    "RecipeDraft",
    "RecipeExpandedRead",
    "RecipeImportConfirmRequest",
    "RecipeIngredient",
    "RecipeRead",
    "RecipeStep",
    "SaveFromPlanRequest",
    "SaveFromPlanResponse",
    # signals
    "UserSignalCreate",
    "UserTasteProfileRead",
    # user
    "UserPreferencesRead",
    "UserPreferencesUpdate",
    "UserProfile",
]
