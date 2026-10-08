# Phase 4 Verification Plan: Next.js Operations Console Integration

## 1. Scope & Objective
Validate [`dashboard/src/app/cameras/page.tsx`](../dashboard/src/app/cameras/page.tsx) and associated components.
Ensures the Next.js Operations Console reflects:
1. **Multi-Camera Feeds:** Displays Gate Choke-Point Feed (`CAM_00`) and Ward Bay Feed (`CAM_01`).
2. **Gate Audit Log Widget:** Live table/drawer displaying personnel check-in status, entry timestamps, and initial PPE validation.
3. **Cross-Camera Incident Notifications:** Real-time alert badge identifying the worker by name (`"Rahul Sharma (Correlated via Entry)"`).
4. **Dual-Mode Sync:** Works smoothly with both live Cloud Firestore and local simulation fallback.

---

## 2. Technical Invariants
1. Next.js 16 App Router compatibility with React 19.
2. Zero console runtime errors or hydration mismatches.
3. Live Firestore listener on `facilities/STPI_HOST_01/gate_logs` and `incidents`.
4. Dark glassmorphic UI adhering to `04_UI_UX_DESIGN_BRIEF.md`.

---

## 3. Test Cases & Acceptance Criteria

### Test Case 4.1: Camera Grid View
* **Route:** `/cameras`
* **Expected:** Gate Camera (`CAM_00 - Facility Main Gate Entry`) and Ward Camera (`CAM_01 - Welding & Fabrication Bay`) rendered with live indicators and AI model badges.
* **Pass/Fail:** Pass if both camera cards mount with zero layout shifts.

### Test Case 4.2: Gate Audit Log Ingestion
* **Trigger:** New check-in logged in Firestore `gate_logs`.
* **Expected:** Gate log list updates reactively via Firestore `onSnapshot()` without requiring page reload.
* **Pass/Fail:** Pass if check-in entry appears in real time.

### Test Case 4.3: Identity-Aware Incident Card
* **Trigger:** Incident raised with `worker_id: "Rahul Sharma (Correlated via Entry)"`.
* **Expected:** Incident card in `/incidents` and header badge displays worker's name instead of generic ID.
* **Pass/Fail:** Pass if name is displayed accurately.

---

## 4. Verification Check
```powershell
# Open browser at:
http://localhost:3000/cameras
http://localhost:3000/incidents
```
