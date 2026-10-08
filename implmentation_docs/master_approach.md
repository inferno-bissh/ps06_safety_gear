# PS6 — Master Approach & Complete Prototype BOM

## Multimodal Industrial Safety & Hazard Monitoring System
### Edge AI + RS-485 Modbus + Contextual Decision Engine + LAN/4G Failover

**Problem Statement:** PS6 — AI-based factory safety monitoring for PPE, smoke and fire  
**Implementation target:** Hackathon prototype / controlled multi-zone industrial safety demonstrator  
**Document status:** Frozen implementation baseline (original, below), amended 2026-09-28 — see amendment immediately below. The original text is kept intact as historical record; the amendment is what current and future documents in this set build from.

---

## AMENDMENT — 2026-09-28 — Hardware/Architecture Revision (supersedes parts of the original below)

The project owner made a deliberate hardware/architecture decision during the Document 06 (Implementation Plan) grilling session that changes several load-bearing parts of the original design below. This amendment is the current source of truth; where it conflicts with the original text further down this document, **the amendment wins.**

### What changed

1. **No NVIDIA Jetson Orin Nano Super — no local edge-AI compute device at all.** Section 5 ("Edge AI Subsystem") and every reference elsewhere in this document to a Jetson-hosted inference pipeline no longer applies.
2. **All computation moves to the cloud backend.** PPE/fire/smoke vision inference (YOLO-class detection, tracking, temporal confirmation) and the full Contextual Decision Engine (Section 9/10 below) now run in the backend, not at the edge. This directly reverses Section 3.1 ("Edge-first AI: video should be processed locally instead of continuously uploading raw CCTV footage to the cloud") — video is now uploaded continuously to the cloud by design.
3. **Cameras must be cloud-push-capable and stream continuously and directly to the backend.** No local device pulls RTSP and forwards it — the camera itself is responsible for reaching the cloud. This reverses `PS6_Complete_BOM.md`'s explicit recommendation to "prefer RTSP-capable IP cameras rather than closed cloud-only cameras" — the new requirement is the opposite: cameras need native cloud-streaming capability (e.g. RTMP push or a vendor cloud-streaming feature), not a plain local-only RTSP camera with no local relay to consume it.
4. **The ESP32 is a pure Modbus-to-cloud gateway and remote-commanded actuator — it has zero local decision authority.** Concretely:
   - It polls the RS-485 Modbus bus (flame + gas/smoke zone nodes, register map unchanged — Section 11 below) and reports readings to the backend over a cellular (GSM) connection.
   - It receives relay/siren activation commands from the backend over that same connection and executes them.
   - It does **not** independently evaluate sensor thresholds, does **not** run any local failsafe logic, and does **not** decide on its own to fire the relay/siren under any circumstance, including total connectivity loss.
5. **Section 3.3 ("A critical local safety action must not depend on Internet access") no longer holds, by deliberate choice.** This was this project's single most-repeated safety invariant across every prior implementation document. The trade-off was surfaced explicitly to the project owner before this amendment was written, and confirmed as intentional: **a GSM/backend outage now means the siren does not fire.** There is no local fallback. Any future document in this set must not claim or imply that local emergency response is independent of connectivity — it is not.
6. **Zone sensor node MCU may be Arduino Nano or an STM8-based board** ("subnet" nodes) — both are RS-485 Modbus RTU slaves using the unchanged register map (Section 11). This is an MCU/BOM choice, not a protocol change.
7. **Connectivity assumption (author's best-effort continuity choice, not separately confirmed by the project owner — correct if wrong):** the ESP32's built-in WiFi is treated as a LAN-primary path to the backend, with the GSM/cellular connection as backup — adapting the original LAN→4G failover *concept* to the new hardware, rather than GSM being the ESP32's only connectivity path. Camera-side network connectivity (how a cloud-push camera itself reaches the internet) is left as an implementation detail.

### What did not change

- RS-485 Modbus RTU topology, addressing, termination, and the 5-register map (Section 11 below) are unchanged.
- PPE classes, PPE PASS/FAIL/UNKNOWN semantics, zone-specific PPE policy, and the P0–P3 priority model and its multimodal decision logic (Sections 6, 9, 10 below) are unchanged in *behavior* — they simply now execute in the backend instead of at the edge.
- The MQ-series sensor representation rule (raw/index, not calibrated PPM — Section 7 below) is unchanged.
- This remains a hackathon prototype, not a certified safety system (Section 23 below) — if anything, more emphatically so, given the removal of any independent local safety layer.

### Documents affected

`01_PRD.md`, `02_TRD.md`, `03_APP_FLOW.md`, `04_UI_UX_DESIGN_BRIEF.md`, and `05_BACKEND_SCHEMA.md` were all written against the original (pre-amendment) architecture below and are being revised to match this amendment. `PS6_Complete_BOM.md` also needs a corresponding hardware revision (remove Jetson, add a GSM module for the ESP32, replace the camera recommendation) — noted there, not rewritten in full here.

---

# 1. Executive Summary

The proposed PS6 solution is a multimodal, real-time industrial safety monitoring platform that combines:

1. Edge computer vision for PPE compliance, smoke and fire detection.
2. Distributed physical flame and gas/smoke sensing.
3. RS-485 Modbus RTU for robust zone-level sensor communication.
4. A local safety controller based on ESP32.
5. A contextual decision engine that combines AI events, physical sensor evidence and zone-specific safety policy.
6. Location-aware alerts containing camera, zone, event type, confidence, timestamp and evidence.
7. LAN/WAN as the primary remote communication path.
8. 4G LTE as automatic communication backup.
9. A local relay/siren that remains operational even when external connectivity is unavailable.
10. A supervisor dashboard and mobile notifications.

The system is deliberately designed as a layered architecture rather than a single AI model. Computer vision provides contextual understanding, physical sensors provide independent environmental evidence, the ESP32 provides local control and the communication layer provides resilience.

The PS requires real-time detection of safety gear compliance, smoke and fire from CCTV/video feeds or recorded footage, together with alerts containing useful location/context information. The implementation therefore treats PPE policy, hazard detection, event evidence and response as separate but connected subsystems.

---

# 2. PS6 Requirements Mapped to the Solution

| PS Requirement | Implementation |
|---|---|
| Safety gear compliance | Edge AI detects worker PPE status |
| Helmet | Dedicated PPE class / status |
| High-visibility vest | Dedicated PPE class / status |
| Protective footwear | Dedicated PPE class / status |
| Gloves where applicable | Dedicated PPE class / status |
| Smoke detection | Vision + physical gas/smoke sensor |
| Fire detection | Vision + flame sensor |
| CCTV/video input | RTSP/IP cameras or recorded video |
| Real-time operation | Local edge inference |
| Location/context | Camera ID, zone ID, floor/area, event type |
| Fast alerting | Local event engine + cloud/mobile notification |
| Industrial robustness | Temporal confirmation + multimodal evidence + zone policies |
| Communication resilience | LAN → 4G failover |
| Network-independent emergency action | Local ESP32 relay/siren |

---

# 3. Design Principles

The implementation follows these principles:

### 3.1 Edge-first AI

Video should be processed locally instead of continuously uploading raw CCTV footage to the cloud.

### 3.2 Multimodal evidence

No single sensor is treated as universally authoritative. Vision and physical sensors provide complementary evidence.

### 3.3 Local safety action

A critical local safety action must not depend on Internet access.

### 3.4 Configurable PPE policy

Different factory zones may require different PPE. PPE requirements must therefore be configurable per zone.

### 3.5 Evidence-based alerts

Every meaningful event should contain enough context for a supervisor to understand what happened.

### 3.6 Temporal confirmation

Single-frame detections should not automatically become persistent safety events.

### 3.7 Prototype-first implementation

The system should first be proven with a two-zone mock facility and then extended.

---

# 4. Final System Architecture

```text
                         ┌──────────────────────┐
                         │      CCTV / IP CAM   │
                         │  CAM-01 ... CAM-N    │
                         └──────────┬───────────┘
                                    │
                              RTSP / Video
                                    │
                                    ▼
                    ┌─────────────────────────────┐
                    │       EDGE AI COMPUTER      │
                    │                             │
                    │ YOLOv8                      │
                    │ Worker                       │
                    │ Helmet                       │
                    │ Safety Vest                  │
                    │ Safety Shoes                 │
                    │ Gloves                       │
                    │ Fire                         │
                    │ Smoke                        │
                    │ Object Tracking              │
                    │ Temporal Confirmation        │
                    └─────────────┬───────────────┘
                                  │
                              AI EVENTS
                                  │
                                  ▼
                    ┌─────────────────────────────┐
                    │     LOCAL SAFETY ENGINE     │
                    │                             │
                    │ AI Events                    │
                    │ +                           │
                    │ Modbus Sensor Events         │
                    │ +                           │
                    │ Zone PPE Policy              │
                    │ +                           │
                    │ Temporal / Confidence Rules  │
                    │             ↓                │
                    │ Context & Priority Engine    │
                    └─────────────┬───────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
          ┌──────────────────┐        ┌──────────────────┐
          │ ESP32 SAFETY     │        │ CLOUD / BACKEND  │
          │ CONTROLLER       │        │                  │
          │                  │        │ Event storage    │
          │ Modbus master    │        │ Dashboard        │
          │ Local logic      │        │ FCM alerts       │
          │ Relay control    │        │ History          │
          └────────┬─────────┘        └────────┬─────────┘
                   │                           │
             RS-485 Modbus                     │
                   │                           │
        ┌──────────┴──────────┐                │
        ▼                     ▼                │
 ┌─────────────┐       ┌─────────────┐        │
 │ ZONE NODE 1 │       │ ZONE NODE 2 │        │
 │ Arduino     │       │ Arduino     │        │
 │ Nano        │       │ Nano        │        │
 │ Flame       │       │ Flame       │        │
 │ Smoke/Gas   │       │ Smoke/Gas   │        │
 └─────────────┘       └─────────────┘        │
                                              │
                                   ┌──────────┴──────────┐
                                   │                     │
                                   ▼                     ▼
                             Web Dashboard          Mobile FCM
```

---

# 5. Edge AI Subsystem

## 5.1 Recommended edge computer

For the intended prototype, the recommended dedicated AI computer is:

**NVIDIA Jetson Orin Nano Super Developer Kit, 8 GB**

NVIDIA specifies 67 INT8 TOPS, 8 GB LPDDR5 memory and a 7–25 W module power range for the Orin Nano Super. It supports local accelerated inference and TensorRT-based deployment.

The developer kit is appropriate for development/prototyping; it should not be treated as the final production safety controller.

## 5.2 Model

Initial model:

- YOLOv8n for rapid development.
- YOLOv8s if accuracy/scene complexity justifies the additional compute.
- ONNX/TensorRT deployment on the edge computer.

The exact final model is selected after benchmarking the project's dataset and target camera resolution.

## 5.3 AI classes

The model architecture should support:

```text
Worker
Helmet
Safety-Vest
Safety-Shoes
Gloves
Fire
Smoke
```

PPE compliance should not be implemented merely as object counting. The system should associate PPE detections with individual workers and their relevant body regions.

---

# 6. PPE Compliance Engine

For every tracked worker:

```text
Worker ID
    |
    +-- Helmet       PASS / FAIL / UNKNOWN
    +-- Safety Vest  PASS / FAIL / UNKNOWN
    +-- Gloves       PASS / FAIL / UNKNOWN
    +-- Safety Shoes PASS / FAIL / UNKNOWN
```

`UNKNOWN` is important because an occluded or poorly visible body part should not automatically be treated as a violation.

## 6.1 Zone-specific PPE policy

Example:

```json
{
  "zone_id": "WELDING_ZONE",
  "required_ppe": {
    "helmet": true,
    "vest": true,
    "gloves": true,
    "safety_shoes": true
  }
}
```

Another zone may use:

```json
{
  "zone_id": "OFFICE_ZONE",
  "required_ppe": {
    "helmet": false,
    "vest": false,
    "gloves": false,
    "safety_shoes": false
  }
}
```

This makes the platform configurable rather than hard-coded.

---

# 7. Fire and Smoke Detection

Fire and smoke detection uses two independent evidence sources.

## 7.1 Visual evidence

The AI identifies:

- Visible fire
- Visible smoke
- Confidence
- Camera location
- Persistence over multiple frames

## 7.2 Physical evidence

Each sensor zone provides:

- Flame sensor status
- Gas/smoke sensor reading
- Normal/elevated/high/critical state

## 7.3 Important sensor representation rule

MQ-series gas sensors should **not** be represented as accurate universal PPM values unless a proper calibration procedure has been performed.

Use:

```text
gas_sensor_raw
```

or:

```text
smoke_index
```

for the prototype.

If the team later performs a valid calibration against a known reference, a calibrated concentration field may be added.

---

# 8. Temporal Confirmation

The AI must not create a persistent event from one noisy frame.

Example:

```text
Frame 1 → Smoke confidence 0.78
Frame 2 → Smoke confidence 0.82
Frame 3 → Smoke confidence 0.86
Frame 4 → Smoke confidence 0.88
Frame 5 → Smoke confidence 0.91
```

→ persistent visual smoke event.

The exact frame count and confidence threshold must be determined experimentally from the validation dataset.

The same principle should be applied to PPE violations where practical.

---

# 9. Contextual Decision Engine

The decision engine combines:

```text
AI event
+
physical sensor event
+
zone policy
+
confidence
+
temporal persistence
+
event history
```

It then produces a system state.

## 9.1 Final event priorities

### P0 — NORMAL

No safety violation or hazard detected.

### P1 — PPE WARNING

Examples:

- Missing helmet
- Missing vest
- Missing gloves
- Missing safety shoes

Action:

- Dashboard warning
- Supervisor notification
- Evidence snapshot
- No emergency siren by default

### P2 — SUSPICIOUS HAZARD

Examples:

- Smoke sensor elevated but camera does not confirm visible fire
- Camera detects smoke but physical sensor remains normal
- Ambiguous visual hazard

Action:

- Immediate inspection alert
- Highlight affected zone
- Preserve evidence
- Escalate if persistence increases

### P3 — CONFIRMED / HIGH-PRIORITY HAZARD

Examples:

- Persistent high-confidence visual fire
- Fire detected with supporting physical evidence
- Persistent severe hazard meeting the configured escalation policy

Action:

- High-priority mobile alert
- Dashboard alarm
- Local siren/relay
- Required action displayed

---

# 10. Multimodal Confirmation Logic

The system must not simply use:

```text
VISION OR SENSOR = CONFIRMED FIRE
```

Instead:

```text
                 HAZARD DETECTION
                       |
             ┌─────────┴─────────┐
             ▼                   ▼
        Vision evidence     Sensor evidence
             |                   |
             └─────────┬─────────┘
                       ▼
                Context Engine
                       |
          ┌────────────┼────────────┐
          ▼            ▼            ▼
       Confirmed    Suspicious    Normal
```

Examples:

### Example A

```text
Vision: FIRE
Sensor: FLAME
```

→ P3 confirmed/high-priority fire.

### Example B

```text
Vision: SMOKE
Sensor: SMOKE HIGH
```

→ P3 or configured high-priority smoke event.

### Example C

```text
Vision: SMOKE
Sensor: NORMAL
```

→ P2 visual smoke verification.

### Example D

```text
Vision: NORMAL
Sensor: SMOKE HIGH
```

→ P2 sensor hazard inspection.

### Example E

```text
Vision: FIRE
Sensor: NORMAL
```

→ high-priority visual fire event subject to confidence/persistence policy.

The exact escalation thresholds should be calibrated during testing.

---

# 11. RS-485 Modbus Sensor Network

## 11.1 Topology

Use a linear daisy-chain bus:

```text
ESP32 MASTER
    |
    +------ Zone Node 1
    |
    +------ Zone Node 2
```

For the initial prototype, two zones are sufficient.

The architecture can later be extended to additional nodes.

## 11.2 Communication

- RS-485 physical layer
- Modbus RTU
- ESP32 as master
- Arduino Nano/ATmega328P as slave nodes
- One unique Modbus address per zone

## 11.3 Termination

Use 120 Ω termination at the two physical ends of the RS-485 bus.

Do not place termination at every node.

## 11.4 Recommended register structure

Example:

```text
40001 — Flame status
40002 — Gas/smoke raw reading
40003 — Gas/smoke normalized index
40004 — Sensor health/status
40005 — Node heartbeat counter
```

Register definitions should be frozen before firmware integration.

---

# 12. Local Safety Controller

The ESP32 is responsible for safety-critical local functions within the prototype:

- Modbus polling
- Sensor status acquisition
- Local event state
- Relay/siren control
- Network-state reporting
- Local failsafe behavior

The ESP32 is not responsible for running the full YOLO model.

The Edge AI computer performs AI inference and communicates event information to the safety engine.

---

# 13. Communication Architecture

## Primary path

```text
Edge/Safety Controller
        ↓
Facility LAN/WAN
        ↓
Cloud Backend
        ↓
Dashboard / FCM
```

## Backup path

```text
LAN unavailable
        ↓
4G LTE modem
        ↓
Cloud Backend
```

## Final local path

```text
LAN unavailable
+
4G unavailable
+
critical hazard
        ↓
ESP32
        ↓
Relay
        ↓
Local Siren
```

---

# 14. Network Failover

The host periodically checks a backend endpoint or equivalent health mechanism.

Proposed initial policy:

```text
Normal LAN
    ↓
Repeated communication failures
    ↓
Switch to 4G
    ↓
Retry cloud communication
```

The exact number of timeouts should be configurable.

Do not hard-code three failures permanently until actual network tests determine an appropriate value.

---

# 15. Dead-Man's Switch

The backend expects a heartbeat from the facility host.

Example:

```text
Heartbeat interval: 5 seconds
Expected timeout: 15 seconds
```

If the backend receives no heartbeat within the configured timeout:

```text
COMMUNICATION LOSS
Facility Host: STPI_HOST_01
Last Seen: <timestamp>
```

The dead-man's switch is a communication monitoring mechanism, not a replacement for the local safety controller.

---

# 16. Event Data Model

A standard event should contain:

```json
{
  "event_id": "EVT-000123",
  "timestamp": "2026-09-28T10:30:15Z",
  "host_id": "STPI_HOST_01",
  "camera_id": "CAM_02",
  "zone_id": "WELDING_ZONE",
  "event_type": "FIRE",
  "priority": "P3",
  "confidence": 0.94,
  "vision": {
    "fire": true,
    "smoke": true
  },
  "physical_sensors": {
    "flame": true,
    "gas_sensor_raw": 812,
    "smoke_index": 0.88
  },
  "network_mode": "LAN",
  "action_required": "EVACUATE_ZONE",
  "evidence_image": "event_000123.jpg"
}
```

---

# 17. PPE Event Example

```json
{
  "event_id": "PPE-000034",
  "timestamp": "2026-09-28T10:31:04Z",
  "camera_id": "CAM_01",
  "zone_id": "ASSEMBLY_ZONE",
  "worker_id": "TRACK_17",
  "event_type": "PPE_VIOLATION",
  "priority": "P1",
  "ppe": {
    "helmet": "PASS",
    "vest": "FAIL",
    "gloves": "PASS",
    "safety_shoes": "PASS"
  },
  "confidence": 0.91,
  "action_required": "SUPERVISOR_REVIEW",
  "evidence_image": "ppe_000034.jpg"
}
```

---

# 18. Supervisor Dashboard

The dashboard should show:

## Facility overview

- Total cameras
- Active zones
- Current network mode
- System health
- Active incidents

## Zone view

- Zone name
- Camera
- Worker count
- PPE compliance
- Fire state
- Smoke state
- Physical sensor state

## Incident panel

- Priority
- Event
- Location
- Timestamp
- Confidence
- Sensor evidence
- AI evidence
- Snapshot
- Required action

## System health

- Edge AI online/offline
- ESP32 online/offline
- Modbus nodes online/offline
- LAN/4G state
- Last heartbeat
- Sensor health

---

# 19. Alerting

## P1

Supervisor dashboard notification.

## P2

Immediate dashboard warning and mobile notification.

## P3

High-priority mobile notification, dashboard alarm and local siren/relay according to configured policy.

The notification should contain:

```text
EVENT
LOCATION
TIME
CONFIDENCE
EVIDENCE
REQUIRED ACTION
```

---

# 20. Implementation Roadmap

## Phase 0 — Hardware bring-up

Verify:

- Jetson
- ESP32
- Arduino Nano nodes
- RS-485 transceivers
- Flame sensors
- MQ sensors
- Relay
- Siren
- 4G modem

Do not start full integration until each subsystem works independently.

## Phase 1 — AI pipeline

1. Prepare PPE/fire/smoke datasets.
2. Train/fine-tune YOLO.
3. Validate class balance.
4. Evaluate precision/recall/mAP.
5. Export to ONNX.
6. Deploy using TensorRT.
7. Benchmark latency and FPS.

## Phase 2 — Camera pipeline

1. Connect two IP cameras or equivalent video sources.
2. Configure RTSP.
3. Map camera → zone.
4. Implement tracking.
5. Implement temporal confirmation.
6. Generate structured events.

## Phase 3 — Sensor network

1. Build Zone 1.
2. Build Zone 2.
3. Implement Modbus registers.
4. Validate polling.
5. Add node heartbeat.
6. Add sensor-health reporting.

## Phase 4 — Decision engine

Integrate:

```text
AI
+
Sensors
+
Zone Policy
+
Temporal Logic
+
Priority
```

## Phase 5 — Local safety response

Test:

```text
P3 event
    ↓
ESP32
    ↓
Relay
    ↓
Siren
```

with no cloud dependency.

## Phase 6 — Cloud and dashboard

Implement:

- event ingestion
- dashboard
- history
- evidence images
- FCM notifications

## Phase 7 — LAN/4G failover

Test:

1. LAN healthy.
2. LAN disconnected.
3. 4G becomes active.
4. LAN restored.
5. 4G disconnected.
6. Both unavailable.
7. Local critical event still activates siren.

## Phase 8 — Final validation

Run controlled scenarios and record quantitative measurements.

---

# 21. Demonstration Scenarios

## Scenario A — PPE violation

A worker enters a zone without a required helmet or vest.

Expected:

```text
Worker tracked
↓
PPE violation persists
↓
P1 event
↓
Dashboard
↓
Evidence image
```

## Scenario B — Confirmed fire

A controlled fire/flame is detected by both camera and physical sensor.

Expected:

```text
Vision fire
+
Flame sensor
↓
P3
↓
Dashboard
+
FCM
+
Local siren
```

## Scenario C — Smoke-only sensor event

Gas/smoke sensor becomes elevated while visual fire is absent.

Expected:

```text
Sensor elevated
↓
P2
↓
Inspection alert
```

## Scenario D — Visual smoke event

AI detects persistent smoke while physical sensor remains normal.

Expected:

```text
Visual smoke
↓
P2
↓
Verification alert
```

## Scenario E — Complete network loss

LAN and 4G are disconnected during a critical hazard.

Expected:

```text
Critical hazard
↓
ESP32 local logic
↓
Relay
↓
Siren
```

No cloud connection should be required for the local response.

---

# 22. Performance and Evaluation Plan

Measure:

## AI accuracy

- Precision
- Recall
- mAP@50
- mAP@50-95
- F1 score

## Real-time performance

- FPS
- AI inference latency
- End-to-end event latency

## Alert performance

- Detection → dashboard
- Detection → FCM
- Detection → siren

## Communication

- LAN failover time
- 4G connection time
- Recovery time after LAN restoration
- Heartbeat loss detection time

## Robustness

Test under:

- Low lighting
- Bright lighting
- Motion blur
- Partial occlusion
- Crowded scenes
- Dust
- Steam
- Different camera angles
- Small fire
- Large fire
- Smoke without visible flame

## False alarms

Record:

```text
False fire
False smoke
False PPE violation
Missed fire
Missed smoke
Missed PPE violation
```

---

# 23. Safety and Prototype Boundaries

This is a hackathon prototype, not a certified industrial fire/life-safety system.

The local siren demonstration must use a controlled test environment.

Do not connect the prototype relay directly to industrial machinery, mains switching, fire suppression equipment or evacuation infrastructure without appropriate electrical protection, engineering review and certification.

Use a low-voltage demonstration load wherever possible.

---
