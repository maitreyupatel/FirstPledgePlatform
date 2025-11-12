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
    <div className={cn("space-y-3", className)} data-testid="safety-meter">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">Safety Breakdown</span>
        <span className="text-muted-foreground">{total} ingredients analyzed</span>
      </div>
      
      <div className="h-3 w-full rounded-full overflow-hidden bg-muted/30 flex">
        {safeCount > 0 && (
          <div
            className="bg-safety-safe transition-all duration-500"
            style={{ width: `${safePercent}%` }}
            data-testid="meter-safe"
          />
        )}
        {cautionCount > 0 && (
          <div
            className="bg-safety-caution transition-all duration-500"
            style={{ width: `${cautionPercent}%` }}
            data-testid="meter-caution"
          />
        )}
        {bannedCount > 0 && (
          <div
            className="bg-safety-banned transition-all duration-500"
            style={{ width: `${bannedPercent}%` }}
            data-testid="meter-banned"
          />
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-safety-safe" />
          <span className="text-muted-foreground">Safe</span>
          <span className="font-semibold ml-auto">{safeCount}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-safety-caution" />
          <span className="text-muted-foreground">Caution</span>
          <span className="font-semibold ml-auto">{cautionCount}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-safety-banned" />
          <span className="text-muted-foreground">Banned</span>
          <span className="font-semibold ml-auto">{bannedCount}</span>
        </div>
      </div>
    </div>
  );
}
