"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Lock, User, CheckCircle2, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("supervisor.safety@factory.internal");
  const [password, setPassword] = useState("••••••••••••");
  const [role, setRole] = useState("SAFETY_SUPERVISOR");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Identity attribution login
    router.push("/");
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4 font-mono">
      <div className="max-w-md w-full bg-[#121821] border border-[#26303C] rounded-lg p-6 shadow-2xl space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center mx-auto border border-blue-400/40 shadow-lg shadow-blue-500/20">
            <ShieldAlert className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-lg font-bold text-slate-100 uppercase tracking-wider">
            SafetyIntel OS Console
          </h1>
          <p className="text-xs text-slate-400">
            Problem Statement 6 • Industrial Safety & Hazard Intelligence
          </p>
        </div>

        {/* Identity Attributed Sign-in Note */}
        <div className="bg-slate-900 border border-slate-800 p-3 rounded text-[11px] text-slate-400 leading-relaxed">
          <span className="text-blue-400 font-bold block mb-1">AUDIT ATTRIBUTION ACCESS:</span>
          Authentication logs supervisor identity for incident acknowledgment and safety sign-off.
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4 text-xs">
          <div className="space-y-1">
            <label className="text-slate-300 font-bold block">Supervisor Identity / Email</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-[#1A222C] border border-[#26303C] rounded pl-9 pr-3 py-2 text-slate-200 focus:outline-hidden focus:border-blue-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-slate-300 font-bold block">Access Passcode</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-[#1A222C] border border-[#26303C] rounded pl-9 pr-3 py-2 text-slate-200 focus:outline-hidden focus:border-blue-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-slate-300 font-bold block">Operator Persona Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full bg-[#1A222C] border border-[#26303C] rounded px-3 py-2 text-slate-200 focus:outline-hidden focus:border-blue-500"
            >
              <option value="SAFETY_SUPERVISOR">Safety Supervisor (Incident Review & Triage)</option>
              <option value="OPERATIONS_SUPERVISOR">Operations Supervisor (Zone & Hardware Health)</option>
              <option value="SYSTEM_ADMINISTRATOR">System Administrator (Policy Configuration)</option>
            </select>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded text-xs tracking-wider uppercase transition-colors shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 mt-2"
          >
            <span>Enter Safety Console</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="pt-2 border-t border-slate-800 text-center text-[10px] text-slate-500">
          Connected to Facility Gateway: <span className="text-slate-400 font-bold">STPI_HOST_01</span>
        </div>
      </div>
    </div>
  );
}
