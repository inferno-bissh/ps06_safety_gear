"use client";

import React from "react";
import { PPEStatusValue } from "@/types/safety";
import { getPPEStyle, cn } from "@/lib/utils";
import { Check, X, HelpCircle } from "lucide-react";

interface PPEChipProps {
  label: string;
  status: PPEStatusValue;
  required?: boolean;
  className?: string;
}

export const PPEChip: React.FC<PPEChipProps> = ({
  label,
  status,
  required = true,
  className,
}) => {
  const style = getPPEStyle(status);

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono-tabular transition-all",
        style.bg,
        style.text,
        style.border,
        className
      )}
      title={`${label}: ${status} ${required ? "(Required in Zone)" : "(Optional)"}`}
    >
      {status === "PASS" && <Check className="w-3 h-3 text-emerald-400 stroke-[3]" />}
      {status === "FAIL" && <X className="w-3 h-3 text-red-400 stroke-[3]" />}
      {status === "UNKNOWN" && <HelpCircle className="w-3 h-3 text-purple-400 stroke-[2.5]" />}
      <span className="font-medium text-[11px] uppercase tracking-wide">{label}:</span>
      <span className="font-bold text-[10px]">{style.label}</span>
    </div>
  );
};
