import { Shield, AlertTriangle, OctagonX } from "lucide-react";
import { cn } from "@/lib/utils";

type SafetyStatus = "safe" | "caution" | "banned";

interface SafetyBadgeProps {
  status: SafetyStatus;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

export default function SafetyBadge({ 
  status, 
  size = "md", 
  showLabel = false,
  className 
}: SafetyBadgeProps) {
  const config = {
    safe: {
      icon: Shield,
      label: "Safe",
      color: "text-safety-safe",
      bgColor: "bg-safety-safeLight",
    },
    caution: {
      icon: AlertTriangle,
      label: "Caution",
      color: "text-safety-caution",
      bgColor: "bg-safety-cautionLight",
    },
    banned: {
      icon: OctagonX,
      label: "Banned",
      color: "text-safety-banned",
      bgColor: "bg-safety-bannedLight",
    },
  };

  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-12 w-12",
  };

  const normalizedStatus = status?.toLowerCase() as SafetyStatus;
  const fallbackStatus = config[normalizedStatus] ? normalizedStatus : "safe";
  const { icon: Icon, label, color, bgColor } = config[fallbackStatus];

  if (showLabel) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium text-sm",
          bgColor,
          color,
          className
        )}
        data-testid={`badge-${status}`}
      >
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-full p-2",
        bgColor,
        className
      )}
      data-testid={`icon-${status}`}
    >
      <Icon className={cn(sizeClasses[size], color)} />
    </div>
  );
}
