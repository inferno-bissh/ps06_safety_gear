# Context & Progress: Multimodal Industrial Safety & Hazard Monitoring System

> **MANDATORY INSTRUCTION FOR ALL AI AGENTS & SESSIONS:**
> Every AI coding agent working on this repository **MUST** read this file at the start of any session, update it during or at the end of the session, and log all changes, architectural decisions, and next steps before finishing. See [AGENTS.md](file:///c:/Users/VICTUS/OneDrive/Desktop/Documents/BPUT%20HACKATHON/ps06_industry_safety/AGENTS.md) and [GEMINI.md](file:///c:/Users/VICTUS/OneDrive/Desktop/Documents/BPUT%20HACKATHON/ps06_industry_safety/GEMINI.md).

---

## 1. Project Overview & Objective

- **Project:** Problem Statement 06 (PS06) — Multimodal Industrial Safety & Hazard Monitoring System (BPUT Hackathon).
- **Core Mission:** Real-time multimodal monitoring of industrial facility zones combining edge Modbus telemetry (ESP32 flame, smoke, temperature sensors) and cloud/backend computer vision inference (YOLO PPE compliance, fire/smoke detection, worker tracking).
- **Primary Deliverables:**
  1. Next.js Web Operations Console (`dashboard/`).
  2. Firebase Firestore backend datastore & real-time sync (`05_BACKEND_SCHEMA.md`).
  3. Vision inference pipeline & Edge telemetry ingestion decision engine.
  4. Emergency takeover mechanism (P3 full-screen takeover, sirens, evacuation signaling).

---

## 2. Technical Stack & Key Architecture Decisions

| Component | Technology | Current Status / Notes |
| :--- | :--- | :--- |
| **Frontend Framework** | Next.js 16 (App Router), React 19, TypeScript | Implemented in `dashboard/` |
| **Styling** | Tailwind CSS v4, Lucide Icons, Glassmorphism dark mode | Implemented |
| **Database** | **Google Cloud Firestore** (Confirmed over Realtime DB / Postgres) | Specified in `05_BACKEND_SCHEMA.md`; SDK installed |
| **State Management** | React Context (`SafetyContext.tsx`) with local simulator | Ready to connect to Firestore live listeners (`onSnapshot`) |
| **Hardware / Edge** | ESP32 microcontroller with Modbus RTU / Sensor nodes | Architecture amended to internal backend inference service |
| **Incident Lifecycle** | `OPEN` -> `ACKNOWLEDGED` -> `RESOLVED` | Implemented in state & UI drawers |
| **Priority Escalation** | `P0` (Normal) -> `P1` (Advisory) -> `P2` (Warning) -> `P3` (Critical Takeover) | Fully modelled in UI and simulation engine |

---

## 3. Current Implementation Status

### Completed Modules:
- [x] **Comprehensive Architecture Docs (`implmentation_docs/`):**
  - PRD (`01_PRD.md`), TRD (`02_TRD.md`), App Flow (`03_APP_FLOW.md`), UI/UX Brief (`04_UI_UX_DESIGN_BRIEF.md`), Backend Schema (`05_BACKEND_SCHEMA.md`), Implementation Plan (`06_IMPLEMENTATION_PLAN.md`), Audit (`07_CROSS_CHECK_AUDIT.md`).
- [x] **Operations Console Dashboard (`dashboard/`):**
  - KPI Header & Host status badge ([`page.tsx`](file:///c:/Users/VICTUS/OneDrive/Desktop/Documents/BPUT%20HACKATHON/ps06_industry_safety/dashboard/src/app/page.tsx)).
  - Zone monitoring cards with PPE badges & sensor readings ([`ZoneCard.tsx`](file:///c:/Users/VICTUS/OneDrive/Desktop/Documents/BPUT%20HACKATHON/ps06_industry_safety/dashboard/src/components/ZoneCard.tsx)).
  - Critical P3 Emergency Screen Takeover modal ([`P3Takeover.tsx`](file:///c:/Users/VICTUS/OneDrive/Desktop/Documents/BPUT%20HACKATHON/ps06_industry_safety/dashboard/src/components/P3Takeover.tsx)).
  - Incident details sliding drawer ([`IncidentDetailDrawer.tsx`](file:///c:/Users/VICTUS/OneDrive/Desktop/Documents/BPUT%20HACKATHON/ps06_industry_safety/dashboard/src/components/IncidentDetailDrawer.tsx)).
  - Camera multi-stream viewer ([`CameraViewer.tsx`](file:///c:/Users/VICTUS/OneDrive/Desktop/Documents/BPUT%20HACKATHON/ps06_industry_safety/dashboard/src/components/CameraViewer.tsx)).
  - Multi-scenario simulation engine in [`SafetyContext.tsx`](file:///c:/Users/VICTUS/OneDrive/Desktop/Documents/BPUT%20HACKATHON/ps06_industry_safety/dashboard/src/context/SafetyContext.tsx) (Scenarios A through E).
  - Navigation pages: `/zones/[zoneId]`, `/incidents`, `/cameras`, `/ppe`, `/history`, `/system-health`, `/settings`, `/login`.
- [x] **Real-time AI Vision & PPE Compliance Pipeline (`vision_pipeline/`):**
  - Ultralytics YOLOv8 object tracking (`yolov8n.pt`, ByteTrack persistent IDs).
  - PPE compliance evaluation engine (`WorkerPPEEvaluator`: head hardhat & torso vest detection, UNKNOWN handling).
  - Temporal confirmation buffer (5 consecutive frames before raising persistent incidents).
  - Direct Cloud Firestore synchronization via REST API & Admin SDK fallback.
  - Interactive tactical HUD with live webcam feed, synthetic industrial fallback, and keyboard simulation triggers (`H`, `V`, `F`, `S`, `Q`).

### In Progress / Pending:
- [x] Connect Firebase SDK initialization (`lib/firebase.ts`) with live project credentials (`ps06-safety-gear`).
- [x] Replace or augment local simulation state in `SafetyContext.tsx` with live Firestore `onSnapshot()` subscribers and Dual-Mode toggle.
- [ ] Implement backend ingestion endpoints or Firestore sync scripts for live ESP32 Modbus sensor payloads.
- [ ] Firebase Authentication integration for operator login / session persistence.

---

## 4. Session History & Work Log

### Session: 2026-10-05 (Session 01)
- **Agent Focus:** Database selection consultation, context standardization, and global agent rules setup.
- **Key Decisions:**
  - Evaluated **Cloud Firestore vs Firebase Realtime Database**: Confirmed **Cloud Firestore** as the optimal choice.
  - Initialized `CONTEXT_AND_PROGRESS.md` as the unified tracking file.
  - Created workspace-wide agent rules (`AGENTS.md`, `GEMINI.md`, `.agents/rules/context_and_progress.md`).
- **Files Created/Modified:**
  - Created: `CONTEXT_AND_PROGRESS.md`, `AGENTS.md`, `GEMINI.md`, `.agents/rules/context_and_progress.md`

### Session: 2026-10-05 (Session 02)
- **Agent Focus:** Firebase credentials onboarding, environment variable templating, and Firestore setup guide.
- **Key Decisions:**
  - Prepared `.env.local.example` in `dashboard/` with all required Firebase client keys (`NEXT_PUBLIC_FIREBASE_*`).
  - Outlined exact steps for creating Firestore and generating both Web client keys (Next.js) and Admin SDK Service Account JSON.
- **Files Created/Modified:**
  - Created: `dashboard/.env.local.example`
  - Updated: `CONTEXT_AND_PROGRESS.md`

### Session: 2026-10-08 (Session 03)
- **Agent Focus:** Full cross-track implementation progress audit against `06_IMPLEMENTATION_PLAN.md` and `implmentation_docs/`.
- **Key Findings:**
  - Implementation documentation suite (Docs 01–07 + master approach) is 100% complete and verified against the amended cloud-backend architecture.
  - Track E (Web Dashboard): ~85-90% complete with full simulation engine, interactive views, P3 emergency takeover, and triage drawers.
  - Track D (Backend/Firestore): ~25% complete (schemas defined, Firebase SDK installed, awaiting live credentials & listeners).
  - Tracks A, B, C (Firmware, Cameras, AI Model): Specified in depth; awaiting physical hardware bring-up and cloud GPU inference deployment.
- **Files Modified:**
  - Updated: `CONTEXT_AND_PROGRESS.md`

### Session: 2026-10-08 (Session 04)
- **Agent Focus:** Live Firebase Integration, Cloud Firestore Real-time Synchronization, and Dual-Mode Safety Engine.
- **Key Decisions & Accomplishments:**
  - Added user's live Firebase credentials (`ps06-safety-gear`) into `dashboard/.env.local`.
  - Implemented `dashboard/src/lib/firebase.ts` exporting modular `app`, `db`, `auth`, `storage` with configuration detection.
  - Implemented `dashboard/src/lib/firestoreService.ts` providing typed real-time subscribers (`subscribeFacility`, `subscribeZones`, `subscribeIncidents`, `subscribeCameras`, `subscribeSystemHealth`), mutation functions, and `seedDefaultFirestoreData`.
  - Upgraded `dashboard/src/context/SafetyContext.tsx` with **Dual-Mode** functionality: connects live to Firestore listeners with fallback to offline simulation.
  - Enhanced `dashboard/src/components/Header.tsx` with a `FIRESTORE: LIVE` status badge and a `SEED FIRESTORE` quickbar button.
  - Successfully restarted Next.js dev server with `.env.local` loaded; verified `http://localhost:3000` compiles with 0 errors.
- **Files Created/Modified:**
  - Created: `dashboard/.env.local`, `dashboard/src/lib/firebase.ts`, `dashboard/src/lib/firestoreService.ts`
  - Modified: `dashboard/src/context/SafetyContext.tsx`, `dashboard/src/components/Header.tsx`, `CONTEXT_AND_PROGRESS.md`

### Session: 2026-10-08 (Session 05)
- **Agent Focus:** Real-Time YOLOv8 Vision Pipeline & Edge Computer Vision Integration (Track C).
- **Key Decisions & Accomplishments:**
  - Installed Python vision environment (`ultralytics`, `torch`, `torchvision`, `opencv-python`, `requests`).
  - Created [`vision_pipeline/config.py`](file:///c:/Users/VICTUS/OneDrive/Desktop/Documents/BPUT%20HACKATHON/ps06_industry_safety/vision_pipeline/config.py) auto-reading `.env.local` credentials and camera stream settings.
  - Implemented [`vision_pipeline/firestore_client.py`](file:///c:/Users/VICTUS/OneDrive/Desktop/Documents/BPUT%20HACKATHON/ps06_industry_safety/vision_pipeline/firestore_client.py) with dual-mode publishing (Cloud Firestore REST API + Firebase Admin SDK fallback).
  - Implemented [`vision_pipeline/ppe_detector.py`](file:///c:/Users/VICTUS/OneDrive/Desktop/Documents/BPUT%20HACKATHON/ps06_industry_safety/vision_pipeline/ppe_detector.py) providing head hardhat and torso vest analysis with 5-frame temporal confirmation buffer.
  - Implemented [`vision_pipeline/main.py`](file:///c:/Users/VICTUS/OneDrive/Desktop/Documents/BPUT%20HACKATHON/ps06_industry_safety/vision_pipeline/main.py) with YOLOv8 person tracking, tactical HUD overlay, webcam input with synthetic fallback, and live keyboard simulation controls (`H`, `V`, `F`, `S`, `Q`).
- **Files Created/Modified:**
  - Created: `vision_pipeline/config.py`, `vision_pipeline/firestore_client.py`, `vision_pipeline/ppe_detector.py`, `vision_pipeline/main.py`, `vision_pipeline/requirements.txt`, `vision_pipeline/README.md`
### Session: 2026-10-08 (Session 06)
- **Agent Focus:** Vision Pipeline PPE Refinement, Tracker Stabilization, and Firestore Rate Limiting.
- **Key Decisions & Accomplishments:**
  - Resolved false-positive `HELMET: PASS`: eliminated `mask_white` (which triggered on white walls/ceilings) and focused on vivid safety hardhat colors (Yellow, Orange, Blue, Red) on the central head dome.
  - Resolved 404/403 Firestore REST issues: added `updateMask.fieldPaths` query parameters to `_rest_patch` in [`vision_pipeline/firestore_client.py`](file:///c:/Users/VICTUS/OneDrive/Desktop/Documents/BPUT%20HACKATHON/ps06_industry_safety/vision_pipeline/firestore_client.py) to support selective field patching on zones.
  - Resolved tracker jumping and incident spam: upgraded `model.track()` to use `bytetrack.yaml` with `conf=0.55`, increased temporal confirmation to 25 frames (~1s), and added a 12-second global camera cooldown in [`vision_pipeline/ppe_detector.py`](file:///c:/Users/VICTUS/OneDrive/Desktop/Documents/BPUT%20HACKATHON/ps06_industry_safety/vision_pipeline/ppe_detector.py).
  - Confirmed incidents are successfully publishing to Cloud Firestore (`200 OK`).
- **Files Modified:**
  - Modified: `vision_pipeline/config.py`, `vision_pipeline/firestore_client.py`, `vision_pipeline/ppe_detector.py`, `vision_pipeline/main.py`, `CONTEXT_AND_PROGRESS.md`

### Session: 2026-10-08 (Session 07)
- **Agent Focus:** Robust Multi-Color & White Hardhat Detection Fix, Crown Dome ROI, and Live Color Classification.
- **Key Decisions & Accomplishments:**
  - Resolved white helmet failure: Previously `V >= 165` and `S <= 45` were too restrictive for typical indoor room webcam lighting (causing white hardhats to fail).
  - Implemented robust Central Skull Crown ROI (`x: 28%-72%`, `y: 4%-65%` of head crop) which focuses strictly on the hardhat dome directly above the eyes/forehead, completely blocking background walls with the worker's head.
  - Adjusted White Hardhat thresholds to `V >= 105` and `S <= 60` with $\ge 20\%$ skull coverage, effectively separating white helmets from dark hair ($V < 90$) and human skin ($S \ge 60$ or $H \in [0, 25]$ with $S \ge 50$).
  - Upgraded [`vision_pipeline/ppe_detector.py`](file:///c:/Users/VICTUS/OneDrive/Desktop/Documents/BPUT%20HACKATHON/ps06_industry_safety/vision_pipeline/ppe_detector.py) to identify and classify specific helmet colors (`WHITE`, `YELLOW`, `ORANGE`, `BLUE`, `RED`, `GREEN`) and vest types (`NEON_YELLOW`, `HI_VIS_ORANGE`).
  - Upgraded [`vision_pipeline/main.py`](file:///c:/Users/VICTUS/OneDrive/Desktop/Documents/BPUT%20HACKATHON/ps06_industry_safety/vision_pipeline/main.py) with visual crown inspection ROI rectangle, dynamic PPE badge labels (`HELMET: PASS [WHITE]`, `HELMET: PASS [YELLOW]`), and real-time periodic terminal telemetry (white % and color % logging every ~1s).
- **Files Modified:**
  - Modified: [`vision_pipeline/ppe_detector.py`](file:///c:/Users/VICTUS/OneDrive/Desktop/Documents/BPUT%20HACKATHON/ps06_industry_safety/vision_pipeline/ppe_detector.py), [`vision_pipeline/main.py`](file:///c:/Users/VICTUS/OneDrive/Desktop/Documents/BPUT%20HACKATHON/ps06_industry_safety/vision_pipeline/main.py), [`CONTEXT_AND_PROGRESS.md`](file:///c:/Users/VICTUS/OneDrive/Desktop/Documents/BPUT%20HACKATHON/ps06_industry_safety/CONTEXT_AND_PROGRESS.md)

---

## 5. Immediate Next Steps for Subsequent Agents

1. **Test Vision Pipeline:** Re-run `python vision_pipeline/main.py` and test with white hardhat, colored hardhats, and bare head.
2. **Verify Live Dashboard:** Check `http://localhost:3000` to confirm live incident sync and real-time priority updates.
3. **Backend Sensor Ingestion (Track D Phase 12):** Build simulated ESP32 Modbus sensor telemetry script to stream continuous smoke index, flame sensor, and heartbeat readings into Firestore.

