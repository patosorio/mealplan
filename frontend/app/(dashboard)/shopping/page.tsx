"use client";

import { useState } from "react";
import {
  useGenerateShoppingList,
  useShoppingList,
  useToggleShoppingItem,
  useDeleteShoppingList,
} from "@/lib/api/shopping";
import { useMealPlanHistory } from "@/lib/api/meal-plans";

export default function ShoppingPage() {
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");

  const { data: plans } = useMealPlanHistory();
  const generateMutation = useGenerateShoppingList();
  const { data: list } = useShoppingList(activeListId);
  const toggleMutation = useToggleShoppingItem();
  const deleteMutation = useDeleteShoppingList();

  async function handleGenerate() {
    if (!selectedPlanId) return;
    const result = await generateMutation.mutateAsync(selectedPlanId);
    setActiveListId(result.id);
  }

  async function handleDelete() {
    if (!activeListId) return;
    await deleteMutation.mutateAsync(activeListId);
    setActiveListId(null);
  }

  const checkedCount = list?.items.filter((i) => i.checked).length ?? 0;
  const totalCount = list?.items.length ?? 0;

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] mb-3" style={{ color: "var(--sage)" }}>
          Shopping
        </p>
        <h1
          className="font-display font-light leading-tight"
          style={{ fontSize: "clamp(2rem,4vw,3rem)", color: "var(--deep-green)" }}
        >
          Your <em className="italic" style={{ color: "var(--terracotta)" }}>shopping list</em>
        </h1>
      </div>

      {/* Generate form */}
      {!list && (
        <div
          className="p-5 rounded-[14px] space-y-4"
          style={{ background: "white", border: "1px solid rgba(122,158,126,0.15)" }}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--sage)" }}>
            Generate from a meal plan
          </p>
          <select
            value={selectedPlanId}
            onChange={(e) => setSelectedPlanId(e.target.value)}
            className="w-full px-4 py-3 rounded-lg font-display text-[0.9rem] outline-none"
            style={{ background: "rgba(247,243,236,0.8)", border: "1px solid rgba(122,158,126,0.3)", color: "var(--deep-green)" }}
          >
            <option value="">Select a meal plan…</option>
            {plans?.map((plan) => {
              const label = new Date(plan.week_start + "T00:00:00").toLocaleDateString(
                "en-GB",
                { day: "numeric", month: "long" }
              );
              return (
                <option key={plan.id} value={plan.id}>
                  Week of {label}
                </option>
              );
            })}
          </select>
          <button
            onClick={handleGenerate}
            disabled={!selectedPlanId || generateMutation.isPending}
            className="w-full py-3.5 rounded-lg font-mono text-[12px] uppercase tracking-[0.15em] transition-colors disabled:opacity-50"
            style={{ background: "var(--deep-green)", color: "var(--cream)" }}
          >
            {generateMutation.isPending ? "Generating…" : "✦ Generate Shopping List"}
          </button>
        </div>
      )}

      {/* Shopping list */}
      {list && (
        <div className="space-y-4">
          {/* Progress header */}
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--sage)" }}>
              {checkedCount} / {totalCount} items
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setActiveListId(null)}
                className="font-mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 rounded-lg"
                style={{ border: "1px solid rgba(122,158,126,0.3)", color: "var(--sage)" }}
              >
                New list
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="font-mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 rounded-lg"
                style={{ border: "1px solid rgba(196,122,74,0.3)", color: "var(--terracotta)" }}
              >
                Delete
              </button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(122,158,126,0.2)" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: totalCount ? `${(checkedCount / totalCount) * 100}%` : "0%",
                background: "var(--sage)",
              }}
            />
          </div>

          {list.items.length === 0 ? (
            <p className="font-display italic text-center py-6" style={{ color: "var(--text-muted)" }}>
              Nothing to buy — your pantry has everything!
            </p>
          ) : (
            <ul className="space-y-1.5">
              {list.items.map((item, idx) => (
                <li
                  key={idx}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-colors"
                  style={{
                    background: item.checked ? "rgba(122,158,126,0.08)" : "white",
                    border: "1px solid rgba(122,158,126,0.12)",
                  }}
                  onClick={() =>
                    toggleMutation.mutate({
                      listId: list.id,
                      itemIdx: idx,
                      checked: !item.checked,
                    })
                  }
                >
                  {/* Checkbox */}
                  <span
                    className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-colors"
                    style={{
                      border: `1.5px solid ${item.checked ? "var(--sage)" : "rgba(122,158,126,0.4)"}`,
                      background: item.checked ? "var(--sage)" : "transparent",
                    }}
                  >
                    {item.checked && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>

                  <span
                    className="font-display text-[0.9rem] flex-1"
                    style={{
                      color: item.checked ? "var(--text-muted)" : "var(--deep-green)",
                      textDecoration: item.checked ? "line-through" : "none",
                    }}
                  >
                    {item.name}
                    {item.qty && (
                      <span className="ml-2 font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {item.qty}
                      </span>
                    )}
                  </span>

                  {item.category && (
                    <span
                      className="font-mono text-[9px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{ background: "rgba(168,197,160,0.2)", color: "var(--sage)" }}
                    >
                      {item.category}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
