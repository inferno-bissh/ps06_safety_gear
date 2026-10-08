import sys
import time
from pathlib import Path

pipeline_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(pipeline_dir))

from multicam_orchestrator import MultiCameraOrchestrator

def test_multicam_orchestrator():
    print("=" * 65)
    print("  PHASE 3 VERIFICATION: DUAL-ZONE ORCHESTRATOR TEST")
    print("=" * 65)

    orchestrator = MultiCameraOrchestrator(
        gate_src="SYNTHETIC_GATE_TEST",
        ward_src="SYNTHETIC_WARD_TEST",
        test_mode=True,
    )

    # 1. Verify Active Baseline Roster
    assert len(orchestrator.active_checked_in_workers) > 0, "Active roster should have baseline worker"
    worker_name = list(orchestrator.active_checked_in_workers.keys())[0]
    print(f"  [Gate Check-In Verified] Active Worker: '{worker_name}'")

    # 2. Verify Cross-Angle Identity Resolution Fallback
    import numpy as np
    dummy_occluded_crop = np.zeros((100, 100, 3), dtype=np.uint8)
    resolved_id, method = orchestrator._resolve_worker_identity(dummy_occluded_crop)
    print(f"  [Cross-Angle Fallback] Resolved ID: '{resolved_id}' | Method: '{method}'")
    assert worker_name in resolved_id, f"Expected '{worker_name}' in resolved ID, got '{resolved_id}'"
    assert "Correlation" in method, f"Expected Correlation method, got '{method}'"

    # 3. Run orchestrator test loop (40 frames)
    start = time.time()
    orchestrator.run()
    duration = time.time() - start

    print(f"  [Dual-Stream Processing] Ran 40 frames in {duration:.2f}s.")
    print("=" * 65)
    print("  PHASE 3 VERIFICATION PASSED SUCCESSFULLY")
    print("=" * 65)

if __name__ == "__main__":
    test_multicam_orchestrator()
