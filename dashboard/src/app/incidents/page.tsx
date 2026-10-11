"use client";

import React, { useState } from "react";
import { useSafety } from "@/context/SafetyContext";
import { PriorityBadge } from "@/components/PriorityBadge";
import { formatDateTime, cn } from "@/lib/utils";
import {
  AlertOctagon,
  Filter,
  Eye,
  ShieldCheck,
  Search,
  ExternalLink,
} from "lucide-react";
import { Priority, IncidentStatus, SourceEventType } from "@/types/safety";

export default function IncidentsPage() {
  const { incidents, selectIncident } = useSafety();

  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState<string>("");

  const filteredIncidents = incidents.filter((incident) => {
    if (priorityFilter !== "ALL" && incident.priority !== priorityFilter) return false;
    if (statusFilter !== "ALL" && incident.status !== statusFilter) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchId = incident.incident_id.toLowerCase().includes(term);
      const matchZone = incident.zone_name.toLowerCase().includes(term);
      const matchReason = incident.decision_reason.toLowerCase().includes(term);
      const matchType = incident.source_event_type.toLowerCase().includes(term);
      return matchId || matchZone || matchReason || matchType;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#26303C] pb-3.5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <AlertOctagon className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-wider text-slate-100 uppercase">
              Incident &amp; Alert Operations Center
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Real-time hazard triage • Multimodal evidence snapshots • Lifecycle status management
          </p>
        </div>

        <div className="text-xs text-slate-300 bg-slate-900/90 border border-slate-800 px-3.5 py-2 rounded-lg flex items-center gap-2 shadow-sm font-mono">
          <span className="text-slate-400">Active Records:</span>
          <span className="font-bold text-slate-100 text-sm">{incidents.length}</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[#121821]/95 border border-[#26303C] rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-md">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-slate-300 font-bold">
            <Filter className="w-4 h-4 text-blue-400" />
            <span>Filters:</span>
          </div>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="bg-[#18212D] border border-[#26303C] text-slate-200 rounded-lg px-3 py-2 text-xs font-semibold focus:outline-none focus:border-blue-500 min-h-[38px] transition-colors"
          >
            <option value="ALL">All Priorities</option>
            <option value="P3">P3 Confirmed Hazards</option>
            <option value="P2">P2 Suspicious Hazards</option>
            <option value="P1">P1 PPE Warnings</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#18212D] border border-[#26303C] text-slate-200 rounded-lg px-3 py-2 text-xs font-semibold focus:outline-none focus:border-blue-500 min-h-[38px] transition-colors"
          >
            <option value="ALL">All Statuses</option>
            <option value="OPEN">OPEN (Requires Action)</option>
            <option value="ACKNOWLEDGED">ACKNOWLEDGED</option>
            <option value="RESOLVED">RESOLVED</option>
          </select>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search incident, zone, or ID..."
            className="w-full bg-[#18212D] border border-[#26303C] text-slate-200 rounded-lg pl-9 pr-3.5 py-2 text-xs sm:text-sm placeholder:text-slate-500 focus:outline-none focus:border-blue-500 min-h-[38px] transition-colors"
          />
        </div>
      </div>

      {/* Incidents Table */}
      <div className="bg-[#121821]/95 border border-[#26303C] rounded-xl overflow-hidden shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#161F2B] border-b border-[#26303C] text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Priority</th>
                <th className="py-3 px-4">Event Type</th>
                <th className="py-3 px-4">Zone / Location</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Confidence</th>
                <th className="py-3 px-4">Reasoning Summary</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A222C]">
              {filteredIncidents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-14 text-center text-slate-400">
                    <ShieldCheck className="w-10 h-10 mx-auto mb-2 text-emerald-500/50" />
                    <span className="font-semibold text-slate-300">No incidents matching the selected filter criteria.</span>
                  </td>
                </tr>
              ) : (
                filteredIncidents.map((incident) => (
                  <tr
                    key={incident.incident_id}
                    onClick={() => selectIncident(incident)}
                    className="hover:bg-[#1A222C]/80 transition-colors cursor-pointer group"
                  >
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <PriorityBadge priority={incident.priority} size="sm" />
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap font-bold text-slate-100 text-xs sm:text-sm">
                      {incident.source_event_type.replace("_", " ")}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap text-slate-300 font-medium">
                      {incident.zone_name}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap font-mono-tabular text-slate-400">
                      {formatDateTime(incident.timestamp)}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap font-mono text-slate-200 font-bold">
                      {(incident.confidence * 100).toFixed(0)}%
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 max-w-xs truncate" title={incident.decision_reason}>
                      {incident.decision_reason}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span
                        className={cn(
                          "px-2.5 py-1 rounded-md text-[11px] font-bold uppercase",
                          incident.status === "OPEN"
                            ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                            : incident.status === "ACKNOWLEDGED"
                            ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                            : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                        )}
                      >
                        {incident.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap text-right">
                      <button className="px-3.5 py-1.5 rounded-lg bg-blue-600/20 group-hover:bg-blue-600/30 text-blue-300 font-bold text-xs border border-blue-500/40 flex items-center gap-1.5 ml-auto transition-all min-h-[32px]">
                        <span>Review</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
