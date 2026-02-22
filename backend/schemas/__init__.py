from schemas.meal_plan import (
    DayMeals,
    DayPlan,
    GeneratePlanRequest,
    GeneratedMealRead,
    MealItem,
    MealPlanRead,
    MealPlanResponse,
    NutritionAvg,
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
from schemas.recipe import RecipeRead, SaveFromPlanRequest, SaveFromPlanResponse
from schemas.signals import UserSignalCreate, UserTasteProfileRead
from schemas.user import UserPreferencesRead, UserPreferencesUpdate, UserProfile

__all__ = [
    # meal_plan
    "DayMeals",
    "DayPlan",
    "GeneratePlanRequest",
    "GeneratedMealRead",
    "MealItem",
    "MealPlanRead",
    "MealPlanResponse",
    "NutritionAvg",
    # pantry
    "GenerateShoppingListRequest",
    "PantryItemCreate",
    "PantryItemRead",
    "PantryItemUpdate",
    "ShoppingItem",
    "ShoppingItemToggle",
    "ShoppingListRead",
    # recipe
    "RecipeRead",
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
