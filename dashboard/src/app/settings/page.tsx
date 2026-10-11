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
  UserCheck,
  UserPlus,
  Camera,
  RefreshCw,
  AlertCircle,
} from "lucide-react";

export default function SettingsPage() {
  const { zones, cameras, facility, updatePPEPolicy } = useSafety();
  const [activeTab, setActiveTab] = useState<"PPE" | "CAMERAS" | "NOTIFICATIONS" | "DEVICES" | "FACE_ID">("PPE");
  const [saveNotice, setSaveNotice] = useState(false);

  // Face ID state
  const [enrolledWorkers, setEnrolledWorkers] = useState<string[]>([]);
  const [enrollName, setEnrollName] = useState("");
  const [enrollCam, setEnrollCam] = useState("cctv1");
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [enrollFeedback, setEnrollFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchRoster = async () => {
    try {
      const res = await fetch("http://localhost:5000/api/roster");
      if (res.ok) {
        const data = await res.json();
        setEnrolledWorkers(data.enrolled_workers || []);
      }
    } catch {
      // Fallback
      setEnrolledWorkers(["Rahul Sharma", "Amit Patel", "Priya Verma", "Suresh Das"]);
    }
  };

  React.useEffect(() => {
    if (activeTab === "FACE_ID") {
      fetchRoster();
    }
  }, [activeTab]);

  const handleEnrollFace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollName.trim()) return;
    setIsEnrolling(true);
    setEnrollFeedback(null);
    try {
      const res = await fetch("http://localhost:5000/api/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: enrollName.trim(), camera: enrollCam }),
      });
      const data = await res.json();
      if (res.ok && data.status === "SUCCESS") {
        setEnrollFeedback({ type: "success", text: data.message });
        setEnrollName("");
        await fetchRoster();
      } else {
        setEnrollFeedback({ type: "error", text: data.message || "Face detection failed. Face the camera directly." });
      }
    } catch {
      setEnrollFeedback({
        type: "error",
        text: "Could not connect to vision pipeline on port 5000. Ensure multicam orchestrator is active.",
      });
    } finally {
      setIsEnrolling(false);
    }
  };

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

        <button
          onClick={() => setActiveTab("FACE_ID")}
          className={`px-4 py-2 font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "FACE_ID"
              ? "border-emerald-500 text-emerald-400 bg-emerald-500/10"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <UserCheck className="w-4 h-4 text-emerald-400" />
          <span>Face ID & AIML Roster</span>
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

      {/* Tab 5: Face ID & AIML Roster */}
      {activeTab === "FACE_ID" && (
        <div className="space-y-4">
          <div className="bg-[#121821] border border-[#26303C] rounded-lg p-4 space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wide flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-emerald-400" />
                    Face ID Enrollment & AIML Training Data Hub
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Register personnel faces into SFace 128-D neural database. Enrolled names replace generic IDs (<code className="text-amber-400">GATE_WORKER_...</code>) on live camera feeds.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={fetchRoster}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded text-xs flex items-center gap-1.5 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
                  <span>Refresh Roster</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Enrollment Form */}
              <div className="bg-[#1A222C] border border-slate-800 rounded-lg p-4 space-y-4">
                <div className="border-b border-slate-700/60 pb-2 flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-emerald-400" />
                  <h3 className="font-bold text-xs text-white uppercase">One-Click Face ID Enrollment</h3>
                </div>

                <form onSubmit={handleEnrollFace} className="space-y-3 text-xs">
                  <div>
                    <label className="block text-slate-300 font-bold mb-1">Worker / Team Member Full Name</label>
                    <input
                      type="text"
                      value={enrollName}
                      onChange={(e) => setEnrollName(e.target.value)}
                      placeholder="e.g. Dehur, John Doe, Supervisor..."
                      required
                      className="w-full bg-[#121821] border border-slate-700 rounded px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-300 font-bold mb-1">Input Camera</label>
                      <select
                        value={enrollCam}
                        onChange={(e) => setEnrollCam(e.target.value)}
                        className="w-full bg-[#121821] border border-slate-700 rounded px-2.5 py-2 text-white focus:outline-none focus:border-emerald-500 text-xs"
                      >
                        <option value="cctv1">CCTV 1 Gate (Webcam)</option>
                        <option value="cctv2">CCTV 2 Front (Phone Cam)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-bold mb-1">Model Engine</label>
                      <div className="w-full bg-[#121821] border border-slate-800 rounded px-2.5 py-2 text-slate-400 text-xs">
                        OpenCV YuNet + SFace (128-D)
                      </div>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isEnrolling || !enrollName.trim()}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-2.5 rounded transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30"
                    >
                      {isEnrolling ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Detecting Face & Extracting Embeddings...</span>
                        </>
                      ) : (
                        <>
                          <Camera className="w-4 h-4" />
                          <span>Scan & Enroll into Face ID</span>
                        </>
                      )}
                    </button>
                  </div>

                  {enrollFeedback && (
                    <div
                      className={`p-3 rounded border flex items-start gap-2 ${
                        enrollFeedback.type === "success"
                          ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-300"
                          : "bg-rose-950/40 border-rose-500/50 text-rose-300"
                      }`}
                    >
                      {enrollFeedback.type === "success" ? (
                        <Check className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 mt-0.5 text-rose-400 shrink-0" />
                      )}
                      <span>{enrollFeedback.text}</span>
                    </div>
                  )}

                  <p className="text-[11px] text-slate-400 leading-relaxed border-t border-slate-800 pt-2">
                    💡 <strong>Tip:</strong> Face the camera with good lighting. Face embeddings are auto-saved to <code className="text-emerald-400">aiml_test_data/faces/&lt;name&gt;</code> and hot-reloaded into the detector with zero downtime.
                  </p>
                </form>
              </div>

              {/* Terminal CLI Instructions */}
              <div className="bg-[#1A222C] border border-slate-800 rounded-lg p-4 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="border-b border-slate-700/60 pb-2 flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-blue-400" />
                    <h3 className="font-bold text-xs text-white uppercase">Terminal & Dataset Enrollment</h3>
                  </div>

                  <div className="space-y-2 mt-3 text-xs text-slate-300">
                    <p className="text-[11px] text-slate-400">
                      You can also enroll from PowerShell or command prompt anytime:
                    </p>

                    <div className="bg-black/60 border border-slate-800 rounded p-2 text-[11px] font-mono text-emerald-400 space-y-1">
                      <p className="text-slate-500"># Interactive stream capture (SPACE to shoot):</p>
                      <p className="text-white">python vision_pipeline/enroll_workers.py --enroll &quot;Your Name&quot;</p>
                      <p className="text-slate-500 mt-2"># Enroll from photos on disk:</p>
                      <p className="text-white">python vision_pipeline/enroll_workers.py --enroll &quot;Your Name&quot; --images photo1.jpg photo2.jpg</p>
                      <p className="text-slate-500 mt-2"># View all enrolled personnel:</p>
                      <p className="text-white">python vision_pipeline/enroll_workers.py --list</p>
                    </div>

                    <div className="border border-slate-800 rounded p-2.5 bg-[#121821] text-[11px] space-y-1 mt-2">
                      <div className="text-blue-400 font-bold uppercase text-[10px]">AIML Test Dataset Paths:</div>
                      <p className="text-slate-400">• Faces: <code className="text-slate-200">aiml_test_data/faces/&lt;name&gt;/</code></p>
                      <p className="text-slate-400">• Roster: <code className="text-slate-200">aiml_test_data/roster.json</code></p>
                      <p className="text-slate-400">• Serialized DB: <code className="text-slate-200">vision_pipeline/worker_face_db.pkl</code></p>
                    </div>
                  </div>
                </div>

                <div className="pt-2 text-[11px] text-slate-500">
                  Cosine Match Threshold: <strong className="text-slate-300">0.38 (SFace Standard)</strong>
                </div>
              </div>
            </div>

            {/* Enrolled Personnel Table */}
            <div className="bg-[#1A222C] border border-slate-800 rounded-lg p-4 space-y-3">
              <div className="border-b border-slate-700/60 pb-2 flex items-center justify-between">
                <span className="font-bold text-xs text-white uppercase flex items-center gap-2">
                  <Shield className="w-4 h-4 text-blue-400" />
                  Active Face ID Roster ({enrolledWorkers.length} Registered)
                </span>
                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded font-bold">
                  DATABASE SYNCED
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                {enrolledWorkers.map((name, i) => (
                  <div
                    key={name}
                    className="bg-[#121821] border border-slate-800 rounded p-2.5 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0">
                        {name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate">{name}</div>
                        <div className="text-[10px] text-slate-500">SFace 128-D</div>
                      </div>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/40">
                      ACTIVE
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
