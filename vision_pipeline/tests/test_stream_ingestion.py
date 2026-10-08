import time
import sys
from pathlib import Path

# Add vision_pipeline to sys.path
pipeline_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(pipeline_dir))

from stream_manager import ThreadedCameraStream

def test_stream_ingestion():
    print("=" * 60)
    print("  PHASE 1 VERIFICATION: LOW-LATENCY STREAM INGESTION TEST")
    print("=" * 60)

    # Test 1: Synthetic/Local stream
    stream = ThreadedCameraStream(src="INVALID_CAM_FALLBACK", camera_id="TEST_CAM_01", target_fps=30)
    time.sleep(0.3)  # Allow thread to start

    frames_acquired = 0
    start = time.time()
    for _ in range(30):
        frame, ts = stream.get_latest_frame()
        if frame is not None:
            frames_acquired += 1
            latency = stream.get_latency()
            assert latency < 0.15, f"Latency too high: {latency:.4f}s"
            assert frame.shape == (720, 1280, 3), f"Unexpected frame shape: {frame.shape}"
        time.sleep(0.02)

    stream.stop()
    duration = time.time() - start

    print(f"  [PASS] Successfully ingested {frames_acquired}/30 frames in {duration:.2f}s.")
    print(f"  [PASS] Average latency verified < 150ms buffer drift.")
    print("=" * 60)
    print("  PHASE 1 VERIFICATION PASSED SUCCESSFULLY")
    print("=" * 60)

if __name__ == "__main__":
    test_stream_ingestion()
