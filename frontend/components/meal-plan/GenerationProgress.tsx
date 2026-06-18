"use client";

import { useEffect, useRef, useState } from "react";
import { DAYS } from "@/lib/types";

const MESSAGES = [
  "Analysing your taste profile…",
  "Reviewing saved recipes…",
  "Checking your pantry…",
  "Selecting seasonal ingredients…",
  "Balancing raw and cooked meals…",
  "Optimising nutrition targets…",
  "Composing your week…",
  "Almost there…",
];

const STEP_DURATION_MS = 3500;
const LAST_INDEX = MESSAGES.length - 1;

interface GenerationProgressProps {
  planDays?: number;
}

export function GenerationProgress({ planDays = 7 }: GenerationProgressProps) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const indexRef = useRef(0);

  useEffect(() => {
    indexRef.current = 0;
    setIndex(0);
    setVisible(true);

    const tick = () => {
      if (indexRef.current >= LAST_INDEX) return; // hold on last message
      setVisible(false);
      setTimeout(() => {
        indexRef.current += 1;
        setIndex(indexRef.current);
        setVisible(true);
      }, 280);
    };

    const timer = setInterval(tick, STEP_DURATION_MS);
    return () => clearInterval(timer);
  }, []); // runs once per mount — a new generation = component unmounts+remounts

  return (
    <div className="space-y-6">
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${Math.min(planDays, 7)}, minmax(0, 1fr))` }}
      >
        {DAYS.slice(0, planDays).map((day, i) => (
          <div key={day} className="space-y-2">
            <div
              className="h-3 rounded-full animate-pulse"
              style={{
                background: "rgba(122,158,126,0.2)",
                animationDelay: `${i * 120}ms`,
              }}
            />
            <div className="space-y-1.5">
              {Array.from({ length: 3 }).map((_, j) => (
                <div
                  key={j}
                  className="h-14 rounded-lg animate-pulse"
                  style={{
                    background: "rgba(122,158,126,0.1)",
                    animationDelay: `${i * 120 + j * 80}ms`,
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="text-center py-6 space-y-3">
        <div className="flex justify-center gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full animate-bounce"
              style={{
                background: "var(--sage)",
                animationDelay: `${i * 150}ms`,
              }}
            />
          ))}
        </div>
        <p
          className="font-mono text-[11px] uppercase tracking-[0.2em] transition-opacity duration-300"
          style={{
            color: "var(--sage)",
            opacity: visible ? 1 : 0,
          }}
        >
          ✦ {MESSAGES[index]}
        </p>
      </div>
    </div>
  );
}
