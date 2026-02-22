export function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Nutrition strip placeholder */}
      <div
        className="h-20 rounded-[14px]"
        style={{ background: "rgba(45,74,53,0.15)" }}
      />

      {/* Day tabs placeholder */}
      <div className="flex gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="h-8 w-12 rounded-lg"
            style={{ background: "rgba(122,158,126,0.15)" }}
          />
        ))}
      </div>

      {/* Meal cards placeholder */}
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-52 rounded-[14px]"
            style={{ background: "rgba(122,158,126,0.1)" }}
          />
        ))}
      </div>

      {/* Snacks placeholder */}
      <div
        className="h-12 rounded-lg"
        style={{ background: "rgba(122,158,126,0.08)" }}
      />

      {/* Generating message */}
      <div className="text-center py-4">
        <p
          className="font-mono text-[11px] uppercase tracking-[0.2em]"
          style={{ color: "var(--sage)" }}
        >
          ✦ Crafting your personalised meal plan…
        </p>
      </div>
    </div>
  );
}
