"use client";

import React, { useState } from "react";
import { useSafety } from "@/context/SafetyContext";
import { PriorityBadge } from "@/components/PriorityBadge";
import { formatDateTime, cn } from "@/lib/utils";
import { History, Download, Search, Filter, ShieldCheck, FileSpreadsheet } from "lucide-react";

export default function EventHistoryPage() {
  const { incidents } = useSafety();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("ALL");

  const historyEvents = [
    // Pre-populate with typical historical audit trail events
    {
      id: "LOG-9921",
      timestamp: new Date(Date.now() - 7200000).toISOString(),
      type: "SYSTEM_HEARTBEAT_ACK",
      priority: "P0",
      zone: "Facility Wide",
      summary: "ESP32 periodic dead-man switch heartbeat received (0 comms drops)",
      mode: "LAN",
    },
    {
      id: "LOG-9918",
      timestamp: new Date(Date.now() - 14400000).toISOString(),
      type: "PPE_POLICY_UPDATED",
      priority: "P0",
      zone: "Welding & Fabrication Bay",
      summary: "Zone PPE policy version incremented to v2 by Supervisor",
      mode: "LAN",
    },
    {
      id: "LOG-9915",
      timestamp: new Date(Date.now() - 21600000).toISOString(),
      type: "MODBUS_NODE_POLL_OK",
      priority: "P0",
      zone: "Bay 1 & Bay 2",
      summary: "RS-485 cycle polling all 5 registers on nodes 0x01 and 0x02 nominal",
      mode: "LAN",
    },
    ...incidents.map((inc) => ({
      id: inc.incident_id,
      timestamp: inc.timestamp,
      type: inc.source_event_type,
      priority: inc.priority,
      zone: inc.zone_name,
      summary: inc.decision_reason,
      mode: inc.network_mode,
    })),
  ];

  const filteredLogs = historyEvents.filter((item) => {
    if (filterType !== "ALL" && item.type !== filterType) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        item.id.toLowerCase().includes(q) ||
        item.summary.toLowerCase().includes(q) ||
        item.zone.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const exportCSV = () => {
    const headers = "ID,Timestamp,Type,Priority,Zone,Summary,NetworkMode\n";
    const rows = filteredLogs
      .map(
        (l) =>
          `"${l.id}","${l.timestamp}","${l.type}","${l.priority}","${l.zone}","${l.summary.replace(/"/g, '""')}","${l.mode}"`
      )
      .join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `safety_audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 font-mono">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#26303C] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-blue-400" />
            <h1 className="text-xl font-bold tracking-wider text-slate-100 uppercase">
              Facility Safety Event History & Audit Log
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Immutable safety ledger • Multimodal sensor and vision event logs • Compliance verification
          </p>
        </div>

        <button
          onClick={exportCSV}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-colors shadow-sm self-start"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Export Audit Log (CSV)</span>
        </button>
      </div>

      {/* Filter and Search */}
      <div className="bg-[#121821] border border-[#26303C] rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400 font-bold">Event Class:</span>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-[#1A222C] border border-[#26303C] text-slate-200 rounded px-2.5 py-1 text-xs focus:outline-hidden focus:border-blue-500"
          >
            <option value="ALL">All Recorded Events</option>
            <option value="PPE_VIOLATION">PPE Violations</option>
            <option value="FIRE">Confirmed Fire Events</option>
            <option value="SMOKE">Smoke Hazard Events</option>
            <option value="SYSTEM_HEARTBEAT_ACK">Heartbeat Checks</option>
          </select>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search event logs..."
            className="w-full bg-[#1A222C] border border-[#26303C] text-slate-200 rounded pl-8 pr-3 py-1 text-xs placeholder:text-slate-500 focus:outline-hidden focus:border-blue-500"
          />
        </div>
      </div>

      {/* Historical Event Table */}
      <div className="bg-[#121821] border border-[#26303C] rounded-lg overflow-hidden shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#161F2B] border-b border-[#26303C] text-slate-400 text-[11px] uppercase tracking-wider font-bold">
              <tr>
                <th className="py-2.5 px-3">Audit ID</th>
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Priority</th>
                <th className="py-2.5 px-3">Event Type</th>
                <th className="py-2.5 px-3">Location / Scope</th>
                <th className="py-2.5 px-3">Summary Description</th>
                <th className="py-2.5 px-3">Link Mode</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A222C]">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-[#1A222C]/70 transition-colors">
                  <td className="py-2.5 px-3 font-mono font-bold text-slate-300">{log.id}</td>
                  <td className="py-2.5 px-3 font-mono-tabular text-slate-400 whitespace-nowrap">
                    {formatDateTime(log.timestamp)}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <PriorityBadge priority={log.priority as any} size="sm" />
                  </td>
                  <td className="py-2.5 px-3 font-bold text-slate-200 whitespace-nowrap">
                    {log.type}
                  </td>
                  <td className="py-2.5 px-3 text-slate-300 whitespace-nowrap">{log.zone}</td>
                  <td className="py-2.5 px-3 text-slate-400 max-w-md truncate" title={log.summary}>
                    {log.summary}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[10px] text-slate-400 whitespace-nowrap">
                    {log.mode}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
