"use client";

import React from "react";
import { useSafety } from "@/context/SafetyContext";
import { CameraViewer } from "@/components/CameraViewer";
import { Video, ShieldAlert, Cpu, Sparkles } from "lucide-react";

export default function CamerasPage() {
  const { cameras, zones, workerTracks } = useSafety();

  return (
    <div className="space-y-5 font-mono">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#26303C] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <Video className="w-5 h-5 text-blue-400" />
            <h1 className="text-xl font-bold tracking-wider text-slate-100 uppercase">
              Live Video Feeds & AI Inference Streams
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Cloud video push ingestion • YOLOv8 real-time object detection • ByteTrack worker association
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs bg-slate-900 border border-slate-800 px-3 py-1.5 rounded">
          <Cpu className="w-4 h-4 text-emerald-400" />
          <span className="text-slate-300">Model:</span>
          <span className="font-bold text-emerald-400">YOLOv8-Safety7 ONNX</span>
        </div>
      </div>

      {/* Model Spec Callout Banner */}
      <div className="bg-[#121821] border border-blue-500/30 p-3 rounded-lg flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-400" />
          <span className="text-slate-300">
            AI Classes Active: <strong className="text-blue-300 font-bold">Worker, Helmet, Safety-Vest, Safety-Shoes, Gloves, Fire, Smoke</strong>
          </span>
        </div>
        <span className="text-slate-500 hidden sm:inline">Temporal Confirmation: 5 Consecutive Frames</span>
      </div>

      {/* Grid of Camera Viewers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {cameras.map((camera) => {
          const zone = zones.find((z) => z.zone_id === camera.zone_id);
          return (
            <CameraViewer
              key={camera.camera_id}
              camera={camera}
              workers={workerTracks}
              zoneName={zone?.name || camera.zone_id}
              hasFireHazard={zone?.fire_detected}
              hasSmokeHazard={zone?.smoke_detected}
            />
          );
        })}
      </div>
    </div>
  );
}
