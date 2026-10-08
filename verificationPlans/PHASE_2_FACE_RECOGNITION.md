# Phase 2 Verification Plan: CPU-Optimized Face Enrollment & Recognition

## 1. Scope & Objective
Validate [`vision_pipeline/face_engine.py`](../vision_pipeline/face_engine.py) and [`vision_pipeline/enroll_workers.py`](../vision_pipeline/enroll_workers.py).
Ensures the facial recognition subsystem runs smoothly on consumer laptops without GPU acceleration, utilizing OpenCV 5.0's native deep learning face modules (YuNet detection + SFace 128-D embedding extraction).

---

## 2. Technical Invariants
1. **CPU Efficiency:** Face embedding inference latency must remain $< 30\text{ms}$ per crop on CPU.
2. **Cosine Distance Metric:**
   $$\text{cosine\_score} = \frac{\mathbf{u} \cdot \mathbf{v}}{\|\mathbf{u}\| \|\mathbf{v}\|}$$
   * Same person: Score $\ge 0.45$.
   * Unknown person / impostor: Score $< 0.40$.
3. **Database Serialization:** Enrolled references stored in `vision_pipeline/worker_face_db.pkl` (containing normed embeddings and person identifiers).
4. **Resilience to Occlusion:** Detects frontal and semi-profile faces ($\pm 35^\circ$ yaw).

---

## 3. Test Cases & Acceptance Criteria

### Test Case 2.1: Reference Database Enrollment
* **Input:** Portrait photos in `known_workers/<name>/` or `--demo` synthetic generation.
* **Expected:** Face detected, 128-D normalized embedding computed and saved to `worker_face_db.pkl`.
* **Pass/Fail:** Pass if `worker_face_db.pkl` contains $\ge 1$ verified enrolled identities.

### Test Case 2.2: Enrolled Worker Positive Match
* **Input:** Face crop of enrolled worker.
* **Expected:** Cosine match score $\ge 0.45$, correctly returns worker's name.
* **Pass/Fail:** True positive rate $100\%$ on clean enrolled crops.

### Test Case 2.3: Unregistered Worker / Occluded Rejection
* **Input:** Face crop of unregistered stranger or blurred/back-of-head crop.
* **Expected:** Cosine match $< 0.40$; returns `"Unidentified Worker"`.
* **Pass/Fail:** Zero false positive misidentifications on unfamiliar faces.

---

## 4. Verification Commands
```powershell
# 1. Run Enrollment Utility
python vision_pipeline/enroll_workers.py --demo

# 2. Run Face Engine Automated Test
python vision_pipeline/tests/test_face_engine.py
```
