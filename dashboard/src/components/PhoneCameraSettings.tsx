"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Smartphone,
  Wifi,
  Radio,
  RefreshCw,
  Check,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  PowerOff,
  Sliders,
  Info,
} from "lucide-react";

interface PhoneCameraSettingsProps {
  className?: string;
  onStreamUpdated?: (newUrl: string) => void;
  compact?: boolean;
}

export function PhoneCameraSettings({
  className = "",
  onStreamUpdated,
  compact = false,
}: PhoneCameraSettingsProps) {
  const [ipInput, setIpInput] = useState("");
  const [portInput, setPortInput] = useState("8080");
  const [endpointInput, setEndpointInput] = useState("/video");
  const [configuredUrl, setConfiguredUrl] = useState("http://192.168.1.5:8080/video");
  const [configuredIp, setConfiguredIp] = useState("192.168.1.5");
  const [connectionStatus, setConnectionStatus] = useState<"ONLINE" | "STANDBY" | "CONNECTING" | "DISCONNECTED">("STANDBY");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isProbing, setIsProbing] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "info";
    title: string;
    message: string;
  } | null>(null);

  // Load saved configuration on mount
  useEffect(() => {
    let isMounted = true;
    const fetchConfig = async () => {
      // 1. Try local storage first for instant UI response
      try {
        const localSaved = localStorage.getItem("safety_phone_cam_ip");
        if (localSaved && isMounted) {
          setIpInput(localSaved);
        }
      } catch {}

      // 2. Fetch server persistent config
      try {
        const res = await fetch("/api/cameras/config");
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted && data.config) {
          const cfg = data.config;
          const url = cfg.cctv2 || "http://192.168.1.5:8080/video";
          const ip = cfg.cctv2_ip || url.replace(/^https?:\/\//, "").split(":")[0];
          const port = String(cfg.cctv2_port || 8080);
          const ep = cfg.cctv2_endpoint || "/video";

          setConfiguredUrl(url);
          setConfiguredIp(ip);
          setPortInput(port);
          setEndpointInput(ep);
          if (!ipInput) setIpInput(ip);

          if (data.liveStatus?.cctv2?.is_connected) {
            setConnectionStatus("ONLINE");
          } else if (cfg.cctv2_status === "DISCONNECTED") {
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
  }, []);

  // Compute normalized stream target URL
  const normalizedUrl = useMemo(() => {
    let raw = ipInput.trim();
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

  // Connect / Update phone camera IP
  const handleConnect = async (customUrl?: string) => {
    const targetUrl = customUrl || normalizedUrl;
    if (!targetUrl || targetUrl === "http://:8080/video") {
      setFeedback({
        type: "error",
        title: "Invalid Phone Address",
        message: "Please enter the phone's IP address displayed on your IP Webcam screen.",
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
          channel: "cctv2",
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

        // Remember in browser localStorage across reloads
        try {
          localStorage.setItem("safety_phone_cam_ip", data.ip || ipInput.trim());
          localStorage.setItem("safety_phone_cam_url", data.streamUrl);
        } catch {}

        if (data.reachable) {
          setConnectionStatus("ONLINE");
          setFeedback({
            type: "success",
            title: "Phone Camera Connected",
            message: `Stream active via ${data.streamUrl} (${data.latencyMs}ms latency). CCTV 1 webcam remains uninterrupted.`,
          });
        } else {
          setConnectionStatus("STANDBY");
          setFeedback({
            type: "info",
            title: "Saved — Standby Mode Active",
            message: `Target saved as ${data.streamUrl}. Note: Phone camera server is not responding yet. Ensure phone & laptop are on the same Wi-Fi and IP Webcam 'Start server' is running. Auto-reconnect is actively listening.`,
          });
        }

        if (onStreamUpdated) {
          onStreamUpdated(data.streamUrl);
        }
      } else {
        setConnectionStatus("STANDBY");
        setFeedback({
          type: "error",
          title: "Connection Failed",
          message: data.error || "Could not reach camera. Please verify the IP address.",
        });
      }
    } catch (e: unknown) {
      setConnectionStatus("STANDBY");
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
    handleConnect(configuredUrl);
  };

  // Disconnect button
  const handleDisconnect = async () => {
    setIsConnecting(true);
    try {
      await fetch("/api/cameras/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "cctv2", action: "disconnect" }),
      });
      setConnectionStatus("DISCONNECTED");
      setFeedback({
        type: "info",
        title: "Camera Disconnected",
        message: "CCTV 2 stream put in standby mode. CCTV 1 webcam continues operating normally.",
      });
    } catch {
      setConnectionStatus("DISCONNECTED");
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div
      className={`bg-[#0D1219] border border-[#222E3C] rounded-xl p-3.5 sm:p-4 text-xs font-mono text-slate-200 transition-all ${className}`}
    >
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#1E2938]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
            <Smartphone className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-100 uppercase tracking-wide text-xs sm:text-sm">
                Phone Camera Settings (CCTV 2)
              </h3>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  connectionStatus === "ONLINE"
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                    : connectionStatus === "CONNECTING"
                    ? "bg-amber-500/15 text-amber-400 border-amber-500/30 animate-pulse"
                    : connectionStatus === "DISCONNECTED"
                    ? "bg-slate-800 text-slate-400 border-slate-700"
                    : "bg-amber-500/10 text-amber-300 border-amber-500/20"
                }`}
              >
                {connectionStatus === "ONLINE"
                  ? `LIVE STREAMING${latencyMs ? ` (${latencyMs}ms)` : ""}`
                  : connectionStatus === "CONNECTING"
                  ? "CONNECTING..."
                  : connectionStatus === "DISCONNECTED"
                  ? "DISCONNECTED"
                  : "AUTO-RECONNECT STANDBY"}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Current Address:{" "}
              <code className="text-cyan-300 bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-800">
                {configuredUrl}
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
            Phone IP Address:
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={ipInput}
                onChange={(e) => setIpInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                placeholder="e.g. 192.168.1.42 or 192.168.1.42:8080"
                className="w-full bg-[#141B24] border border-[#283545] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3 py-2 text-slate-100 placeholder-slate-500 text-xs sm:text-sm font-mono outline-none transition-all"
              />
              {ipInput && (
                <div className="text-[10px] text-blue-400 mt-1 truncate">
                  Will connect to: <span className="font-semibold">{normalizedUrl}</span>
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
                  <span>Connect &amp; Switch Feed</span>
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
              if (!ipInput.includes(":")) {
                setIpInput(configuredIp || "192.168.1.5");
              }
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
              if (!ipInput.includes(":")) {
                setIpInput(configuredIp || "192.168.1.5");
              }
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
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                Port Number:
              </label>
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
            <span>How to Reconnect after Phone IP changes:</span>
          </div>
          <ol className="list-decimal list-inside space-y-0.5 text-slate-400 text-[10px] leading-relaxed">
            <li>Ensure the phone is connected to the same Wi-Fi/Hotspot as this laptop.</li>
            <li>In Android <strong>IP Webcam</strong>, tap <em>&quot;Start server&quot;</em> and note the IP on the phone screen (e.g. <code>192.168.1.X:8080</code>).</li>
            <li>Type the new IP address above and press <strong>Connect &amp; Switch Feed</strong>.</li>
            <li>The feed will immediately switch to the new phone camera without interrupting CCTV 1 webcam.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
