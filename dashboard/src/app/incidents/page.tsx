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
    <div className="space-y-5 font-mono">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#26303C] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <AlertOctagon className="w-5 h-5 text-amber-400" />
            <h1 className="text-xl font-bold tracking-wider text-slate-100 uppercase">
              Incident & Alert Operations Center
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time hazard triage • Multimodal evidence snapshots • Lifecycle status management
          </p>
        </div>

        <div className="text-xs text-slate-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded flex items-center gap-2">
          <span>Active Log Records:</span>
          <span className="font-bold text-slate-100">{incidents.length}</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[#121821] border border-[#26303C] rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-slate-400 font-bold">
            <Filter className="w-3.5 h-3.5" />
            <span>Filters:</span>
          </div>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="bg-[#1A222C] border border-[#26303C] text-slate-200 rounded px-2.5 py-1 text-xs focus:outline-hidden focus:border-blue-500"
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
            className="bg-[#1A222C] border border-[#26303C] text-slate-200 rounded px-2.5 py-1 text-xs focus:outline-hidden focus:border-blue-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="OPEN">OPEN (Requires Action)</option>
            <option value="ACKNOWLEDGED">ACKNOWLEDGED</option>
            <option value="RESOLVED">RESOLVED</option>
          </select>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search incident, zone, or ID..."
            className="w-full bg-[#1A222C] border border-[#26303C] text-slate-200 rounded pl-8 pr-3 py-1 text-xs placeholder:text-slate-500 focus:outline-hidden focus:border-blue-500"
          />
        </div>
      </div>

      {/* Incidents Table (Dense SCADA layout per UI/UX Section 16) */}
      <div className="bg-[#121821] border border-[#26303C] rounded-lg overflow-hidden shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#161F2B] border-b border-[#26303C] text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-3">Priority</th>
                <th className="py-2.5 px-3">Event Type</th>
                <th className="py-2.5 px-3">Zone / Location</th>
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Confidence</th>
                <th className="py-2.5 px-3">Reasoning Summary</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A222C]">
              {filteredIncidents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                    <span>No incidents matching the selected filter criteria.</span>
                  </td>
                </tr>
              ) : (
                filteredIncidents.map((incident) => (
                  <tr
                    key={incident.incident_id}
                    onClick={() => selectIncident(incident)}
                    className="hover:bg-[#1A222C]/70 transition-colors cursor-pointer group"
                  >
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <PriorityBadge priority={incident.priority} size="sm" />
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap font-bold text-slate-200">
                      {incident.source_event_type.replace("_", " ")}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-slate-300">
                      {incident.zone_name}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap font-mono-tabular text-slate-400">
                      {formatDateTime(incident.timestamp)}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap font-mono text-slate-300 font-bold">
                      {(incident.confidence * 100).toFixed(0)}%
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 max-w-xs truncate" title={incident.decision_reason}>
                      {incident.decision_reason}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
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
                    <td className="py-2.5 px-3 whitespace-nowrap text-right">
                      <button className="text-blue-400 group-hover:text-blue-300 flex items-center gap-1 ml-auto font-bold">
                        <span>Review</span>
                        <ExternalLink className="w-3 h-3" />
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
