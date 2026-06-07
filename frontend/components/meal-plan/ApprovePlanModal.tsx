"use client";

import { useState } from "react";

interface ApprovePlanModalProps {
  onApprove: (name: string) => Promise<void>;
  onClose: () => void;
  /** When true, all pending meals are accepted as part of approval. */
  acceptAll?: boolean;
}

export function ApprovePlanModal({ onApprove, onClose, acceptAll = false }: ApprovePlanModalProps) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onApprove(name.trim());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(45,74,53,0.35)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-[18px] p-8 animate-fade-in"
        style={{ background: "var(--cream)", border: "1px solid rgba(122,158,126,0.2)" }}
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] mb-2" style={{ color: "var(--sage)" }}>
          Approve plan
        </p>
        <h2
          className="font-display font-light mb-1 leading-tight"
          style={{ fontSize: "1.6rem", color: "var(--deep-green)" }}
        >
          Name your <em className="italic" style={{ color: "var(--terracotta)" }}>week</em>
        </h2>
        <p
          className="font-display text-[0.875rem] font-light italic mb-6"
          style={{ color: "var(--text-muted)" }}
        >
          {acceptAll
            ? "All meals will be accepted and the plan marked approved — perfect when the whole week looks great."
            : "Give this plan a name so you can find it easily later — e.g. \"Juice Week March\" or \"High Protein April\"."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Plan name…"
            maxLength={80}
            className="w-full px-4 py-3 rounded-lg font-display text-[1rem] font-light focus:outline-none"
            style={{
              background: "white",
              border: "1px solid rgba(122,158,126,0.3)",
              color: "var(--deep-green)",
            }}
          />
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={!name.trim() || busy}
              className="flex-1 font-mono text-[11px] uppercase tracking-[0.15em] py-3 rounded-lg transition-colors disabled:opacity-50"
              style={{ background: "var(--deep-green)", color: "var(--cream)" }}
            >
              {busy ? "Approving…" : acceptAll ? "✦ Approve All" : "✦ Approve Plan"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 font-mono text-[11px] uppercase tracking-[0.15em] py-3 rounded-lg transition-colors"
              style={{ border: "1px solid rgba(122,158,126,0.25)", color: "var(--sage)" }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
