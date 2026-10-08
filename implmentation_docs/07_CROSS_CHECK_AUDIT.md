# PS6 — Final Cross-Check Audit

## Documents 01–06 vs. `master_approach.md` (as amended 2026-09-28), and against each other

**Document:** 07 — Final Cross-Check Audit
**Method:** Full read of all eight source files (`master_approach.md` with its 2026-09-28 amendment, `PS6_Complete_BOM.md`, `01_PRD.md`–`06_IMPLEMENTATION_PLAN.md`) performed fresh for this audit, not from memory of earlier sessions.
**Scope note:** The Master Approach was amended on 2026-09-28 to remove the Jetson, move all vision/decision compute to the cloud backend, and remove the ESP32's local failsafe. That amendment is now the source of truth this audit checks against — not the pre-amendment original text, which the amendment explicitly supersedes.

---

## PART 1 — Master Approach Requirement Extraction

Extracted from `master_approach.md`'s amendment (current truth) plus the unchanged portions of the original document it doesn't override.

**A. Product** — Multimodal safety platform: vision + physical sensors + decision engine + dashboard + mobile alerts. Hackathon prototype, two-zone baseline, zone-count-agnostic architecture.
**B. Vision compute** — YOLO-based detection, ONNX deployment, tracking, temporal confirmation. **Amended:** runs in the cloud backend, not on a Jetson; TensorRT no longer applies.
**C. PPE** — Classes: Worker, Helmet, Safety-Vest, Safety-Shoes, Gloves. PASS/FAIL/UNKNOWN per item per tracked worker. UNKNOWN ≠ FAIL. Not object counting. Zone-specific policy.
**D. Fire/smoke** — Vision (fire, smoke, confidence, persistence) + physical (flame, gas/smoke raw+index). Two independent sources.
**E. Sensors** — Flame sensor, MQ-series gas/smoke sensor. Represented as `gas_sensor_raw`/`smoke_index`, never calibrated PPM.
**F. RS-485/Modbus** — RS-485 physical layer, Modbus RTU, ESP32 master, Arduino Nano/ATmega328P slaves (**amended:** or STM8), linear bus, 120 Ω at ends only, unique address per node, registers 40001–40005 as specified.
**G. ESP32** — **Amended:** Modbus polling, sensor telemetry relay to backend, heartbeat, executes remote relay/siren commands. **No longer:** local event state, local failsafe, independent decision authority.
**H. Camera** — **Amended:** cloud-push-capable cameras streaming continuously and directly to the backend (was: RTSP to a local edge computer). Camera-to-zone mapping.
**I. Decision engine** — AI event + sensor event + zone policy + confidence + temporal persistence + event history → priority. Not `VISION OR SENSOR = CONFIRMED`. **Amended:** runs entirely in the backend.
**J. Priority system** — P0 Normal / P1 PPE Warning / P2 Suspicious Hazard / P3 Confirmed. Specific triggers and response actions per level.
**K. Temporal confirmation** — Configurable frame count + confidence threshold before an event is raised. Applies to fire/smoke and (where practical) PPE.
**L. Event model** — Hazard event and PPE event field sets as specified in the original §16/§17.
**M. Evidence** — Snapshot + metadata per meaningful event.
**N. Dashboard** — Facility overview, Zone view, Incident panel, System health, as specified.
**O. Alerts/FCM** — P1 dashboard only, P2 dashboard+mobile, P3 dashboard alarm+mobile+siren (**amended:** siren only if ESP32 connectivity present).
**P. Network failover** — **Amended:** LAN/WiFi primary + cellular/GSM backup for the ESP32 only (was: for a combined Jetson-hosted host). **Amended, critical:** the "final local path" (siren fires with no cloud dependency) **no longer exists.**
**Q. Dead-man heartbeat** — Configurable interval/timeout (example 5s/15s), communication monitoring. **Amended:** now functionally equivalent to "emergency response unavailable," not merely a monitoring signal, since no local fallback remains.
**R. Backend** — Event ingestion/persistence, dashboard APIs, evidence storage — vendor not mandated by the source (Firebase named only as a "possible stack").
**S. Configuration** — Zone, camera-to-zone, PPE policy, sensor/node, thresholds — all without code changes.
**T. Testing** — Unit/integration, end-to-end scenarios, performance, robustness, safety-boundary validation.
**U. Demonstration scenarios** — A (PPE), B (confirmed fire), C (sensor-only smoke), D (visual smoke), E (**amended:** total connectivity loss is now a required *negative-result* test — siren must NOT fire — not a resilience demonstration).
**V. Safety boundaries** — Hackathon prototype, not certified; no machinery/mains/suppression/evacuation control; low-voltage demonstration load. **Amended, additive:** must also disclose the no-local-fallback limitation clearly.
**W. Implementation phases** — Foundation → hardware → sensor network → ESP32 → camera → dataset → training → deployment → PPE engine → temporal confirmation → decision engine → schema → backend → evidence → dashboard → real-time → notifications → failover → dead-man → health → config → UI → testing (unit → e2e → performance → robustness → safety → demo).
**X. Performance evaluation** — AI metrics, runtime metrics, alert latency, communication timing, robustness conditions, false-event tracking — no invented numeric targets.

---

## PART 2 — Document-by-Document Traceability Matrix

Legend: ✅ Correct · ⚠️ Incomplete · ❌ Missing · 🔴 Contradiction · ➕ Unnecessary addition (classified in Part 20, not penalized here)

| ID | Master Requirement | PRD | TRD | App Flow | UI/UX | Backend | Impl. Plan | Status |
|---|---|---|---|---|---|---|---|---|
| B | Vision compute in cloud, not edge | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| C | PPE PASS/FAIL/UNKNOWN, per-worker, zone policy | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| D | Fire/smoke, dual evidence | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| E | MQ-series raw/index, never PPM | ✅ | ✅ | (n/a) | (n/a) | ✅ | ✅ | ✅ |
| F | RS-485/Modbus, register map frozen | ✅ | ✅ | ✅ | (n/a) | ✅ | ✅ | ✅ |
| G | ESP32 role (revised) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| H | Camera cloud-push requirement | ✅ | ✅ | ⚠️ (see FIX-02) | ✅ | ✅ | ✅ | ⚠️ |
| I | Decision engine, multimodal, in backend | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| J | P0–P3 system | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| K | Temporal confirmation | ✅ | ✅ | ✅ | (implicit) | ✅ | ✅ | ✅ |
| L | Event model fields | ✅ | ✅ | ✅ | (n/a) | ✅ | ✅ | ✅ |
| M | Evidence | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| N | Dashboard panels | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ (see FIX-05) | ⚠️ |
| O | Alerts/FCM | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| P | Failover (revised) | ✅ | ✅ | 🔴 (see FIX-01) | ✅ | ✅ | ✅ | 🔴 |
| Q | Dead-man switch (revised meaning) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| R | Backend choice | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| S | Configuration screens | ✅ | ✅ | 🔴 (see FIX-02, self-contradiction) | ✅ | ✅ | ✅ | 🔴 |
| T | Testing coverage | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| U | Demonstration scenarios (Scenario E revised) | ✅ | (n/a) | ✅ (Journey 5) | (n/a) | (n/a) | ✅ | ✅ |
| V | Safety boundaries (+ no-fallback disclosure) | ✅ | ✅ | ✅ | ✅ | (n/a) | ✅ | ✅ |
| W | Implementation phases, dependency order | (n/a) | (n/a) | (n/a) | (n/a) | (n/a) | ✅ | ✅ |
| X | Performance metrics | ✅ | ✅ | (n/a) | (n/a) | (n/a) | ✅ | ✅ |

Two rows carry a 🔴 — both are **residue from the architecture-pivot revision that didn't fully propagate**, not new architectural contradictions. Detail in Part 3 and Part 21.

---

## PART 3 — Cross-Document Consistency Findings

Systematic pairwise comparison surfaced the following (only real findings listed; pairs with no finding are not padded out with "no issues found" filler):

### App Flow ↔ Backend Schema ↔ UI/UX — network state enum mismatch (🔴, see FIX-01)

- `05_BACKEND_SCHEMA.md` §16 defines `network_state.current_mode` as a **3-value enum**: `LAN` / `CELLULAR` / `OFFLINE`.
- `04_UI_UX_DESIGN_BRIEF.md` §12 correctly renders **3 states**: LAN (green) / CELLULAR (amber) / OFFLINE (red).
- `03_APP_FLOW.md` §4 (Main Navigation) and §3 (Page Inventory, item 13) still describe a **4-state** badge: "LAN / 4G / LOCAL_ONLY / OFFLINE" — this is the pre-amendment state set (back when a fourth "local-only, still protected" state existed because the ESP32 had a local fallback). That state no longer exists; there is no "LOCAL_ONLY" mode distinct from OFFLINE anymore, since going fully local means no protection, not a different protected mode.
- **Impact:** a coding agent building the `NetworkStatus` component off App Flow's spec would implement a 4-value enum that contradicts the Backend Schema it has to read from and the UI/UX spec it has to render.

### App Flow, self-contradiction — Camera Configuration screen described two ways (🔴, see FIX-02)

- `03_APP_FLOW.md` §3 (Page Inventory, item 17): "Camera Configuration | Camera connection/**RTSP** settings"
- `03_APP_FLOW.md` §18 (Configuration Flow table): "Camera Configuration | **Cloud-stream connection details** per camera (camera must support native cloud push, not just local RTSP — `02_TRD.md` §13.1)"
- Same screen, two different descriptions of what it configures, within the same document. §18's description is correct (matches the amendment); §3's is stale.

### Backend Schema, internal inconsistency — stale "RTSP credentials" reference (🟡, see FIX-03)

- `05_BACKEND_SCHEMA.md` §4 (`stream_config_ref` field) correctly says: "the camera must support native cloud push... this is no longer a local RTSP URL."
- `05_BACKEND_SCHEMA.md` §24 (Security table, "Secret handling" row) still says: "**RTSP credentials**, service credentials for ingestion endpoints: Secret Manager..." — the same document contradicting its own Section 4 two sections later.

### UI/UX, internal inconsistency — stray "Edge AI" label (🟡, see FIX-04)

- `04_UI_UX_DESIGN_BRIEF.md` §13 correctly renamed the System Health entry to "Cloud vision inference service" throughout.
- `04_UI_UX_DESIGN_BRIEF.md` §6 (Facility Dashboard ASCII wireframe) still labels the health strip: "Edge AI · ESP32 · Modbus nodes · Sensors · Network · Heartbeat" — the old label, missed during the revision pass.

### App Flow ↔ Implementation Plan — three App-Flow screens never assigned to a build phase (🟡, see FIX-05)

`03_APP_FLOW.md` §3 lists 19 real screens (item 20 is explicitly not a route). Cross-checking each against `06_IMPLEMENTATION_PLAN.md`'s phase task lists:

| Screen | Assigned phase? |
|---|---|
| Facility Dashboard, Zone Overview/Detail, Incident Center/Detail, System Health, Camera View, PPE Compliance View | Phase 14 (references `04_UI_UX_DESIGN_BRIEF.md` §6–13, which covers these) |
| Zone/PPE Policy/Camera/Sensor Configuration, Communication Settings | Phase 20 |
| Sensor/Modbus Node Status, Network Status | Reasonably implied by Phase 19 (System Health) |
| Event History | **Only implicitly** covered by "apply `04_UI_UX_DESIGN_BRIEF.md` in full" in Phase 21 — never named as a foundational deliverable in Phase 14/15 |
| Worker Detail | Not explicitly named; only inferable from the generic `WorkerCard` component and Phase 14's broad `§6-13` reference |
| **Notification Settings** | **Not mentioned in any phase, anywhere in the document** |
| **System / Device Details** | **Not mentioned in any phase, anywhere in the document** |

Notification Settings and System/Device Details have real backend/data-model support (`05_BACKEND_SCHEMA.md` §20's `notification_preferences` field; the device-identifier fields scattered across §4/§7) and a real screen definition in App Flow, but **no implementation phase builds them.** A coding agent executing the plan phase-by-phase would very plausibly never build these two screens.

### Backend Schema, internal gap — per-sensor health derivation is unstated (🟡, see FIX-06)

- `05_BACKEND_SCHEMA.md` §9 (Register → Field Map) shows register 40004 ("Sensor health/status") mapping to `sensor_nodes/{node}.sensor_health` — a single, **node-level** field.
- `05_BACKEND_SCHEMA.md` §8 (Sensors) gives **each** sub-sensor (`flame`, `gas_smoke`) its own independent `health_state` field.
- Nothing in `02_TRD.md` or `05_BACKEND_SCHEMA.md` states how `sensors/flame.health_state` and `sensors/gas_smoke.health_state` are derived, given there is only one shared node-level health register. (Flame's own fault state is inferable from register 40001's value `2 = sensor fault`, but gas_smoke has no equivalent per-sensor fault code in registers 40002/40003 — its health would have to come from the shared 40004 register.) This predates today's architecture pivot; it was not introduced by the amendment, but it is a real, uncovered ambiguity that would force a coding agent to guess.

### Backend Schema — missing index for a screen it's supposed to support (🟡, see FIX-07)

- `03_APP_FLOW.md` §3 defines Worker Detail as "a tracked worker's recent PPE status/history," which requires querying `ppe_events` by `worker_track_id`, ordered by `timestamp`.
- `05_BACKEND_SCHEMA.md` §22 (Indexes) does not declare a composite index for `(worker_track_id, timestamp)` on `ppe_events` — every other screen's query pattern has an explicit index, this one doesn't.

### UI/UX ↔ App Flow — Empty States list is a subset (🟢, no FIX prompt, noted for completeness)

`03_APP_FLOW.md` §19 lists 8 empty states (including "No evidence image" and "No active alerts"). `04_UI_UX_DESIGN_BRIEF.md` §19 lists only 6, missing those two. Not a contradiction (nothing UI/UX says is wrong), just incomplete relative to what App Flow already specified.

### Everything else checked and found consistent

PRD ↔ TRD (event schema, priority model, sensor representation), TRD ↔ Backend (register map → Firestore field mapping is exact and complete), PRD ↔ UI/UX (value proposition table correctly inverted post-amendment, no stray "local fallback" language), App Flow ↔ UI/UX (P3 takeover, incident lifecycle, PPE dashed-border-for-UNKNOWN all match), Backend ↔ Implementation Plan (every collection in §2–20 is referenced by a phase), UI/UX ↔ Implementation Plan (Phase 21 correctly scopes the full UI/UX brief) — no findings in any of these pairs.

---

## PART 4 — Hardware / Software Cross-Check

| Component | Correct responsibility everywhere? |
|---|---|
| Jetson | **Absent from all six documents** except as an explicit "removed, here's why" note — correct, this is the amendment's central change, and every document acknowledges it consistently. |
| ESP32 | Modbus master, telemetry relay, remote-commanded actuator, zero local decision logic — consistent across TRD §12, App Flow §11–14, Backend §17/§18, Implementation Plan Phase 3. No document accidentally gives it local failsafe logic. |
| Zone nodes (Arduino Nano/STM8) | RS-485 slave, register map 40001–40005, unique address — consistent everywhere. Both MCU options treated identically (protocol-level, not architecture-level choice). |
| RS-485 bus | Linear/daisy-chain, 120 Ω at ends only, not per-node — stated identically in `master_approach.md`, `02_TRD.md` §10, `06_IMPLEMENTATION_PLAN.md` Phase 2. |
| Cameras | Cloud-push-capable, own connectivity, no local relay — consistent in TRD, Backend, Implementation Plan; App Flow has the two stale mentions already flagged (FIX-01, FIX-02) but the *architecture* description itself (§13.1 references) is correct. |

No document assigns a Jetson-era responsibility to the wrong device.

---

## PART 5 — AI Cross-Check

Classes (Worker, Helmet, Safety-Vest, Safety-Shoes, Gloves, Fire, Smoke): identical list in `master_approach.md`, `02_TRD.md` §3, `05_BACKEND_SCHEMA.md` §10. Worker tracking, individual PPE association, PASS/FAIL/UNKNOWN, zone policy, temporal confirmation, confidence, evidence generation: present and consistent in PRD §6–9, TRD §4–9, App Flow §8, UI/UX §9, Backend §8/§10/§11. UNKNOWN-never-becomes-FAIL is stated explicitly in five of the six documents (not TRD, which correctly defers UI-level behavior to PRD/App Flow/UI-UX; TRD's own §4 states UNKNOWN "never defaulted to FAIL" too, so actually all six). PPE-is-not-object-counting is stated explicitly in PRD, TRD, App Flow. No inconsistency found.

---

## PART 6 — Sensor Cross-Check

`gas_sensor_raw`/`smoke_index`, never calibrated PPM: stated identically in `master_approach.md` §7.3, `01_PRD.md` §7, `02_TRD.md` §6, `05_BACKEND_SCHEMA.md` §8. No document treats the MQ-series sensor as a calibrated PPM source. The one real gap here is FIX-06 (per-sensor health derivation), not a PPM-representation violation.

---

## PART 7 — Decision Engine Cross-Check

The five cases (A–E) are reproduced with identical outcomes in `master_approach.md` §10, `01_PRD.md` §9, `02_TRD.md` §9, and referenced (not re-copied, correctly) by `03_APP_FLOW.md` §9. No document weakens this to `VISION OR SENSOR = CONFIRMED`. Consistent.

---

## PART 8 — Priority System

P0–P3 meaning, triggers, and response actions match across all six documents. The one architecture-driven change — P3's "local siren" becoming "backend-commanded siren, connectivity-dependent" — is applied consistently everywhere it appears (PRD §8, TRD §8, App Flow §11/§20, UI/UX §11/§14, Backend §19). No document silently reverts to the old "local siren, no cloud dependency" framing.

---

## PART 9 — Network Failover

Consistent **except** the App Flow 4-state vs. 3-state mismatch already detailed in Part 3 (FIX-01). Everywhere else, the LAN-primary/cellular-backup/no-further-fallback structure is identical, and the "must not depend on Internet" requirement is correctly and uniformly **inverted** (flagged as a deliberate, disclosed trade-off) rather than silently dropped.

---

## PART 10 — Dead-Man Switch

5s/15s example values, CONFIGURABLE, present in `master_approach.md` §15, `01_PRD.md` §13, `02_TRD.md` §15, `05_BACKEND_SCHEMA.md` §17. The revised meaning ("this is now functionally an emergency-response-availability signal, not just monitoring") is stated consistently in all four. No document claims the dead-man switch replaces or restores local safety control.

---

## PART 11 — Event Model Cross-Check

PRD requirement → TRD contract → Backend schema → API → Dashboard chain is intact for both event types. The only field-level change (`LOCAL_FAILSAFE_TRIGGER` removal) is applied consistently everywhere it would have appeared (TRD §16, Backend §12/§13). No orphaned references to that event type remain in any of the six documents (verified by direct search).

---

## PART 12 — Dashboard Cross-Check

Every field in `master_approach.md` §18 (Facility overview, Zone view, Incident panel, System health) has a named source in `05_BACKEND_SCHEMA.md` (Sections 2, 3, 14, 18) and a rendering spec in `04_UI_UX_DESIGN_BRIEF.md` (Sections 6–8, 13). No orphaned UI field without a backend source, and no backend field the dashboard is specified to need but doesn't display.

---

## PART 13 — App Flow Screen Cross-Check

Applying the 8-point checklist (requirement / nav path / data source / loading / empty / error / permissions / implementation-plan coverage) to all 19 routed screens: **17 of 19 pass cleanly.** The two gaps are Notification Settings and System/Device Details, both missing point 8 (implementation-plan coverage) — detailed in Part 3 (FIX-05). All 19 screens have a product requirement, a navigation path, loading/empty/error states, and identical (no-role-gating) permissions.

---

## PART 14 — UI/UX Cross-Check

P0–P3 communicated via color + icon + label + text (Section 3): confirmed, not color-only. PASS/FAIL/UNKNOWN visually distinct via color + icon + **border style** (solid vs. dashed): confirmed, explicitly called out as non-negotiable. Network states: **3 states correctly shown in UI/UX** (the App Flow document is the one with the stale 4-state description, not this one). System states (Online/Offline/Degraded/Unknown): all four present with distinct colors/icons in Section 3.2. Evidence accessibility: inline-on-open, no secondary navigation, per Section 15. No findings against this document beyond FIX-04 (stray "Edge AI" label) and the Empty States subset noted in Part 3.

---

## PART 15 — Backend Cross-Check

All 17 entity types from the Master Approach checklist (facilities through system health) are present as named collections in `05_BACKEND_SCHEMA.md` §2–19. Document IDs, reference fields, relationships (§21), indexes (§22, with the one gap in FIX-07), authentication (§24), evidence storage (§15), and API endpoints (§23) are all specified. Every dashboard field traced in Part 12 has a backend source. Two findings (FIX-03, FIX-06, FIX-07) already detailed above; nothing else found.

---

## PART 16 — Implementation Order

The dependency graph in `06_IMPLEMENTATION_PLAN.md` does **not** violate any of the ordering rules the brief calls out as examples:

- Dashboard is not built before the event schema (Phase 14 depends on Phase 11).
- Frontend does not precede backend contracts (Phase 14 depends on Phase 12).
- The decision engine does not run before sensor/AI events exist (Phase 10's sync point explicitly gates on Phases 3, 4, 7, 8, 9, 11).
- Failover is not tested before a communication path exists (Phase 17 depends on Phases 3 and 12).

The plan's actual structure (five parallel tracks converging at one sync point) is a stricter, more explicit dependency model than the brief's flat 28-item list, and it satisfies every ordering constraint the flat list implies. No violation found.

---

## PART 17 — Demonstration Cross-Check

All five scenarios (A–E) are present with trigger → processing → decision → priority → dashboard → notification → local action → expected result, consistently, in `01_PRD.md` §17 and `06_IMPLEMENTATION_PLAN.md` Phase 23, and consistently reflected as user journeys in `03_APP_FLOW.md` §23. Scenario E's redefinition (from a resilience demonstration to a required negative-result test) is applied identically in both documents that restate it. No inconsistency.

---

## PART 18 — Performance Cross-Check

AI, runtime, alert, communication, robustness, and false-event categories are present and identical in `01_PRD.md` §16 and `02_TRD.md` §22, and referenced (not restated, correctly) by `06_IMPLEMENTATION_PLAN.md` Phase 24/25. The one architecture-driven addition — camera-to-cloud upload time as a new latency factor — is called out consistently in both TRD §22 and the Implementation Plan Phase 24. No invented numeric targets found anywhere.

---

## PART 19 — Safety Boundary Cross-Check

"Hackathon prototype, not certified," no machinery/mains/suppression/evacuation control, low-voltage demonstration load only: present and unweakened in `master_approach.md` §23 (original, still valid — the amendment doesn't touch this), `01_PRD.md` §18, `02_TRD.md` §21, `06_IMPLEMENTATION_PLAN.md` Phase 26. The additive requirement (disclose the no-local-fallback limitation) is present in PRD §18, App Flow (throughout), UI/UX (throughout), and explicitly named as its own Phase 26 checklist item. No document weakens or omits any boundary.

---

## PART 20 — Unnecessary Additions

| Addition | Classification | Reasoning |
|---|---|---|
| Firebase Auth login (App Flow) | C — Scope expansion | master_approach never mentions authentication; this is a genuine, deliberate addition. Correctly labeled as a grill-session decision everywhere it appears, not silently invented. |
| Incident lifecycle (OPEN/ACKNOWLEDGED/RESOLVED) | B — Reasonable technical choice | Explicitly labeled "AppFlow-level extension, not in master_approach" everywhere it appears; necessary for a usable dashboard, doesn't change architecture/cost/safety. |
| `resolution_note` field / false-positive dismissal | A — Safe implementation detail | Minimal addition to make the incident lifecycle usable; explicitly labeled as such in Backend Schema. |
| shadcn/ui + Radix, dark/light theme pair, P3 full-screen takeover pattern | A — Safe implementation detail | Presentation-layer choices, don't affect product behavior, data model, or safety boundaries. |
| Firestore + GPU-backed cloud vision service | B — Reasonable technical choice | master_approach names Firebase only as a "possible stack"; TRD picks a concrete implementation and labels it a TRD decision, with a named alternative (Postgres) noted as non-violating. |
| Notification Settings screen (per-user FCM preferences) | C — Scope expansion | Not in master_approach at all. Currently also has no implementation-plan phase (Part 3, FIX-05) — flagged there as the more urgent problem; the addition itself is reasonable but incomplete. |
| `facility_access`/`zone_access` fields on the user document | A — Safe implementation detail | Present but explicitly unenforced, forward-compatibility only; doesn't change current behavior. |
| Cloud GPU inference cost/latency as an open risk | Not a scope addition — a **flagged risk**, not a feature. Already called out prominently in Implementation Plan Phase 7's "Known risks." | No classification needed; this is the plan correctly surfacing a consequence of an already-approved architecture change, not adding scope. |

No addition was found in classification D (potentially conflicting requirement) — nothing added changes the frozen decision logic, register map, priority system, or safety boundaries.

---

## Post-Audit Update (2026-09-28)

All 10 findings below (FIX-01 through FIX-07, plus ISSUE-08/09/10) were applied immediately after this audit was delivered. All six documents are now **Implementation-ready** — no open findings remain. The register and Part 22 classifications below are kept as the historical record of what was found and fixed, not as an outstanding to-do list.

## PART 21 — Final Issue Register

| ID | Severity | Document | Section | Problem | Master Requirement | Required Correction |
|---|---|---|---|---|---|---|
| ISSUE-01 | 🟠 HIGH | `03_APP_FLOW.md` | §3 (item 13), §4 | Network status badge described as a 4-value state (LAN/4G/LOCAL_ONLY/OFFLINE), contradicting the 3-value enum (LAN/CELLULAR/OFFLINE) in `05_BACKEND_SCHEMA.md` §16 and `04_UI_UX_DESIGN_BRIEF.md` §12 | Amendment §7: ESP32 has LAN-primary + cellular-backup only, no further local mode | Change both references to the 3-state LAN/CELLULAR/OFFLINE model, matching Backend Schema and UI/UX |
| ISSUE-02 | 🟡 MEDIUM | `03_APP_FLOW.md` | §3 (item 17) | Camera Configuration screen described as "RTSP settings" in the page inventory, but "cloud-stream connection details" in §18 — same screen, contradictory description within the same document | Amendment §3: cameras must be cloud-push-capable, not RTSP-local | Update §3's description to match §18 |
| ISSUE-03 | 🟡 MEDIUM | `05_BACKEND_SCHEMA.md` | §24 | Security table's "Secret handling" row says "RTSP credentials," contradicting §4's correct "no longer a local RTSP URL" | Amendment §3 | Change "RTSP credentials" to "camera cloud-stream credentials" |
| ISSUE-04 | 🟡 MEDIUM | `04_UI_UX_DESIGN_BRIEF.md` | §6 | Facility Dashboard wireframe labels the health strip "Edge AI," contradicting §13's correct "Cloud vision inference service" | Amendment §1/§2 | Change the wireframe label to "Cloud Vision" or "Vision Service" |
| ISSUE-05 | 🟡 MEDIUM | `06_IMPLEMENTATION_PLAN.md` | Phase 14/20/21 | Notification Settings and System/Device Details screens (App Flow items 18, 19) are never assigned to a build phase | master_approach §S (configuration/dashboard visibility, via App Flow's screen requirements) | Add both screens explicitly to Phase 14 or Phase 20's task list |
| ISSUE-06 | 🟡 MEDIUM | `05_BACKEND_SCHEMA.md` | §8 / §9 | No stated rule for how `sensors/flame.health_state` and `sensors/gas_smoke.health_state` are derived from the single shared register 40004 (plus register 40001's own fault code for flame) | master_approach §11.4 (register map) | Add a derivation rule: flame's health_state from register 40001 (value 2 = FAULT), gas_smoke's health_state from register 40004 |
| ISSUE-07 | 🟡 MEDIUM | `05_BACKEND_SCHEMA.md` | §22 | No composite index for `ppe_events` by `(worker_track_id, timestamp)`, needed by the Worker Detail screen | App Flow §3, item 9 | Add the missing composite index |
| ISSUE-08 | 🟢 LOW | `04_UI_UX_DESIGN_BRIEF.md` | §19 | Empty States list (6 items) is missing "No evidence image" and "No active alerts," present in `03_APP_FLOW.md` §19's 8-item list | App Flow §19 (already-approved list) | Add the two missing empty states to the UI/UX brief for completeness |
| ISSUE-09 | 🟢 LOW | `06_IMPLEMENTATION_PLAN.md` | Phase 12 | Materialized-view triggers (zone `current_priority` rollup, `system_health/current` rollup, `network_state_history` append) are implied by the "§2-20" section reference but never named as discrete tasks | Backend Schema §3/§16/§18 | Add these three triggers explicitly to Phase 12's task list |
| ISSUE-10 | 🟢 LOW | `06_IMPLEMENTATION_PLAN.md` | Phase 14/21 | Event History screen (App Flow item 10) is only implicitly covered via "apply UI/UX in full" in Phase 21, never named as a foundational deliverable | App Flow §3, item 10 | Name Event History explicitly in Phase 14 or 15's task list |

No 🔴 CRITICAL issues were found — nothing in the six documents would cause an implementation to silently violate the frozen decision logic, the register map, the priority system, or the safety boundaries. Every finding above is a residual terminology/coverage gap from the architecture-pivot revision, confined to a single section of a single document, with an exact and narrow correction.

---

## PART 22 — Document Classification

| Document | Classification at time of audit | Classification after fixes applied |
|---|---|---|
| `01_PRD.md` | Implementation-ready | Implementation-ready |
| `02_TRD.md` | Implementation-ready | Implementation-ready |
| `03_APP_FLOW.md` | Needs correction — ISSUE-01 (HIGH), ISSUE-02 (MEDIUM) | **Implementation-ready** — both fixed |
| `04_UI_UX_DESIGN_BRIEF.md` | Needs correction — ISSUE-04 (MEDIUM), ISSUE-08 (LOW) | **Implementation-ready** — both fixed |
| `05_BACKEND_SCHEMA.md` | Needs correction — ISSUE-03, ISSUE-06, ISSUE-07 (all MEDIUM) | **Implementation-ready** — all three fixed |
| `06_IMPLEMENTATION_PLAN.md` | Needs correction — ISSUE-05 (MEDIUM), ISSUE-09, ISSUE-10 (LOW) | **Implementation-ready** — all three fixed |

No document ever required **Major correction.** The architecture pivot was propagated correctly at the structural/behavioral level everywhere; what remained was narrow terminology and coverage residue, each fixed independently without touching any other document's architecture.

---

## PART 23 — Exact Correction Prompts

### FIX-01 — Network status shown as 4 states in App Flow, contradicting a 3-state Backend/UI-UX enum

```text
Update 03_APP_FLOW.md to fix the following issue:

Section 3 (Page/Screen Inventory, item 13 "Network Status") and Section 4 (Main Navigation,
"Network status indicator" row) describe the network status badge as a 4-value state:
"LAN / 4G / LOCAL_ONLY / OFFLINE". This contradicts 05_BACKEND_SCHEMA.md Section 16
(network_state.current_mode enum: LAN / CELLULAR / OFFLINE) and 04_UI_UX_DESIGN_BRIEF.md
Section 12, which both correctly use the 3-value model established by the 2026-09-28
architecture amendment (the ESP32 has a LAN-primary path and a cellular-backup path only;
there is no separate "LOCAL_ONLY, still protected" mode, since no local fallback exists).

Source-of-truth requirement:

master_approach.md's amendment, item 7: the ESP32's WiFi is LAN-primary, GSM/cellular is
backup -- no third local-only mode. 05_BACKEND_SCHEMA.md Section 16 already codifies this
as the correct 3-value enum.

Required change:

Update both locations in 03_APP_FLOW.md to describe the network status badge as
LAN / CELLULAR / OFFLINE (3 states), matching 05_BACKEND_SCHEMA.md Section 16 and
04_UI_UX_DESIGN_BRIEF.md Section 12 exactly.

Do not change unrelated architecture or requirements.
Maintain consistency with all other PS6 documents.
```

### FIX-02 — Camera Configuration screen described two contradictory ways within 03_APP_FLOW.md

```text
Update 03_APP_FLOW.md to fix the following issue:

Section 3 (Page/Screen Inventory, item 17 "Camera Configuration") describes this screen as
"Camera connection/RTSP settings". Section 18 (Configuration Flow table) describes the same
screen as "Cloud-stream connection details per camera (camera must support native cloud
push, not just local RTSP -- 02_TRD.md Section 13.1)". These contradict each other within
the same document. Section 18's description is correct; Section 3's is stale, left over
from before the 2026-09-28 architecture amendment.

Source-of-truth requirement:

master_approach.md's amendment, item 3: cameras must be cloud-push-capable, not
plain local-RTSP-only.

Required change:

Update Section 3, item 17's description to match Section 18: "Cloud-stream connection
settings per camera" (or equivalent wording consistent with Section 18).

Do not change unrelated architecture or requirements.
Maintain consistency with all other PS6 documents.
```

### FIX-03 — Backend Schema Security table still references "RTSP credentials"

```text
Update 05_BACKEND_SCHEMA.md to fix the following issue:

Section 24 (Security table, "Secret handling" row) reads: "RTSP credentials, service
credentials for ingestion endpoints: Secret Manager, referenced by key (Section 4), never
stored as plain Firestore fields." This contradicts Section 4's own field description for
stream_config_ref, which correctly states cameras use native cloud-push streaming, "no
longer a local RTSP URL."

Source-of-truth requirement:

master_approach.md's amendment, item 3, and 05_BACKEND_SCHEMA.md's own Section 4.

Required change:

Change "RTSP credentials" to "camera cloud-stream credentials" in the Section 24 table row.

Do not change unrelated architecture or requirements.
Maintain consistency with all other PS6 documents.
```

### FIX-04 — UI/UX Facility Dashboard wireframe still labels the health strip "Edge AI"

```text
Update 04_UI_UX_DESIGN_BRIEF.md to fix the following issue:

Section 6 (Facility Dashboard ASCII wireframe) labels the system health strip:
"Edge AI · ESP32 · Modbus nodes · Sensors · Network · Heartbeat". This contradicts
Section 13, which correctly renamed this entry to "Cloud vision inference service"
following the 2026-09-28 architecture amendment (no edge device exists).

Source-of-truth requirement:

master_approach.md's amendment, items 1-2 (no Jetson/edge device; vision runs in the
cloud backend). 04_UI_UX_DESIGN_BRIEF.md's own Section 13 already uses the correct label.

Required change:

Change "Edge AI" to "Cloud Vision" (or "Vision Service") in the Section 6 wireframe,
matching Section 13's terminology.

Do not change unrelated architecture or requirements.
Maintain consistency with all other PS6 documents.
```

### FIX-05 — Notification Settings and System/Device Details screens have no implementation phase

```text
Update 06_IMPLEMENTATION_PLAN.md to fix the following issue:

03_APP_FLOW.md Section 3 defines 19 routed screens, including "Notification Settings"
(item 18) and "System / Device Details" (item 19), both with defined data sources in
05_BACKEND_SCHEMA.md (Section 20's notification_preferences field; device/firmware
identifier fields across Sections 4/7). Neither screen is named as a deliverable in any
phase of 06_IMPLEMENTATION_PLAN.md (Phase 14, 20, and 21 were checked specifically and
do not mention either screen).

Source-of-truth requirement:

03_APP_FLOW.md Section 3 (already-approved screen inventory); 05_BACKEND_SCHEMA.md
Section 20 (data support already exists for Notification Settings).

Required change:

Add explicit tasks for building the Notification Settings screen and the System/Device
Details screen to Phase 14 (Dashboard Foundation) or Phase 20 (Configuration), whichever
fits better given how the rest of that phase is scoped. Do not create a new phase number;
add to an existing phase's task list.

Do not change unrelated architecture or requirements.
Maintain consistency with all other PS6 documents.
```

### FIX-06 — Per-sensor health_state derivation is unstated

```text
Update 05_BACKEND_SCHEMA.md to fix the following issue:

Section 8 (Sensors) gives each of the two sub-sensors (flame, gas_smoke) an independent
health_state field (OK/WARNING/FAULT). Section 9 (Register -> Field Map) shows register
40004 ("Sensor health/status") as a single, node-level value mapped only to
sensor_nodes/{node}.sensor_health. No document states how the two independent per-sensor
health_state fields are derived from this single shared register.

Source-of-truth requirement:

master_approach.md Section 11.4 (register map, unchanged by the amendment) -- only one
health register exists per node.

Required change:

In Section 8 (or Section 9), add an explicit derivation rule: flame's health_state is
derived from register 40001's own value (0=normal/OK, 1=flame detected -> not a fault,
2=sensor fault -> FAULT); gas_smoke's health_state is derived from the shared register
40004 (0=OK, 1=WARNING, 2=FAULT, 3=OFFLINE), since registers 40002/40003 carry no fault
code of their own.

Do not change unrelated architecture or requirements.
Maintain consistency with all other PS6 documents.
```

### FIX-07 — Missing composite index for Worker Detail's query pattern

```text
Update 05_BACKEND_SCHEMA.md to fix the following issue:

03_APP_FLOW.md Section 3 (item 9, Worker Detail) requires querying a tracked worker's
recent PPE status/history, which means querying the ppe_events collection filtered by
worker_track_id and ordered by timestamp. Section 22 (Indexes) does not declare a
composite index for this query pattern, unlike every other screen's query pattern, which
does have an explicit index listed.

Source-of-truth requirement:

03_APP_FLOW.md Section 3, item 9 (already-approved screen requirement).

Required change:

Add a row to the Section 22 Indexes table: "Worker's recent PPE history |
ppe_events: (worker_track_id ASC, timestamp DESC)".

Do not change unrelated architecture or requirements.
Maintain consistency with all other PS6 documents.
```
