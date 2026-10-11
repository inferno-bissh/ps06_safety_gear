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
  Flame,
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
    liveHazard,
    toggleLiveHazard,
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
    <header className="border-b border-[#26303C] bg-[#121821]/95 backdrop-blur sticky top-0 z-40 shadow-sm">
      {/* Top Banner if Emergency Response is Unavailable (PRD Section 12/13 requirement) */}
      {!facility.emergency_response_available && (
        <div className="bg-red-600 text-white px-4 py-1.5 text-xs font-bold tracking-wider flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              CRITICAL: ESP32 GATEWAY OFFLINE — AUTOMATED SIREN / RELAY RESPONSE IS CURRENTLY UNAVAILABLE (NO LOCAL FALLBACK). MANUAL ONSITE SAFETY INTERVENTION REQUIRED.
            </span>
          </div>
          <button
            onClick={() => setNetworkMode("LAN")}
            className="bg-white text-red-700 px-3 py-1 rounded-md text-xs font-bold hover:bg-slate-100 transition-colors shadow-sm ml-2"
          >
            RESTORE LAN
          </button>
        </div>
      )}

      {/* Main Header Bar */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-2.5 gap-3 flex-wrap">
        {/* Left: Branding & Simple Navigation */}
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center border border-blue-400/40 shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm sm:text-base tracking-wider text-slate-100 uppercase">
                  Industrial Safety Monitor
                </span>
                <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded font-mono font-bold">
                  PS-06
                </span>
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                <span className="font-mono text-slate-300">HOST: {facility.facility_id}</span>
                <span>•</span>
                <span className="text-slate-400 truncate max-w-[200px]">{facility.name}</span>
              </p>
            </div>
          </Link>

          {/* Top Quick Navigation */}
          <nav className="hidden xl:flex items-center gap-1 bg-[#161F2B] border border-[#26303C] rounded-lg p-1 text-xs">
            <Link href="/" className="px-3 py-1 rounded text-slate-300 hover:text-white hover:bg-slate-800 transition-colors font-semibold">
              Overview
            </Link>
            <Link href="/cameras" className="px-3 py-1 rounded text-slate-300 hover:text-white hover:bg-slate-800 transition-colors font-semibold">
              Live Monitoring
            </Link>
            <Link href="/incidents" className="px-3 py-1 rounded text-slate-300 hover:text-white hover:bg-slate-800 transition-colors font-semibold flex items-center gap-1.5">
              <span>Incidents</span>
              {openIncidents.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-slate-950 font-bold">
                  {openIncidents.length}
                </span>
              )}
            </Link>
            <Link href="/zones" className="px-3 py-1 rounded text-slate-300 hover:text-white hover:bg-slate-800 transition-colors font-semibold">
              Zones
            </Link>
          </nav>
        </div>

        {/* Center: Live Telemetry, Network Badge & Siren Status */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Network Mode Status Badge */}
          <div className="relative">
            <button
              onClick={() => setShowNetworkMenu(!showNetworkMenu)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all min-h-[36px] hover:shadow-sm",
                netBadge.color
              )}
              title="Click to toggle simulated connection mode"
            >
              {facility.current_network_mode === "LAN" && <Wifi className="w-3.5 h-3.5" />}
              {facility.current_network_mode === "CELLULAR" && <Radio className="w-3.5 h-3.5" />}
              {facility.current_network_mode === "OFFLINE" && <WifiOff className="w-3.5 h-3.5" />}
              <span>{netBadge.label}</span>
              <span className={cn("w-2 h-2 rounded-full", netBadge.indicator)} />
            </button>

            {/* Dropdown for Network Simulation */}
            {showNetworkMenu && (
              <div className="absolute top-full mt-1.5 left-0 w-56 bg-[#1A222C] border border-[#26303C] rounded-xl shadow-2xl py-1.5 z-50 text-xs font-mono">
                <div className="px-3.5 py-1.5 text-[10px] text-slate-400 font-bold uppercase tracking-wider border-b border-[#26303C]">
                  Simulate Gateway Network
                </div>
                <button
                  onClick={() => {
                    setNetworkMode("LAN");
                    setShowNetworkMenu(false);
                  }}
                  className="w-full text-left px-3.5 py-2 hover:bg-[#26303C] text-emerald-400 flex items-center justify-between transition-colors"
                >
                  <span className="font-semibold">LAN (WiFi Primary)</span>
                  {facility.current_network_mode === "LAN" && <span>✓</span>}
                </button>
                <button
                  onClick={() => {
                    setNetworkMode("CELLULAR");
                    setShowNetworkMenu(false);
                  }}
                  className="w-full text-left px-3.5 py-2 hover:bg-[#26303C] text-amber-400 flex items-center justify-between transition-colors"
                >
                  <span className="font-semibold">CELLULAR (GSM Backup)</span>
                  {facility.current_network_mode === "CELLULAR" && <span>✓</span>}
                </button>
                <button
                  onClick={() => {
                    setNetworkMode("OFFLINE");
                    setShowNetworkMenu(false);
                  }}
                  className="w-full text-left px-3.5 py-2 hover:bg-[#26303C] text-red-400 flex items-center justify-between transition-colors"
                >
                  <span className="font-semibold">OFFLINE (Total Loss)</span>
                  {facility.current_network_mode === "OFFLINE" && <span>✓</span>}
                </button>
              </div>
            )}
          </div>

          {/* Siren Actuator State */}
          <div
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all min-h-[36px]",
              facility.emergency_siren_active
                ? "bg-red-500/20 text-red-400 border-red-500/60 animate-pulse font-bold"
                : "bg-slate-800/40 text-slate-400 border-slate-700/60"
            )}
          >
            {facility.emergency_siren_active ? (
              <>
                <Volume2 className="w-4 h-4 text-red-400 animate-bounce" />
                <span>SIREN: ACTIVE</span>
              </>
            ) : (
              <>
                <VolumeX className="w-4 h-4 text-slate-500" />
                <span>SIREN: QUIET</span>
              </>
            )}
          </div>

          {/* Live Multi-Camera Hazard Sensor Status */}
          <div className="flex items-center">
            {liveHazard?.fire ? (
              <button
                onClick={() => toggleLiveHazard("reset")}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600/25 text-red-300 border border-red-500 ring-2 ring-red-500/40 hover:bg-red-600/40 transition-all min-h-[36px] animate-pulse"
                title="CRITICAL: Live Flame detected on CCTV 2. Click to clear."
              >
                <Flame className="w-4 h-4 text-red-400 animate-bounce" />
                <span>FIRE: ACTIVE [P3]</span>
                <span className="text-[10px] bg-red-800 px-1.5 py-0.5 rounded text-white font-mono">CLEAR</span>
              </button>
            ) : liveHazard?.smoke ? (
              <button
                onClick={() => toggleLiveHazard("reset")}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold bg-orange-500/20 text-orange-300 border border-orange-500/60 hover:bg-orange-500/30 transition-all min-h-[36px]"
                title={`Smoke detected on CCTV 2 (Index: ${(liveHazard.smoke_index || 0.88).toFixed(2)}). Click to clear.`}
              >
                <AlertTriangle className="w-4 h-4 text-orange-400" />
                <span>SMOKE: {(liveHazard.smoke_index || 0.88).toFixed(2)} [P2]</span>
                <span className="text-[10px] bg-orange-700 px-1.5 py-0.5 rounded text-white font-mono">CLEAR</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800/40 text-slate-400 border border-slate-700/60 min-h-[36px]">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>HAZARDS: NORMAL</span>
              </div>
            )}
          </div>

          {/* Cloud Firestore / Simulation Data Source Badge & Switcher */}
          <div className="flex items-center">
            {dataSource === "FIRESTORE" ? (
              <button
                onClick={() => setDataSource("SIMULATION")}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/20 transition-all min-h-[36px]"
                title="Connected to Firebase Cloud Firestore. Click to toggle Simulation Mode."
              >
                <Database className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">FIRESTORE:</span>
                <span>LIVE</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
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
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/40 hover:bg-amber-500/20 transition-all min-h-[36px]"
                title="Running offline simulation. Click to switch to Live Firestore."
              >
                <Sliders className="w-3.5 h-3.5 text-amber-400" />
                <span>SIMULATION MODE</span>
              </button>
            )}
          </div>

          {/* Clock */}
          <div className="hidden md:flex items-center font-mono-tabular text-xs font-semibold text-slate-300 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-lg min-h-[36px]">
            <span>{time}</span>
          </div>
        </div>

        {/* Right: Incident Bell & Scenario Toolbar Toggle */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowSimBar(!showSimBar)}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-2 transition-all min-h-[36px]",
              showSimBar
                ? "bg-blue-600/20 text-blue-300 border-blue-500/50 shadow-sm"
                : "bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700"
            )}
          >
            <Play className="w-3.5 h-3.5" />
            <span>Demo Scenarios</span>
          </button>

          <Link
            href="/incidents"
            className={cn(
              "relative p-2 rounded-lg border transition-all flex items-center justify-center min-h-[36px] min-w-[36px]",
              openIncidents.length > 0
                ? "bg-amber-500/15 border-amber-500/50 text-amber-300 hover:bg-amber-500/25"
                : "bg-slate-800/50 border-slate-700/60 text-slate-400 hover:bg-slate-800"
            )}
            title="Open Incidents"
          >
            <Bell className="w-4 h-4" />
            {openIncidents.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-slate-950 text-[11px] font-extrabold w-5 h-5 rounded-full flex items-center justify-center font-mono shadow-sm">
                {openIncidents.length}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* Scenario Simulation Quickbar - Clean, spacious, and easily clickable buttons */}
      {showSimBar && (
        <div className="bg-[#0B0F15] border-t border-[#1E2632] px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between text-xs gap-3">
          <div className="flex items-center gap-2 text-slate-300 text-xs font-semibold">
            <span className="text-blue-400 font-bold uppercase tracking-wider">Demo Scenarios:</span>
            <span className="hidden md:inline text-slate-400">Click to trigger simulated conditions:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => triggerScenario("A")}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold border transition-all flex items-center gap-1.5 min-h-[36px] shadow-sm active:scale-95",
                activeScenario === "A"
                  ? "bg-amber-500 text-slate-950 font-extrabold border-amber-400 ring-2 ring-amber-400/50"
                  : "bg-[#18212C] text-amber-300 border-amber-500/40 hover:bg-amber-500/15 hover:border-amber-400"
              )}
            >
              <span>[A] PPE Violation</span>
              <span className="text-[10px] opacity-75 font-mono">(P1)</span>
            </button>

            <button
              onClick={() => triggerScenario("B")}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold border transition-all flex items-center gap-1.5 min-h-[36px] shadow-sm active:scale-95",
                activeScenario === "B"
                  ? "bg-red-600 text-white font-extrabold border-red-500 ring-2 ring-red-400/50 animate-pulse"
                  : "bg-[#18212C] text-red-400 border-red-500/40 hover:bg-red-500/15 hover:border-red-400"
              )}
            >
              <span>[B] Confirmed Fire</span>
              <span className="text-[10px] opacity-75 font-mono">(P3)</span>
            </button>

            <button
              onClick={() => triggerScenario("C")}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold border transition-all flex items-center gap-1.5 min-h-[36px] shadow-sm active:scale-95",
                activeScenario === "C"
                  ? "bg-orange-500 text-slate-950 font-extrabold border-orange-400 ring-2 ring-orange-400/50"
                  : "bg-[#18212C] text-orange-400 border-orange-500/40 hover:bg-orange-500/15 hover:border-orange-400"
              )}
            >
              <span>[C] Sensor Smoke</span>
              <span className="text-[10px] opacity-75 font-mono">(P2)</span>
            </button>

            <button
              onClick={() => triggerScenario("D")}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold border transition-all flex items-center gap-1.5 min-h-[36px] shadow-sm active:scale-95",
                activeScenario === "D"
                  ? "bg-orange-500 text-slate-950 font-extrabold border-orange-400 ring-2 ring-orange-400/50"
                  : "bg-[#18212C] text-orange-400 border-orange-500/40 hover:bg-orange-500/15 hover:border-orange-400"
              )}
            >
              <span>[D] Visual Smoke</span>
              <span className="text-[10px] opacity-75 font-mono">(P2)</span>
            </button>

            <button
              onClick={() => triggerScenario("E")}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold border transition-all flex items-center gap-1.5 min-h-[36px] shadow-sm active:scale-95",
                activeScenario === "E"
                  ? "bg-slate-600 text-white font-extrabold border-slate-400 ring-2 ring-slate-400/50"
                  : "bg-[#18212C] text-slate-300 border-slate-600 hover:bg-slate-700/60 hover:border-slate-500"
              )}
            >
              <span>[E] Comms Loss</span>
              <span className="text-[10px] opacity-75 font-mono">(No Siren)</span>
            </button>

            <button
              onClick={() => triggerScenario("RESET")}
              className="px-3.5 py-1.5 rounded-lg text-xs sm:text-sm bg-emerald-950/60 text-emerald-300 border border-emerald-500/50 hover:bg-emerald-900/60 flex items-center gap-1.5 font-bold transition-all min-h-[36px] shadow-sm active:scale-95"
              title="Reset all triggers to normal"
            >
              <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
              <span>RESET</span>
            </button>

            {isFirebaseAvailable && (
              <button
                onClick={seedFirestore}
                className="px-3.5 py-1.5 rounded-lg text-xs sm:text-sm bg-blue-950/70 text-blue-300 border border-blue-500/60 hover:bg-blue-900/70 flex items-center gap-1.5 font-bold transition-all min-h-[36px] shadow-sm active:scale-95"
                title="Populate Cloud Firestore with baseline facility, 3 zones, and cameras"
              >
                <UploadCloud className="w-3.5 h-3.5 text-blue-400" />
                <span>SEED FIRESTORE</span>
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
