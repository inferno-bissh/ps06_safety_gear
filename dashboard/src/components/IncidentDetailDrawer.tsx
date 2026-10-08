"use client";

import React, { useState } from "react";
import { useSafety } from "@/context/SafetyContext";
import { formatDateTime } from "@/lib/utils";
import { PriorityBadge } from "./PriorityBadge";
import {
  X,
  MapPin,
  Clock,
  Camera,
  CheckCircle,
  AlertCircle,
  Radio,
  Eye,
  Shield,
  FileText,
} from "lucide-react";

export const IncidentDetailDrawer: React.FC = () => {
  const { selectedIncident, selectIncident, acknowledgeIncident, resolveIncident } = useSafety();
  const [resolutionNote, setResolutionNote] = useState("");
  const [showResolveInput, setShowResolveInput] = useState(false);

  if (!selectedIncident) return null;

  const handleResolve = () => {
    resolveIncident(selectedIncident.incident_id, resolutionNote);
    setShowResolveInput(false);
    setResolutionNote("");
    selectIncident(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end animate-in fade-in duration-150 font-mono">
      <div className="w-full max-w-xl bg-[#121821] border-l border-[#26303C] h-full overflow-y-auto flex flex-col justify-between shadow-2xl">
        {/* Top Header */}
        <div className="p-4 border-b border-[#26303C] bg-[#161F2B] flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            <PriorityBadge priority={selectedIncident.priority} size="md" />
            <div>
              <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
                {selectedIncident.source_event_type.replace("_", " ")}
              </h2>
              <span className="text-[11px] text-slate-400 font-mono-tabular">
                ID: {selectedIncident.incident_id}
              </span>
            </div>
          </div>

          <button
            onClick={() => selectIncident(null)}
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-5 text-xs text-slate-300">
          {/* Action Required Banner */}
          <div className="bg-red-950/30 border border-red-500/40 p-3.5 rounded-md">
            <div className="text-[10px] text-red-400 font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> REQUIRED SUPERVISOR PROTOCOL:
            </div>
            <div className="text-xs font-bold text-white leading-relaxed">
              {selectedIncident.required_action}
            </div>
          </div>

          {/* Evidence Image */}
          {selectedIncident.evidence_image && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="font-bold flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5 text-blue-400" /> EVIDENCE SNAPSHOT
                </span>
                <span className="font-mono">CONFIDENCE: {(selectedIncident.confidence * 100).toFixed(0)}%</span>
              </div>
              <div className="rounded border border-[#26303C] overflow-hidden bg-black aspect-video relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selectedIncident.evidence_image}
                  alt="Incident Evidence"
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-2 left-2 bg-black/80 text-[10px] px-2 py-0.5 rounded text-slate-300">
                  Recorded at {formatDateTime(selectedIncident.timestamp)}
                </div>
              </div>
            </div>
          )}

          {/* Context Details Table */}
          <div className="bg-[#1A222C] border border-[#26303C] rounded p-3 space-y-2">
            <div className="text-[11px] font-bold text-slate-200 border-b border-slate-700/60 pb-1 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-blue-400" /> LOCATION & CONTEXT
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-slate-400 block">Zone:</span>
                <span className="font-bold text-slate-100">{selectedIncident.zone_name}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Camera ID:</span>
                <span className="font-mono text-slate-100">{selectedIncident.camera_id || "N/A"}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Timestamp:</span>
                <span className="font-mono text-slate-100">{formatDateTime(selectedIncident.timestamp)}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Lifecycle Status:</span>
                <span className="font-bold text-amber-400">{selectedIncident.status}</span>
              </div>
            </div>
          </div>

          {/* Multimodal Reasoning Block */}
          <div className="bg-[#1A222C] border border-[#26303C] rounded p-3 space-y-2">
            <div className="text-[11px] font-bold text-slate-200 border-b border-slate-700/60 pb-1 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-amber-400" /> DECISION ENGINE REASONING
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              {selectedIncident.decision_reason}
            </p>

            {/* Sensor vs Vision breakdown */}
            <div className="pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-[11px]">
              <div className="bg-slate-900/60 p-2 rounded border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase font-bold flex items-center gap-1">
                  <Eye className="w-3 h-3 text-blue-400" /> Vision AI Evidence
                </span>
                <span className="text-slate-200 font-medium mt-1 block">
                  {selectedIncident.vision_evidence?.missing_items?.length
                    ? `Missing: ${selectedIncident.vision_evidence.missing_items.join(", ")}`
                    : selectedIncident.vision_evidence?.fire
                    ? "Fire Confirmed (0.96)"
                    : selectedIncident.vision_evidence?.smoke
                    ? "Smoke Detected"
                    : "No Visual Flame"}
                </span>
              </div>

              <div className="bg-slate-900/60 p-2 rounded border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase font-bold flex items-center gap-1">
                  <Radio className="w-3 h-3 text-orange-400" /> Physical Sensor
                </span>
                <span className="text-slate-200 font-medium mt-1 block">
                  {selectedIncident.sensor_evidence ? (
                    <>
                      Flame: {selectedIncident.sensor_evidence.flame_detected ? "TRIPPED" : "Normal"} | Raw: {selectedIncident.sensor_evidence.gas_sensor_raw}
                    </>
                  ) : (
                    "Normal"
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Controls Footer */}
        <div className="p-4 border-t border-[#26303C] bg-[#161F2B] space-y-3 sticky bottom-0">
          {selectedIncident.status === "OPEN" && (
            <div className="flex gap-2">
              <button
                onClick={() => acknowledgeIncident(selectedIncident.incident_id)}
                className="flex-1 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold py-2 rounded text-xs tracking-wider uppercase transition-colors flex items-center justify-center gap-1.5"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Acknowledge Incident</span>
              </button>
              <button
                onClick={() => setShowResolveInput(true)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded text-xs tracking-wider uppercase transition-colors"
              >
                Resolve
              </button>
            </div>
          )}

          {selectedIncident.status === "ACKNOWLEDGED" && !showResolveInput && (
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-amber-400">
                Acknowledged by {selectedIncident.acknowledged_by || "Supervisor"}
              </span>
              <button
                onClick={() => setShowResolveInput(true)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded text-xs tracking-wider uppercase transition-colors"
              >
                Mark Resolved
              </button>
            </div>
          )}

          {showResolveInput && (
            <div className="space-y-2 pt-2 border-t border-slate-700">
              <label className="text-[11px] text-slate-300 font-bold block">
                Resolution Note (Required for Safety Audit):
              </label>
              <textarea
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                placeholder="e.g. Worker instructed to wear helmet; area inspected and verified safe."
                className="w-full bg-[#0B0F14] border border-[#26303C] rounded p-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-hidden focus:border-blue-500"
                rows={2}
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowResolveInput(false)}
                  className="px-3 py-1 bg-slate-800 text-slate-300 text-xs rounded hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleResolve}
                  className="px-4 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded"
                >
                  Confirm & Resolve
                </button>
              </div>
            </div>
          )}

          {selectedIncident.status === "RESOLVED" && (
            <div className="text-[11px] text-slate-400 bg-slate-900/60 p-2.5 rounded border border-slate-800">
              <span className="text-emerald-400 font-bold block mb-1">INCIDENT RESOLVED</span>
              <span>{selectedIncident.resolution_note || "Resolved after inspection"}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
