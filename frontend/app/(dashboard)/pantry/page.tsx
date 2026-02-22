"use client";

import { useState } from "react";
import {
  usePantry,
  useAddPantryItem,
  useDeletePantryItem,
  useClearPantry,
} from "@/lib/api/pantry";
import type { PantryItem } from "@/lib/api/pantry";

export default function PantryPage() {
  const { data: items, isLoading } = usePantry();
  const addMutation = useAddPantryItem();
  const deleteMutation = useDeletePantryItem();
  const clearMutation = useClearPantry();

  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    try {
      await addMutation.mutateAsync({
        name: name.trim(),
        quantity: quantity.trim() || undefined,
        category: category.trim() || undefined,
      });
      setName("");
      setQuantity("");
      setCategory("");
    } catch {
      setError("Failed to add item.");
    }
  }

  // Group items by category
  const grouped: Record<string, PantryItem[]> = {};
  for (const item of items ?? []) {
    const cat = item.category ?? "Other";
    (grouped[cat] ??= []).push(item);
  }

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] mb-3" style={{ color: "var(--sage)" }}>
            Your Pantry
          </p>
          <h1
            className="font-display font-light leading-tight"
            style={{ fontSize: "clamp(2rem,4vw,3rem)", color: "var(--deep-green)" }}
          >
            What&apos;s in your <em className="italic" style={{ color: "var(--terracotta)" }}>kitchen</em>?
          </h1>
        </div>
        {(items?.length ?? 0) > 0 && (
          <button
            onClick={() => clearMutation.mutate()}
            disabled={clearMutation.isPending}
            className="font-mono text-[10px] uppercase tracking-[0.12em] px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
            style={{ border: "1px solid rgba(196,122,74,0.3)", color: "var(--terracotta)" }}
          >
            Clear All
          </button>
        )}
      </div>

      {/* Add item form */}
      <form
        onSubmit={handleAdd}
        className="p-5 rounded-[14px] space-y-3"
        style={{ background: "white", border: "1px solid rgba(122,158,126,0.15)" }}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--sage)" }}>
          Add Item
        </p>
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ingredient name"
            required
            className="flex-1 min-w-[160px] px-4 py-2.5 rounded-lg font-display text-[0.875rem] outline-none"
            style={{ background: "rgba(247,243,236,0.8)", border: "1px solid rgba(122,158,126,0.3)", color: "var(--deep-green)" }}
          />
          <input
            type="text"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="Qty (opt.)"
            className="w-28 px-4 py-2.5 rounded-lg font-display text-[0.875rem] outline-none"
            style={{ background: "rgba(247,243,236,0.8)", border: "1px solid rgba(122,158,126,0.3)", color: "var(--deep-green)" }}
          />
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category (opt.)"
            className="w-36 px-4 py-2.5 rounded-lg font-display text-[0.875rem] outline-none"
            style={{ background: "rgba(247,243,236,0.8)", border: "1px solid rgba(122,158,126,0.3)", color: "var(--deep-green)" }}
          />
          <button
            type="submit"
            disabled={addMutation.isPending || !name.trim()}
            className="px-5 py-2.5 rounded-lg font-mono text-[11px] uppercase tracking-[0.15em] transition-colors disabled:opacity-50"
            style={{ background: "var(--deep-green)", color: "var(--cream)" }}
          >
            Add
          </button>
        </div>
        {error && (
          <p className="font-mono text-[10px]" style={{ color: "var(--terracotta)" }}>{error}</p>
        )}
      </form>

      {/* Items list */}
      {isLoading ? (
        <div className="space-y-2 animate-pulse">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 rounded-lg" style={{ background: "rgba(122,158,126,0.1)" }} />
          ))}
        </div>
      ) : !items?.length ? (
        <div
          className="flex items-center justify-center h-32 rounded-[14px]"
          style={{ border: "1px dashed rgba(122,158,126,0.3)" }}
        >
          <p className="font-display italic" style={{ color: "var(--text-muted)" }}>
            Your pantry is empty. Add ingredients above.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).sort().map(([cat, catItems]) => (
            <div key={cat}>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] mb-2" style={{ color: "var(--sage)" }}>
                {cat}
              </p>
              <div className="space-y-1.5">
                {catItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between px-4 py-3 rounded-lg"
                    style={{ background: "white", border: "1px solid rgba(122,158,126,0.12)" }}
                  >
                    <div>
                      <span className="font-display text-[0.9rem]" style={{ color: "var(--deep-green)" }}>
                        {item.name}
                      </span>
                      {item.quantity && (
                        <span className="ml-2 font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>
                          {item.quantity}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => deleteMutation.mutate(item.id)}
                      disabled={deleteMutation.isPending}
                      aria-label="Remove item"
                      className="p-1.5 rounded-md transition-colors"
                      style={{ color: "var(--text-muted)" }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.color = "var(--terracotta)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)";
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
