"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import {
  FacilityState,
  Zone,
  Camera,
  Incident,
  WorkerTrack,
  SystemHealthItem,
  NetworkMode,
  ZonePPEPolicy,
} from "../types/safety";
import { isFirebaseConfigured } from "../lib/firebase";
import {
  subscribeFacility,
  subscribeZones,
  subscribeIncidents,
  subscribeCameras,
  subscribeSystemHealth,
  subscribeGateLogs,
  GateLogEntry,
  acknowledgeIncidentInFirestore,
  resolveIncidentInFirestore,
  updateZonePPEPolicyInFirestore,
  updateCameraInFirestore,
  setNetworkModeInFirestore,
  createIncidentInFirestore,
  seedDefaultFirestoreData,
} from "../lib/firestoreService";

interface SafetyContextType {
  facility: FacilityState;
  zones: Zone[];
  cameras: Camera[];
  incidents: Incident[];
  gateLogs: GateLogEntry[];
  workerTracks: WorkerTrack[];
  systemHealth: SystemHealthItem[];
  selectedIncident: Incident | null;
  isP3TakeoverActive: boolean;
  p3EmergencyIncident: Incident | null;
  isSimulationMode: boolean;
  dataSource: "FIRESTORE" | "SIMULATION";
  isFirebaseAvailable: boolean;
  activeScenario: string | null;
  liveHazard: { smoke: boolean; fire: boolean; smoke_index: number };
  isVisionEngineOnline: boolean;
  telemetryError: boolean;
  // Actions
  toggleLiveHazard: (type: "smoke" | "fire" | "reset", active?: boolean, smokeIndex?: number) => Promise<void>;
  setDataSource: (source: "FIRESTORE" | "SIMULATION") => void;
  seedFirestore: () => Promise<void>;
  triggerScenario: (scenario: "A" | "B" | "C" | "D" | "E" | "RESET") => void;
  selectIncident: (incident: Incident | null) => void;
  acknowledgeIncident: (incidentId: string) => void;
  resolveIncident: (incidentId: string, note?: string) => void;
  dismissP3Takeover: () => void;
  setNetworkMode: (mode: NetworkMode) => void;
  updatePPEPolicy: (zoneId: string, policy: Partial<ZonePPEPolicy>) => void;
  updateCameraName: (cameraId: string, newName: string) => Promise<void>;
  updateCameraConfig: (cameraId: string, updates: Partial<Camera>) => Promise<void>;
}

const initialFacility: FacilityState = {
  facility_id: "STPI_HOST_01",
  name: "BPUT Industrial Facility Alpha",
  current_network_mode: "LAN",
  total_cameras: 2,
  active_zones: 3,
  emergency_siren_active: false,
  emergency_response_available: true,
  last_heartbeat: new Date().toISOString(),
  heartbeat_timeout_seconds: 15,
};

const initialZones: Zone[] = [
  {
    zone_id: "WELDING_ZONE",
    facility_id: "STPI_HOST_01",
    name: "Welding & Fabrication Bay",
    description: "Heavy sparks, welding arcs, and thermal cutting operations.",
    floor_area: "Bay 1 - Ground Floor",
    status: "ACTIVE",
    current_priority: "P0",
    camera_id: "CAM_01",
    worker_count: 2,
    fire_detected: false,
    smoke_detected: false,
    sensor_flame: false,
    sensor_smoke_raw: 142,
    sensor_smoke_index: 0.14,
    node_status: "ONLINE",
    ppe_policy: {
      helmet_required: true,
      vest_required: true,
      gloves_required: true,
      safety_shoes_required: true,
      policy_version: 2,
      updated_at: new Date().toISOString(),
    },
  },
  {
    zone_id: "ASSEMBLY_ZONE",
    facility_id: "STPI_HOST_01",
    name: "Electronics Assembly Area",
    description: "Component assembly, conveyor lines, and pick-and-place robots.",
    floor_area: "Floor 2 - Cleanroom Section",
    status: "ACTIVE",
    current_priority: "P0",
    camera_id: "CAM_02",
    worker_count: 1,
    fire_detected: false,
    smoke_detected: false,
    sensor_flame: false,
    sensor_smoke_raw: 88,
    sensor_smoke_index: 0.08,
    node_status: "ONLINE",
    ppe_policy: {
      helmet_required: true,
      vest_required: true,
      gloves_required: false,
      safety_shoes_required: true,
      policy_version: 1,
      updated_at: new Date().toISOString(),
    },
  },
  {
    zone_id: "OFFICE_ZONE",
    facility_id: "STPI_HOST_01",
    name: "Supervisory Control Office",
    description: "Administrative desk workstations and control monitors.",
    floor_area: "Mezzanine Floor",
    status: "ACTIVE",
    current_priority: "P0",
    camera_id: "CAM_03",
    worker_count: 1,
    fire_detected: false,
    smoke_detected: false,
    sensor_flame: false,
    sensor_smoke_raw: 45,
    sensor_smoke_index: 0.04,
    node_status: "ONLINE",
    ppe_policy: {
      helmet_required: false,
      vest_required: false,
      gloves_required: false,
      safety_shoes_required: false,
      policy_version: 1,
      updated_at: new Date().toISOString(),
    },
  },
];

const initialCameras: Camera[] = [
  {
    camera_id: "CCTV_01",
    zone_id: "GATE_ZONE",
    facility_id: "STPI_HOST_01",
    name: "CCTV 1 — Facility Gate Choke-Point (Laptop Camera)",
    status: "ONLINE",
    last_seen: new Date().toISOString(),
    stream_url: "http://localhost:5000/video/cctv1",
    fps: 20,
    resolution: "1280x720",
    role: "Gate Entry Choke-Point",
  },
  {
    camera_id: "CCTV_02",
    zone_id: "WELDING_ZONE",
    facility_id: "STPI_HOST_01",
    name: "CCTV 2 — Welding Bay (Phone 1)",
    status: "ONLINE",
    last_seen: new Date().toISOString(),
    stream_url: "http://localhost:5000/video/cctv2",
    fps: 25,
    resolution: "1280x720",
    role: "Front View (Phone 1)",
  },
  {
    camera_id: "CCTV_03",
    zone_id: "WELDING_ZONE",
    facility_id: "STPI_HOST_01",
    name: "CCTV 3 — Welding Bay (Phone 2)",
    status: "ONLINE",
    last_seen: new Date().toISOString(),
    stream_url: "http://localhost:5000/video/cctv3",
    fps: 25,
    resolution: "1280x720",
    role: "Left Side View (Phone 2)",
  },
  {
    camera_id: "CCTV_04",
    zone_id: "WELDING_ZONE",
    facility_id: "STPI_HOST_01",
    name: "CCTV 4 — Welding Bay (Phone 3)",
    status: "ONLINE",
    last_seen: new Date().toISOString(),
    stream_url: "http://localhost:5000/video/cctv4",
    fps: 25,
    resolution: "1280x720",
    role: "Right Side View (Phone 3)",
  },
];

const initialGateLogs: GateLogEntry[] = [
  {
    log_id: "GATE-001",
    worker_name: "Rahul Sharma",
    checkin_time: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    timestamp_display: "09:30:15 AM",
    gate_id: "GATE_01",
    ppe_status: "COMPLIANT",
    match_confidence: 0.98,
  },
  {
    log_id: "GATE-002",
    worker_name: "Amit Patel",
    checkin_time: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    timestamp_display: "09:40:22 AM",
    gate_id: "GATE_01",
    ppe_status: "COMPLIANT",
    match_confidence: 0.95,
  },
];

const initialWorkers: WorkerTrack[] = [
  {
    worker_track_id: "TRACK_22",
    camera_id: "CCTV_02",
    zone_id: "WELDING_ZONE",
    first_seen: new Date(Date.now() - 1200000).toISOString(),
    last_seen: new Date().toISOString(),
    status: "ACTIVE",
    confidence: 0.92,
    ppe: {
      helmet: "FAIL",
      vest: "UNKNOWN",
      gloves: "FAIL",
      safety_shoes: "UNKNOWN",
    },
    bbox: {
      x: 45,
      y: 22,
      width: 28,
      height: 64,
      label: "Worker [TRACK_22]",
      confidence: 0.92,
      color: "#f59e0b",
    },
  },
  {
    worker_track_id: "TRACK_09",
    camera_id: "CCTV_03",
    zone_id: "ASSEMBLY_ZONE",
    first_seen: new Date(Date.now() - 900000).toISOString(),
    last_seen: new Date().toISOString(),
    status: "ACTIVE",
    confidence: 0.88,
    ppe: {
      helmet: "PASS",
      vest: "PASS",
      gloves: "FAIL",
      safety_shoes: "PASS",
    },
    bbox: {
      x: 35,
      y: 25,
      width: 26,
      height: 60,
      label: "Worker [TRACK_09]",
      confidence: 0.88,
      color: "#3b82f6",
    },
  },
];

const initialHealth: SystemHealthItem[] = [
  {
    id: "h_vision",
    name: "Cloud Vision Inference (YOLOv8)",
    category: "AI",
    status: "ONLINE",
    last_seen: new Date().toISOString(),
    detail: "ONNX Runtime 28.4 FPS · Inference Latency 24ms",
  },
  {
    id: "h_esp32",
    name: "Central ESP32 Gateway",
    category: "GATEWAY",
    status: "ONLINE",
    last_seen: new Date().toISOString(),
    detail: "Host ID: STPI_HOST_01 · Primary WiFi Active",
    is_safety_critical: true,
  },
  {
    id: "h_modbus_1",
    name: "Modbus Node 1 (Welding Bay)",
    category: "NODE",
    status: "ONLINE",
    last_seen: new Date().toISOString(),
    detail: "Addr: 0x01 · Heartbeat incrementing (Reg 40005: 14820)",
  },
  {
    id: "h_modbus_2",
    name: "Modbus Node 2 (Assembly Area)",
    category: "NODE",
    status: "ONLINE",
    last_seen: new Date().toISOString(),
    detail: "Addr: 0x02 · Heartbeat incrementing (Reg 40005: 14818)",
  },
  {
    id: "h_flame_1",
    name: "IR Flame Sensor 1",
    category: "SENSOR",
    status: "ONLINE",
    last_seen: new Date().toISOString(),
    detail: "Welding Zone · Reading: Normal (0)",
  },
  {
    id: "h_smoke_1",
    name: "MQ-2 Gas/Smoke Sensor 1",
    category: "SENSOR",
    status: "ONLINE",
    last_seen: new Date().toISOString(),
    detail: "Welding Zone · Raw: 142 (Index 0.14)",
  },
  {
    id: "h_net_lan",
    name: "Facility LAN/WiFi Interface",
    category: "NETWORK",
    status: "ONLINE",
    last_seen: new Date().toISOString(),
    detail: "SSID: FACTORY_SECURE_LAN · Latency 14ms",
  },
  {
    id: "h_net_gsm",
    name: "ESP32 Cellular Backup (SIM7600)",
    category: "NETWORK",
    status: "ONLINE",
    last_seen: new Date().toISOString(),
    detail: "Standby backup connection ready · Signal: 84%",
  },
  {
    id: "h_backend",
    name: "Firebase Cloud Services",
    category: "BACKEND",
    status: "ONLINE",
    last_seen: new Date().toISOString(),
    detail: "Firestore, Storage, FCM active",
  },
];

const SafetyContext = createContext<SafetyContextType | undefined>(undefined);

export const SafetyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [facility, setFacility] = useState<FacilityState>(initialFacility);
  const [zones, setZones] = useState<Zone[]>(initialZones);
  const [cameras, setCameras] = useState<Camera[]>(initialCameras);
  const [workers, setWorkers] = useState<WorkerTrack[]>(initialWorkers);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [gateLogs, setGateLogs] = useState<GateLogEntry[]>(initialGateLogs);
  const [systemHealth, setSystemHealth] = useState<SystemHealthItem[]>(initialHealth);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [isP3TakeoverActive, setIsP3TakeoverActive] = useState(false);
  const [p3EmergencyIncident, setP3EmergencyIncident] = useState<Incident | null>(null);
  const [activeScenario, setActiveScenario] = useState<string | null>(null);
  const [liveHazard, setLiveHazard] = useState<{ smoke: boolean; fire: boolean; smoke_index: number }>({
    smoke: false,
    fire: false,
    smoke_index: 0.0,
  });
  const [isVisionEngineOnline, setIsVisionEngineOnline] = useState(false);
  const [telemetryError, setTelemetryError] = useState(false);
  
  // Dual-mode state: Firestore vs Simulation
  const [dataSource, setDataSource] = useState<"FIRESTORE" | "SIMULATION">("SIMULATION");
  const [isFirebaseAvailable, setIsFirebaseAvailable] = useState<boolean>(false);

  useEffect(() => {
    const configured = isFirebaseConfigured();
    setIsFirebaseAvailable(configured);
    if (configured) {
      setDataSource("FIRESTORE");
    }
  }, []);

  // Set up live Firestore real-time listeners when in FIRESTORE mode
  useEffect(() => {
    if (dataSource !== "FIRESTORE" || !isFirebaseConfigured()) return;

    const facilityId = facility.facility_id || "STPI_HOST_01";
    console.log("[Firestore] Attaching live real-time listeners for facility:", facilityId);

    const unsubFacility = subscribeFacility(
      facilityId,
      (data: FacilityState) => {
        if (data) setFacility((prev) => ({ ...prev, ...data }));
      },
      (err: unknown) => console.warn("[Firestore] Facility sync error:", err)
    );

    const unsubZones = subscribeZones(
      facilityId,
      (data: Zone[]) => {
        if (data && data.length > 0) setZones(data);
      },
      (err: unknown) => console.warn("[Firestore] Zones sync error:", err)
    );

    const unsubIncidents = subscribeIncidents(
      facilityId,
      (data: Incident[]) => {
        if (data) setIncidents(data);
      },
      (err: unknown) => console.warn("[Firestore] Incidents sync error:", err)
    );

    const unsubCameras = subscribeCameras(
      facilityId,
      (data: Camera[]) => {
        if (data && data.length > 0) setCameras(data);
      },
      (err: unknown) => console.warn("[Firestore] Cameras sync error:", err)
    );

    const unsubGate = subscribeGateLogs(
      facilityId,
      (data: GateLogEntry[]) => {
        if (data && data.length > 0) setGateLogs(data);
      },
      (err: unknown) => console.warn("[Firestore] Gate logs sync error:", err)
    );

    const unsubHealth = subscribeSystemHealth(
      facilityId,
      (data: SystemHealthItem[]) => {
        if (data && data.length > 0) setSystemHealth(data);
      },
      (err: unknown) => console.warn("[Firestore] Health sync error:", err)
    );

    return () => {
      unsubFacility && unsubFacility();
      unsubZones && unsubZones();
      unsubIncidents && unsubIncidents();
      unsubCameras && unsubCameras();
      unsubGate && unsubGate();
      unsubHealth && unsubHealth();
    };
  }, [dataSource, facility.facility_id]);

  // Heartbeat ticker
  useEffect(() => {
    const interval = setInterval(() => {
      setFacility((prev) => ({
        ...prev,
        last_heartbeat: new Date().toISOString(),
      }));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Real-time YOLO Worker Tracking telemetry synchronization from Vision Orchestrator
  useEffect(() => {
    let isMounted = true;
    const syncLiveWorkers = async () => {
      try {
        const res = await fetch("/api/cameras/workers");
        if (!res.ok) {
          if (isMounted) {
            setIsVisionEngineOnline(false);
            setTelemetryError(true);
          }
          return;
        }
        const data = await res.json();
        if (isMounted) {
          if (data.success && Array.isArray(data.workers)) {
            setIsVisionEngineOnline(true);
            setTelemetryError(false);
            setWorkers((prev) => {
              const liveMap = new Map<string, WorkerTrack>();
              // Add live detected workers from live orchestrator
              data.workers.forEach((w: WorkerTrack) => {
                liveMap.set(w.worker_track_id, w);
              });
              // Retain demo/other camera workers (e.g. CCTV_03, CCTV_04) if not part of active live orchestrator channels
              prev.forEach((oldW) => {
                if (
                  !liveMap.has(oldW.worker_track_id) &&
                  oldW.camera_id !== "CCTV_01" &&
                  oldW.camera_id !== "CCTV_02"
                ) {
                  liveMap.set(oldW.worker_track_id, oldW);
                }
              });
              return Array.from(liveMap.values());
            });
          } else {
            setIsVisionEngineOnline(false);
          }
        }
      } catch {
        if (isMounted) {
          setIsVisionEngineOnline(false);
          setTelemetryError(true);
        }
      }
    };

    const workerInterval = setInterval(syncLiveWorkers, 400);
    return () => {
      isMounted = false;
      clearInterval(workerInterval);
    };
  }, []);

  const toggleLiveHazard = async (type: "smoke" | "fire" | "reset", active?: boolean, smokeIndex?: number) => {
    try {
      if (type === "reset") {
        await fetch("/api/cameras/hazard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reset: true }),
        });
        setLiveHazard({ smoke: false, fire: false, smoke_index: 0.0 });
      } else if (type === "smoke") {
        const targetActive = active !== undefined ? active : !liveHazard.smoke;
        await fetch("/api/cameras/hazard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            smoke: targetActive,
            smoke_index: smokeIndex ?? (targetActive ? 0.88 : 0.0),
          }),
        });
        setLiveHazard((prev) => ({
          ...prev,
          smoke: targetActive,
          smoke_index: targetActive ? (smokeIndex ?? 0.88) : 0.0,
        }));
      } else if (type === "fire") {
        const targetActive = active !== undefined ? active : !liveHazard.fire;
        await fetch("/api/cameras/hazard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fire: targetActive }),
        });
        setLiveHazard((prev) => ({
          ...prev,
          fire: targetActive,
        }));
      }
    } catch (err) {
      console.warn("[Hazard] Could not sync live hazard to port 5000:", err);
    }
  };

  // Real-time synchronization with port 5000 hazard state
  useEffect(() => {
    let isMounted = true;
    const syncHazard = async () => {
      try {
        const res = await fetch("/api/cameras/hazard");
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted && data.success && data.hazard) {
          const h = data.hazard;
          setLiveHazard({
            smoke: !!h.smoke,
            fire: !!h.fire,
            smoke_index: typeof h.smoke_index === "number" ? h.smoke_index : 0.0,
          });

          if (h.fire) {
            setZones((prev) =>
              prev.map((z) =>
                z.zone_id === "WELDING_ZONE"
                  ? {
                      ...z,
                      current_priority: "P3",
                      fire_detected: true,
                      smoke_detected: true,
                      sensor_flame: true,
                      sensor_smoke_raw: 820,
                      sensor_smoke_index: 0.85,
                    }
                  : z
              )
            );
            setFacility((prev) => ({ ...prev, emergency_siren_active: true }));
            setIsP3TakeoverActive(true);
          } else if (h.smoke) {
            setZones((prev) =>
              prev.map((z) =>
                z.zone_id === "WELDING_ZONE"
                  ? {
                      ...z,
                      current_priority: z.current_priority === "P3" ? "P3" : "P2",
                      smoke_detected: true,
                      sensor_smoke_index: typeof h.smoke_index === "number" ? h.smoke_index : 0.88,
                      sensor_smoke_raw: 540,
                    }
                  : z
              )
            );
          }
        }
      } catch {
        // Broadcaster temporarily unreachable
      }
    };

    const hazardInterval = setInterval(syncHazard, 1000);
    return () => {
      isMounted = false;
      clearInterval(hazardInterval);
    };
  }, []);

  const persistIncident = async (incident: Incident) => {
    if (dataSource === "FIRESTORE" && isFirebaseConfigured()) {
      try {
        await createIncidentInFirestore(facility.facility_id, incident);
      } catch (err) {
        console.warn("[Firestore] Could not persist incident:", err);
      }
    }
  };

  const seedFirestore = async () => {
    if (!isFirebaseConfigured()) {
      alert("Firebase is not configured in .env.local!");
      return;
    }
    try {
      await seedDefaultFirestoreData(
        facility.facility_id,
        initialFacility,
        initialZones,
        initialCameras,
        initialHealth
      );
      alert("Success: Cloud Firestore initialized with baseline facility, zones, cameras, and diagnostics!");
    } catch (err: any) {
      console.error("Firestore seeding failed:", err);
      alert("Seeding failed: " + (err.message || String(err)));
    }
  };

  // Scenario Trigger Function covering Scenarios A through E
  const triggerScenario = (scenario: "A" | "B" | "C" | "D" | "E" | "RESET") => {
    setActiveScenario(scenario);
    const now = new Date().toISOString();

    if (scenario === "RESET") {
      setZones(initialZones);
      setWorkers(initialWorkers);
      setIncidents([]);
      setSystemHealth(initialHealth);
      setFacility(initialFacility);
      setIsP3TakeoverActive(false);
      setP3EmergencyIncident(null);
      setSelectedIncident(null);
      toggleLiveHazard("reset");
      return;
    }

    if (scenario === "A") {
      // Scenario A: PPE Violation
      const newIncident: Incident = {
        incident_id: `PPE-${Date.now().toString().slice(-6)}`,
        facility_id: "STPI_HOST_01",
        zone_id: "WELDING_ZONE",
        zone_name: "Welding & Fabrication Bay",
        camera_id: "CAM_01",
        worker_id: "TRACK_17",
        source_event_type: "PPE_VIOLATION",
        priority: "P1",
        timestamp: now,
        confidence: 0.94,
        status: "OPEN",
        required_action: "SUPERVISOR REVIEW — ISSUE PPE COMPLIANCE WARNING",
        decision_reason: "Helmet required by WELDING_ZONE policy; worker tracked without helmet for >5 consecutive seconds",
        evidence_image: "https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?auto=format&fit=crop&w=800&q=80",
        vision_evidence: {
          missing_items: ["HELMET"],
        },
        network_mode: facility.current_network_mode,
      };

      setWorkers((prev) =>
        prev.map((w) =>
          w.worker_track_id === "TRACK_17"
            ? {
                ...w,
                ppe: { ...w.ppe, helmet: "FAIL" },
                bbox: { ...w.bbox!, color: "#eab308", label: "Worker [TRACK_17] - HELMET FAIL" },
              }
            : w
        )
      );

      setZones((prev) =>
        prev.map((z) =>
          z.zone_id === "WELDING_ZONE"
            ? { ...z, current_priority: z.current_priority === "P0" ? "P1" : z.current_priority }
            : z
        )
      );

      setIncidents((prev) => [newIncident, ...prev]);
      persistIncident(newIncident);
    } else if (scenario === "B") {
      // Scenario B: Confirmed Fire (Vision Fire + Physical Flame Sensor -> P3 Critical)
      const fireIncident: Incident = {
        incident_id: `HAZ-${Date.now().toString().slice(-6)}`,
        facility_id: "STPI_HOST_01",
        zone_id: "WELDING_ZONE",
        zone_name: "Welding & Fabrication Bay",
        camera_id: "CAM_01",
        source_event_type: "FIRE",
        priority: "P3",
        timestamp: now,
        confidence: 0.96,
        status: "OPEN",
        required_action: "EVACUATE ZONE IMMEDIATELY — SIREN ACTIVATED — DISPATCH FIRE BRIGADE",
        decision_reason: "MULTIMODAL CONVERGENCE: Vision Fire (0.96) confirmed by Modbus IR Flame Sensor (Reg 40001: 2) -> Critical P3 Takeover",
        evidence_image: "https://images.unsplash.com/photo-1542385151-efd9000785a0?auto=format&fit=crop&w=800&q=80",
        vision_evidence: {
          fire: true,
          smoke: true,
        },
        sensor_evidence: {
          flame_detected: true,
          gas_sensor_raw: 785,
          smoke_index: 0.78,
        },
        network_mode: facility.current_network_mode,
      };

      setZones((prev) =>
        prev.map((z) =>
          z.zone_id === "WELDING_ZONE"
            ? {
                ...z,
                current_priority: "P3",
                fire_detected: true,
                smoke_detected: true,
                sensor_flame: true,
                sensor_smoke_raw: 785,
                sensor_smoke_index: 0.78,
              }
            : z
        )
      );

      setFacility((prev) => ({
        ...prev,
        emergency_siren_active: prev.emergency_response_available ? true : false,
      }));

      setIncidents((prev) => [fireIncident, ...prev]);
      setP3EmergencyIncident(fireIncident);
      setIsP3TakeoverActive(true);
      persistIncident(fireIncident);
      toggleLiveHazard("fire", true);
    } else if (scenario === "C") {
      // Scenario C: Sensor-Only Smoke
      const sensorSmokeIncident: Incident = {
        incident_id: `SMK-${Date.now().toString().slice(-6)}`,
        facility_id: "STPI_HOST_01",
        zone_id: "ASSEMBLY_ZONE",
        zone_name: "Electronics Assembly Area",
        camera_id: "CAM_02",
        source_event_type: "SMOKE",
        priority: "P2",
        timestamp: now,
        confidence: 0.82,
        status: "OPEN",
        required_action: "INSPECTION REQUIRED — SENSOR TRIGGERED WITHOUT VISUAL CONFIRMATION",
        decision_reason: "Physical MQ-2 gas/smoke sensor reading elevated (Reg 40003: 0.48), but camera video shows clear air -> P2 Verification Alert",
        evidence_image: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=800&q=80",
        sensor_evidence: {
          flame_detected: false,
          gas_sensor_raw: 480,
          smoke_index: 0.48,
        },
        network_mode: facility.current_network_mode,
      };

      setZones((prev) =>
        prev.map((z) =>
          z.zone_id === "ASSEMBLY_ZONE"
            ? {
                ...z,
                current_priority: z.current_priority === "P3" ? "P3" : "P2",
                sensor_smoke_raw: 480,
                sensor_smoke_index: 0.48,
              }
            : z
        )
      );

      setIncidents((prev) => [sensorSmokeIncident, ...prev]);
      persistIncident(sensorSmokeIncident);
      toggleLiveHazard("smoke", true, 0.48);
    } else if (scenario === "D") {
      // Scenario D: Visual Smoke
      const visualSmokeIncident: Incident = {
        incident_id: `VIS-${Date.now().toString().slice(-6)}`,
        facility_id: "STPI_HOST_01",
        zone_id: "WELDING_ZONE",
        zone_name: "Welding & Fabrication Bay",
        camera_id: "CAM_01",
        source_event_type: "SMOKE",
        priority: "P2",
        timestamp: now,
        confidence: 0.88,
        status: "OPEN",
        required_action: "OPERATOR VISUAL VERIFICATION REQUIRED — CAMERA DETECTS SMOKE CLOUD",
        decision_reason: "AI vision model identified smoke column (0.88 conf), physical sensor below threshold -> P2 Suspicious Alert",
        evidence_image: "https://images.unsplash.com/photo-1542385151-efd9000785a0?auto=format&fit=crop&w=800&q=80",
        vision_evidence: {
          smoke: true,
          fire: false,
        },
        network_mode: facility.current_network_mode,
      };

      setZones((prev) =>
        prev.map((z) =>
          z.zone_id === "WELDING_ZONE"
            ? {
                ...z,
                current_priority: z.current_priority === "P3" ? "P3" : "P2",
                smoke_detected: true,
              }
            : z
        )
      );

      setIncidents((prev) => [visualSmokeIncident, ...prev]);
      persistIncident(visualSmokeIncident);
      toggleLiveHazard("smoke", true, 0.88);
    } else if (scenario === "E") {
      // Scenario E: Negative Test (Total Connectivity Loss)
      setFacility((prev) => ({
        ...prev,
        current_network_mode: "OFFLINE",
        emergency_response_available: false,
        emergency_siren_active: false,
      }));

      setSystemHealth((prev) =>
        prev.map((h) =>
          h.category === "GATEWAY" || h.category === "NETWORK"
            ? { ...h, status: "OFFLINE", detail: "Comms timeout — Heartbeat missed >15s" }
            : h
        )
      );
    }
  };

  const acknowledgeIncident = async (incidentId: string) => {
    setIncidents((prev) =>
      prev.map((inc) =>
        inc.incident_id === incidentId
          ? {
              ...inc,
              status: "ACKNOWLEDGED",
              acknowledged_at: new Date().toISOString(),
              acknowledged_by: "Supervisor VICTUS",
            }
          : inc
      )
    );

    if (dataSource === "FIRESTORE" && isFirebaseConfigured()) {
      try {
        await acknowledgeIncidentInFirestore(facility.facility_id, incidentId, "Supervisor VICTUS");
      } catch (e) {
        console.error("Failed to acknowledge in Firestore:", e);
      }
    }
  };

  const resolveIncident = async (incidentId: string, note?: string) => {
    setIncidents((prev) =>
      prev.map((inc) =>
        inc.incident_id === incidentId
          ? {
              ...inc,
              status: "RESOLVED",
              resolved_at: new Date().toISOString(),
              resolved_by: "Supervisor VICTUS",
              resolution_note: note || "Resolved after on-site review",
            }
          : inc
      )
    );

    if (dataSource === "FIRESTORE" && isFirebaseConfigured()) {
      try {
        await resolveIncidentInFirestore(facility.facility_id, incidentId, "Supervisor VICTUS", note);
      } catch (e) {
        console.error("Failed to resolve in Firestore:", e);
      }
    }

    // Recalculate zone priorities if needed
    setZones((prev) =>
      prev.map((z) => {
        const remainingForZone = incidents.filter(
          (i) => i.zone_id === z.zone_id && i.incident_id !== incidentId && i.status !== "RESOLVED"
        );
        let maxP: any = "P0";
        if (remainingForZone.some((i) => i.priority === "P3")) maxP = "P3";
        else if (remainingForZone.some((i) => i.priority === "P2")) maxP = "P2";
        else if (remainingForZone.some((i) => i.priority === "P1")) maxP = "P1";
        return { ...z, current_priority: maxP };
      })
    );
  };

  const dismissP3Takeover = () => {
    setIsP3TakeoverActive(false);
  };

  const setNetworkMode = async (mode: NetworkMode) => {
    setFacility((prev) => ({
      ...prev,
      current_network_mode: mode,
      emergency_response_available: mode !== "OFFLINE",
      emergency_siren_active: mode === "OFFLINE" ? false : prev.emergency_siren_active,
    }));

    if (dataSource === "FIRESTORE" && isFirebaseConfigured()) {
      try {
        await setNetworkModeInFirestore(facility.facility_id, mode);
      } catch (e) {
        console.error("Failed to update network mode in Firestore:", e);
      }
    }
  };

  const updatePPEPolicy = async (zoneId: string, policy: Partial<ZonePPEPolicy>) => {
    setZones((prev) =>
      prev.map((z) =>
        z.zone_id === zoneId
          ? {
              ...z,
              ppe_policy: {
                ...z.ppe_policy,
                ...policy,
                policy_version: z.ppe_policy.policy_version + 1,
                updated_at: new Date().toISOString(),
              },
            }
          : z
      )
    );

    if (dataSource === "FIRESTORE" && isFirebaseConfigured()) {
      try {
        await updateZonePPEPolicyInFirestore(facility.facility_id, zoneId, policy);
      } catch (e) {
        console.error("Failed to update PPE policy in Firestore:", e);
      }
    }
  };

  const updateCameraName = async (cameraId: string, newName: string) => {
    setCameras((prev) =>
      prev.map((c) => (c.camera_id === cameraId ? { ...c, name: newName } : c))
    );

    if (dataSource === "FIRESTORE" && isFirebaseConfigured()) {
      try {
        await updateCameraInFirestore(facility.facility_id, cameraId, { name: newName });
      } catch (e) {
        console.error("Failed to update camera name in Firestore:", e);
      }
    }
  };

  const updateCameraConfig = async (cameraId: string, updates: Partial<Camera>) => {
    setCameras((prev) =>
      prev.map((c) => (c.camera_id === cameraId ? { ...c, ...updates } : c))
    );

    if (dataSource === "FIRESTORE" && isFirebaseConfigured()) {
      try {
        await updateCameraInFirestore(facility.facility_id, cameraId, updates);
      } catch (e) {
        console.error("Failed to update camera config in Firestore:", e);
      }
    }
  };

  return (
    <SafetyContext.Provider
      value={{
        facility,
        zones,
        cameras,
        incidents,
        gateLogs,
        workerTracks: workers,
        systemHealth,
        selectedIncident,
        isP3TakeoverActive,
        p3EmergencyIncident,
        isSimulationMode: dataSource === "SIMULATION",
        dataSource,
        isFirebaseAvailable,
        activeScenario,
        liveHazard,
        isVisionEngineOnline,
        telemetryError,
        toggleLiveHazard,
        setDataSource,
        seedFirestore,
        triggerScenario,
        selectIncident: setSelectedIncident,
        acknowledgeIncident,
        resolveIncident,
        dismissP3Takeover,
        setNetworkMode,
        updatePPEPolicy,
        updateCameraName,
        updateCameraConfig,
      }}
    >
      {children}
    </SafetyContext.Provider>
  );
};

export const useSafety = () => {
  const context = useContext(SafetyContext);
  if (!context) {
    throw new Error("useSafety must be used within a SafetyProvider");
  }
  return context;
};
