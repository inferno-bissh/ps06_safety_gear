import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  FacilityState,
  Zone,
  Camera,
  Incident,
  SystemHealthItem,
  NetworkMode,
  ZonePPEPolicy,
} from "@/types/safety";

/**
 * Real-time listener for the main facility doc
 */
export function subscribeFacility(
  facilityId: string,
  onData: (facility: FacilityState) => void,
  onError?: (err: unknown) => void
): Unsubscribe | null {
  if (!db) return null;
  const facilityRef = doc(db, "facilities", facilityId);
  return onSnapshot(
    facilityRef,
    (snapshot) => {
      if (snapshot.exists()) {
        onData(snapshot.data() as FacilityState);
      }
    },
    onError
  );
}

/**
 * Real-time listener for facility zones
 */
export function subscribeZones(
  facilityId: string,
  onData: (zones: Zone[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe | null {
  if (!db) return null;
  const zonesCol = collection(db, "facilities", facilityId, "zones");
  return onSnapshot(
    zonesCol,
    (snapshot) => {
      const zonesMap = new Map<string, Zone>();
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as Zone;
        const zid = data.zone_id || docSnap.id;
        zonesMap.set(zid, { ...data, zone_id: zid });
      });
      onData(Array.from(zonesMap.values()));
    },
    onError
  );
}

/**
 * Real-time listener for facility incidents
 */
export function subscribeIncidents(
  facilityId: string,
  onData: (incidents: Incident[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe | null {
  if (!db) return null;
  const incidentsCol = collection(db, "facilities", facilityId, "incidents");
  return onSnapshot(
    incidentsCol,
    (snapshot) => {
      const incidents: Incident[] = [];
      snapshot.forEach((docSnap) => {
        incidents.push(docSnap.data() as Incident);
      });
      // Sort newest first
      incidents.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      onData(incidents);
    },
    onError
  );
}

/**
 * Real-time listener for cameras
 */
export function subscribeCameras(
  facilityId: string,
  onData: (cameras: Camera[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe | null {
  if (!db) return null;
  const camerasCol = collection(db, "facilities", facilityId, "cameras");
  return onSnapshot(
    camerasCol,
    (snapshot) => {
      const camsMap = new Map<string, Camera>();
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as Camera;
        const cid = data.camera_id || docSnap.id;
        camsMap.set(cid, { ...data, camera_id: cid });
      });
      onData(Array.from(camsMap.values()));
    },
    onError
  );
}

/**
 * Real-time listener for system health diagnostics
 */
export function subscribeSystemHealth(
  facilityId: string,
  onData: (items: SystemHealthItem[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe | null {
  if (!db) return null;
  const healthCol = collection(db, "facilities", facilityId, "system_health");
  return onSnapshot(
    healthCol,
    (snapshot) => {
      const items: SystemHealthItem[] = [];
      snapshot.forEach((docSnap) => {
        items.push(docSnap.data() as SystemHealthItem);
      });
      onData(items);
    },
    onError
  );
}

export interface GateLogEntry {
  log_id: string;
  worker_name: string;
  checkin_time: string;
  timestamp_display?: string;
  gate_id: string;
  ppe_status: "COMPLIANT" | "NON_COMPLIANT";
  match_confidence?: number;
}

/**
 * Real-time listener for Gate Check-in Audit Logs
 */
export function subscribeGateLogs(
  facilityId: string,
  onData: (logs: GateLogEntry[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe | null {
  if (!db) return null;
  const gateCol = collection(db, "facilities", facilityId, "gate_logs");
  return onSnapshot(
    gateCol,
    (snapshot) => {
      const logs: GateLogEntry[] = [];
      snapshot.forEach((docSnap) => {
        logs.push(docSnap.data() as GateLogEntry);
      });
      logs.sort((a, b) => (b.checkin_time > a.checkin_time ? 1 : -1));
      onData(logs);
    },
    onError
  );
}

/**
 * Acknowledge an incident in Firestore
 */
export async function acknowledgeIncidentInFirestore(
  facilityId: string,
  incidentId: string,
  supervisorUid: string = "SUPERVISOR_01"
): Promise<void> {
  if (!db) throw new Error("Firestore not initialized");
  const incidentRef = doc(db, "facilities", facilityId, "incidents", incidentId);
  await setDoc(
    incidentRef,
    {
      status: "ACKNOWLEDGED",
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: supervisorUid,
    },
    { merge: true }
  );
}

/**
 * Resolve an incident in Firestore
 */
export async function resolveIncidentInFirestore(
  facilityId: string,
  incidentId: string,
  supervisorUid: string = "SUPERVISOR_01",
  note?: string
): Promise<void> {
  if (!db) throw new Error("Firestore not initialized");
  const incidentRef = doc(db, "facilities", facilityId, "incidents", incidentId);
  await setDoc(
    incidentRef,
    {
      status: "RESOLVED",
      resolved_at: new Date().toISOString(),
      resolved_by: supervisorUid,
      resolution_note: note || "Resolved after on-site review",
    },
    { merge: true }
  );
}

/**
 * Update PPE policy for a zone
 */
export async function updateZonePPEPolicyInFirestore(
  facilityId: string,
  zoneId: string,
  policy: Partial<ZonePPEPolicy>
): Promise<void> {
  if (!db) throw new Error("Firestore not initialized");
  const zoneRef = doc(db, "facilities", facilityId, "zones", zoneId);
  await setDoc(
    zoneRef,
    {
      zone_id: zoneId,
      ppe_policy: {
        helmet_required: policy.helmet_required,
        vest_required: policy.vest_required,
        gloves_required: policy.gloves_required,
        safety_shoes_required: policy.safety_shoes_required,
        updated_at: new Date().toISOString(),
      },
    },
    { merge: true }
  );
}

/**
 * Update facility network mode
 */
export async function setNetworkModeInFirestore(
  facilityId: string,
  mode: NetworkMode
): Promise<void> {
  if (!db) throw new Error("Firestore not initialized");
  const facilityRef = doc(db, "facilities", facilityId);
  await setDoc(
    facilityRef,
    {
      current_network_mode: mode,
      emergency_response_available: mode !== "OFFLINE",
    },
    { merge: true }
  );
}

/**
 * Create or push a new incident
 */
export async function createIncidentInFirestore(
  facilityId: string,
  incident: Incident
): Promise<void> {
  if (!db) throw new Error("Firestore not initialized");
  const incidentRef = doc(db, "facilities", facilityId, "incidents", incident.incident_id);
  await setDoc(incidentRef, incident, { merge: true });
}

/**
 * Update Camera metadata (such as custom name, stream URL) in Firestore
 * Uses setDoc with merge: true to safely create if the document does not exist yet.
 */
export async function updateCameraInFirestore(
  facilityId: string,
  cameraId: string,
  updates: Partial<Camera>
): Promise<void> {
  if (!db) throw new Error("Firestore not initialized");
  const camRef = doc(db, "facilities", facilityId, "cameras", cameraId);
  await setDoc(
    camRef,
    {
      camera_id: cameraId,
      ...updates,
      last_seen: new Date().toISOString(),
    },
    { merge: true }
  );
}

/**
 * Seed initial baseline data into Firestore if collections are empty
 */
export async function seedDefaultFirestoreData(
  facilityId: string,
  initialFacility: FacilityState,
  initialZones: Zone[],
  initialCameras: Camera[],
  initialHealth: SystemHealthItem[]
): Promise<void> {
  if (!db) throw new Error("Firestore not initialized");

  // 1. Facility document
  const facilityRef = doc(db, "facilities", facilityId);
  await setDoc(facilityRef, initialFacility, { merge: true });

  // 2. Zones
  for (const zone of initialZones) {
    const zoneRef = doc(db, "facilities", facilityId, "zones", zone.zone_id);
    await setDoc(zoneRef, zone, { merge: true });
  }

  // 3. Cameras
  for (const camera of initialCameras) {
    const camRef = doc(db, "facilities", facilityId, "cameras", camera.camera_id);
    await setDoc(camRef, camera, { merge: true });
  }

  // 4. System Health Items
  for (const item of initialHealth) {
    const healthRef = doc(db, "facilities", facilityId, "system_health", item.id);
    await setDoc(healthRef, item, { merge: true });
  }
}
