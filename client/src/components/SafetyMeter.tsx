import { cn } from "@/lib/utils";

interface SafetyMeterProps {
  safeCount: number;
  cautionCount: number;
  bannedCount: number;
  className?: string;
}

export default function SafetyMeter({
  safeCount,
  cautionCount,
  bannedCount,
  className,
}: SafetyMeterProps) {
  const total = safeCount + cautionCount + bannedCount;
  const safePercent = total > 0 ? (safeCount / total) * 100 : 0;
  const cautionPercent = total > 0 ? (cautionCount / total) * 100 : 0;
  const bannedPercent = total > 0 ? (bannedCount / total) * 100 : 0;

  return (
    <div className={cn("space-y-4", className)} data-testid="safety-meter">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold font-display tracking-tight">Safety Breakdown</span>
        <span className="text-xs text-muted-foreground font-medium">
          {total} ingredient{total !== 1 ? "s" : ""} analyzed
        </span>
      </div>

      {/* Glass progress bar */}
      <div className="relative h-2.5 w-full rounded-full overflow-hidden glass-subtle">
        <div className="absolute inset-0 flex">
          {safeCount > 0 && (
            <div
              className="h-full transition-all duration-700 ease-smooth"
              style={{
                width: `${safePercent}%`,
                background: "linear-gradient(90deg, rgb(21 128 61) 0%, rgb(34 197 94) 100%)",
                boxShadow: "0 0 8px rgba(34, 197, 94, 0.40)",
              }}
              data-testid="meter-safe"
            />
          )}
          {cautionCount > 0 && (
            <div
              className="h-full transition-all duration-700 ease-smooth"
              style={{
                width: `${cautionPercent}%`,
                background: "linear-gradient(90deg, rgb(180 83 9) 0%, rgb(245 158 11) 100%)",
                boxShadow: "0 0 8px rgba(245, 158, 11, 0.40)",
              }}
              data-testid="meter-caution"
            />
          )}
          {bannedCount > 0 && (
            <div
              className="h-full transition-all duration-700 ease-smooth"
              style={{
                width: `${bannedPercent}%`,
                background: "linear-gradient(90deg, rgb(185 28 28) 0%, rgb(239 68 68) 100%)",
                boxShadow: "0 0 8px rgba(239, 68, 68, 0.40)",
              }}
              data-testid="meter-banned"
            />
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Safe", count: safeCount, color: "bg-safety-safe dark:bg-safety-safeDark", pct: safePercent },
          { label: "Caution", count: cautionCount, color: "bg-safety-caution dark:bg-safety-cautionDark", pct: cautionPercent },
          { label: "Banned", count: bannedCount, color: "bg-safety-banned dark:bg-safety-bannedDark", pct: bannedPercent },
        ].map(({ label, count, color, pct }) => (
          <div key={label} className="glass-subtle rounded-xl p-2.5 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <div className={cn("h-2 w-2 rounded-full flex-shrink-0", color)} />
              <span className="text-[11px] text-muted-foreground font-medium">{label}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-base font-bold font-display leading-none">{count}</span>
              <span className="text-[10px] text-muted-foreground">
                {total > 0 ? `${Math.round(pct)}%` : "—"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
