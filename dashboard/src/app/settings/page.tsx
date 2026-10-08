"use client";

import React, { useState } from "react";
import { useSafety } from "@/context/SafetyContext";
import {
  Sliders,
  Boxes,
  Video,
  Bell,
  HardHat,
  Cpu,
  Save,
  Check,
  Shield,
  Radio,
} from "lucide-react";

export default function SettingsPage() {
  const { zones, cameras, facility, updatePPEPolicy } = useSafety();
  const [activeTab, setActiveTab] = useState<"PPE" | "CAMERAS" | "NOTIFICATIONS" | "DEVICES">("PPE");
  const [saveNotice, setSaveNotice] = useState(false);

  // Form states
  const [temporalFrames, setTemporalFrames] = useState(5);
  const [fireConfidence, setFireConfidence] = useState(0.85);
  const [ppeConfidence, setPpeConfidence] = useState(0.80);

  const handleSave = () => {
    setSaveNotice(true);
    setTimeout(() => setSaveNotice(false), 3000);
  };

  return (
    <div className="space-y-5 font-mono">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#26303C] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-blue-400" />
            <h1 className="text-xl font-bold tracking-wider text-slate-100 uppercase">
              System Configuration & Policy Hub
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Zone PPE rules • Camera cloud-push streams • Sensor parameters • Mobile notification policies
          </p>
        </div>

        {saveNotice && (
          <div className="bg-emerald-600/20 border border-emerald-500/50 text-emerald-400 px-3 py-1 rounded text-xs flex items-center gap-1.5 font-bold animate-in fade-in">
            <Check className="w-4 h-4" />
            <span>Policy Configurations Synchronized</span>
          </div>
        )}
      </div>

      {/* Tabs Bar */}
      <div className="flex border-b border-[#26303C] gap-1 overflow-x-auto text-xs">
        <button
          onClick={() => setActiveTab("PPE")}
          className={`px-4 py-2 font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "PPE"
              ? "border-blue-500 text-blue-400 bg-blue-500/10"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <HardHat className="w-4 h-4" />
          <span>Zone PPE Policies</span>
        </button>

        <button
          onClick={() => setActiveTab("CAMERAS")}
          className={`px-4 py-2 font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "CAMERAS"
              ? "border-blue-500 text-blue-400 bg-blue-500/10"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Video className="w-4 h-4" />
          <span>Camera Stream Ingestion</span>
        </button>

        <button
          onClick={() => setActiveTab("NOTIFICATIONS")}
          className={`px-4 py-2 font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "NOTIFICATIONS"
              ? "border-blue-500 text-blue-400 bg-blue-500/10"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Bell className="w-4 h-4" />
          <span>Mobile FCM Alerts</span>
        </button>

        <button
          onClick={() => setActiveTab("DEVICES")}
          className={`px-4 py-2 font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "DEVICES"
              ? "border-blue-500 text-blue-400 bg-blue-500/10"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span>Device & Modbus Specs</span>
        </button>
      </div>

      {/* Tab 1: Zone PPE Policies */}
      {activeTab === "PPE" && (
        <div className="space-y-4">
          <div className="bg-[#121821] border border-[#26303C] rounded-lg p-4 space-y-4">
            <div>
              <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
                Zone-Specific PPE Enforcement Rules
              </h2>
              <p className="text-xs text-slate-400">
                Configure which PPE items are mandated per industrial workcell without modifying AI code.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {zones.map((zone) => (
                <div key={zone.zone_id} className="bg-[#1A222C] border border-slate-800 rounded-lg p-3 space-y-3">
                  <div className="border-b border-slate-700/60 pb-2">
                    <span className="text-[10px] text-blue-400 font-bold uppercase">{zone.zone_id}</span>
                    <h3 className="font-bold text-xs text-white">{zone.name}</h3>
                  </div>

                  <div className="space-y-2 text-xs">
                    <label className="flex items-center justify-between cursor-pointer p-1.5 rounded hover:bg-slate-800">
                      <span className="text-slate-300">Safety Helmet:</span>
                      <input
                        type="checkbox"
                        checked={zone.ppe_policy.helmet_required}
                        onChange={(e) =>
                          updatePPEPolicy(zone.zone_id, { helmet_required: e.target.checked })
                        }
                        className="rounded border-slate-700 text-blue-600 focus:ring-0 w-4 h-4"
                      />
                    </label>

                    <label className="flex items-center justify-between cursor-pointer p-1.5 rounded hover:bg-slate-800">
                      <span className="text-slate-300">High-Vis Vest:</span>
                      <input
                        type="checkbox"
                        checked={zone.ppe_policy.vest_required}
                        onChange={(e) =>
                          updatePPEPolicy(zone.zone_id, { vest_required: e.target.checked })
                        }
                        className="rounded border-slate-700 text-blue-600 focus:ring-0 w-4 h-4"
                      />
                    </label>

                    <label className="flex items-center justify-between cursor-pointer p-1.5 rounded hover:bg-slate-800">
                      <span className="text-slate-300">Protective Gloves:</span>
                      <input
                        type="checkbox"
                        checked={zone.ppe_policy.gloves_required}
                        onChange={(e) =>
                          updatePPEPolicy(zone.zone_id, { gloves_required: e.target.checked })
                        }
                        className="rounded border-slate-700 text-blue-600 focus:ring-0 w-4 h-4"
                      />
                    </label>

                    <label className="flex items-center justify-between cursor-pointer p-1.5 rounded hover:bg-slate-800">
                      <span className="text-slate-300">Safety Footwear:</span>
                      <input
                        type="checkbox"
                        checked={zone.ppe_policy.safety_shoes_required}
                        onChange={(e) =>
                          updatePPEPolicy(zone.zone_id, { safety_shoes_required: e.target.checked })
                        }
                        className="rounded border-slate-700 text-blue-600 focus:ring-0 w-4 h-4"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-[#26303C] flex justify-end">
              <button
                onClick={handleSave}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-1.5 rounded text-xs flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save All PPE Policies</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Cameras */}
      {activeTab === "CAMERAS" && (
        <div className="bg-[#121821] border border-[#26303C] rounded-lg p-4 space-y-4 text-xs">
          <div>
            <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
              Camera Cloud-Push Streaming Configuration
            </h2>
            <p className="text-xs text-slate-400">
              Per 2026-09-28 amendment: Cameras push continuous streams directly to the cloud backend.
            </p>
          </div>

          <div className="space-y-3">
            {cameras.map((c) => (
              <div key={c.camera_id} className="bg-[#1A222C] border border-slate-800 rounded p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-blue-400">{c.name} ({c.camera_id})</span>
                  <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">
                    STREAM ACTIVE
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div>
                    <label className="text-slate-400 text-[10px] block">Ingestion Target Endpoint:</label>
                    <input
                      type="text"
                      readOnly
                      value={`rtmp://cloud-ingest.safetyos.internal/live/${c.camera_id.toLowerCase()}`}
                      className="w-full bg-[#0B0F14] border border-[#26303C] rounded px-2 py-1 text-slate-300 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 text-[10px] block">FPS & Resolution:</label>
                    <input
                      type="text"
                      readOnly
                      value={`${c.fps} FPS • ${c.resolution}`}
                      className="w-full bg-[#0B0F14] border border-[#26303C] rounded px-2 py-1 text-slate-300 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 text-[10px] block">Zone Association:</label>
                    <input
                      type="text"
                      readOnly
                      value={c.zone_id}
                      className="w-full bg-[#0B0F14] border border-[#26303C] rounded px-2 py-1 text-slate-300 font-mono"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Notifications */}
      {activeTab === "NOTIFICATIONS" && (
        <div className="bg-[#121821] border border-[#26303C] rounded-lg p-4 space-y-4 text-xs">
          <div>
            <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
              Firebase Cloud Messaging (FCM) Alert Routing
            </h2>
            <p className="text-xs text-slate-400">
              Configure delivery priorities for supervisor mobile notifications.
            </p>
          </div>

          <div className="space-y-2 max-w-xl">
            <div className="flex items-center justify-between p-2.5 rounded bg-[#1A222C] border border-slate-800">
              <div>
                <span className="font-bold text-red-400 block">P3 Confirmed Hazard Alerts:</span>
                <span className="text-[10px] text-slate-400">High-priority push + Audio siren + Full takeover</span>
              </div>
              <span className="text-emerald-400 font-bold">MANDATORY ACTIVE</span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded bg-[#1A222C] border border-slate-800">
              <div>
                <span className="font-bold text-orange-400 block">P2 Suspicious Hazard Alerts:</span>
                <span className="text-[10px] text-slate-400">Immediate mobile push notification + Dashboard warning</span>
              </div>
              <input type="checkbox" defaultChecked className="rounded text-blue-600 w-4 h-4" />
            </div>

            <div className="flex items-center justify-between p-2.5 rounded bg-[#1A222C] border border-slate-800">
              <div>
                <span className="font-bold text-amber-400 block">P1 PPE Compliance Alerts:</span>
                <span className="text-[10px] text-slate-400">Dashboard warning toast only (no sound siren)</span>
              </div>
              <input type="checkbox" defaultChecked className="rounded text-blue-600 w-4 h-4" />
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Device & Modbus Specs */}
      {activeTab === "DEVICES" && (
        <div className="bg-[#121821] border border-[#26303C] rounded-lg p-4 space-y-4 text-xs">
          <div>
            <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
              Field Hardware Specifications (Frozen Architecture)
            </h2>
            <p className="text-xs text-slate-400">
              Hardware registry for ESP32 central gateway and Arduino Nano / STM8 zone sensor nodes.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#1A222C] border border-slate-800 rounded p-3 space-y-2">
              <span className="font-bold text-blue-400 block border-b border-slate-700 pb-1">
                Central Gateway (ESP32 DevKitC)
              </span>
              <div className="space-y-1 text-[11px] text-slate-300">
                <p>• Role: RS-485 Modbus RTU Master + Cloud Telemetry Relay</p>
                <p>• Actuator: 5V Relay controlling 12V Demonstration Siren</p>
                <p>• Local Failsafe: <strong className="text-amber-400">NONE (Commanded by Backend Only)</strong></p>
                <p>• Primary Link: 2.4GHz 802.11b/g/n WiFi</p>
                <p>• Backup Link: SIM7600/SIM800L Cellular Modem</p>
              </div>
            </div>

            <div className="bg-[#1A222C] border border-slate-800 rounded p-3 space-y-2">
              <span className="font-bold text-orange-400 block border-b border-slate-700 pb-1">
                Modbus RTU Register Map (Frozen)
              </span>
              <div className="space-y-1 text-[11px] text-slate-300">
                <p>• Reg 40001: IR Flame Status (0=Normal, 1=Flame, 2=Fault)</p>
                <p>• Reg 40002: Gas / Smoke Raw ADC (0–1023)</p>
                <p>• Reg 40003: Normalized Smoke Index (0–1000 $\rightarrow$ 0.00–1.00)</p>
                <p>• Reg 40004: Sensor Health State (0=OK, 1=Warn, 2=Fault)</p>
                <p>• Reg 40005: Monotonic Node Heartbeat Counter</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
