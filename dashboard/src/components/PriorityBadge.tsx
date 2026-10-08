"use client";

import React from "react";
import { Priority } from "@/types/safety";
import { getPriorityColor, cn } from "@/lib/utils";
import { ShieldCheck, ShieldAlert, TriangleAlert, Flame } from "lucide-react";

interface PriorityBadgeProps {
  priority: Priority;
  showIcon?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({
  priority,
  showIcon = true,
  className,
  size = "md",
}) => {
  const colors = getPriorityColor(priority);

  const getIcon = () => {
    switch (priority) {
      case "P3":
        return <Flame className={size === "sm" ? "w-3 h-3" : "w-4 h-4"} />;
      case "P2":
        return <TriangleAlert className={size === "sm" ? "w-3 h-3" : "w-4 h-4"} />;
      case "P1":
        return <ShieldAlert className={size === "sm" ? "w-3 h-3" : "w-4 h-4"} />;
      case "P0":
      default:
        return <ShieldCheck className={size === "sm" ? "w-3 h-3" : "w-4 h-4"} />;
    }
  };

  const getLabel = () => {
    switch (priority) {
      case "P3":
        return "P3 CONFIRMED";
      case "P2":
        return "P2 SUSPICIOUS";
      case "P1":
        return "P1 PPE WARNING";
      case "P0":
      default:
        return "P0 NORMAL";
    }
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono-tabular font-semibold uppercase tracking-wider rounded border",
        colors.badgeBg,
        size === "sm" && "text-[10px] px-1.5 py-0.5",
        size === "md" && "text-xs px-2 py-0.5",
        size === "lg" && "text-sm px-3 py-1 font-bold",
        className
      )}
    >
      {showIcon && getIcon()}
      <span>{getLabel()}</span>
    </span>
  );
};
