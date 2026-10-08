# PS6 — Technical Requirements Document (TRD)

## Multimodal Industrial Safety & Hazard Monitoring System
### RS-485 Modbus + Cloud-Based Contextual Decision Engine + GSM-Connected Local Actuation

**Document:** 02 — TRD (Technical Requirements Document)
**Source of truth:** `master_approach.md` (as amended 2026-09-28) and `PS6_Complete_BOM.md` (as amended). Nothing in this document overrides those; where the source left a choice open, this document makes it and says so explicitly.
**Companion document:** `01_PRD.md` — product behavior (WHAT/WHY). This document is HOW: technologies, protocols, interfaces, schemas, and constraints.
**Revision note (2026-09-28):** This document is a full rewrite of the original TRD, following the architecture amendment in `master_approach.md`. **The original design's edge-first AI, Jetson-hosted decision engine, and ESP32 defense-in-depth local failsafe no longer apply.** There is no local edge-AI compute device; all vision and decision computation runs in the cloud backend; the ESP32 has zero local decision authority.

### Status legend used throughout this document

| Tag | Meaning |
|---|---|
| **REQUIRED** | Fixed by master_approach.md (as amended) / the BOM. Not a choice. |
| **TRD DECISION** | The source left this open. This document picks one and states the reasoning. |
| **CONFIGURABLE** | Must be exposed as a runtime/config parameter, not hard-coded. |
| **OPTIONAL / FUTURE** | Not required for the prototype. |
| **TBD AFTER TESTING** | The exact value can only be set from real data/hardware behavior. |

---

## 1. System Architecture

```text
CCTV / IP Camera (CAM-01 .. CAM-N)  ── cloud-push capable, own network connectivity ──┐
                                                                                        │
                                                                              continuous stream
                                                                                        │
                                                                                        ▼
                                                                          ┌─────────────────────────┐
                                                                          │      CLOUD BACKEND       │
                                                                          │                          │
                                                                          │  Vision inference (YOLO) │
                                                                          │  Contextual Decision      │
                                                                          │  Engine (P0-P3)           │
                                                                          │  Event storage             │
                                                                          │  Evidence storage           │
                                                                          │  Dashboard APIs               │
                                                                          │  FCM notifications              │
                                                                          └───────────┬─────────────────┘
                                                                                      │  ▲
                                                                     relay/siren command │  │ sensor telemetry + heartbeat
                                                                                      ▼  │
                                                                          LAN/WiFi (primary) or
                                                                          Cellular/GSM (backup)
                                                                                      │
                                                                                      ▼
                                                                          ┌─────────────────────┐
                                                                          │        ESP32          │
                                                                          │  Modbus master          │
                                                                          │  Sensor telemetry relay  │
                                                                          │  Remote-commanded relay/  │
                                                                          │    siren actuator only    │
                                                                          │  (no local decision logic)│
                                                                          └───────────┬─────────────┘
                                                                                      │  RS-485 Modbus RTU
                                                                                      ▼
                                                                          Zone Node 1 .. Zone Node N
                                                                          (Arduino Nano or STM8)
                                                                          Flame sensor + Gas/Smoke sensor
```

### Component/host allocation (TRD DECISION, revised)

| Component | Host | Reasoning |
|---|---|---|
| Camera capture + upload | The camera itself | No local relay device exists (confirmed during this document's grilling). Cameras must be selected for native cloud-streaming capability (e.g. RTMP push or a vendor cloud-streaming feature) — a plain local-RTSP-only camera cannot fulfill this role. |
| Vision inference (YOLO) | Cloud backend | Moved from the (now-removed) Jetson per the architecture amendment. |
| Contextual Decision Engine | Cloud backend | Same reasoning — there is no local compute device to host it on. |
| RS-485 Modbus master | ESP32 | Unchanged — REQUIRED. |
| Sensor telemetry relay to backend | ESP32, over LAN/WiFi (primary) or cellular/GSM (backup) | ESP32 has built-in WiFi (primary path) plus an added GSM module (backup path) — TRD DECISION, adapting the original LAN→4G failover *concept* to the new hardware. Not separately re-confirmed by the project owner; flagged for correction if wrong. |
| Relay/siren actuation | ESP32, executing a command received from the backend | ESP32 has zero local decision authority — it does not evaluate sensor thresholds itself under any circumstance, including total connectivity loss. |
| `host_id` identity (e.g. `STPI_HOST_01`) | The ESP32 (as the sole device with a persistent facility-side identity and heartbeat) | Cameras report to the backend independently and do not share the ESP32's connectivity path, so they are tracked separately (Section 11) rather than folded into a single "facility host" concept. |

**Non-negotiable limitation, stated explicitly:** if the ESP32 cannot reach the backend (both LAN/WiFi and cellular unavailable), sensor readings stop arriving and no relay/siren command can be issued or executed. There is no local fallback. This is a deliberate, accepted trade-off from the architecture amendment, not a gap to be engineered around within this document's scope.

---

## 2. Cloud Compute (replaces the original "Edge Computer" section)

There is no local edge-AI compute device in this build. All vision inference and decision-engine logic run as backend services.

| Layer | TRD DECISION | Notes |
|---|---|---|
| Vision inference runtime | Python, Ultralytics YOLO, OpenCV, ONNX Runtime | Same model family as originally planned (Section 3) — only the execution host changed, not the model architecture |
| GPU acceleration | A cloud GPU instance (e.g. a managed inference endpoint or a GPU-backed VM/container), sized after Phase 6 benchmarking | Running YOLO-class inference at video-stream rates is not practical on a serverless/CPU-only function; this must be a provisioned GPU-backed service, not Cloud Functions |
| Decision engine runtime | Python, co-located with or adjacent to the vision inference service | Kept in the same backend deployment to avoid an extra network hop between "AI event produced" and "decision computed" |
| Video ingestion | Receives the continuous stream pushed by each camera (protocol per Section 13) | |

**Important constraint carried forward unchanged:** whatever cloud compute is provisioned here remains a prototyping/demonstration setup — it must not be represented as a certified production safety system (`master_approach.md` §23, unchanged by the amendment).

---

## 3. Computer Vision

| Item | Value | Status |
|---|---|---|
| Initial model | YOLOv8n | REQUIRED (starting point) |
| Alternative | YOLOv8s | REQUIRED to evaluate after benchmarking; final choice TBD AFTER TESTING |
| Deployment | ONNX, served from the cloud compute layer (Section 2) — **TensorRT is dropped**, since TensorRT specifically targets NVIDIA Jetson/embedded deployment, which no longer exists in this architecture | TRD DECISION, revised |
| Classes | Worker, Helmet, Safety-Vest, Safety-Shoes, Gloves, Fire, Smoke | REQUIRED, fixed set, unchanged |

### PPE is not object counting (unchanged)

PPE detections must be associated with an individual tracked worker and the relevant body region — not counted as anonymous objects in a frame.

### Required pipeline stages (unchanged in behavior, now backend-hosted)

1. Detection (per-frame, per-class, with confidence score) on the received video stream.
2. Object tracking — persistent worker ID across frames (CONFIGURABLE tracker choice; exact tracker TBD AFTER TESTING).
3. Camera-to-zone mapping — a static CONFIGURABLE mapping (`camera_id → zone_id`).
4. Temporal confirmation (Section 7) before any detection becomes an event.
5. Structured event generation (Section 16).

---

## 4. PPE Engine

Unchanged from the original design — this logic now executes in the backend rather than at the edge, but its behavior is identical:

```text
Worker ID
  ├─ Helmet        : PASS | FAIL | UNKNOWN
  ├─ Safety Vest    : PASS | FAIL | UNKNOWN
  ├─ Gloves         : PASS | FAIL | UNKNOWN
  └─ Safety Shoes   : PASS | FAIL | UNKNOWN
```

UNKNOWN is REQUIRED for occluded/unclear regions — never defaulted to FAIL.

---

## 5. Zone Policy Engine

Unchanged. PPE requirements remain CONFIGURABLE per zone, loaded by the backend decision engine from zone configuration (not hard-coded), independent of the vision model:

```text
WELDING_ZONE:
  helmet       = true
  vest         = true
  gloves       = true
  safety_shoes = true

OFFICE_ZONE:
  helmet       = false
  vest         = false
  gloves       = false
  safety_shoes = false
```

---

## 6. Fire/Smoke Detection

Unchanged in evidence structure — two independent sources, cross-checked by the decision engine (Section 9).

### Vision (now from the backend's inference on the streamed video)
- Fire: boolean + confidence
- Smoke: boolean + confidence
- Persistence (Section 7)
- Camera / zone location

### Physical (from zone sensor nodes, via Modbus — Section 11, relayed by the ESP32)
- Flame sensor status
- Gas/smoke sensor: raw reading + derived state (normal / elevated / high / critical)

### Sensor representation rule (REQUIRED, unchanged)

MQ-series sensors are represented as `gas_sensor_raw` and/or `smoke_index` — never as a calibrated PPM concentration.

---

## 7. Temporal Confirmation

Unchanged. Single-frame detections must not become events; confirmation requires a CONFIGURABLE number of consecutive frames at or above a CONFIGURABLE confidence threshold, TBD AFTER TESTING. This logic now runs in the backend against the continuous camera stream rather than against a locally-captured RTSP feed — the requirement itself is unaffected by where it executes.

---

## 8. Contextual Decision Engine

Unchanged behavior — now hosted entirely in the cloud backend (Section 2), not split between an edge device and the cloud.

| Priority | Name | Meaning |
|---|---|---|
| P0 | NORMAL | No safety violation or hazard |
| P1 | PPE WARNING | Dashboard warning, supervisor notification, evidence snapshot, no siren by default |
| P2 | SUSPICIOUS HAZARD | Immediate inspection alert, zone highlighted, evidence preserved, escalates on persistence |
| P3 | CONFIRMED / HIGH-PRIORITY HAZARD | High-priority mobile alert, dashboard alarm, backend commands the ESP32 to activate the relay/siren |

---

## 9. Multimodal Decision Rules

Unchanged — still REQUIRED, still must not be implemented as `VISION OR SENSOR = CONFIRMED FIRE`:

| Vision | Physical sensor | Result |
|---|---|---|
| FIRE | Flame sensor active | P3 |
| SMOKE | Smoke sensor HIGH | P3, or configured high-priority event |
| SMOKE | Normal | P2 |
| Normal | Smoke sensor HIGH | P2 |
| FIRE | Normal | High-priority visual event, subject to confidence/persistence policy |

Exact escalation thresholds are CONFIGURABLE, TBD AFTER TESTING.

**The ESP32 local-failsafe exception from the original design (§9/§12.2) no longer exists.** There is no fallback path where the ESP32 independently evaluates sensor-only evidence — every priority decision, with no exception, is made by the backend.

---

## 10. RS-485 / Modbus

Unchanged from the original design:

| Item | Value | Status |
|---|---|---|
| Physical layer | RS-485 | REQUIRED |
| Protocol | Modbus RTU | REQUIRED |
| Topology | Linear daisy-chain bus | REQUIRED |
| Master | ESP32 | REQUIRED |
| Slave nodes | Arduino Nano **or an STM8-based board** | REQUIRED role, MCU choice open per the architecture amendment — both implement the same register map (Section 11) |
| Initial node count | 2 (matches the BOM's 2-zone baseline) | REQUIRED for this build; node-count-agnostic architecturally |
| Addressing | One unique Modbus address per zone node | REQUIRED |
| Termination | 120 Ω at the two physical bus ends only | REQUIRED |

---

## 11. Modbus Register Map

**Unchanged — frozen, must not be reinterpreted:**

| Register | Name | Data type | Range / values | Access |
|---|---|---|---|---|
| 40001 | Flame status | uint16 (enum) | 0 = normal, 1 = flame detected, 2 = sensor fault | Read-only |
| 40002 | Gas/smoke raw reading | uint16 | 0–1023 (10-bit ADC) | Read-only |
| 40003 | Gas/smoke normalized index | uint16 | 0–1000 → `smoke_index` 0.000–1.000 | Read-only |
| 40004 | Sensor health/status | uint16 (enum) | 0 = OK, 1 = WARNING, 2 = FAULT, 3 = OFFLINE | Read-only |
| 40005 | Node heartbeat counter | uint16 | Monotonically incrementing, wraps at 65535 | Read-only |

Polling, error handling, and heartbeat behavior are unchanged from the original design (round-robin polling, CONFIGURABLE poll interval, missed-poll and stuck-heartbeat fault classes). The one change: the ESP32 now forwards every register value to the backend (Section 13), rather than to a local decision engine — the register semantics themselves are untouched.

**Camera-side connectivity is tracked separately** (last-frame-received timestamp per camera, reported by the backend's ingestion layer), since cameras stream directly and do not share the ESP32's Modbus/connectivity path.

---

## 12. ESP32 — Sensor Gateway and Remote-Commanded Actuator (replaces "ESP32 Safety Controller")

**Revised responsibilities:**
- Modbus polling (master)
- Sensor telemetry relay to the backend (LAN/WiFi primary, cellular/GSM backup)
- Heartbeat reporting to the backend
- Executing relay/siren commands received from the backend

**Explicitly removed from this document (present in the original TRD, no longer applicable):**
- Local event state derived independently of the backend
- Any local failsafe/watchdog logic
- Any local threshold evaluation of sensor readings
- Any ability to activate the relay/siren without an explicit backend command

**Firmware framework (TRD DECISION, unchanged from the original reasoning):** Arduino framework — faster iteration, wide library support (Modbus master, MQTT/HTTP client, WiFi, GSM modem AT-command libraries) for a hackathon timeline.

### 12.1 Normal operation

The ESP32 polls the RS-485 bus (Section 11) and forwards sensor telemetry plus its own heartbeat to the backend over its primary (LAN/WiFi) or backup (cellular/GSM) connection. When the backend determines a relay/siren action is required (via the decision engine, Section 8), it sends a command to the ESP32, which executes it immediately.

### 12.2 Total connectivity loss

**There is no fallback behavior here.** If the ESP32 cannot reach the backend by either path, it continues polling the local Modbus bus (so readings are ready to send once connectivity returns) but cannot report them, cannot receive commands, and cannot activate the relay/siren under any condition — including a genuine physical hazard. This is the explicit, accepted trade-off from the architecture amendment.

---

## 13. Communication

### 13.1 Camera → Backend (TRD DECISION)

Cameras must support native cloud-streaming (continuous push), since no local relay device exists to pull RTSP and forward it. Exact protocol (RTMP push, a vendor SDK/cloud-streaming feature, or WebRTC) is a camera-selection decision, TBD — the requirement is: the camera itself initiates and maintains an outbound connection to the backend's ingestion endpoint, requiring no local intermediary device.

### 13.2 ESP32 → Backend (TRD DECISION)

```text
Primary: ESP32 → Facility LAN/WiFi → Backend
Backup:  LAN unavailable → Cellular (GSM module on the ESP32) → Backend
```

Protocol: HTTPS to the backend's ingestion API (Section 17), consistent across both network interfaces — only the underlying transport changes. A persistent connection (e.g. MQTT to a cloud-hosted broker) is an acceptable alternative for lower-latency command delivery; either is compatible with this architecture. Exact choice TBD AFTER TESTING against the GSM module's actual throughput/latency characteristics.

### 13.3 No further path

Once both ESP32 connectivity options are exhausted, there is no third path. This differs fundamentally from the original design's "ESP32 → Relay → Local Siren, no cloud dependency" final path, which no longer exists.

---

## 14. Network Failover

**REQUIRED logic, adapted to the new hardware:**
```text
Normal LAN/WiFi → repeated communication failures → switch to cellular/GSM → retry backend communication
```

| Parameter | Status |
|---|---|
| Number of consecutive failures before switching to cellular | CONFIGURABLE, TBD AFTER TESTING |
| Retry/backoff behavior on cellular | CONFIGURABLE |
| Behavior on LAN restoration | REQUIRED to detect and switch back, exact re-check interval CONFIGURABLE |

This governs the ESP32's connection to the backend only. Camera connectivity (Section 13.1) is independent and not covered by this failover logic — a camera going offline is a separate fault class (Section 11's "last-frame-received" tracking), not a LAN/GSM failover event.

---

## 15. Dead-Man's Switch

**REQUIRED, scoped to Backend ↔ ESP32 monitoring (revised from "Backend ↔ Host," since there is no longer a single combined facility host):**

| Parameter | Example value | Status |
|---|---|---|
| Heartbeat interval | 5 seconds | CONFIGURABLE |
| Expected timeout | 15 seconds | CONFIGURABLE |

On timeout, the backend/dashboard shows a communication-loss state for the ESP32 with a last-seen timestamp.

**This is no longer "just" a monitoring signal.** Because the ESP32 has no local decision authority (Section 12), a dead-man's-switch timeout for the ESP32 is functionally identical to "emergency response is currently unavailable" — the dashboard must present it that way (Section 18 of `04_UI_UX_DESIGN_BRIEF.md`, to be revised accordingly), not merely as a background health indicator.

---

## 16. Event Data Model

Unchanged field-level structure from the original design (Section 16 hazard event, PPE event schemas) — `network_mode` now reflects the ESP32's LAN/WiFi vs. cellular state specifically, and there is no `LOCAL_FAILSAFE_TRIGGER` event type, since that fallback path no longer exists. All other fields (event_id, timestamp, host_id, camera_id, zone_id, event_type, priority, confidence, vision, physical_sensors, action_required, evidence_image; and the PPE event's worker_id/ppe fields) are unchanged.

---

## 17. Backend

Unchanged reasoning from the original TRD decision — Firebase/Firestore + Cloud Functions + FCM remains the backend choice (confirmed independently in `05_BACKEND_SCHEMA.md`). What changes here: the backend now also hosts the GPU-backed vision inference service (Section 2), which is a different deployment shape than Cloud Functions (Cloud Functions cannot practically run continuous video-stream YOLO inference) — this inference service sits alongside Firestore/Cloud Functions in the same backend, ingesting camera streams directly and writing structured events into Firestore once produced.

---

## 18. Dashboard

Unchanged (Next.js/React/Tailwind, Firestore listeners) — see Section 21 of `03_APP_FLOW.md` note on communication-loss messaging, which must be revised to remove any "local siren still active" reassurance.

---

## 19. Environment Variables

Revised — Jetson-specific variables removed, GSM and cloud-vision variables added.

### Required — Backend / Cloud Vision
```text
BACKEND_PROJECT_ID
BACKEND_API_KEY
BACKEND_SERVICE_ACCOUNT_PATH
FCM_SENDER_ID
VISION_MODEL_PATH
VISION_GPU_ENDPOINT
CAMERA_INGEST_ENDPOINT
CAMERA_ZONE_MAP_PATH
ZONE_POLICY_CONFIG_PATH
```

### Required — ESP32
```text
ESP32_HOST_ID
BACKEND_INGEST_URL
WIFI_SSID
WIFI_PASSWORD
GSM_APN
GSM_MODEM_UART_PINS
```

### Hardware-specific — Modbus
```text
MODBUS_SERIAL_PORT
MODBUS_BAUD_RATE
MODBUS_NODE_ADDRESSES
RELAY_GPIO_PIN
SIREN_GPIO_PIN
```

### Optional / development-only
```text
LOG_LEVEL
DEV_MOCK_SENSOR_DATA
DASHBOARD_LOCAL_API_BASE_URL
```

---

## 20. Folder / Repository Structure

Revised — the `edge-ai/` and `decision-engine/` directories from the original design move under `backend/` (since there is no separate edge device to host them), and `firmware/esp32-controller/` drops any failsafe-related module.

```text
ps6/
├── backend/
│   ├── vision-inference/      # YOLO model serving, GPU-backed, receives camera streams directly
│   ├── decision-engine/        # P0-P3 logic, multimodal decision table (unchanged behavior)
│   ├── zone_policy/             # zone PPE policy loader
│   ├── functions/                # Cloud Functions: ingestion API, callable mutations, audit triggers
│   └── firestore-rules/
│
├── firmware/
│   ├── esp32-gateway/          # Arduino-framework firmware: Modbus master, telemetry relay, remote-commanded actuator only
│   └── zone-node/               # Arduino Nano or STM8 firmware: Modbus RTU slave, flame + gas/smoke acquisition
│
├── dashboard/                    # Next.js/React/Tailwind app
│
├── shared-schemas/                # Event/PPE event schema definitions
│
├── config/                        # Zone definitions, PPE policy defaults, escalation thresholds
│
├── tests/
│
└── docs/
    ├── 01_PRD.md
    ├── 02_TRD.md
    └── master_approach.md
```

---

## 21. Technical Constraints

| Constraint | Status |
|---|---|
| Prototype-first: build and validate the initial mock facility before scaling | Unchanged |
| Initial 2-zone deployment (architecture remains zone-count-agnostic) | Unchanged |
| ~~Edge-first AI~~ — **superseded:** all vision/decision computation is cloud-based | Amended |
| ~~Local safety response must not depend on Internet access~~ — **superseded:** emergency response fully depends on ESP32-to-backend connectivity | Amended |
| RS-485 Modbus RTU for zone sensor communication | Unchanged |
| ESP32 LAN/WiFi is the primary path to the backend | Amended (was: facility LAN as primary path for a Jetson-hosted host) |
| Cellular/GSM is the ESP32's automatic backup path | Amended (was: 4G LTE on the Jetson) |
| ~~Local siren/relay is the final fallback, independent of cloud/WAN~~ — **removed entirely**, no fallback exists | Amended |
| PPE policies configurable per zone, without model changes | Unchanged |
| Temporal confirmation required before any event is raised | Unchanged |
| Multimodal evidence required; single-source confirmation forbidden | Unchanged (no exception remains — the ESP32 fallback exception is gone) |
| MQ-series sensors represented as raw/index only, never as calibrated PPM | Unchanged |
| No control of industrial machinery or mains-voltage systems | Unchanged |
| Low-voltage demonstration load only | Unchanged |
| Not a certified safety system | Unchanged (more emphatically true now, given the removed local safety layer) |

---

## 22. Performance Requirements

Unchanged categories — Precision/Recall/mAP/F1, FPS/inference latency/end-to-end latency, alert latencies, network failover/recovery/heartbeat timing. Note: "end-to-end event latency" now includes camera-to-cloud upload time, which did not exist as a factor in the original edge-hosted design and should be measured explicitly.

---

## 23. Test Environment

Unchanged visual robustness conditions (lighting, occlusion, crowding, dust, steam, angle, fire/smoke scale variations).

**Network/communication failure conditions, revised:**
LAN failure (ESP32), cellular/GSM failure (ESP32), complete ESP32 connectivity loss (both unavailable — this is now a "no response is possible" test, not a fallback-path test), camera stream interruption, sensor node failure, Modbus communication failure.

Each connectivity-loss scenario must be run with an active physical hazard present specifically to confirm and document that **no siren activation occurs** — this is now a required negative-result test (confirming the accepted limitation behaves as designed), not a resilience test.
