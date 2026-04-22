import { Shield, AlertTriangle, OctagonX } from "lucide-react";
import { cn } from "@/lib/utils";

type SafetyStatus = "safe" | "caution" | "banned";

interface SafetyBadgeProps {
  status: SafetyStatus;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

const CONFIG = {
  safe: {
    icon: Shield,
    label: "Safe",
    glassClass: "glass-safe",
    textColor: "text-safety-safeDark dark:text-safety-safeDark",
    dotColor: "bg-safety-safe dark:bg-safety-safeDark",
    glow: "shadow-[0_0_24px_rgba(34,197,94,0.35),0_0_8px_rgba(21,128,61,0.20)]",
  },
  caution: {
    icon: AlertTriangle,
    label: "Caution",
    glassClass: "glass-caution",
    textColor: "text-safety-caution dark:text-safety-cautionDark",
    dotColor: "bg-safety-caution dark:bg-safety-cautionDark",
    glow: "shadow-[0_0_24px_rgba(245,158,11,0.35),0_0_8px_rgba(180,83,9,0.20)]",
  },
  banned: {
    icon: OctagonX,
    label: "Banned",
    glassClass: "glass-banned",
    textColor: "text-safety-banned dark:text-safety-bannedDark",
    dotColor: "bg-safety-banned dark:bg-safety-bannedDark",
    glow: "shadow-[0_0_24px_rgba(239,68,68,0.35),0_0_8px_rgba(185,28,28,0.20)]",
  },
};

const ICON_SIZE = {
  sm: "h-3.5 w-3.5",
  md: "h-5 w-5",
  lg: "h-10 w-10",
};

export default function SafetyBadge({
  status,
  size = "md",
  showLabel = false,
  className,
}: SafetyBadgeProps) {
  const normalized = status?.toLowerCase() as SafetyStatus;
  const cfg = CONFIG[normalized] ?? CONFIG.safe;
  const { icon: Icon, label, glassClass, textColor, dotColor, glow } = cfg;

  if (showLabel) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-2 px-3 py-1.5 rounded-xl font-semibold text-sm",
          glassClass,
          textColor,
          glow,
          className
        )}
        data-testid={`badge-${status}`}
      >
        <Icon className="h-4 w-4 flex-shrink-0" />
        <span>{label}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-xl p-2",
        glassClass,
        glow,
        className
      )}
      data-testid={`icon-${status}`}
    >
      <Icon className={cn(ICON_SIZE[size], textColor)} />
    </div>
  );
}
