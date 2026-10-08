import sys
import time
from pathlib import Path

# Add vision_pipeline to sys.path
pipeline_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(pipeline_dir))

from face_engine import WorkerFaceEngine
from enroll_workers import create_synthetic_portrait

def test_face_engine():
    print("=" * 60)
    print("  PHASE 2 VERIFICATION: FACE ENGINE & ENROLLMENT TEST")
    print("=" * 60)

    test_db = pipeline_dir / "test_worker_db.pkl"
    if test_db.exists():
        test_db.unlink()

    engine = WorkerFaceEngine(db_path=test_db, cosine_threshold=0.45)

    # 1. Enroll worker "Rahul Sharma"
    p1 = create_synthetic_portrait("Rahul Sharma", seed=100)
    p2 = create_synthetic_portrait("Rahul Sharma", seed=101)
    success = engine.enroll_worker("Rahul Sharma", [p1, p2])
    assert success, "Failed to enroll Rahul Sharma"
    assert len(engine.database["names"]) == 1

    # 2. Test identification with matching portrait
    query_p = create_synthetic_portrait("Rahul Sharma", seed=100)
    start = time.time()
    name, score = engine.identify_face(query_p)
    latency = (time.time() - start) * 1000.0

    print(f"  [Positive Match] Identified: '{name}' | Score: {score:.3f} | Latency: {latency:.2f}ms")
    assert name == "Rahul Sharma", f"Expected 'Rahul Sharma', got '{name}'"
    assert score >= 0.45, f"Score {score:.3f} below threshold 0.45"
    assert latency < 50.0, f"Latency {latency:.2f}ms exceeded 50ms limit"

    # 3. Test identification with unregistered person
    stranger = create_synthetic_portrait("Stranger", seed=999)
    name_stranger, score_stranger = engine.identify_face(stranger)
    print(f"  [Negative Match] Result: '{name_stranger}' | Score: {score_stranger:.3f}")
    assert name_stranger in ["Unidentified Worker", "Unregistered Worker"] or score_stranger < score

    # Clean up test database
    if test_db.exists():
        test_db.unlink()

    print("=" * 60)
    print("  PHASE 2 VERIFICATION PASSED SUCCESSFULLY")
    print("=" * 60)

if __name__ == "__main__":
    test_face_engine()
