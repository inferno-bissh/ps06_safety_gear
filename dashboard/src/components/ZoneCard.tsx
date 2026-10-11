"use client";

import React from "react";
import { Zone } from "@/types/safety";
import { PriorityBadge } from "./PriorityBadge";
import { getPriorityColor, cn } from "@/lib/utils";
import {
  MapPin,
  Users,
  Flame,
  Radio,
  HardHat,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";

interface ZoneCardProps {
  zone: Zone;
}

export const ZoneCard: React.FC<ZoneCardProps> = ({ zone }) => {
  const priorityStyle = getPriorityColor(zone.current_priority);

  return (
    <div
      className={cn(
        "rounded-xl bg-[#121821]/95 border p-4 sm:p-5 transition-all flex flex-col justify-between shadow-md hover:border-slate-700/80",
        priorityStyle.border,
        zone.current_priority === "P3" && "ring-2 ring-red-500/50 bg-red-950/20 animate-pulse",
        zone.current_priority === "P2" && "ring-1 ring-orange-500/30 bg-orange-950/10",
        zone.current_priority === "P1" && "border-l-4 border-l-amber-500"
      )}
    >
      <div>
        {/* Top Header */}
        <div className="flex items-start justify-between gap-2 mb-2.5 pb-2.5 border-b border-[#26303C]">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
              <MapPin className="w-3.5 h-3.5 text-blue-400" />
              <span>{zone.floor_area || zone.zone_id}</span>
            </div>
            <h3 className="font-extrabold text-base text-slate-100 mt-1">{zone.name}</h3>
          </div>
          <PriorityBadge priority={zone.current_priority} size="sm" />
        </div>

        <p className="text-xs text-slate-400 mb-3.5 line-clamp-1">{zone.description}</p>

        {/* Status Metrics Grid */}
        <div className="grid grid-cols-2 gap-2.5 text-xs mb-3.5">
          <div className="bg-[#18212D] p-2.5 rounded-lg border border-slate-800/80 flex items-center justify-between">
            <span className="text-slate-400 flex items-center gap-1.5 font-medium">
              <Users className="w-3.5 h-3.5 text-blue-400" /> Workers:
            </span>
            <span className="font-bold text-slate-200 font-mono-tabular">{zone.worker_count}</span>
          </div>

          <div className="bg-[#18212D] p-2.5 rounded-lg border border-slate-800/80 flex items-center justify-between">
            <span className="text-slate-400 flex items-center gap-1.5 font-medium">
              <Radio className="w-3.5 h-3.5 text-orange-400" /> Node:
            </span>
            <span
              className={cn(
                "font-bold text-xs font-mono",
                zone.node_status === "ONLINE" ? "text-emerald-400" : "text-red-400"
              )}
            >
              {zone.node_status}
            </span>
          </div>

          <div className="bg-[#18212D] p-2.5 rounded-lg border border-slate-800/80 flex items-center justify-between">
            <span className="text-slate-400 flex items-center gap-1.5 font-medium">
              <Flame className="w-3.5 h-3.5 text-red-400" /> Fire:
            </span>
            <span
              className={cn(
                "font-bold text-xs font-mono",
                (zone.sensor_flame || zone.fire_detected) ? "text-red-400 animate-pulse font-extrabold" : "text-slate-300"
              )}
            >
              {(zone.sensor_flame || zone.fire_detected) ? "TRIPPED" : "Normal"}
            </span>
          </div>

          <div className="bg-[#18212D] p-2.5 rounded-lg border border-slate-800/80 flex items-center justify-between">
            <span className="text-slate-400 flex items-center gap-1.5 font-medium">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> Smoke:
            </span>
            <span
              className={cn(
                "font-bold text-xs font-mono-tabular",
                (zone.smoke_detected || (zone.sensor_smoke_raw ?? 0) > 400) ? "text-orange-400 font-bold" : "text-slate-300"
              )}
            >
              {(zone.smoke_detected ? "DETECTED" : (zone.sensor_smoke_raw ?? 0))} ({(zone.sensor_smoke_index ?? 0).toFixed(2)})
            </span>
          </div>
        </div>

        {/* Required PPE items tags */}
        <div className="text-xs text-slate-400 mb-3">
          <span className="font-bold uppercase tracking-wider text-[11px] block mb-1.5">
            Zone PPE Mandate:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {zone.ppe_policy?.helmet_required && (
              <span className="bg-slate-800/90 text-blue-300 border border-slate-700/80 px-2 py-0.5 rounded-md text-[11px] font-semibold">
                Helmet
              </span>
            )}
            {zone.ppe_policy?.vest_required && (
              <span className="bg-slate-800/90 text-blue-300 border border-slate-700/80 px-2 py-0.5 rounded-md text-[11px] font-semibold">
                Vest
              </span>
            )}
            {zone.ppe_policy?.gloves_required && (
              <span className="bg-slate-800/90 text-blue-300 border border-slate-700/80 px-2 py-0.5 rounded-md text-[11px] font-semibold">
                Gloves
              </span>
            )}
            {zone.ppe_policy?.safety_shoes_required && (
              <span className="bg-slate-800/90 text-blue-300 border border-slate-700/80 px-2 py-0.5 rounded-md text-[11px] font-semibold">
                Boots
              </span>
            )}
            {(!zone.ppe_policy ||
              (!zone.ppe_policy.helmet_required &&
                !zone.ppe_policy.vest_required &&
                !zone.ppe_policy.gloves_required &&
                !zone.ppe_policy.safety_shoes_required)) && (
              <span className="text-slate-500 italic text-[11px]">No PPE required in this zone</span>
            )}
          </div>
        </div>
      </div>

      {/* Drill-down action link - prominent, comfortable button */}
      <Link
        href={`/zones/${zone.zone_id}`}
        className="mt-3 pt-2.5 border-t border-[#26303C] flex items-center justify-between text-xs text-blue-400 hover:text-blue-300 font-bold px-3 py-2 rounded-lg bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/25 transition-all min-h-[36px] active:scale-[0.98]"
      >
        <span>Inspect Zone &amp; Camera</span>
        <ChevronRight className="w-4 h-4" />
      </Link>
    </div>
  );
};
