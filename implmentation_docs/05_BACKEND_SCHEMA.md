# PS6 — Backend Schema / Data Model & Auth Architecture

## Multimodal Industrial Safety & Hazard Monitoring System

**Document:** 05 — Backend Schema / Data Model & Auth Architecture
**Source of truth:** `master_approach.md`, plus decisions frozen in `01_PRD.md`, `02_TRD.md` (Firebase/Firestore/FCM backend), `03_APP_FLOW.md` (Firebase Auth login, identity-only/no role gating, OPEN/ACKNOWLEDGED/RESOLVED incident lifecycle), `04_UI_UX_DESIGN_BRIEF.md`.
**Datastore, confirmed this session:** Firestore (not Realtime Database, not Postgres) — consistent with `02_TRD.md` and the Firestore `onSnapshot` listeners already assumed by `03_APP_FLOW.md`.
**Revision note (2026-09-28):** Revised to match the architecture amendment in `master_approach.md` — no Jetson/edge host, vision inference runs as an internal backend service (not a separate ingesting caller), the ESP32 is the sole device with a connectivity/heartbeat identity (`facility_host` removed), and `LOCAL_FAILSAFE_TRIGGER`/`LOCAL_FAILSAFE` are removed since that fallback path no longer exists.

### Vocabulary translation

This document's brief was written in relational-schema language (tables, primary keys, foreign keys, migrations, indexes). Firestore is a schemaless document database, so every term below is the deliberate Firestore-idiomatic translation — not a different concept:

| Relational term | Firestore equivalent used throughout this document |
|---|---|
| Table | Collection (or subcollection, where hierarchy applies) |
| Row | Document |
| Primary key | Document ID |
| Foreign key | Reference field — stores the referenced document's ID (path string), not a Firestore `DocumentReference` object, for simpler client-side handling |
| Index | Firestore composite index (declared in `firestore.indexes.json`, not created ad hoc) |
| Migration | No literal migration mechanism exists (schemaless). Every document carries a `schema_version` integer field; a breaking field change is handled by a Cloud Functions backfill script, not a migration file. |
| Join | Either denormalized fields (duplicate a small amount of data at write time) or a second query keyed by a reference field — Firestore has no server-side joins |

---

## 1. Database Design Goals

Firestore is used for: real-time event ingestion (via `onSnapshot` listeners, `02_TRD.md`/`03_APP_FLOW.md`), historical events, incident tracking, zone-specific PPE policy, camera/sensor-to-zone mapping, Modbus node monitoring (as reported by the decision engine, not direct ESP32-to-Firestore writes — see Section 23), network failover state, heartbeat monitoring, system health, and notification records.

**Duplication policy:** fields are denormalized only where it materially speeds up a dashboard read that would otherwise require a second query (e.g. `zone_name` cached on an incident document so the Incident list doesn't need a lookup per row). Every denormalized field's source of truth is named explicitly in its table below.

---

## 2. Facility

**Collection:** `facilities/{facility_id}`

| Field | Type | Notes |
|---|---|---|
| `facility_id` | string (Document ID) | e.g. `STPI_HOST_01`, matches the `host_id` used throughout `02_TRD.md`'s event schema |
| `name` | string | |
| `location` | string | Optional, free text |
| `status` | enum | `ACTIVE` / `INACTIVE` |
| `current_network_mode` | enum | `LAN` / `CELLULAR` / `OFFLINE` — the **ESP32's** connectivity state (cameras are tracked independently, per-camera, not folded into this field), denormalized from `network_state/current` (Section 16) for a single-read Dashboard KPI card |
| `schema_version` | integer | Section "Vocabulary translation" |
| `created_at` / `updated_at` | timestamp | |

Nesting zones, cameras, and sensor nodes under a facility document (rather than flat top-level collections with only a `facility_id` field) makes multi-facility support (Section 27) structural rather than something every query has to remember to filter by.

---

## 3. Zones

**Collection:** `facilities/{facility_id}/zones/{zone_id}`

| Field | Type | Notes |
|---|---|---|
| `zone_id` | string (Document ID) | e.g. `WELDING_ZONE` — human-readable, matches `01_PRD.md`/`02_TRD.md` examples |
| `facility_id` | string | Denormalized (redundant with the path) so a collection-group query on `zones` can filter without parsing the document path |
| `name` | string | |
| `description` | string | |
| `floor_area` | string | Optional |
| `status` | enum | `ACTIVE` / `INACTIVE` |
| `current_priority` | enum | `P0`–`P3`, denormalized — the highest currently-open incident priority in this zone, maintained by a Cloud Functions trigger on the `incidents` collection (Section 14). Drives the Zone Overview visual hierarchy from `04_UI_UX_DESIGN_BRIEF.md` §7 without a client-side aggregation query. |
| `ppe_policy` | map | Current live policy — see Section 6 |
| `schema_version` | integer | |
| `created_at` / `updated_at` | timestamp | |

Camera-to-zone mapping is expressed by cameras living in `zones/{zone_id}/cameras` (Section 4), not a field on the zone document — a zone does not need to enumerate its cameras; the subcollection already is that mapping.

---

## 4. Cameras

**Collection:** `facilities/{facility_id}/zones/{zone_id}/cameras/{camera_id}`

| Field | Type | Notes |
|---|---|---|
| `camera_id` | string (Document ID) | e.g. `CAM_02` |
| `zone_id` | string | Denormalized (path redundancy, for collection-group queries) |
| `facility_id` | string | Denormalized, same reason |
| `name` | string | |
| `stream_config_ref` | string | **Reference only** — points to a Secret Manager / Cloud Functions environment config key holding the camera's cloud-stream connection details and any credentials (the camera must support native cloud push per `02_TRD.md` §13.1 — this is no longer a local RTSP URL). Never stored as a plain Firestore field — Section 24. |
| `status` | enum | `ONLINE` / `OFFLINE` / `DEGRADED` |
| `last_seen` | timestamp | |
| `schema_version` | integer | |
| `created_at` / `updated_at` | timestamp | |

---

## 5. Worker Tracks

**Collection:** `facilities/{facility_id}/worker_tracks/{worker_track_id}`

| Field | Type | Notes |
|---|---|---|
| `worker_track_id` | string (Document ID) | System-generated tracking ID (e.g. `TRACK_17`) — **not a personally identifying employee identity.** No name, employee ID, or biometric identifier is stored; this is an ephemeral vision-tracker handle, scoped to a single tracking session (`03_APP_FLOW.md` §8 notes re-identification across sessions is not implemented). |
| `camera_id` | string | Reference field |
| `zone_id` | string | Reference field |
| `first_seen` / `last_seen` | timestamp | |
| `status` | enum | `ACTIVE` (currently tracked) / `ENDED` (left frame / tracking lost) |
| `schema_version` | integer | |

Kept as a flat facility-level collection rather than nested under camera, since a worker's PPE event history (Section 11) is queried by `worker_track_id` independent of which camera is currently viewing them.

---

## 6. PPE Policy

Stored two ways for different needs:

**Live policy (fast read):** `zones/{zone_id}.ppe_policy` — a map field on the zone document itself:

```text
ppe_policy: {
  helmet_required:       boolean
  vest_required:         boolean
  gloves_required:       boolean
  safety_shoes_required: boolean
  policy_version:        integer
  updated_at:            timestamp
  updated_by:            string (uid)
}
```

**History (audit trail):** `facilities/{facility_id}/zones/{zone_id}/ppe_policy_history/{policy_version}` — an append-only record written by the same Cloud Function that updates the live `ppe_policy` map, one document per version, never mutated after creation.

This satisfies Section 6's "support future policy changes" without needing a join — the dashboard reads the fast live field, and History is only queried when a supervisor explicitly wants to see what a zone's policy was at a past point in time.

---

## 7. Sensor Nodes

**Collection:** `facilities/{facility_id}/zones/{zone_id}/sensor_nodes/{node_id}`

| Field | Type | Notes |
|---|---|---|
| `node_id` | string (Document ID) | |
| `zone_id` / `facility_id` | string | Denormalized, path redundancy |
| `modbus_address` | integer | Unique per bus, per `02_TRD.md` §10 |
| `node_type` | string | e.g. `ARDUINO_NANO_FLAME_SMOKE` |
| `firmware_version` | string | |
| `status` | enum | `ONLINE` / `OFFLINE` / `DEGRADED` — `DEGRADED` covers the "stuck heartbeat" case from `02_TRD.md` §11 |
| `last_seen` | timestamp | Last successful Modbus poll, as reported by the ESP32 → decision engine → Firestore write path (Section 23) |
| `heartbeat_counter` | integer | Mirrors register 40005 |
| `sensor_health` | enum | `OK` / `WARNING` / `FAULT` / `OFFLINE` — mirrors register 40004 |
| `schema_version` | integer | |
| `created_at` / `updated_at` | timestamp | |

---

## 8. Sensors

**Collection:** `facilities/{facility_id}/zones/{zone_id}/sensor_nodes/{node_id}/sensors/{sensor_id}`

`sensor_id` is a fixed, conventional string per sensor type (not auto-generated) — `flame` and `gas_smoke` for the prototype's two physical sensors per node, leaving room to add sensor types later (`01_PRD.md` §5B) without restructuring.

| Field | Type | Notes |
|---|---|---|
| `sensor_id` | string (Document ID) | `flame` \| `gas_smoke` |
| `sensor_type` | enum | `FLAME` \| `GAS_SMOKE` |
| `status` | enum | `ONLINE` / `OFFLINE` / `FAULT` |
| `raw_value` | integer | For `flame`: 0/1/2 (register 40001). For `gas_smoke`: 0–1023 (register 40002) |
| `smoke_index` | float, nullable | Only present for `gas_smoke` — 0.000–1.000, derived from register 40003. **Never** a calibrated PPM value, per `02_TRD.md` §6/§11. |
| `last_reading_at` | timestamp | |
| `health_state` | enum | `OK` / `WARNING` / `FAULT` — **derivation:** for `flame`, derived from register 40001's own value (`0`/`1` → OK, `2` → FAULT — registers 40002/40003 carry no fault code of their own); for `gas_smoke`, derived from the shared node-level register 40004 (Section 9), since it has no independent per-sensor fault code |

---

## 9. Modbus Register → Firestore Field Map

This is documentation, not a collection — it shows how the physical register map from `02_TRD.md` §11 lands in the schema above, since the ESP32 never writes to Firestore directly (Section 23); the decision engine translates.

| Register | Meaning | Data type | R/W (Modbus side) | Firestore field |
|---|---|---|---|---|
| 40001 | Flame status | uint16 enum (0/1/2) | Read-only | `sensors/flame.raw_value` |
| 40002 | Gas/smoke raw reading | uint16 (0–1023) | Read-only | `sensors/gas_smoke.raw_value` |
| 40003 | Gas/smoke normalized index | uint16 (0–1000, ÷1000 on read) | Read-only | `sensors/gas_smoke.smoke_index` |
| 40004 | Sensor health/status | uint16 enum | Read-only | `sensor_nodes/{node}.sensor_health` |
| 40005 | Node heartbeat counter | uint16, wraps at 65535 | Read-only | `sensor_nodes/{node}.heartbeat_counter` |

---

## 10. AI Events

**Collection:** `facilities/{facility_id}/ai_events/{ai_event_id}`

Kept flat (not nested under camera/zone) so a time-range or cross-zone query doesn't need a collection-group query on every read.

| Field | Type | Notes |
|---|---|---|
| `ai_event_id` | string (Document ID) | |
| `timestamp` | timestamp | |
| `host_id` | string | Reference to `facilities/{facility_id}` |
| `camera_id` | string | Reference field |
| `zone_id` | string | Reference field |
| `event_type` | enum | `WORKER` \| `HELMET` \| `VEST` \| `SAFETY_SHOES` \| `GLOVES` \| `FIRE` \| `SMOKE` |
| `class` | string | Model output class label |
| `confidence` | float | 0.0–1.0 |
| `bounding_box` | map, nullable | `{x, y, width, height}` normalized 0–1, where applicable |
| `tracking_id` | string, nullable | References `worker_tracks/{worker_track_id}` when applicable |
| `persistence_state` | enum | `CANDIDATE` / `CONFIRMED` — per the temporal confirmation logic, `02_TRD.md` §7 |
| `evidence_image_ref` | string, nullable | References `evidence/{evidence_id}` (Section 15) |
| `schema_version` | integer | |

Raw per-frame detections are **not** written here — only detections that have entered the temporal confirmation buffer are persisted, to avoid flooding Firestore with per-frame writes.

---

## 11. PPE Events

**Collection:** `facilities/{facility_id}/ppe_events/{ppe_event_id}`

| Field | Type | Notes |
|---|---|---|
| `ppe_event_id` | string (Document ID) | |
| `timestamp` | timestamp | |
| `camera_id` / `zone_id` | string | Reference fields |
| `worker_track_id` | string | Reference field |
| `event_type` | enum | `PPE_VIOLATION` |
| `priority` | enum | `P0`–`P3` (normally `P1`) |
| `helmet_status` / `vest_status` / `gloves_status` / `safety_shoes_status` | enum | `PASS` / `FAIL` / `UNKNOWN` |
| `confidence` | float | |
| `action_required` | string | e.g. `SUPERVISOR_REVIEW` |
| `evidence_image_ref` | string | References `evidence/{evidence_id}` |
| `incident_id` | string, nullable | Set once the decision engine promotes this into an Incident (Section 14) |
| `schema_version` | integer | |

---

## 12. Hazard Events (Fire/Smoke)

**Collection:** `facilities/{facility_id}/hazard_events/{hazard_event_id}`

| Field | Type | Notes |
|---|---|---|
| `hazard_event_id` | string (Document ID) | |
| `timestamp` | timestamp | |
| `camera_id` / `zone_id` | string | Reference fields |
| `event_type` | enum | `FIRE` \| `SMOKE` — **`LOCAL_FAILSAFE_TRIGGER` removed 2026-09-28:** the ESP32 no longer has independent sensor-only decision logic (`02_TRD.md` §12), so this event type can no longer occur |
| `priority` | enum | `P0`–`P3` |
| `confidence` | float | Always vision-sourced now — there is no sensor-only fallback path that would leave this null |
| `vision_evidence` | map, nullable | `{fire: bool, smoke: bool}` |
| `flame_evidence` | boolean, nullable | From `sensors/flame` at time of event |
| `smoke_gas_evidence` | map, nullable | `{gas_sensor_raw, smoke_index}` |
| `persistence_confirmed` | boolean | |
| `action_required` | string | |
| `evidence_image_ref` | string, nullable | |
| `incident_id` | string, nullable | |
| `schema_version` | integer | |

---

## 13. Contextual Decisions

**Collection:** `facilities/{facility_id}/decisions/{decision_id}`

Holds the decision engine's full reasoning snapshot — kept separate from Incidents (Section 14) because Incidents are the supervisor-facing entity with a lifecycle, while Decisions are the immutable audit record of *why* a priority was assigned.

| Field | Type | Notes |
|---|---|---|
| `decision_id` | string (Document ID) | |
| `timestamp` | timestamp | |
| `ai_event_ref` | string, nullable | Reference field |
| `sensor_event_ref` | string, nullable | Reference field into `hazard_events` or the raw sensor reading used |
| `zone_id` | string | |
| `ppe_policy_version_used` | integer, nullable | Points into `ppe_policy_history` |
| `confidence` | float | |
| `temporal_persistence_count` | integer | Number of consecutive confirming frames/polls |
| `event_history_considered` | array of string | IDs of recent prior events in this zone that fed the escalation decision |
| `priority` | enum | `P0`–`P3` |
| `event_classification` | string | e.g. `FIRE`, `PPE_VIOLATION` |
| `decision_reason` | string | Human-readable, e.g. `"Vision FIRE + Flame sensor active → P3"` (mirrors `02_TRD.md` §9's case table) |
| `escalation_state` | enum | `INITIAL` / `ESCALATED_FROM_P2` — **`LOCAL_FAILSAFE` removed 2026-09-28**, no local fallback path exists |
| `incident_id` | string | Reference — every decision produces exactly one incident |
| `schema_version` | integer | |

---

## 14. Incidents

**Collection:** `facilities/{facility_id}/incidents/{incident_id}`

The unified, supervisor-facing entity — this is what `03_APP_FLOW.md`'s Incident Center and Incident Detail read.

| Field | Type | Notes |
|---|---|---|
| `incident_id` | string (Document ID) | |
| `facility_id` / `zone_id` / `camera_id` | string | Reference fields (`camera_id` nullable for a sensor-only event) |
| `zone_name` | string | Denormalized from `zones/{zone_id}.name` for list rendering without a lookup |
| `source_event_type` | enum | `PPE_VIOLATION` \| `FIRE` \| `SMOKE` |
| `source_event_ref` | string | Reference into `ppe_events` or `hazard_events` |
| `source_decision_ref` | string | Reference into `decisions` (Section 13) |
| `priority` | enum | `P0`–`P3` |
| `timestamp` | timestamp | |
| `confidence` | float, nullable | |
| `status` | enum | `OPEN` / `ACKNOWLEDGED` / `RESOLVED` — the lifecycle introduced in `03_APP_FLOW.md` §15 as an AppFlow-level extension, not a master_approach requirement. No other status values exist; the system never auto-transitions this field. |
| `required_action` | string | |
| `evidence_ref` | string, nullable | Reference into `evidence` (Section 15) |
| `acknowledged_at` | timestamp, nullable | |
| `acknowledged_by` | string (uid), nullable | |
| `resolved_at` | timestamp, nullable | |
| `resolved_by` | string (uid), nullable | |
| `created_at` / `updated_at` | timestamp | |
| `schema_version` | integer | |

No workflow states beyond OPEN/ACKNOWLEDGED/RESOLVED are introduced — no `IN_PROGRESS`, `ESCALATED`, `DISMISSED`, etc., per the brief's own "do not invent complex workflow states" instruction. A false-positive dismissal (`03_APP_FLOW.md` §8) is recorded by resolving the incident with a `resolution_note` field (added here as the minimal necessary addition) rather than a new status value.

| Additional field | Type | Notes |
|---|---|---|
| `resolution_note` | string, nullable | Free text, set on resolve — covers "false positive" and any other resolution context without adding a new status enum value |

---

## 15. Evidence Storage

**Object storage:** Firebase Storage (same project as Firestore — Section 17 of `02_TRD.md`).
**Metadata collection:** `facilities/{facility_id}/evidence/{evidence_id}`

| Field | Type | Notes |
|---|---|---|
| `evidence_id` | string (Document ID) | |
| `incident_id` / `event_ref` | string, nullable | Whichever produced this evidence — an incident, an AI event, or a PPE event |
| `storage_path` | string | Firebase Storage object key, e.g. `evidence/{facility_id}/{evidence_id}.jpg` |
| `file_type` | string | MIME type |
| `timestamp` | timestamp | |
| `camera_id` / `zone_id` | string | |
| `created_at` | timestamp | |

The image binary itself is **never** stored as a Firestore field — only the Storage object key, per the brief's own instruction. Access is governed by Firebase Storage Security Rules mirroring the Firestore auth requirement (Section 24) — no public URLs; the dashboard requests short-lived signed URLs.

---

## 16. Network State

Tracks the **ESP32's** connectivity specifically. Camera connectivity is tracked per-camera (`cameras/{camera_id}.status`/`last_seen`, Section 4) since cameras stream independently and do not share this path.

**Current state (fast read):** `facilities/{facility_id}/network_state/current` — singleton document.

| Field | Type | Notes |
|---|---|---|
| `current_mode` | enum | `LAN` / `CELLULAR` / `OFFLINE` |
| `last_transition_at` | timestamp | |
| `connection_health` | map | `{lan_healthy: bool, cellular_healthy: bool}` |
| `updated_at` | timestamp | |

**History (append-only):** `facilities/{facility_id}/network_state_history/{transition_id}` — one document per failover/recovery event (`from_mode`, `to_mode`, `reason`, `timestamp`), written by a Cloud Function whenever `current` changes. Powers `03_APP_FLOW.md` §12's "show this transition clearly" requirement without replaying event history from scratch.

---

## 17. Heartbeats

**Collection:** `facilities/{facility_id}/heartbeats/{source_id}`

One document per heartbeat source. `source_id` is a fixed string: `esp32`, or a sensor node's `node_id` (nodes report to the backend indirectly, via the ESP32's Modbus polling — Section 11).

| Field | Type | Notes |
|---|---|---|
| `source_id` | string (Document ID) | |
| `source_type` | enum | `ESP32` \| `SENSOR_NODE` — **`FACILITY_HOST` removed 2026-09-28**, since there is no longer a single combined edge host; the ESP32 is the sole device with a persistent connectivity identity |
| `last_seen` | timestamp | |
| `status` | enum | `ONLINE` / `TIMEOUT` |
| `heartbeat_interval_seconds` | integer | CONFIGURABLE, example default 5 (`02_TRD.md` §15) |
| `timeout_seconds` | integer | CONFIGURABLE, example default 15 |
| `updated_at` | timestamp | |

**Revised 2026-09-28:** the `esp32` entry's `status = TIMEOUT` is what the dead-man's-switch (`02_TRD.md` §15) checks — and, unlike the original design, this is no longer merely a monitoring signal. The ESP32 has no local decision logic of its own (`02_TRD.md` §12), so a TIMEOUT here means emergency response (relay/siren) is genuinely unavailable, not just that a background health metric has degraded. Any dashboard surface reading this field must present it that way.

---

## 18. System Health

**Materialized rollup:** `facilities/{facility_id}/system_health/current` — a single document, kept in sync by Cloud Functions triggers on the underlying collections (`sensor_nodes`, `cameras`, `heartbeats`, `network_state`), so the Dashboard's System Health panel is one document read instead of N queries.

| Field | Type | Notes |
|---|---|---|
| `vision_inference_status` | enum | `ONLINE` / `OFFLINE` — the cloud vision inference service (renamed from `edge_ai_status`, since there is no edge device) |
| `esp32_status` | enum | `ONLINE` / `OFFLINE` / `DEGRADED` — **the single most safety-critical row on this document**, since ESP32 OFFLINE means emergency response is unavailable (Section 17) |
| `modbus_nodes` | array of map | `[{node_id, status}]` |
| `sensor_health` | array of map | `[{node_id, sensor_id, health_state}]` |
| `camera_health` | array of map | `[{camera_id, status}]` — per-camera stream connectivity, independent of ESP32 status |
| `esp32_lan_status` / `esp32_cellular_status` | enum | `ONLINE` / `OFFLINE` |
| `backend_status` | enum | `ONLINE` (implicitly — if this document is being read at all, the backend is reachable) |
| `heartbeat_status` | enum | `ONLINE` / `TIMEOUT`, mirrors `heartbeats/esp32.status` |
| `updated_at` | timestamp | |

---

## 19. Notifications

**Collection:** `facilities/{facility_id}/notifications/{notification_id}`

| Field | Type | Notes |
|---|---|---|
| `notification_id` | string (Document ID) | |
| `incident_id` | string | Reference field |
| `recipient_uid` | string | References `users/{uid}` |
| `channel` | enum | `DASHBOARD` \| `FCM` |
| `priority` | enum | `P1`–`P3` (P0 never notifies) |
| `sent_at` | timestamp | |
| `delivery_status` | enum | `SENT` / `FAILED` / `PENDING` |
| `failure_reason` | string, nullable | |

P3 notifications set `priority: P3` and are sent via FCM with `android.priority = high` / APNs `priority: 10` — the "high-priority mobile notification" requirement from `01_PRD.md` §10 is an FCM delivery-priority setting, not a separate document field.

---

## 20. Users / Auth

**Provider:** Firebase Auth (confirmed in `03_APP_FLOW.md`). Exact sign-in method (email/password vs. SSO) remains **TBD** — not frozen by master_approach.md.

**Collection:** `users/{uid}` (top-level — not facility-nested, since a user's identity is not facility-scoped even though this prototype has one facility).

| Field | Type | Notes |
|---|---|---|
| `uid` | string (Document ID) | Matches the Firebase Auth UID |
| `display_name` | string | |
| `email` | string | |
| `role_label` | enum | `SAFETY_SUPERVISOR` \| `OPERATIONS_SUPERVISOR` \| `SYSTEM_ADMINISTRATOR` — **label only, not enforced.** Per `03_APP_FLOW.md`'s explicit decision, login is identity/audit-only; every authenticated user has identical access regardless of this field. It exists for display and for audit-log attribution ("who made this change"), not for authorization checks. |
| `facility_access` | array of string, nullable | Present for future multi-facility use; **not enforced** in this build (single facility, full access) |
| `zone_access` | array of string, nullable | Same — present, not enforced |
| `notification_preferences` | map | Which event types/priorities trigger FCM push for this user (`03_APP_FLOW.md` §3, Notification Settings screen) |
| `created_at` / `updated_at` | timestamp | |

---

## 21. Relationships

```text
facilities/{facility_id}
 ├─ zones/{zone_id}
 │   ├─ cameras/{camera_id}
 │   ├─ sensor_nodes/{node_id}
 │   │   └─ sensors/{sensor_id}
 │   └─ ppe_policy_history/{policy_version}
 ├─ worker_tracks/{worker_track_id}          → references camera_id, zone_id
 ├─ ai_events/{ai_event_id}                   → references camera_id, zone_id, worker_track_id
 ├─ ppe_events/{ppe_event_id}                 → references worker_track_id, evidence_id, incident_id
 ├─ hazard_events/{hazard_event_id}           → references camera_id, zone_id, evidence_id, incident_id
 ├─ decisions/{decision_id}                   → references ai_event, sensor_event, incident_id
 ├─ incidents/{incident_id}                   → references source_event, source_decision, evidence_id
 ├─ evidence/{evidence_id}                    → references incident_id / event_ref
 ├─ network_state/current, network_state_history/{id}
 ├─ heartbeats/{source_id}
 ├─ system_health/current
 └─ notifications/{notification_id}           → references incident_id, recipient_uid

users/{uid}                                    ← referenced by incidents.acknowledged_by/resolved_by, notifications.recipient_uid, ppe_policy.updated_by
```

---

## 22. Indexes

Firestore composite indexes (declared in `firestore.indexes.json`), targeting the query patterns `04_UI_UX_DESIGN_BRIEF.md` and `03_APP_FLOW.md` actually need:

| Query | Composite index |
|---|---|
| Latest incidents, facility-wide | `incidents`: `(facility_id ASC, timestamp DESC)` |
| Active P2/P3 incidents | `incidents`: `(status ASC, priority DESC, timestamp DESC)` |
| Incidents for a zone | `incidents`: `(zone_id ASC, timestamp DESC)` |
| Event History filtered by type + date range | `ai_events` / `ppe_events` / `hazard_events`: `(event_type ASC, timestamp DESC)` |
| Event History filtered by zone + date range | Each event collection: `(zone_id ASC, timestamp DESC)` |
| Sensor node status per zone | `sensor_nodes` (collection group): `(zone_id ASC, status ASC)` |
| Stale/offline cameras | `cameras` (collection group): `(status ASC, last_seen ASC)` |
| Notification history per user | `notifications`: `(recipient_uid ASC, sent_at DESC)` |
| Worker's recent PPE history | `ppe_events`: `(worker_track_id ASC, timestamp DESC)` |

Single-field indexes (facility_id, zone_id, camera_id, event_type, priority, status, last_seen, node_id, sensor_id) are auto-indexed by Firestore by default and do not need explicit declaration — only the composite (multi-field) ones above require it.

---

## 23. API Endpoints

**Design decision, not a literal reading of the brief:** most dashboard reads are **direct Firestore client-SDK queries/listeners** governed by Security Rules (Section 24), not custom REST endpoints — building a REST API over data Firestore already serves natively would be redundant. Custom endpoints exist only where server-side validation, cross-document writes, or trusted-source authentication is required.

**Revised 2026-09-28:** ingestion no longer comes from a single Jetson-based host. It now comes from two independent sources: the cloud vision inference service (internal to the backend, not a separate caller — it writes `ai_events`/`ppe_events`/`hazard_events`/`decisions`/`incidents` directly as part of the same backend deployment) and the ESP32 (external, over HTTPS, for sensor telemetry, heartbeat, and receiving relay/siren commands).

| Endpoint | Method | Purpose | Caller | Auth |
|---|---|---|---|---|
| *(internal — no HTTP boundary)* | — | Vision inference service writes `ai_events`, `ppe_events`, `hazard_events`, `decisions`, and `incidents` directly to Firestore as part of the same backend deployment (Section 2/17 of `02_TRD.md`) | Backend internal | Backend service identity |
| `POST /ingest/sensor-telemetry` | Cloud Function (HTTPS) | ESP32 reports Modbus register readings for a node | ESP32 | Service credential, not user auth |
| `POST /ingest/heartbeat` | Cloud Function (HTTPS) | ESP32 heartbeat | ESP32 | Service credential |
| `POST /ingest/network-state` | Cloud Function (HTTPS) | ESP32 LAN/Cellular mode transition | ESP32 | Service credential |
| `GET /commands/poll` (or a persistent MQTT/HTTPS long-poll, per `02_TRD.md` §13.2) | Cloud Function or messaging channel | ESP32 checks for a pending relay/siren command | ESP32 | Service credential |
| `acknowledgeIncident` | Callable Cloud Function | Set `status = ACKNOWLEDGED`, `acknowledged_by/at` | Dashboard | Firebase Auth (any authenticated user) |
| `resolveIncident` | Callable Cloud Function | Set `status = RESOLVED`, `resolved_by/at`, optional `resolution_note` | Dashboard | Firebase Auth |
| `updatePpePolicy` | Callable Cloud Function | Write `zones/{zone_id}.ppe_policy`, append to `ppe_policy_history` | Dashboard (Configuration) | Firebase Auth |
| `updateCameraConfig` | Callable Cloud Function | Write camera cloud-stream connection details/status; never accepts a raw stream credential as a plain field | Dashboard (Configuration) | Firebase Auth |
| *(all reads: facility status, zones, cameras, incidents, event history, sensor readings, node health, system health, network status, heartbeat, evidence metadata, notifications)* | Firestore SDK query/listener | Direct read per Sections 2–20 above | Dashboard | Firestore Security Rules (`request.auth != null`) |

Evidence images themselves are fetched via short-lived Firebase Storage signed URLs, requested through a small `getEvidenceUrl` Callable Cloud Function rather than a public Storage URL (Section 24).

---

## 24. Security

| Concern | Approach |
|---|---|
| Authentication | Firebase Auth (`03_APP_FLOW.md`) |
| Authorization | Any authenticated user has full read/write access to configuration and incident actions — **no role-based restriction**, per `03_APP_FLOW.md`'s explicit decision. `role_label` is attribution-only. |
| Input validation | All writes from untrusted sources (dashboard mutations) go through Callable Cloud Functions, which validate shape/types server-side before writing — no direct client writes to `incidents`, `zones.ppe_policy`, or `cameras` |
| Secure environment variables | Section 19 of `02_TRD.md` — names only, no values, in Cloud Functions environment config / Secret Manager |
| Secret handling | Camera cloud-stream credentials, service credentials for ingestion endpoints: Secret Manager, referenced by key (Section 4), never stored as plain Firestore fields |
| Rate limiting | Ingestion endpoints (Section 23) are called by a single known ESP32 per facility, not the public internet — rate limiting here is a sanity ceiling (reject if a single device exceeds a configurable events/minute threshold) rather than abuse prevention |
| Audit logging | Firestore `onWrite` triggers on `zones/{zone_id}` (ppe_policy changes), `cameras/{camera_id}`, and `incidents/{incident_id}` (status changes) write to `facilities/{facility_id}/config_audit_log/{log_id}` — capturing `uid`, `before`, `after`, `timestamp` automatically, rather than relying on every call site to remember to log |
| Restricted evidence access | Firebase Storage Security Rules require `request.auth != null`, matching Firestore's rule — no public evidence URLs; access is via signed URL only (Section 23) |

---

## 25. Real-Time Data

Firestore `onSnapshot` listeners, matching what `03_APP_FLOW.md` §18 already assumes:

| Dashboard surface | Listener target |
|---|---|
| New incidents / P2/P3 alerts | `incidents` query: `(status == OPEN OR ACKNOWLEDGED) ORDER BY priority DESC, timestamp DESC` |
| Zone state | `zones/{zone_id}` document listener (per open Zone Detail view) |
| Sensor status | `sensor_nodes` / `sensors` document listeners (per open Zone Detail / Sensor Status view) |
| Network status | `network_state/current` document listener |
| System health | `system_health/current` document listener |

No separate WebSocket layer is introduced — Firestore's own real-time protocol covers every listed need.

---

## 26. Data Retention

No retention period is specified by master_approach.md — the values below are **CONFIGURABLE defaults**, not mandatory:

| Data | Suggested default (CONFIGURABLE) | Mechanism |
|---|---|---|
| `ai_events` (raw, non-incident-linked) | 30 days | Firestore native TTL policy on a `ttl_at` field |
| `ppe_events` / `hazard_events` not linked to an incident | 30 days | Same |
| Incidents, their linked events, and evidence | Retained indefinitely (safety audit record) | No TTL |
| `heartbeats` history (if a history collection is later added beyond the current-state doc) | 7 days | TTL |
| `network_state_history` | 90 days | TTL |
| `config_audit_log` | Retained indefinitely | No TTL |

---

## 27. Scalability

Nothing in this schema names `WELDING_ZONE`/`OFFICE_ZONE` or a fixed zone count structurally — those are example document IDs, not schema fields. The initial 1 facility / 2 zones / 2 sensor nodes / N cameras prototype and a later multi-zone, multi-camera, or multi-facility deployment use the exact same collection structure: adding a zone is adding a document to `zones`, not a schema change. Cross-zone and cross-facility queries use collection-group queries (Section 22) rather than assuming a fixed enumeration.

---

## 28. Summary for Implementation

This document is precise enough to generate Firestore Security Rules, `firestore.indexes.json`, and Cloud Functions signatures directly from the tables above — every collection, field, type, reference relationship, and index is named. No application code is included, per the brief's instruction.
