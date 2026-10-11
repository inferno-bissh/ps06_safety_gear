"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Smartphone,
  Radio,
  RefreshCw,
  Check,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  PowerOff,
  Sliders,
  Info,
} from "lucide-react";

export type PhoneChannel = "cctv2" | "cctv3" | "cctv4";

interface PhoneCameraSettingsProps {
  className?: string;
  channel?: PhoneChannel;
  cameraName?: string;
  onStreamUpdated?: (newUrl: string, channel: PhoneChannel) => void;
  compact?: boolean;
}

const CHANNEL_INFO: Record<PhoneChannel, { name: string; slot: string; defaultPort: number; role: string }> = {
  cctv2: {
    name: "Phone 1",
    slot: "CCTV 2",
    defaultPort: 8080,
    role: "Front Bay / Production Overhead",
  },
  cctv3: {
    name: "Phone 2",
    slot: "CCTV 3",
    defaultPort: 8080,
    role: "Left Side Cross-Angle View",
  },
  cctv4: {
    name: "Phone 3",
    slot: "CCTV 4",
    defaultPort: 8080,
    role: "Right Side Cross-Angle View",
  },
};

export function PhoneCameraSettings({
  className = "",
  channel: initialChannel,
  cameraName,
  onStreamUpdated,
  compact = false,
}: PhoneCameraSettingsProps) {
  // If no fixed channel is passed, allow tab selection across Phone 1, Phone 2, Phone 3
  const [selectedChannel, setSelectedChannel] = useState<PhoneChannel>(initialChannel || "cctv2");
  const activeChannel = initialChannel || selectedChannel;

  const [ipInput, setIpInput] = useState("");
  const [portInput, setPortInput] = useState("8080");
  const [endpointInput, setEndpointInput] = useState("/video");
  const [configuredUrl, setConfiguredUrl] = useState("");
  const [configuredIp, setConfiguredIp] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<
    "ONLINE" | "STANDBY" | "CONNECTING" | "DISCONNECTED" | "FAILED"
  >("STANDBY");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "info";
    title: string;
    message: string;
  } | null>(null);

  // Load saved configuration for the active channel
  useEffect(() => {
    let isMounted = true;
    const fetchConfig = async () => {
      // 1. LocalStorage cached IP for this specific channel
      try {
        const localSaved = localStorage.getItem(`safety_phone_cam_ip_${activeChannel}`);
        if (localSaved && isMounted) {
          setIpInput(localSaved);
        } else {
          setIpInput("");
        }
      } catch {}

      // 2. Fetch server persistent config
      try {
        const res = await fetch("/api/cameras/config");
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted && data.config) {
          const cfg = data.config;
          const url = cfg[activeChannel] || "";
          const ip = cfg[`${activeChannel}_ip`] || (url ? url.replace(/^https?:\/\//, "").split(":")[0] : "");
          const port = String(cfg[`${activeChannel}_port`] || CHANNEL_INFO[activeChannel].defaultPort);
          const ep = cfg[`${activeChannel}_endpoint`] || "/video";
          const status = cfg[`${activeChannel}_status`];

          setConfiguredUrl(url);
          setConfiguredIp(ip);
          setPortInput(port);
          setEndpointInput(ep);
          if (ip) setIpInput(ip);

          const liveConnected = data.liveStatus?.[activeChannel]?.is_connected;
          if (liveConnected) {
            setConnectionStatus("ONLINE");
            if (data.liveStatus[activeChannel]?.latency_sec !== undefined) {
              setLatencyMs(Math.round(data.liveStatus[activeChannel].latency_sec * 1000));
            }
          } else if (status === "DISCONNECTED") {
            setConnectionStatus("DISCONNECTED");
          } else if (!url) {
            setConnectionStatus("DISCONNECTED");
          } else {
            setConnectionStatus("STANDBY");
          }
        }
      } catch {
        // Broadcaster offline
      }
    };

    fetchConfig();
    return () => {
      isMounted = false;
    };
  }, [activeChannel]);

  // Compute normalized stream target URL
  const normalizedUrl = useMemo(() => {
    const raw = ipInput.trim();
    if (!raw) return configuredUrl;

    if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("rtsp://")) {
      if ((raw.endsWith(":8080") || raw.endsWith(":8080/")) && !raw.includes("/video")) {
        return raw.replace(/\/+$/, "") + "/video";
      }
      return raw;
    }

    if (raw.includes(":")) {
      const parts = raw.split(":");
      const host = parts[0];
      const rest = parts[1];
      if (rest.includes("/")) {
        return `http://${raw}`;
      }
      return `http://${host}:${rest}${endpointInput.startsWith("/") ? endpointInput : "/" + endpointInput}`;
    }

    const port = portInput.trim() || "8080";
    const ep = endpointInput.trim() ? (endpointInput.startsWith("/") ? endpointInput : `/${endpointInput}`) : "/video";
    return `http://${raw}:${port}${ep}`;
  }, [ipInput, portInput, endpointInput, configuredUrl]);

  // Connect / Update phone camera IP for this channel
  const handleConnect = async (customUrl?: string) => {
    const targetUrl = customUrl || normalizedUrl;
    if (!targetUrl || targetUrl === "http://:8080/video" || targetUrl === "0") {
      setFeedback({
        type: "error",
        title: "Invalid Phone Address",
        message: `Please enter the IP address displayed on ${CHANNEL_INFO[activeChannel].name}'s camera screen.`,
      });
      return;
    }

    setIsConnecting(true);
    setConnectionStatus("CONNECTING");
    setFeedback(null);

    try {
      const res = await fetch("/api/cameras/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: activeChannel,
          url: targetUrl,
          ip: ipInput.trim() || undefined,
          port: portInput.trim() || undefined,
          endpoint: endpointInput.trim() || undefined,
          action: "connect",
        }),
      });

      const data = await res.json();
      if (data.success) {
        setConfiguredUrl(data.streamUrl);
        setConfiguredIp(data.ip || ipInput.trim());
        setLatencyMs(data.latencyMs || null);

        // Remember in browser localStorage per channel
        try {
          localStorage.setItem(`safety_phone_cam_ip_${activeChannel}`, data.ip || ipInput.trim());
          localStorage.setItem(`safety_phone_cam_url_${activeChannel}`, data.streamUrl);
        } catch {}

        if (data.reachable) {
          setConnectionStatus("ONLINE");
          setFeedback({
            type: "success",
            title: `${CHANNEL_INFO[activeChannel].name} (${CHANNEL_INFO[activeChannel].slot}) Connected`,
            message: `Stream active via ${data.streamUrl} (${data.latencyMs}ms latency). CCTV 1 webcam and other cameras remain completely uninterrupted.`,
          });
        } else {
          setConnectionStatus("STANDBY");
          setFeedback({
            type: "info",
            title: "Saved — Standby Mode Active",
            message: `Target saved as ${data.streamUrl}. Phone server is not responding yet. Ensure ${CHANNEL_INFO[activeChannel].name} is on the same Wi-Fi and IP Webcam 'Start server' is running. Auto-reconnect is actively listening.`,
          });
        }

        if (onStreamUpdated) {
          onStreamUpdated(data.streamUrl, activeChannel);
        }
      } else {
        setConnectionStatus("FAILED");
        setFeedback({
          type: "error",
          title: "Connection Failed",
          message: data.error || `Could not reach ${CHANNEL_INFO[activeChannel].name}. Please verify the IP address.`,
        });
      }
    } catch (e: unknown) {
      setConnectionStatus("FAILED");
      setFeedback({
        type: "error",
        title: "Network Error",
        message: e instanceof Error ? e.message : "Could not reach dashboard API.",
      });
    } finally {
      setIsConnecting(false);
    }
  };

  // Reconnect button
  const handleReconnect = () => {
    if (!configuredUrl) {
      handleConnect();
      return;
    }
    handleConnect(configuredUrl);
  };

  // Disconnect button
  const handleDisconnect = async () => {
    setIsConnecting(true);
    try {
      await fetch("/api/cameras/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: activeChannel, action: "disconnect" }),
      });
      setConnectionStatus("DISCONNECTED");
      setFeedback({
        type: "info",
        title: `${CHANNEL_INFO[activeChannel].slot} Disconnected`,
        message: `${CHANNEL_INFO[activeChannel].slot} put in standby mode. CCTV 1 (webcam) and other phone streams continue running normally.`,
      });
      if (onStreamUpdated) {
        onStreamUpdated("", activeChannel);
      }
    } catch {
      setConnectionStatus("DISCONNECTED");
    } finally {
      setIsConnecting(false);
    }
  };

  const channelMeta = CHANNEL_INFO[activeChannel];

  return (
    <div
      className={`bg-[#0D1219] border border-[#222E3C] rounded-xl p-3.5 sm:p-4 text-xs font-mono text-slate-200 transition-all ${className}`}
    >
      {/* Multi-Channel Tab Bar (only shown if channel was not hardcoded by prop) */}
      {!initialChannel && (
        <div className="flex items-center gap-1 mb-3.5 pb-2.5 border-b border-[#1E2938] overflow-x-auto">
          {(["cctv2", "cctv3", "cctv4"] as PhoneChannel[]).map((ch) => {
            const info = CHANNEL_INFO[ch];
            const isSelected = activeChannel === ch;
            return (
              <button
                key={ch}
                type="button"
                onClick={() => {
                  setSelectedChannel(ch);
                  setFeedback(null);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 border ${
                  isSelected
                    ? "bg-cyan-500/20 text-cyan-200 border-cyan-400 shadow-sm"
                    : "bg-[#141B24] text-slate-400 hover:text-slate-200 border-[#26303C] hover:bg-slate-800"
                }`}
              >
                <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
                <span>
                  {info.name} ({info.slot})
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#1E2938]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
            <Smartphone className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-slate-100 uppercase tracking-wide text-xs sm:text-sm">
                {cameraName || `${channelMeta.name} Settings (${channelMeta.slot})`}
              </h3>
              <span className="text-[10px] text-slate-400 hidden sm:inline">• {channelMeta.role}</span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  connectionStatus === "ONLINE"
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                    : connectionStatus === "CONNECTING"
                    ? "bg-amber-500/15 text-amber-400 border-amber-500/30 animate-pulse"
                    : connectionStatus === "DISCONNECTED"
                    ? "bg-slate-800 text-slate-400 border-slate-700"
                    : connectionStatus === "FAILED"
                    ? "bg-red-500/15 text-red-400 border-red-500/30"
                    : "bg-amber-500/10 text-amber-300 border-amber-500/20"
                }`}
              >
                {connectionStatus === "ONLINE"
                  ? `CONNECTED${latencyMs ? ` (${latencyMs}ms)` : ""}`
                  : connectionStatus === "CONNECTING"
                  ? "CONNECTING..."
                  : connectionStatus === "DISCONNECTED"
                  ? "DISCONNECTED"
                  : connectionStatus === "FAILED"
                  ? "CONNECTION FAILED"
                  : "AUTO-RECONNECT STANDBY"}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Current Stream:{" "}
              <code className="text-cyan-300 bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-800">
                {configuredUrl || "Not Configured (Standby Mode)"}
              </code>
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          <button
            onClick={handleReconnect}
            disabled={isConnecting}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#161F2B] hover:bg-slate-800 border border-[#26303C] text-slate-200 hover:text-white text-xs font-semibold transition-all disabled:opacity-50"
            title="Attempt immediate reconnection to current address"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isConnecting ? "animate-spin" : ""}`} />
            <span>Reconnect</span>
          </button>
          {connectionStatus !== "DISCONNECTED" && (
            <button
              onClick={handleDisconnect}
              disabled={isConnecting}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-950/20 hover:bg-red-900/30 border border-red-500/30 text-red-300 text-xs font-semibold transition-all disabled:opacity-50"
              title="Disconnect phone stream to standby"
            >
              <PowerOff className="w-3.5 h-3.5" />
              <span>Disconnect</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Input Controls */}
      <div className="mt-3 space-y-3">
        <div>
          <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
            {channelMeta.name} IP Address / Stream URL:
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={ipInput}
                onChange={(e) => setIpInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                placeholder={`e.g. 192.168.1.X or http://192.168.1.X:${channelMeta.defaultPort}/video`}
                className="w-full bg-[#141B24] border border-[#283545] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3 py-2 text-slate-100 placeholder-slate-500 text-xs sm:text-sm font-mono outline-none transition-all"
              />
              {ipInput && (
                <div className="text-[10px] text-blue-400 mt-1 truncate">
                  Target feed: <span className="font-semibold">{normalizedUrl}</span>
                </div>
              )}
            </div>

            <button
              onClick={() => handleConnect()}
              disabled={isConnecting || !ipInput.trim()}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs sm:text-sm shadow-md shadow-blue-900/30 border border-blue-400/40 transition-all flex items-center justify-center gap-1.5 disabled:bg-slate-800 disabled:text-slate-500 disabled:border-transparent cursor-pointer shrink-0 min-h-[38px]"
            >
              {isConnecting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <Radio className="w-4 h-4" />
                  <span>Connect {channelMeta.slot}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Quick IP Presets */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[11px] text-slate-400 font-semibold">Presets:</span>
          <button
            type="button"
            onClick={() => {
              setPortInput("8080");
              setEndpointInput("/video");
            }}
            className="text-[11px] bg-[#161F2B] hover:bg-slate-800 text-slate-300 border border-[#26303C] px-2.5 py-1 rounded-md transition-colors"
          >
            IP Webcam (:8080/video)
          </button>
          <button
            type="button"
            onClick={() => {
              setPortInput("4747");
              setEndpointInput("/video");
            }}
            className="text-[11px] bg-[#161F2B] hover:bg-slate-800 text-slate-300 border border-[#26303C] px-2.5 py-1 rounded-md transition-colors"
          >
            DroidCam (:4747/video)
          </button>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 ml-auto font-medium"
          >
            <Sliders className="w-3 h-3" />
            <span>{showAdvanced ? "Hide Port / Path" : "Advanced (Port & Path)"}</span>
            {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {/* Advanced Port / Path Panel */}
        {showAdvanced && (
          <div className="p-3 bg-[#121820] border border-slate-800 rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-2.5 animate-in fade-in duration-150">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Port Number:</label>
              <input
                type="number"
                value={portInput}
                onChange={(e) => setPortInput(e.target.value)}
                placeholder="8080"
                className="w-full bg-[#0B0F14] border border-[#222E3C] rounded px-2.5 py-1 text-slate-200 text-xs font-mono outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                Stream Endpoint Path:
              </label>
              <input
                type="text"
                value={endpointInput}
                onChange={(e) => setEndpointInput(e.target.value)}
                placeholder="/video"
                className="w-full bg-[#0B0F14] border border-[#222E3C] rounded px-2.5 py-1 text-slate-200 text-xs font-mono outline-none"
              />
            </div>
          </div>
        )}

        {/* Feedback Alert Banner */}
        {feedback && (
          <div
            className={`p-3 rounded-lg border flex items-start gap-2.5 text-xs animate-in fade-in duration-150 ${
              feedback.type === "success"
                ? "bg-emerald-950/20 border-emerald-500/40 text-emerald-300"
                : feedback.type === "error"
                ? "bg-red-950/20 border-red-500/40 text-red-300"
                : "bg-blue-950/20 border-blue-500/40 text-blue-300"
            }`}
          >
            {feedback.type === "success" ? (
              <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : feedback.type === "error" ? (
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            ) : (
              <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            )}
            <div className="space-y-0.5">
              <div className="font-bold text-[11px] uppercase tracking-wide">{feedback.title}</div>
              <div className="opacity-95 leading-relaxed">{feedback.message}</div>
            </div>
          </div>
        )}

        {/* Connection Instructions */}
        <div className="p-2.5 bg-slate-900/60 border border-slate-800/80 rounded-lg text-[11px] text-slate-400 space-y-1">
          <div className="font-bold text-slate-300 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-blue-400" />
            <span>Connection Guide for {channelMeta.name} ({channelMeta.slot}):</span>
          </div>
          <ol className="list-decimal list-inside space-y-0.5 text-slate-400 text-[10px] leading-relaxed">
            <li>Connect this phone to the same Wi-Fi/Hotspot network as this dashboard laptop.</li>
            <li>In the phone camera app (e.g. <strong>IP Webcam</strong>), tap <em>&quot;Start server&quot;</em>.</li>
            <li>Note the IP shown on the phone screen (e.g. <code>192.168.1.X:8080</code>).</li>
            <li>Enter the IP address above and click <strong>Connect {channelMeta.slot}</strong>.</li>
            <li>CCTV 1 (laptop webcam) and other cameras remain completely operational throughout.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
