# Phase 3 Verification Plan: Dual-Zone Orchestrator & Cross-Angle Identity Resolution

## 1. Scope & Objective
Validate [`vision_pipeline/multicam_orchestrator.py`](../vision_pipeline/multicam_orchestrator.py).
Ensures the orchestrator concurrently manages:
1. **Gate Camera:** Frontal choke-point worker access, face recognition, initial PPE check, and active session logging (`active_checked_in_workers`).
2. **Ward / Work Area Camera:** Elevated perspective, YOLOv8 worker + PPE tracking, 15-frame violation debouncing.
3. **Cross-Angle Identity Resolution:** Attempts local face matching; falls back to active gate check-in sessions if the worker is turned away or occluded.
4. **Cloud Firestore Sync:** Real-time push of incident documents with worker identity and evidence snapshot.

---

## 2. Technical Invariants
1. **Event-Driven Decoupling:** Facial recognition is NEVER run on every frame in the work area—only at Gate check-in and on confirmed violations ($\ge 15$ frames).
2. **Debounce Interval:** Violations must persist for $\ge 15$ frames before alerting. Once alerted, track enters cooldown ($-30$ frames) to prevent alert flooding.
3. **Identity Fallback Policy:**
   * Step 1: Work-area camera face match (score $\ge 0.45$).
   * Step 2: Fallback to Gate Check-in log if 1 active worker is present.
   * Step 3: Marked as `"Unidentified Worker (Facing away)"` if multiple ambiguous workers exist.
4. **Cloud Incident Schema:** Adheres to `05_BACKEND_SCHEMA.md` (`incident_id`, `worker_id`, `priority`, `vision_evidence`).

---

## 3. Test Cases & Acceptance Criteria

### Test Case 3.1: Gate Camera Check-In
* **Trigger:** Enrolled worker appears in Gate Camera feed.
* **Expected:** Face recognized $\rightarrow$ active session added to memory and Firestore `gate_logs` subcollection:
  `Worker: [Name] | Status: Checked-In | Gate PPE: Compliant | Time: [HH:MM:SS]`.
* **Pass/Fail:** Pass if worker is recorded in `active_checked_in_workers`.

### Test Case 3.2: Sustained Work-Area Violation & Fallback Correlation
* **Trigger:** Worker in Work Area Camera missing hardhat for $\ge 15$ frames facing away from camera.
* **Expected:** Sustained violation triggers $\rightarrow$ direct face match fails $\rightarrow$ orchestrator resolves identity via Gate Check-in log $\rightarrow$ raises `ALERT: Worker [Name (Correlated via Entry)] in [Ward] missing helmet` $\rightarrow$ pushes incident to Firestore.
* **Pass/Fail:** Pass if incident appears in Firestore with `status: OPEN`.

---

## 4. Verification Command
```powershell
python vision_pipeline/multicam_orchestrator.py --test-mode
```
