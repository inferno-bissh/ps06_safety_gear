# Multi-Camera & Cross-Angle Identity Safety Verification Master Plan

## 1. Overview & Objective
This test & verification framework validates the end-to-end industrial multi-camera safety monitoring pipeline for **PS-06 (Multimodal Industrial Safety & Hazard Monitoring System)**.

The architecture decouples choke-point access verification from elevated work-area PPE monitoring to prevent CPU/memory bottlenecks, while providing real-time identity correlation and sub-second incident dispatching to Cloud Firestore and the Next.js Operations Console.

---

## 2. Phase-by-Phase Verification Roadmap

| Phase | Module | Verification Document | Key Criteria |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Multi-Threaded Low-Latency Camera Ingestion | [`PHASE_1_STREAM_INGESTION.md`](./PHASE_1_STREAM_INGESTION.md) | Dedicated daemon threads, `CAP_PROP_BUFFERSIZE=1`, zero latency drift on mobile phone RTSP/HTTP feeds & webcams. |
| **Phase 2** | CPU-Optimized Face Enrollment & Recognition | [`PHASE_2_FACE_RECOGNITION.md`](./PHASE_2_FACE_RECOGNITION.md) | OpenCV SOTA YuNet detector + SFace recognizer, cosine similarity $\ge 0.45$, < 25ms inference on CPU. |
| **Phase 3** | Dual-Zone Orchestrator & Cross-Angle Fallback | [`PHASE_3_MULTICAM_ORCHESTRATOR.md`](./PHASE_3_MULTICAM_ORCHESTRATOR.md) | Gate audit check-in, 15-frame debouncing, work-area face verification with Gate Session Fallback, Firestore push. |
| **Phase 4** | Next.js Operations Console & Gate Log UI | [`PHASE_4_DASHBOARD_INTEGRATION.md`](./PHASE_4_DASHBOARD_INTEGRATION.md) | `/cameras` multi-stream grid, real-time Gate Audit Log drawer, live Firestore listener sync. |

---

## 3. Test Execution Quick Reference

```powershell
# 1. Verify Phase 1 (Stream Ingestion)
python vision_pipeline/tests/test_stream_ingestion.py

# 2. Verify Phase 2 (Face Enrollment & Recognition)
python vision_pipeline/enroll_workers.py --demo
python vision_pipeline/tests/test_face_engine.py

# 3. Verify Phase 3 (Dual-Zone Orchestrator)
python vision_pipeline/multicam_orchestrator.py --test-mode

# 4. Verify Phase 4 (Next.js Dashboard Integration)
# In browser: http://localhost:3000/cameras
```

---

## 4. Sign-Off & Acceptance Criteria
* Latency buffer across mobile streams stays $\le 100\text{ms}$ over 5 minutes of continuous execution.
* CPU utilization remains $< 75\%$ on standard consumer laptops.
* Facial recognition triggers only on Gate entry and sustained work-area violations (event-driven).
* Incidents successfully write to Firestore `facilities/STPI_HOST_01/incidents` with worker identity and evidence snapshot.
