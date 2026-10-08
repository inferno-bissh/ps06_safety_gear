import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Priority, PPEStatusValue, NetworkMode, ComponentStatus } from "@/types/safety";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTimestamp(isoString?: string): string {
  if (!isoString) return "--:--:--";
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return isoString;
  }
}

export function formatDateTime(isoString?: string): string {
  if (!isoString) return "--";
  try {
    const d = new Date(isoString);
    return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${d.toLocaleTimeString("en-US", { hour12: false })}`;
  } catch {
    return isoString;
  }
}

export function getPriorityColor(priority: Priority): {
  bg: string;
  text: string;
  border: string;
  badgeBg: string;
} {
  switch (priority) {
    case "P3":
      return {
        bg: "bg-red-950/40",
        text: "text-red-400",
        border: "border-red-600",
        badgeBg: "bg-red-500/20 text-red-400 border-red-500/50",
      };
    case "P2":
      return {
        bg: "bg-orange-950/30",
        text: "text-orange-400",
        border: "border-orange-500",
        badgeBg: "bg-orange-500/20 text-orange-400 border-orange-500/50",
      };
    case "P1":
      return {
        bg: "bg-amber-950/20",
        text: "text-amber-400",
        border: "border-amber-500",
        badgeBg: "bg-amber-500/20 text-amber-400 border-amber-500/50",
      };
    case "P0":
    default:
      return {
        bg: "bg-emerald-950/20",
        text: "text-emerald-400",
        border: "border-emerald-600/40",
        badgeBg: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
      };
  }
}

export function getPPEStyle(status: PPEStatusValue) {
  switch (status) {
    case "PASS":
      return {
        bg: "bg-emerald-500/15",
        text: "text-emerald-400",
        border: "border-solid border-emerald-500/50",
        label: "PASS",
      };
    case "FAIL":
      return {
        bg: "bg-red-500/15",
        text: "text-red-400",
        border: "border-solid border-red-500/50",
        label: "FAIL",
      };
    case "UNKNOWN":
      return {
        bg: "bg-purple-500/15",
        text: "text-purple-300",
        border: "border-dashed border-purple-400/70", // Non-negotiable dashed border per PRD
        label: "UNKNOWN",
      };
  }
}

export function getNetworkBadge(mode: NetworkMode) {
  switch (mode) {
    case "LAN":
      return {
        label: "LAN (ETH/WIFI)",
        color: "text-emerald-400 bg-emerald-500/15 border-emerald-500/40",
        indicator: "bg-emerald-500",
      };
    case "CELLULAR":
      return {
        label: "CELLULAR (GSM)",
        color: "text-amber-400 bg-amber-500/15 border-amber-500/40",
        indicator: "bg-amber-500",
      };
    case "OFFLINE":
      return {
        label: "COMMUNICATION LOSS",
        color: "text-red-400 bg-red-500/20 border-red-500/60 animate-pulse",
        indicator: "bg-red-500",
      };
  }
}

export function getStatusStyle(status: ComponentStatus) {
  switch (status) {
    case "ONLINE":
      return { color: "text-emerald-400", bg: "bg-emerald-500", label: "ONLINE" };
    case "OFFLINE":
      return { color: "text-slate-400", bg: "bg-slate-500", label: "OFFLINE" };
    case "DEGRADED":
      return { color: "text-orange-400", bg: "bg-orange-500", label: "DEGRADED" };
    case "WARNING":
      return { color: "text-amber-400", bg: "bg-amber-500", label: "WARNING" };
    case "CRITICAL":
      return { color: "text-red-400", bg: "bg-red-500", label: "CRITICAL" };
  }
}
