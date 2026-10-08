"use client";

import React from "react";
import { useSafety } from "@/context/SafetyContext";
import { getStatusStyle, formatDateTime, cn } from "@/lib/utils";
import {
  Activity,
  Server,
  Radio,
  Wifi,
  Cpu,
  AlertTriangle,
  Clock,
  Heart,
  ShieldAlert,
} from "lucide-react";

export default function SystemHealthPage() {
  const { facility, systemHealth, setNetworkMode } = useSafety();

  const isDegraded = !facility.emergency_response_available;

  return (
    <div className="space-y-5 font-mono">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#26303C] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" />
            <h1 className="text-xl font-bold tracking-wider text-slate-100 uppercase">
              Subsystem Diagnostics & Device Health
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time status of Cloud AI inference, RS-485 Modbus bus, sensor nodes, and gateway failover
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Dead-Man Heartbeat:</span>
          <span className="font-mono text-emerald-400 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded flex items-center gap-1.5 font-bold">
            <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500 animate-pulse" />
            <span>ACTIVE (Every 5s / Timeout 15s)</span>
          </span>
        </div>
      </div>

      {/* Safety Critical Invariant Note (PRD Section 12 & TRD Section 12.2) */}
      <div
        className={cn(
          "p-4 rounded-lg border text-xs leading-relaxed space-y-1.5",
          isDegraded
            ? "bg-red-950/40 border-red-500 text-red-200"
            : "bg-[#121821] border-[#26303C] text-slate-300"
        )}
      >
        <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-amber-400 text-xs">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          <span>Safety Invariant Specification (Amended Architecture):</span>
        </div>
        <p className="text-[11px] text-slate-300">
          The ESP32 is a remote-commanded actuator without independent local failsafe authority. Automated emergency siren triggering requires live connectivity to the cloud backend. When the gateway is in <strong className="text-red-400">COMMUNICATION LOSS / OFFLINE</strong>, automated siren response cannot execute.
        </p>
      </div>

      {/* Subsystem Health Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {systemHealth.map((item) => {
          const statusStyle = getStatusStyle(item.status);

          return (
            <div
              key={item.id}
              className={cn(
                "bg-[#121821] border rounded-lg p-4 font-mono flex flex-col justify-between shadow-sm transition-all",
                item.is_safety_critical && item.status === "OFFLINE"
                  ? "border-red-600 ring-2 ring-red-500/50 bg-red-950/20"
                  : "border-[#26303C]"
              )}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2 pb-2 border-b border-[#26303C]">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                      {item.category}
                    </span>
                    <h3 className="font-bold text-xs text-slate-100 mt-0.5">{item.name}</h3>
                  </div>

                  <span
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-bold uppercase border",
                      item.status === "ONLINE"
                        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                        : item.status === "DEGRADED"
                        ? "bg-orange-500/20 text-orange-400 border-orange-500/40"
                        : "bg-red-500/20 text-red-400 border-red-500/50"
                    )}
                  >
                    {item.status}
                  </span>
                </div>

                <p className="text-[11px] text-slate-400 mt-1">{item.detail}</p>
              </div>

              <div className="mt-3 pt-2 border-t border-[#1E2632] flex items-center justify-between text-[10px] text-slate-500">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>Last Seen:</span>
                </span>
                <span className="font-mono text-slate-400 font-tabular">
                  {formatDateTime(item.last_seen)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Network Interface Failover Diagnostic Box */}
      <div className="bg-[#121821] border border-[#26303C] rounded-lg p-4 space-y-3">
        <h3 className="text-xs font-bold text-slate-200 uppercase flex items-center gap-2">
          <Wifi className="w-4 h-4 text-blue-400" />
          <span>Gateway Failover Mechanism (ESP32 WiFi $\rightarrow$ GSM Cellular)</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="bg-[#1A222C] p-3 rounded border border-slate-800 space-y-1">
            <span className="text-slate-400 text-[11px] block font-bold">Primary Channel (LAN/WiFi):</span>
            <span className="text-emerald-400 font-bold block">
              {facility.current_network_mode === "LAN" ? "ACTIVE & TRANSMITTING" : "DISCONNECTED"}
            </span>
            <p className="text-[10px] text-slate-500">Standard factory wireless / ethernet AP connection</p>
          </div>

          <div className="bg-[#1A222C] p-3 rounded border border-slate-800 space-y-1">
            <span className="text-slate-400 text-[11px] block font-bold">Secondary Backup (SIM7600 LTE/GSM):</span>
            <span className="text-amber-400 font-bold block">
              {facility.current_network_mode === "CELLULAR" ? "ACTIVE FAILOVER IN PROGRESS" : "STANDBY READY"}
            </span>
            <p className="text-[10px] text-slate-500">Auto-engages upon 3 consecutive missed LAN beacons</p>
          </div>

          <div className="bg-[#1A222C] p-3 rounded border border-slate-800 space-y-1">
            <span className="text-slate-400 text-[11px] block font-bold">Total Disconnection State:</span>
            <span className="text-red-400 font-bold block">
              {facility.current_network_mode === "OFFLINE" ? "ACTIVE FAULT STATE" : "NORMAL"}
            </span>
            <p className="text-[10px] text-slate-500">Triggers Dead-Man switch timeout on cloud backend</p>
          </div>
        </div>
      </div>
    </div>
  );
}
