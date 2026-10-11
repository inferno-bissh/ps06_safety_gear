"use client";

import React, { useEffect } from "react";
import { useSafety } from "@/context/SafetyContext";
import { formatTimestamp } from "@/lib/utils";
import {
  Flame,
  AlertTriangle,
  Volume2,
  CheckCircle,
  Eye,
  Radio,
  Clock,
  MapPin,
} from "lucide-react";

export const P3Takeover: React.FC = () => {
  const { isP3TakeoverActive, p3EmergencyIncident, dismissP3Takeover, acknowledgeIncident } = useSafety();

  // Web Audio Synth Beeper for high urgency alarm (non-looping, gentle periodic double beep)
  useEffect(() => {
    if (!isP3TakeoverActive) return;

    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContext) {
        const ctx = new AudioContext();
        const playBeep = () => {
          if (ctx.state === "suspended") ctx.resume();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sawtooth";
          osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
          osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.35);
        };

        playBeep();
        const interval = setInterval(playBeep, 2500);
        return () => {
          clearInterval(interval);
          ctx.close();
        };
      }
    } catch {
      // AudioContext not permitted or supported
    }
  }, [isP3TakeoverActive]);

  if (!isP3TakeoverActive || !p3EmergencyIncident) return null;

  const handleAcknowledge = () => {
    acknowledgeIncident(p3EmergencyIncident.incident_id);
    dismissP3Takeover();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="max-w-4xl w-full bg-[#1A0B0E] border-2 border-red-600 rounded-lg shadow-2xl overflow-hidden font-mono">
        {/* Top Emergency Annunciator Header */}
        <div className="bg-red-600 text-white px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-red-700 border border-white/40 flex items-center justify-center animate-pulse">
              <Flame className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-black tracking-widest uppercase">
                  MASTER ALARM // P3 CONFIRMED HAZARD
                </span>
                <span className="bg-white text-red-700 text-xs px-2 py-0.5 rounded font-bold">
                  HIGH PRIORITY
                </span>
              </div>
              <p className="text-xs text-red-100 font-mono-tabular">
                INCIDENT ID: {p3EmergencyIncident.incident_id} • TRIGGERED AT: {formatTimestamp(p3EmergencyIncident.timestamp)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-red-800/80 px-3 py-1.5 rounded border border-red-400 text-xs font-bold">
            <Volume2 className="w-4 h-4 animate-bounce" />
            <span>LOCAL SIREN: COMMANDED ACTIVE</span>
          </div>
        </div>

        {/* Alarm Body */}
        <div className="p-6 space-y-5 text-slate-200">
          {/* Action Required Banner */}
          <div className="bg-red-950/70 border border-red-500/80 p-4 rounded-md flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs text-red-300 font-bold uppercase tracking-wider mb-1">
                MANDATORY PROTOCOL / ACTION REQUIRED:
              </div>
              <div className="text-base font-bold text-white tracking-wide">
                {p3EmergencyIncident.required_action}
              </div>
            </div>
          </div>

          {/* Location and Evidence Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Visual Evidence Snapshot */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400 font-bold">
                <span className="flex items-center gap-1.5 text-red-400">
                  <Eye className="w-4 h-4" /> VISUAL AI EVIDENCE (YOLOv8)
                </span>
                <span className="text-slate-300 font-mono">
                  CONFIDENCE: {(p3EmergencyIncident.confidence * 100).toFixed(1)}%
                </span>
              </div>
              <div className="relative rounded overflow-hidden border border-red-900/60 bg-black aspect-video flex items-center justify-center">
                {p3EmergencyIncident.evidence_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p3EmergencyIncident.evidence_image}
                    alt="P3 Fire Evidence"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-xs text-slate-500">Evidence Image Recorded</div>
                )}
                <div className="absolute top-2 left-2 bg-red-600/90 text-white text-[11px] font-bold px-2 py-0.5 rounded">
                  FIRE + SMOKE PERSISTENCE CONFIRMED
                </div>
              </div>
            </div>

            {/* Sensor Telemetry & Correlation Table */}
            <div className="space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-xs text-red-400 font-bold mb-2">
                  <Radio className="w-4 h-4" /> PHYSICAL SENSOR CORRELATION
                </div>
                <div className="bg-[#121821] border border-[#26303C] rounded p-3 space-y-2 text-xs">
                  <div className="flex justify-between items-center pb-1.5 border-b border-slate-800">
                    <span className="text-slate-400">Affected Zone:</span>
                    <span className="font-bold text-white flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-red-400" />
                      {p3EmergencyIncident.zone_name}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-1.5 border-b border-slate-800">
                    <span className="text-slate-400">Camera Source:</span>
                    <span className="font-mono text-slate-200">{p3EmergencyIncident.camera_id}</span>
                  </div>
                  <div className="flex justify-between items-center pb-1.5 border-b border-slate-800">
                    <span className="text-slate-400">Physical IR Flame Sensor:</span>
                    <span className="font-bold text-red-400 flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5" /> ACTIVE (Reg 40001: 1)
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-1.5 border-b border-slate-800">
                    <span className="text-slate-400">MQ-2 Gas / Smoke Reading:</span>
                    <span className="font-bold text-amber-400 font-mono">
                      Raw: {p3EmergencyIncident.sensor_evidence?.gas_sensor_raw || 880} (Index: {p3EmergencyIncident.sensor_evidence?.smoke_index || 0.88})
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Multimodal Decision Reason:</span>
                    <span className="text-[11px] text-red-300 font-medium text-right max-w-[200px]">
                      {p3EmergencyIncident.decision_reason}
                    </span>
                  </div>
                </div>
              </div>

              {/* Note on Remote Relay Action */}
              <div className="text-[11px] text-slate-400 bg-slate-900/60 p-2.5 rounded border border-slate-800 leading-relaxed">
                Emergency siren was commanded by the cloud backend via the ESP32 gateway relay.
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="pt-3 border-t border-red-950 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-slate-400 font-mono flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-slate-500" />
              <span>Acknowledging this alarm returns you to the live monitoring dashboard.</span>
            </div>

            <button
              onClick={handleAcknowledge}
              className="w-full sm:w-auto px-8 h-12 bg-red-600 hover:bg-red-500 text-white font-extrabold text-sm tracking-wider uppercase rounded-xl shadow-xl shadow-red-700/50 transition-all flex items-center justify-center gap-2.5 active:scale-95 cursor-pointer"
            >
              <CheckCircle className="w-5 h-5 stroke-[2.5]" />
              <span>ACKNOWLEDGE EMERGENCY ALARM</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
