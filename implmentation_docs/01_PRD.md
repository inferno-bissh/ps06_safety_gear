# PS6 — Product Requirements Document (PRD)

## Multimodal Industrial Safety & Hazard Monitoring System
### Edge AI + RS-485 Modbus + Contextual Decision Engine + LAN/4G Failover

**Document:** 01 — PRD (Product Requirements Document)
**Source of truth:** `master_approach.md` (frozen architecture, as amended 2026-09-28) and `PS6_Complete_BOM.md` (hardware baseline). This PRD does not alter, replace, or simplify anything defined there.
**Revision note (2026-09-28):** This document has been revised to match the architecture amendment in `master_approach.md` — no local edge-AI compute device, all vision/decision computation in the cloud backend, and no independent local emergency response. Passages below reflect the amended architecture, not the original pre-amendment design.
**Companion document:** Technical implementation detail (code structure, exact JSON payloads, Modbus register maps, model training pipelines) is intentionally excluded here and belongs to Document 02 — TRD.
**Document status:** Implementation-ready — intended to be read without further product clarification by a coding agent, hardware/firmware developer, ML engineer, backend developer, and frontend developer.

---

## 1. Product Overview

| Field | Value |
|---|---|
| Product name | PS6 — Multimodal Industrial Safety & Hazard Monitoring System |
| Tagline | Edge AI + RS-485 Modbus + Contextual Decision Engine + LAN/4G Failover |
| Problem statement | PS6 — AI-based factory safety monitoring for PPE, smoke and fire |
| Implementation target | Hackathon prototype / controlled multi-zone industrial safety demonstrator |
| Intended prototype scope | A zone-count-agnostic, data-driven industrial safety platform, demonstrated on a minimal multi-zone mock facility |
| Primary value proposition | Confirms hazards and PPE violations using independent visual and physical evidence, applies zone-specific safety policy, and keeps local emergency response working even when all network paths fail |

### Product vision

A factory floor is monitored continuously by cameras and physical sensors working together, rather than by either alone. Detected hazards and PPE violations are placed in context — which zone, what policy applies there, how confident the detection is, whether it has persisted, and whether independent evidence agrees — before anyone or anything is alerted. All of this evaluation happens in the cloud backend; when connectivity between the ESP32 and the backend is unavailable, emergency response is unavailable too (Section 12).

### Product objective

Give a supervisor a single place to see facility-wide safety state (PPE compliance, fire/smoke status, sensor and system health) and give the facility itself a way to act on a confirmed hazard without waiting on a dashboard, an app, or an internet connection.

### Product architecture, in one sentence

Cameras stream continuously to a cloud backend, which runs both the computer vision (PPE/fire/smoke detection) and the contextual decision engine; physical sensors provide independent environmental evidence relayed to that same backend by the ESP32 over cellular; and the ESP32 executes the relay/siren commands the backend sends back — every part of this system, including the emergency response, depends on connectivity reaching the backend.

### What this platform combines

1. Cloud-based computer vision (run in the backend on continuously streamed camera video) for PPE compliance, smoke, and fire detection.
2. Distributed physical flame and gas/smoke sensing, independent of the camera.
3. RS-485 Modbus RTU for zone-level sensor communication.
4. An ESP32 sensor gateway and remote-commanded actuator (polls Modbus, reports to the backend over cellular, executes relay/siren commands the backend sends back — no independent local decision logic).
5. A contextual decision engine, running in the cloud backend, that combines AI events, physical sensor evidence, and zone-specific safety policy.
6. Location-aware alerts (camera, zone, floor/area, event type).
7. LAN/WiFi as the ESP32's primary path to the backend.
8. Cellular (GSM) as the ESP32's automatic communication backup.
9. A relay/siren, commanded remotely by the backend — **this build has no independent local fallback**; if connectivity to the backend is lost, the siren does not fire. This is a deliberate, accepted trade-off (Section 12), not an oversight.
10. A supervisor dashboard.
11. Mobile notifications.

---

## 2. Problem Being Solved

| Problem | Why it matters |
|---|---|
| Workers may enter a zone without the PPE that zone requires | Different zones (e.g. a welding bay vs. an office) carry different risk, so a single global PPE rule either over-restricts or under-protects |
| Smoke or fire needs to be caught quickly | Delayed detection increases harm; the system must operate on a live or recorded feed, not after-the-fact review |
| Camera-only hazard detection can be ambiguous | Smoke-like conditions (steam, dust, glare) can be visually similar to a real hazard; vision alone can both miss and over-trigger |
| Sensor-only hazard detection can also be ambiguous | A gas/smoke sensor can drift, read locally, or be triggered by something other than a fire; sensor alone is not proof either |
| A network outage disables emergency response in this build | **This is an accepted limitation, not a solved problem.** All detection and the decision to fire the relay/siren happen in the cloud backend; a connectivity outage between the ESP32 and the backend means the siren does not fire. See Section 12. |
| Supervisors need context, not a bare alarm | "Alarm" with no location, confidence, or evidence forces a supervisor to investigate blind; every alert should already answer "where, how sure, and what do I do" |
| Events need location, timestamp, confidence, and evidence | Without these, an event cannot be audited, trusted, or acted on efficiently |

The system streams camera video **continuously to the cloud backend**, where it is processed — this build does not perform local, on-site video inference. Structured events, once generated by the backend, are what the dashboard and mobile notifications consume.

---

## 3. Target Users

### A. Safety Supervisor
- **Goals:** Know the facility's safety state at a glance; act quickly on real hazards; not be flooded by noise.
- **Interactions:** Monitors facility safety, reviews incidents, receives mobile/dashboard alerts, reviews evidence (snapshot + sensor data behind each event), checks zone and system health.

### B. Facility/Operations Supervisor
- **Goals:** Keep zones running safely; know immediately if a zone's monitoring hardware or network has degraded, independent of whether a hazard has occurred.
- **Interactions:** Monitors active zones, reviews network and hardware status (LAN/4G state, node heartbeat), responds to incidents operationally (evacuation, isolation, escalation).

### C. System Administrator / Technical Operator
- **Goals:** Keep the platform correctly configured as the facility's layout or policy changes; keep hardware healthy.
- **Interactions:** Configures cameras (camera-to-zone mapping), configures zones, configures PPE policies per zone, monitors sensor node health, maintains and re-provisions hardware.

### D. Development/Engineering Team
- **Goals:** Prove the system works under controlled, repeatable conditions before it is treated as demonstration-ready.
- **Interactions:** Uses the system for prototype testing, validation, and demonstration — running the scenarios in Section 17, capturing the metrics in Section 16.

---

## 4. Core Value Proposition

The system differs from a simple CCTV AI detector along these lines:

| Dimension | Simple CCTV AI detector | This system |
|---|---|---|
| Evidence | Vision only | Vision + independent physical sensors (flame, gas/smoke), cross-checked |
| Detection scope | Frame-by-frame object detection | Continuous video + object tracking + temporal confirmation before an event is raised |
| PPE policy | Usually a single global rule set, if any | Per-zone configurable PPE policy, associated with individually tracked workers |
| Ambiguity handling | Typically forces a binary pass/fail | Explicit PASS / FAIL / UNKNOWN, so occlusion is not silently treated as a violation |
| Prioritization | Often a flat alarm | A 4-level priority model (P0–P3) driven by combined evidence, not vision alone |
| Emergency response on network loss | Stops functioning (cloud-dependent) | **Also stops functioning (cloud-dependent).** This build has no independent local fallback — not a differentiator here, an explicit accepted trade-off (Section 12). |
| Sensor communication | Rarely present | RS-485 Modbus RTU, an industrial-standard wired bus for zone sensor nodes |
| Network resilience | Usually a single path | The ESP32 has a LAN/WiFi primary path plus a cellular (GSM) backup for reaching the backend, but no local-only fallback once both are unavailable |
| Liveness monitoring | Rarely present | Dead-man's-switch heartbeat monitoring reports communication loss to the backend |
| Alert content | Often just "alarm triggered" | Every meaningful alert carries location, time, confidence, evidence, and required action |

This system is **not** presented as a certified industrial safety system. See Section 18.

---

## 5. Core Features

### A. Must Have for Prototype

| # | Feature |
|---|---|
| 1 | CCTV/IP camera video input |
| 2 | RTSP support |
| 3 | Edge AI inference |
| 4 | Worker detection |
| 5 | Helmet detection |
| 6 | Safety vest detection |
| 7 | Safety shoes detection |
| 8 | Gloves detection |
| 9 | Fire detection |
| 10 | Smoke detection |
| 11 | Object tracking |
| 12 | Temporal confirmation |
| 13 | Individual worker PPE association |
| 14 | PASS / FAIL / UNKNOWN PPE states |
| 15 | Zone-specific PPE policies |
| 16 | Flame sensor input |
| 17 | Gas/smoke sensor input |
| 18 | RS-485 communication |
| 19 | Modbus RTU |
| 20 | ESP32 sensor gateway and remote-commanded actuator |
| 21 | Zone sensor nodes |
| 22 | Sensor health monitoring |
| 23 | Node heartbeat |
| 24 | Contextual decision engine |
| 25 | P0/P1/P2/P3 priority model |
| 26 | Multimodal hazard confirmation |
| 27 | Relay/siren activation, commanded remotely by the backend (no local fallback) |
| 28 | Event data generation |
| 29 | Evidence snapshot |
| 30 | Supervisor dashboard |
| 31 | Mobile notifications |
| 32 | LAN communication |
| 33 | ESP32 LAN/WiFi primary with cellular (GSM) backup to the backend |
| 34 | Dead-man heartbeat monitoring |
| 35 | Event history |
| 36 | Facility/zone/system health visibility |
| 37 | Controlled validation scenarios |

Every item above is required for the prototype to be considered complete; none is optional or deferrable.

### B. Nice to Have / Future Extensions

**Not required for the initial prototype.** Listed only because they extend the existing architecture without conflicting with it:

- Additional zones beyond the initial demonstration set (the architecture is already zone-count-agnostic; this is a scale-up, not a redesign).
- Additional cameras per zone.
- More PPE categories.
- Production-grade, calibrated industrial gas sensors (replacing the prototype's raw/indicative MQ-series reading — see Section 7).
- More advanced analytics (trend reporting, compliance-over-time dashboards).
- Expanded reporting/export for supervisors and administrators.
- Multi-site support (multiple facilities under one backend).
- Role-based access control on the dashboard.

---

## 6. PPE Requirements

### Required PPE classes

- Helmet
- Safety vest
- Gloves
- Safety shoes

### Association with individuals

PPE compliance is not implemented as object counting. Every PPE detection is associated with a specific tracked worker, so a violation can be attributed to "this worker, in this zone, at this time" rather than reported as an anonymous zone-level count.

### PPE status values

Each PPE item, for each tracked worker, has exactly one of three states:

| Status | Meaning |
|---|---|
| PASS | The required PPE item is visibly present and correctly worn |
| FAIL | The required PPE item is required by zone policy and is confirmed absent |
| UNKNOWN | The relevant body region is occluded, out of frame, or not clearly visible enough to determine PASS or FAIL |

**Why UNKNOWN is required:** if a body part is occluded or poorly visible, the system must not default to treating it as a violation. Automatically converting "can't tell" into "FAIL" would produce false PPE violations and erode trust in every subsequent alert. UNKNOWN is a first-class result, not an error state.

### Zone-specific PPE policy

PPE requirements are **configurable per zone**, not hard-coded globally. Each zone declares which PPE classes it requires:

**Example — a zone with strict requirements:**
```text
WELDING_ZONE:
  helmet       = required
  vest         = required
  gloves       = required
  safety_shoes = required
```

**Example — a zone with no PPE requirement:**
```text
OFFICE_ZONE:
  helmet       = not required
  vest         = not required
  gloves       = not required
  safety_shoes = not required
```

A worker who is not wearing a helmet is only a violation in a zone where a helmet is required. The same worker in a zone where a helmet is not required produces no PPE event for that item.

---

## 7. Fire and Smoke Detection

Fire and smoke detection combines two independent evidence sources; neither is trusted alone (see Section 9).

### Visual evidence (from the backend's vision analysis of the streamed camera video)

- Fire detected (yes/no)
- Smoke detected (yes/no)
- Confidence score
- Camera / zone location
- Persistence across frames (see Section 8)

### Physical evidence (from the zone sensor nodes)

- Flame sensor status
- Gas/smoke sensor reading
- A derived state: normal / elevated / high / critical

### Sensor representation rule

The prototype uses MQ-series gas/smoke sensors. These are **not** represented as calibrated, universally accurate PPM (parts-per-million) values. Instead, the system represents their output as either:

- a **raw reading** (`gas_sensor_raw`), or
- a **normalized smoke index** (`smoke_index`)

A calibrated concentration value may only be introduced later, after a proper calibration procedure against a known reference has been performed. Presenting an uncalibrated MQ-series reading as a trustworthy PPM figure would be misleading to a supervisor and is explicitly out of scope for the prototype.

---

## 8. Event Priority Model

Every hazard or PPE observation resolves to exactly one of four priority levels.

### P0 — NORMAL
No safety violation or hazard detected. No alert is generated.

### P1 — PPE WARNING

**Examples:** missing helmet, missing vest, missing gloves, missing safety shoes (where required by zone policy).

**Expected response:**
- Dashboard warning
- Supervisor notification
- Evidence snapshot attached
- No emergency siren by default

### P2 — SUSPICIOUS HAZARD

**Examples:**
- Smoke sensor elevated, but the camera does not confirm visible fire
- Camera detects smoke, but the physical sensor remains normal
- An ambiguous visual hazard (evidence present but not strong enough for P3)

**Expected response:**
- Immediate inspection alert
- Affected zone highlighted
- Evidence preserved
- Escalates to P3 if persistence/confidence increases per policy

### P3 — CONFIRMED / HIGH-PRIORITY HAZARD

**Examples:**
- Persistent, high-confidence visual fire
- Fire detected with supporting physical sensor evidence
- A severe hazard meeting the configured escalation policy

**Expected response:**
- High-priority mobile alert
- Dashboard alarm
- Local siren/relay activation
- Required action displayed to the supervisor

---

## 9. Multimodal Decision Logic

**The system must not implement the following:**

```text
VISION OR SENSOR = CONFIRMED FIRE
```

A single evidence source triggering is not, by itself, a confirmed hazard. Instead, the decision engine combines:

- the AI (vision) event
- the physical sensor event
- the applicable zone policy
- detection confidence
- temporal persistence
- recent event history for that zone

...to arrive at a priority (P0–P3). This is what distinguishes the platform from a single-source detector (see Section 4).

### Worked examples

| # | Vision | Physical sensor | Resulting priority |
|---|---|---|---|
| A | FIRE | Flame sensor active | P3 — confirmed/high-priority fire |
| B | SMOKE | Smoke sensor HIGH | P3, or a configured high-priority smoke event |
| C | SMOKE | Normal | P2 — visual smoke requiring verification |
| D | Normal (no visual hazard) | Smoke sensor HIGH | P2 — sensor hazard requiring inspection |
| E | FIRE | Normal | High-priority visual fire event, subject to the confidence/persistence escalation policy |

The exact escalation thresholds (confidence cutoffs, frame/persistence counts, how quickly P2 escalates to P3) are **experimentally calibrated** during validation, not fixed in advance. They must be exposed as configurable parameters rather than hard-coded constants.

---

## 10. Alert Requirements

Every meaningful alert contains, at minimum:

- **Event** — what was detected
- **Location** — where it happened
- **Time** — when it happened
- **Confidence** — how sure the system is
- **Evidence** — what supports the determination
- **Required action** — what the recipient should do next

### Location/context fields (where applicable)

- Host ID
- Camera ID
- Zone ID
- Floor/area
- Event type

### Alert delivery by priority

| Priority | Delivery |
|---|---|
| P1 | Dashboard notification |
| P2 | Immediate dashboard warning **and** mobile notification |
| P3 | High-priority mobile notification **and** dashboard alarm **and** local siren/relay (per configured policy) |

---

## 11. Dashboard Product Requirements

### Facility overview
- Total cameras
- Active zones
- Current network mode
- System health
- Active incidents

### Zone view
- Zone name
- Camera
- Worker count
- PPE compliance
- Fire state
- Smoke state
- Physical sensor state

### Incident panel
- Priority
- Event
- Location
- Timestamp
- Confidence
- Sensor evidence
- AI evidence
- Snapshot
- Required action

### System health
- Edge AI: online/offline
- ESP32: online/offline
- Modbus nodes: online/offline (per node)
- LAN/4G state
- Last heartbeat
- Sensor health (per node)

---

## 12. Network Resilience Requirements

### Camera path
```text
Camera → Cloud Backend (continuous stream, direct — no local relay device)
```

### ESP32 path
```text
Primary: ESP32 → Facility LAN/WiFi → Cloud Backend
Backup:  LAN unavailable → Cellular (GSM) → Cloud Backend
```

### No further local fallback
```text
LAN unavailable + cellular unavailable
    → sensor readings stop reaching the backend
    → no relay/siren command can be issued or executed
```

**This is a deliberate, accepted trade-off, not an oversight:** relay/siren activation depends entirely on connectivity reaching the cloud backend. The ESP32 has no local decision logic — it does not evaluate sensor thresholds itself and does not act without an explicit command from the backend. If connectivity is lost, the siren does not fire, regardless of what the physical sensors are reading. Every document in this set must reflect this honestly.

---

## 13. Dead-Man's Switch

The backend expects a periodic heartbeat from the ESP32.

**Example configuration:**
- Heartbeat interval: 5 seconds
- Expected timeout: 15 seconds

If a heartbeat is not received within the configured timeout, the backend marks the ESP32 as a communication loss and the dashboard shows:
- Facility/ESP32 identifier
- Last-seen timestamp

**Important distinction from the original design:** in the amended architecture (Section 12), the dead-man's-switch timeout is not just a monitoring signal — it is functionally the same condition under which the ESP32 stops being able to receive or execute relay/siren commands at all, since the ESP32 has no local logic of its own. A dashboard "communication loss" state for the ESP32 should be read as "emergency response is currently unavailable," not merely as a monitoring inconvenience. Camera connectivity is tracked separately (via last-frame-received per camera, Section 11 of `02_TRD.md`), since cameras and the ESP32 do not share a connectivity path.

---

## 14. Event Evidence

Every generated event must preserve enough context for a supervisor to understand and audit it after the fact, without needing to reconstruct anything from raw footage. Minimum fields:

- Event type
- Timestamp
- Location (host / camera / zone / floor-area, as applicable)
- Confidence
- AI evidence (what vision contributed)
- Physical sensor evidence, where available (what the sensor contributed)
- Snapshot / evidence image
- Required action
- Network mode at the time of the event (LAN / 4G / local-only)
- A unique event ID

---

## 15. User Stories

- As a **Safety Supervisor**, I want to view overall facility health at a glance, so that I can immediately tell whether any zone needs attention.
- As a **Safety Supervisor**, I want to view each zone's current state (PPE compliance, fire/smoke, sensor state), so that I can assess risk zone by zone.
- As a **Safety Supervisor**, I want to review PPE violations with the worker, zone, and PPE item identified, so that I can follow up with the right person.
- As a **Safety Supervisor**, I want to review fire/smoke alerts with both visual and sensor evidence, so that I can judge how serious the situation is before acting.
- As a **Safety Supervisor**, I want to receive mobile notifications for P2 and P3 events, so that I am informed even when I am not looking at the dashboard.
- As a **Safety Supervisor**, I want to review the evidence snapshot behind an event, so that I do not have to take an alert on faith.
- As a **System Administrator**, I want to configure PPE policy per zone, so that a zone's requirements match its actual risk profile.
- As a **System Administrator**, I want to monitor sensor node health and heartbeat, so that I know if a zone's physical sensing has gone silent before it matters.
- As the **system**, I need to detect network failure (LAN unreachable), so that I can switch to the backup communication path automatically.
- As the **system**, I need to switch to 4G when LAN is unavailable, so that events and alerts continue to reach the backend and dashboard.
- As the **system**, when ESP32-to-backend connectivity is lost, I must surface this as a "communication loss / emergency response unavailable" state on the dashboard, so a supervisor knows the automated siren cannot currently be relied on and must respond manually.
- As the **system**, I need to track individual workers across frames, so that PPE status can be attributed per person rather than counted anonymously.
- As the **system**, I need to represent an occluded or unclear PPE region as UNKNOWN, so that I do not generate a false violation.
- As the **system**, I need to record event history, so that supervisors and administrators can review what happened over time, not just the current state.

---

## 16. Success Metrics

No numeric target values are specified here; only the metrics to be measured. Targets are set during validation, based on the actual dataset, hardware, and network conditions — not invented in advance.

### AI accuracy
- Precision
- Recall
- mAP@50
- mAP@50-95
- F1 score

### Real-time performance
- FPS
- AI inference latency
- End-to-end event latency (detection to event generation)

### Alert performance
- Detection → dashboard latency
- Detection → FCM (mobile) latency
- Detection → siren latency

### Communication
- LAN failover time
- 4G connection time
- Recovery time after LAN is restored
- Heartbeat loss detection time

### Robustness (conditions to test under)
- Low lighting
- Bright lighting
- Motion blur
- Partial occlusion
- Crowded scenes
- Dust
- Steam
- Camera angle variation
- Small fire
- Large fire
- Smoke without visible flame

### False events (to record, not eliminate outright)
- False fire
- False smoke
- False PPE violation
- Missed fire
- Missed smoke
- Missed PPE violation

---

## 17. Demonstration Scenarios

### Scenario A — PPE violation
A worker enters a zone without a required helmet or vest.

**Expected flow:** Worker tracked → PPE violation persists → P1 → Dashboard notification → Evidence image attached.

### Scenario B — Confirmed fire
A controlled fire/flame is detected by both the camera (streamed to the backend) and the physical flame sensor (reported by the ESP32).

**Expected flow:** Vision fire + Flame sensor → backend decision engine → P3 → Dashboard alarm + Mobile (FCM) alert + backend commands the ESP32 to fire the siren.

### Scenario C — Smoke-only sensor event
The gas/smoke sensor becomes elevated while no visual fire is present.

**Expected flow:** Sensor elevated → P2 → Inspection alert.

### Scenario D — Visual smoke event
The AI detects persistent smoke while the physical sensor remains normal.

**Expected flow:** Visual smoke persists → P2 → Verification alert.

### Scenario E — Complete connectivity loss
The ESP32 loses both its LAN/WiFi and cellular paths to the backend during a physical hazard (e.g. the flame sensor is actually active).

**Expected flow:** Sensor reading cannot reach the backend → no decision is made → **the siren does not fire.** The dashboard shows a communication-loss state for the ESP32 once connectivity is restored (or once the dead-man's-switch timeout elapses, if the dashboard itself remains reachable via other paths). This scenario demonstrates the accepted limitation from Section 12, not a resilience capability — it exists to make the limitation visible and testable, not to show it being overcome.

---

## 18. Out of Scope / Boundaries

- **There is no independent local emergency response.** Relay/siren activation requires the ESP32 to reach the cloud backend (via LAN/WiFi or cellular). A connectivity outage means no automated siren response — this is a deliberate, accepted trade-off for this build, not a defect to be fixed later within this document's scope.
- This is a **hackathon prototype**, not a certified industrial fire/life-safety system.
- It is **not** a certified evacuation infrastructure.
- It must **not** directly control industrial machinery.
- It must **not** directly switch mains-voltage systems without appropriate engineering.
- It must **not** directly control fire suppression infrastructure.
- All local emergency demonstration hardware must be **low-voltage** (siren, beacon, relay-switched demonstration load).
- Any future production deployment would require dedicated engineering, electrical protection, and certification beyond the scope of this prototype.

---

## 19. Product Acceptance Criteria

The PRD requirements are considered implemented when all of the following are true:

- [ ] Every "Must Have" feature in Section 5A is present and demonstrable.
- [ ] Every tracked worker has an independent PASS/FAIL/UNKNOWN status per required PPE item, correctly scoped to that worker (not a zone-wide count).
- [ ] PPE policy is configurable per zone (not hard-coded), and a change to one zone's policy does not affect another zone's evaluation.
- [ ] UNKNOWN is produced for occluded/unclear PPE regions instead of a false FAIL.
- [ ] Fire and smoke detection draws on both visual and physical evidence, and the multimodal decision logic in Section 9 (not "vision OR sensor") governs the resulting priority.
- [ ] MQ-series sensor output is represented as a raw reading or smoke index, never as an unqualified PPM concentration.
- [ ] Every generated event resolves to exactly one of P0/P1/P2/P3, with the response behavior in Section 8 matching that priority.
- [ ] Every alert (P1/P2/P3) contains, at minimum, the fields in Section 10.
- [ ] Every generated event record contains, at minimum, the fields in Section 14.
- [ ] The dashboard displays all four panels in Section 11 (facility overview, zone view, incident panel, system health) with the listed fields.
- [ ] The RS-485/Modbus RTU sensor network is operational, with the ESP32 as master and zone nodes as slaves, each independently addressable.
- [ ] Sensor node health and heartbeat are visible on the dashboard's system health panel.
- [ ] The ESP32's LAN/WiFi → cellular failover order described in Section 12 works, and the dashboard clearly indicates when emergency response is unavailable due to connectivity loss (it does **not** attempt to trigger the siren/relay when both paths are unavailable — there is no local fallback in this build).
- [ ] The dead-man's-switch heartbeat mechanism reports communication loss (host + last-seen timestamp), and the dashboard correctly treats an ESP32 communication-loss state as "emergency response currently unavailable" (Section 13), not merely a monitoring inconvenience.
- [ ] Event history is queryable/reviewable, not just the current live state.
- [ ] All five demonstration scenarios in Section 17 can be run and produce their expected outcomes.
- [ ] The metrics in Section 16 can be measured and recorded (even if no fixed target has been set).
- [ ] Nothing in Section 18 has been violated (no mains switching, no direct machinery/suppression control, no claim of certification).

This PRD is complete when another AI agent can read it in isolation and understand the intended product behavior — what the system does, why, and how "done" is judged — without needing to ask a basic product question that these 19 sections should already answer.
