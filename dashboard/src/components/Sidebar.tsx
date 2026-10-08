"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSafety } from "@/context/SafetyContext";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Boxes,
  Video,
  AlertOctagon,
  HardHat,
  History,
  Activity,
  Sliders,
  Flame,
} from "lucide-react";

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const { incidents, zones } = useSafety();

  const openIncidents = incidents.filter((i) => i.status !== "RESOLVED");
  const p3Count = openIncidents.filter((i) => i.priority === "P3").length;
  const p2Count = openIncidents.filter((i) => i.priority === "P2").length;
  const p1Count = openIncidents.filter((i) => i.priority === "P1").length;

  const navItems = [
    {
      label: "Facility Overview",
      href: "/",
      icon: LayoutDashboard,
    },
    {
      label: "Zones & Areas",
      href: "/zones",
      icon: Boxes,
      badge: `${zones.length}`,
    },
    {
      label: "Live CCTV Streams",
      href: "/cameras",
      icon: Video,
      badge: "LIVE",
      badgeColor: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
    },
    {
      label: "Incident Center",
      href: "/incidents",
      icon: AlertOctagon,
      badge: openIncidents.length > 0 ? `${openIncidents.length}` : undefined,
      badgeColor:
        p3Count > 0
          ? "bg-red-500 text-white font-bold animate-pulse"
          : p2Count > 0
          ? "bg-orange-500 text-slate-950 font-bold"
          : "bg-amber-500 text-slate-950 font-bold",
    },
    {
      label: "PPE Compliance",
      href: "/ppe",
      icon: HardHat,
    },
    {
      label: "Event History",
      href: "/history",
      icon: History,
    },
    {
      label: "System Health",
      href: "/system-health",
      icon: Activity,
    },
    {
      label: "Configuration Hub",
      href: "/settings",
      icon: Sliders,
    },
  ];

  return (
    <aside className="w-60 bg-[#121821] border-r border-[#26303C] flex flex-col justify-between shrink-0 h-[calc(100vh-80px)] sticky top-[80px]">
      <div className="py-3 px-2 flex flex-col gap-1">
        <div className="px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
          Navigation
        </div>

        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center justify-between px-3 py-2 rounded text-xs font-medium transition-colors font-mono",
                isActive
                  ? "bg-blue-600/15 text-blue-400 border border-blue-500/30 font-bold"
                  : "text-slate-300 hover:bg-[#1A222C] hover:text-slate-100"
              )}
            >
              <div className="flex items-center gap-2.5">
                <Icon className={cn("w-4 h-4", isActive ? "text-blue-400" : "text-slate-400")} />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.2 rounded font-mono font-semibold",
                    item.badgeColor || "bg-slate-800 text-slate-300 border border-slate-700"
                  )}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Bottom Status Block */}
      <div className="p-3 border-t border-[#26303C] bg-[#0E131A] text-xs font-mono">
        <div className="flex items-center justify-between text-slate-400 mb-1.5 text-[11px]">
          <span>Hazard Status:</span>
          {p3Count > 0 ? (
            <span className="text-red-400 font-bold flex items-center gap-1">
              <Flame className="w-3 h-3 text-red-500 animate-pulse" /> P3 ACTIVE
            </span>
          ) : p2Count > 0 ? (
            <span className="text-orange-400 font-bold">P2 WARNING</span>
          ) : p1Count > 0 ? (
            <span className="text-amber-400 font-bold">P1 PPE ALERT</span>
          ) : (
            <span className="text-emerald-400 font-bold">ALL NORMAL</span>
          )}
        </div>
        <div className="text-[10px] text-slate-400 leading-tight">
          Cloud Vision Inference active. RS-485 Modbus RTU online.
        </div>
      </div>
    </aside>
  );
};
