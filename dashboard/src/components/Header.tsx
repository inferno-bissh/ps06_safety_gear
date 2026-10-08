"use client";

import React, { useState, useEffect } from "react";
import { useSafety } from "@/context/SafetyContext";
import { getNetworkBadge, cn } from "@/lib/utils";
import {
  ShieldAlert,
  Bell,
  Volume2,
  VolumeX,
  Play,
  RotateCcw,
  Wifi,
  Radio,
  WifiOff,
  AlertTriangle,
  Database,
  Sliders,
  UploadCloud,
} from "lucide-react";
import Link from "next/link";

export const Header: React.FC = () => {
  const {
    facility,
    incidents,
    activeScenario,
    triggerScenario,
    setNetworkMode,
    isP3TakeoverActive,
    dataSource,
    isFirebaseAvailable,
    setDataSource,
    seedFirestore,
  } = useSafety();

  const [time, setTime] = useState("");
  const [showNetworkMenu, setShowNetworkMenu] = useState(false);
  const [showSimBar, setShowSimBar] = useState(true);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const openIncidents = incidents.filter((i) => i.status !== "RESOLVED");
  const p3Count = openIncidents.filter((i) => i.priority === "P3").length;
  const netBadge = getNetworkBadge(facility.current_network_mode);

  return (
    <header className="border-b border-[#26303C] bg-[#121821] sticky top-0 z-40">
      {/* Top Banner if Emergency Response is Unavailable (PRD Section 12/13 requirement) */}
      {!facility.emergency_response_available && (
        <div className="bg-red-600/90 text-white px-4 py-1 text-xs font-bold font-mono-tabular tracking-wider flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span>
              CRITICAL: ESP32 GATEWAY OFFLINE — AUTOMATED SIREN / RELAY RESPONSE IS CURRENTLY UNAVAILABLE (NO LOCAL FALLBACK). MANUAL ONSITE SAFETY INTERVENTION REQUIRED.
            </span>
          </div>
          <button
            onClick={() => setNetworkMode("LAN")}
            className="bg-white text-red-700 px-2 py-0.5 rounded text-[11px] font-bold hover:bg-slate-100"
          >
            RESTORE LAN
          </button>
        </div>
      )}

      {/* Main Header Bar */}
      <div className="flex items-center justify-between px-4 py-2.5">
        {/* Left: Branding & Facility Context */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center border border-blue-400/40 shadow-sm shadow-blue-500/20">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm tracking-wider text-slate-100 uppercase">
                  SafetyIntel OS
                </span>
                <span className="text-[10px] px-1 py-0.2 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded font-mono font-semibold">
                  PS-06
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono-tabular flex items-center gap-2">
                <span>HOST: {facility.facility_id}</span>
                <span>•</span>
                <span className="text-slate-500">{facility.name}</span>
              </p>
            </div>
          </Link>
        </div>

        {/* Center: Live Telemetry, Network Badge & Siren Status */}
        <div className="flex items-center gap-3">
          {/* Network Mode Status Badge */}
          <div className="relative">
            <button
              onClick={() => setShowNetworkMenu(!showNetworkMenu)}
              className={cn(
                "flex items-center gap-2 px-2.5 py-1 rounded text-xs font-mono font-bold border transition-all",
                netBadge.color
              )}
              title="Click to toggle simulated connection mode"
            >
              {facility.current_network_mode === "LAN" && <Wifi className="w-3.5 h-3.5" />}
              {facility.current_network_mode === "CELLULAR" && <Radio className="w-3.5 h-3.5" />}
              {facility.current_network_mode === "OFFLINE" && <WifiOff className="w-3.5 h-3.5" />}
              <span>{netBadge.label}</span>
              <span className={cn("w-1.5 h-1.5 rounded-full", netBadge.indicator)} />
            </button>

            {/* Dropdown for Network Simulation */}
            {showNetworkMenu && (
              <div className="absolute top-full mt-1 left-0 w-52 bg-[#1A222C] border border-[#26303C] rounded shadow-xl py-1 z-50 text-xs font-mono">
                <div className="px-3 py-1 text-[10px] text-slate-400 font-bold uppercase border-b border-[#26303C]">
                  Simulate Gateway Network
                </div>
                <button
                  onClick={() => {
                    setNetworkMode("LAN");
                    setShowNetworkMenu(false);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#26303C] text-emerald-400 flex items-center justify-between"
                >
                  <span>LAN (WiFi Primary)</span>
                  {facility.current_network_mode === "LAN" && <span>✓</span>}
                </button>
                <button
                  onClick={() => {
                    setNetworkMode("CELLULAR");
                    setShowNetworkMenu(false);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#26303C] text-amber-400 flex items-center justify-between"
                >
                  <span>CELLULAR (GSM Backup)</span>
                  {facility.current_network_mode === "CELLULAR" && <span>✓</span>}
                </button>
                <button
                  onClick={() => {
                    setNetworkMode("OFFLINE");
                    setShowNetworkMenu(false);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#26303C] text-red-400 flex items-center justify-between"
                >
                  <span>OFFLINE (Total Loss)</span>
                  {facility.current_network_mode === "OFFLINE" && <span>✓</span>}
                </button>
              </div>
            )}
          </div>

          {/* Siren Actuator State */}
          <div
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono border transition-all",
              facility.emergency_siren_active
                ? "bg-red-500/20 text-red-400 border-red-500/60 animate-pulse font-bold"
                : "bg-slate-800/40 text-slate-400 border-slate-700/50"
            )}
          >
            {facility.emergency_siren_active ? (
              <>
                <Volume2 className="w-3.5 h-3.5 text-red-400 animate-bounce" />
                <span>SIREN COMMANDED: ACTIVE</span>
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5 text-slate-500" />
                <span>SIREN: QUIET</span>
              </>
            )}
          </div>

          {/* Cloud Firestore / Simulation Data Source Badge & Switcher */}
          <div className="flex items-center">
            {dataSource === "FIRESTORE" ? (
              <button
                onClick={() => setDataSource("SIMULATION")}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/20 transition-all"
                title="Connected to Firebase Cloud Firestore. Click to toggle Simulation Mode."
              >
                <Database className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">FIRESTORE:</span>
                <span>LIVE</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </button>
            ) : (
              <button
                onClick={() => {
                  if (isFirebaseAvailable) {
                    setDataSource("FIRESTORE");
                  } else {
                    alert("Firebase credentials not detected in .env.local! Running offline simulation.");
                  }
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/40 hover:bg-amber-500/20 transition-all"
                title="Running offline simulation. Click to switch to Live Firestore."
              >
                <Sliders className="w-3.5 h-3.5 text-amber-400" />
                <span>SIMULATION</span>
              </button>
            )}
          </div>

          {/* Clock */}
          <div className="hidden md:flex items-center font-mono-tabular text-xs text-slate-400 bg-slate-900/60 border border-slate-800 px-2.5 py-1 rounded">
            <span>{time}</span>
          </div>
        </div>

        {/* Right: Incident Bell & Scenario Toolbar Toggle */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSimBar(!showSimBar)}
            className={cn(
              "px-2.5 py-1 rounded text-xs font-mono font-medium border flex items-center gap-1.5 transition-colors",
              showSimBar
                ? "bg-blue-600/20 text-blue-400 border-blue-500/40"
                : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700"
            )}
          >
            <Play className="w-3 h-3" />
            <span>Demo Scenarios</span>
          </button>

          <Link
            href="/incidents"
            className={cn(
              "relative p-2 rounded border transition-colors flex items-center justify-center",
              openIncidents.length > 0
                ? "bg-amber-500/10 border-amber-500/40 text-amber-400 hover:bg-amber-500/20"
                : "bg-slate-800/50 border-slate-700/60 text-slate-400 hover:bg-slate-800"
            )}
          >
            <Bell className="w-4 h-4" />
            {openIncidents.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-amber-500 text-slate-950 text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center font-mono">
                {openIncidents.length}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* Scenario Simulation Quickbar */}
      {showSimBar && (
        <div className="bg-[#0B0F14] border-t border-[#1E2632] px-4 py-1.5 flex flex-wrap items-center justify-between text-xs font-mono gap-2">
          <div className="flex items-center gap-2 text-slate-400 text-[11px]">
            <span className="font-bold text-blue-400 uppercase">Interactive Hackathon Simulator:</span>
            <span>Trigger any of the 5 test scenarios:</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => triggerScenario("A")}
              className={cn(
                "px-2 py-0.5 rounded text-[11px] border transition-colors",
                activeScenario === "A"
                  ? "bg-amber-500 text-slate-950 font-bold border-amber-400"
                  : "bg-slate-800 text-amber-300 border-amber-500/30 hover:bg-slate-700"
              )}
            >
              [A] PPE Violation (P1)
            </button>
            <button
              onClick={() => triggerScenario("B")}
              className={cn(
                "px-2 py-0.5 rounded text-[11px] border transition-colors",
                activeScenario === "B"
                  ? "bg-red-500 text-white font-bold border-red-400"
                  : "bg-slate-800 text-red-400 border-red-500/30 hover:bg-slate-700"
              )}
            >
              [B] Confirmed Fire (P3)
            </button>
            <button
              onClick={() => triggerScenario("C")}
              className={cn(
                "px-2 py-0.5 rounded text-[11px] border transition-colors",
                activeScenario === "C"
                  ? "bg-orange-500 text-slate-950 font-bold border-orange-400"
                  : "bg-slate-800 text-orange-400 border-orange-500/30 hover:bg-slate-700"
              )}
            >
              [C] Sensor Smoke (P2)
            </button>
            <button
              onClick={() => triggerScenario("D")}
              className={cn(
                "px-2 py-0.5 rounded text-[11px] border transition-colors",
                activeScenario === "D"
                  ? "bg-orange-500 text-slate-950 font-bold border-orange-400"
                  : "bg-slate-800 text-orange-400 border-orange-500/30 hover:bg-slate-700"
              )}
            >
              [D] Visual Smoke (P2)
            </button>
            <button
              onClick={() => triggerScenario("E")}
              className={cn(
                "px-2 py-0.5 rounded text-[11px] border transition-colors",
                activeScenario === "E"
                  ? "bg-slate-700 text-white font-bold border-slate-500"
                  : "bg-slate-800 text-slate-300 border-slate-600 hover:bg-slate-700"
              )}
            >
              [E] Total Comms Loss (No Siren)
            </button>
            <button
              onClick={() => triggerScenario("RESET")}
              className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-950/40 flex items-center gap-1 font-bold"
            >
              <RotateCcw className="w-3 h-3" />
              <span>RESET</span>
            </button>

            {isFirebaseAvailable && (
              <button
                onClick={seedFirestore}
                className="px-2 py-0.5 rounded text-[11px] bg-blue-950/60 text-blue-300 border border-blue-500/50 hover:bg-blue-900/60 flex items-center gap-1 font-bold transition-colors"
                title="Populate Cloud Firestore with baseline facility, 3 zones, and cameras"
              >
                <UploadCloud className="w-3 h-3 text-blue-400" />
                <span>SEED FIRESTORE</span>
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
