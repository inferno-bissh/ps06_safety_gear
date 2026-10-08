import type { Metadata } from "next";
import "./globals.css";
import { SafetyProvider } from "@/context/SafetyContext";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { P3Takeover } from "@/components/P3Takeover";
import { IncidentDetailDrawer } from "@/components/IncidentDetailDrawer";

export const metadata: Metadata = {
  title: "SafetyIntel OS | PS-06 Industrial Safety Intelligence",
  description:
    "Multimodal Industrial Safety & Hazard Monitoring System — Cloud Vision (YOLOv8) + RS-485 Modbus Telemetry + Contextual Decision Engine",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#0B0F14] text-[#E6EDF3]">
        <SafetyProvider>
          {/* Persistent Control Room Header */}
          <Header />

          {/* Master Alarm P3 Takeover (when P3 triggered) */}
          <P3Takeover />

          {/* Incident Detail Right Slide-over Drawer */}
          <IncidentDetailDrawer />

          {/* Main App Layout Body */}
          <div className="flex flex-1">
            <Sidebar />
            <main className="flex-1 p-5 overflow-y-auto max-w-7xl mx-auto w-full">
              {children}
            </main>
          </div>
        </SafetyProvider>
      </body>
    </html>
  );
}
