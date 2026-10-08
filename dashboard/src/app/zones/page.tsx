"use client";

import React from "react";
import { useSafety } from "@/context/SafetyContext";
import { ZoneCard } from "@/components/ZoneCard";
import { Boxes, Sliders, Shield } from "lucide-react";
import Link from "next/link";

export default function ZonesPage() {
  const { zones } = useSafety();

  return (
    <div className="space-y-5 font-mono">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#26303C] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <Boxes className="w-5 h-5 text-purple-400" />
            <h1 className="text-xl font-bold tracking-wider text-slate-100 uppercase">
              Facility Zones & Industrial Workcells
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Zone-specific PPE compliance policies • RS-485 Modbus RTU environmental telemetry
          </p>
        </div>

        <Link
          href="/settings"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
        >
          <Sliders className="w-3.5 h-3.5 text-blue-400" />
          <span>Configure Zone Policies</span>
        </Link>
      </div>

      {/* Grid of All Monitored Zones */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {zones.map((zone, idx) => (
          <ZoneCard key={zone.zone_id ? `${zone.zone_id}-${idx}` : `zone-${idx}`} zone={zone} />
        ))}
      </div>
    </div>
  );
}
