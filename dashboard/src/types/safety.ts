export type Priority = "P0" | "P1" | "P2" | "P3";

export type PPEStatusValue = "PASS" | "FAIL" | "UNKNOWN";

export type NetworkMode = "LAN" | "CELLULAR" | "OFFLINE";

export type ComponentStatus = "ONLINE" | "OFFLINE" | "DEGRADED" | "WARNING" | "CRITICAL";

export type IncidentStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";

export type SourceEventType = "PPE_VIOLATION" | "FIRE" | "SMOKE";

export interface PPEItemStatus {
  helmet: PPEStatusValue;
  vest: PPEStatusValue;
  gloves: PPEStatusValue;
  safety_shoes: PPEStatusValue;
}

export interface ZonePPEPolicy {
  helmet_required: boolean;
  vest_required: boolean;
  gloves_required: boolean;
  safety_shoes_required: boolean;
  policy_version: number;
  updated_at: string;
}

export interface Zone {
  zone_id: string;
  facility_id: string;
  name: string;
  description: string;
  floor_area?: string;
  status: "ACTIVE" | "INACTIVE";
  current_priority: Priority;
  camera_id: string;
  worker_count: number;
  fire_detected: boolean;
  smoke_detected: boolean;
  sensor_flame: boolean;
  sensor_smoke_raw: number;
  sensor_smoke_index: number;
  node_status: ComponentStatus;
  ppe_policy: ZonePPEPolicy;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  confidence: number;
  color?: string;
}

export interface WorkerTrack {
  worker_track_id: string;
  camera_id: string;
  zone_id: string;
  first_seen: string;
  last_seen: string;
  status: "ACTIVE" | "ENDED";
  ppe: PPEItemStatus;
  confidence: number;
  bbox?: BoundingBox;
}

export interface Camera {
  camera_id: string;
  zone_id: string;
  facility_id: string;
  name: string;
  status: ComponentStatus;
  last_seen: string;
  stream_url?: string;
  fps: number;
  resolution: string;
  role?: string;
}

export interface Incident {
  incident_id: string;
  facility_id: string;
  zone_id: string;
  zone_name: string;
  camera_id?: string;
  worker_id?: string;
  source_event_type: SourceEventType;
  priority: Priority;
  timestamp: string;
  confidence: number;
  status: IncidentStatus;
  required_action: string;
  evidence_image?: string;
  decision_reason: string;
  vision_evidence?: {
    fire?: boolean;
    smoke?: boolean;
    missing_items?: string[];
  };
  sensor_evidence?: {
    flame_detected: boolean;
    gas_sensor_raw: number;
    smoke_index: number;
  };
  network_mode: NetworkMode;
  acknowledged_at?: string;
  acknowledged_by?: string;
  resolved_at?: string;
  resolved_by?: string;
  resolution_note?: string;
}

export interface SystemHealthItem {
  id: string;
  name: string;
  category: "AI" | "GATEWAY" | "NETWORK" | "NODE" | "SENSOR" | "BACKEND";
  status: ComponentStatus;
  last_seen: string;
  detail?: string;
  is_safety_critical?: boolean;
}

export interface FacilityState {
  facility_id: string;
  name: string;
  current_network_mode: NetworkMode;
  total_cameras: number;
  active_zones: number;
  emergency_siren_active: boolean;
  emergency_response_available: boolean;
  last_heartbeat: string;
  heartbeat_timeout_seconds: number;
}
