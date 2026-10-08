"use client";

import React from "react";
import { useSafety } from "@/context/SafetyContext";
import { PPEChip } from "@/components/PPEChip";
import { formatDateTime, cn } from "@/lib/utils";
import { HardHat, Users, ShieldAlert, CheckCircle2, HelpCircle, MapPin } from "lucide-react";

export default function PPECompliancePage() {
  const { workerTracks, zones } = useSafety();

  // Calculate compliance statistics
  const totalTracked = workerTracks.length;
  const compliantCount = workerTracks.filter(
    (w) => !Object.values(w.ppe).includes("FAIL")
  ).length;
  const violationCount = totalTracked - compliantCount;
  const complianceRate = totalTracked > 0 ? (compliantCount / totalTracked) * 100 : 100;

  return (
    <div className="space-y-5 font-mono">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#26303C] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <HardHat className="w-5 h-5 text-amber-400" />
            <h1 className="text-xl font-bold tracking-wider text-slate-100 uppercase">
              Worker PPE Compliance Intelligence
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Individual worker tracking association • Multi-item body region inspection • Non-binary UNKNOWN handling
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded flex items-center gap-2">
            <span className="text-slate-400">Compliance Rate:</span>
            <span
              className={cn(
                "font-bold text-sm",
                complianceRate >= 90 ? "text-emerald-400" : "text-amber-400"
              )}
            >
              {complianceRate.toFixed(0)}%
            </span>
          </div>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#121821] border border-[#26303C] p-4 rounded-lg">
          <span className="text-slate-400 text-xs block mb-1">TOTAL TRACKED PERSONNEL</span>
          <div className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400" />
            <span>{totalTracked} Workers</span>
          </div>
        </div>

        <div className="bg-[#121821] border border-[#26303C] p-4 rounded-lg">
          <span className="text-slate-400 text-xs block mb-1">COMPLIANT WORKERS</span>
          <div className="text-2xl font-bold text-emerald-400 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            <span>{compliantCount} Personnel</span>
          </div>
        </div>

        <div className="bg-[#121821] border border-[#26303C] p-4 rounded-lg">
          <span className="text-slate-400 text-xs block mb-1">PPE VIOLATIONS DETECTED</span>
          <div
            className={cn(
              "text-2xl font-bold flex items-center gap-2",
              violationCount > 0 ? "text-amber-400" : "text-slate-400"
            )}
          >
            <ShieldAlert className="w-5 h-5" />
            <span>{violationCount} Violations</span>
          </div>
        </div>
      </div>

      {/* Engineering Note on UNKNOWN Occlusion Handling */}
      <div className="bg-[#121821] border border-purple-500/30 p-3.5 rounded-lg flex items-start gap-3 text-xs">
        <HelpCircle className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-bold text-purple-300 uppercase tracking-wide">
            First-Class UNKNOWN Handling (PRD Section 6 Protocol):
          </span>
          <p className="text-slate-300 leading-relaxed">
            Per the PRD specification, occluded or low-visibility body regions (such as safety footwear hidden behind industrial machinery) evaluate strictly to <strong className="text-purple-300">UNKNOWN (dashed border)</strong> rather than triggering a false violation. Violations are raised only upon persistent confirmed absence (<strong className="text-red-400">FAIL</strong>).
          </p>
        </div>
      </div>

      {/* Tracked Worker Personnel Roster */}
      <div className="bg-[#121821] border border-[#26303C] rounded-lg overflow-hidden shadow-md">
        <div className="p-3 bg-[#161F2B] border-b border-[#26303C] flex items-center justify-between">
          <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wide">
            Real-Time Tracked Personnel Status Roster
          </h2>
          <span className="text-[11px] text-slate-400 font-mono">Camera-to-Worker Association Active</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0E131A] text-slate-400 text-[11px] uppercase tracking-wider border-b border-[#26303C]">
              <tr>
                <th className="py-2.5 px-3">Tracker ID</th>
                <th className="py-2.5 px-3">Zone / Workcell</th>
                <th className="py-2.5 px-3">Camera Link</th>
                <th className="py-2.5 px-3">Vision Confidence</th>
                <th className="py-2.5 px-3">Safety Helmet</th>
                <th className="py-2.5 px-3">High-Vis Vest</th>
                <th className="py-2.5 px-3">Protective Gloves</th>
                <th className="py-2.5 px-3">Safety Footwear</th>
                <th className="py-2.5 px-3">Overall State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A222C]">
              {workerTracks.map((worker) => {
                const zone = zones.find((z) => z.zone_id === worker.zone_id);
                const hasViolation = Object.values(worker.ppe).includes("FAIL");

                return (
                  <tr key={worker.worker_track_id} className="hover:bg-[#1A222C]/70 transition-colors">
                    <td className="py-3 px-3 font-bold text-blue-400 whitespace-nowrap">
                      {worker.worker_track_id}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap text-slate-300">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        <span>{zone?.name || worker.zone_id}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-400 whitespace-nowrap">
                      {worker.camera_id}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-200 whitespace-nowrap">
                      {(worker.confidence * 100).toFixed(0)}%
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <PPEChip label="Helmet" status={worker.ppe.helmet} required={zone?.ppe_policy.helmet_required} />
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <PPEChip label="Vest" status={worker.ppe.vest} required={zone?.ppe_policy.vest_required} />
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <PPEChip label="Gloves" status={worker.ppe.gloves} required={zone?.ppe_policy.gloves_required} />
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <PPEChip label="Shoes" status={worker.ppe.safety_shoes} required={zone?.ppe_policy.safety_shoes_required} />
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      {hasViolation ? (
                        <span className="bg-amber-500/20 text-amber-400 border border-amber-500/40 px-2 py-0.5 rounded text-[10px] font-bold">
                          VIOLATION DETECTED
                        </span>
                      ) : (
                        <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded text-[10px] font-bold">
                          FULLY COMPLIANT
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
