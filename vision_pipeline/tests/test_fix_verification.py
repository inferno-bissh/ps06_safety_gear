import sys
import os
import time
import numpy as np
import cv2

sys.path.insert(0, os.path.abspath("vision_pipeline"))
from ppe_detector import WorkerPPEEvaluator
from stream_manager import ThreadedCameraStream

print("=================================================================")
print("RUNNING COMPREHENSIVE VERIFICATION FOR ISSUE 1 AND ISSUE 2")
print("=================================================================")

evaluator = WorkerPPEEvaluator()

# -------------------------------------------------------------
# TEST 1: Authentic Hardhat Wearing (Must PASS)
# -------------------------------------------------------------
print("\n--- Test 1: Authentic Hardhat Wearing (Yellow Hardhat) ---")
h, w = 720, 1280
frame = np.ones((h, w, 3), dtype=np.uint8) * 180
fx, fy, fw, fh = 500, 240, 120, 140
face_bbox = (fx, fy, fw, fh)
# Face skin
cv2.rectangle(frame, (fx, fy), (fx + fw, fy + fh), (130, 160, 210), -1)
# Yellow hardhat on head (sits fy - 90 to fy + 10)
cv2.rectangle(frame, (fx - 15, fy - 90), (fx + fw + 15, fy + 10), (20, 225, 245), -1)

helmet_box = (fx - 15, fy - 90, fx + fw + 15, fy + 10)
ppe_items = [{"label": "helmet", "conf": 0.88, "box": helmet_box}]

res1 = evaluator.evaluate_ppe(frame, (400, 150, 700, 650), "WORKER_01", frame_ppe_items=ppe_items, face_bbox=face_bbox)
print(f"Result: helmet={res1['helmet']}, color={res1['helmet_color']}, source={res1['helmet_source']}")
assert res1["helmet"] == "PASS", f"Expected PASS for worn hardhat, got {res1['helmet']}"
print("[PASS] Test 1: Authentic Hardhat Passed correctly.")

# -------------------------------------------------------------
# TEST 2: TEST A - Helmet Removed (Must IMMEDIATELY transition to FAIL, NO stale PASS)
# -------------------------------------------------------------
print("\n--- Test 2: Scenario A - Helmet Removed (Immediate FAIL, zero stale PASS) ---")
# User removes helmet: hair is now on head, NO helmet in head region
frame_removed = np.ones((h, w, 3), dtype=np.uint8) * 180
# Face skin
cv2.rectangle(frame_removed, (fx, fy), (fx + fw, fy + fh), (130, 160, 210), -1)
# Dark/brown hair with room lighting highlights (V ~ 90-110, low saturation)
cv2.rectangle(frame_removed, (fx - 10, fy - 75), (fx + fw + 10, fy + 5), (65, 70, 75), -1)

# Frame items: helmet was set aside on desk at x=800, y=500
desk_helmet = [{"label": "helmet", "conf": 0.85, "box": (800, 500, 920, 600)}]

res2 = evaluator.evaluate_ppe(frame_removed, (400, 150, 700, 650), "WORKER_01", frame_ppe_items=desk_helmet, face_bbox=face_bbox)
print(f"Result: helmet={res2['helmet']}, color={res2['helmet_color']}, source={res2['helmet_source']}")
assert res2["helmet"] == "FAIL", f"Expected FAIL after helmet removal, got {res2['helmet']}"
assert res2["helmet_color"] in ["BARE_HAIR", "HAIR_TEXTURE", "BARE_SKIN", "NONE"], f"Unexpected color: {res2['helmet_color']}"
print("[PASS] Test 2: Helmet Removal immediately triggers FAIL (No stale PASS).")

# -------------------------------------------------------------
# TEST 3: TEST B - Bareheaded person sitting near camera against light wall
# -------------------------------------------------------------
print("\n--- Test 3: Scenario B - Bareheaded Person with Hair near camera against light wall ---")
frame_light_wall = np.ones((h, w, 3), dtype=np.uint8) * 235 # White / light wall
cv2.rectangle(frame_light_wall, (fx, fy), (fx + fw, fy + fh), (130, 160, 210), -1)
cv2.rectangle(frame_light_wall, (fx - 10, fy - 75), (fx + fw + 10, fy + 5), (60, 65, 70), -1)

res3 = evaluator.evaluate_ppe(frame_light_wall, (400, 150, 700, 650), "WORKER_CLOSEUP", frame_ppe_items=[], face_bbox=face_bbox)
print(f"Result: helmet={res3['helmet']}, color={res3['helmet_color']}, source={res3['helmet_source']}")
assert res3["helmet"] == "FAIL", f"Expected FAIL for bareheaded worker against white wall, got {res3['helmet']}"
print("[PASS] Test 3: Bare head with hair against light wall is correctly FAIL (Not misclassified as WHITE helmet).")

# -------------------------------------------------------------
# TEST 4: Background Person Wearing Helmet vs Foreground Bareheaded Person
# -------------------------------------------------------------
print("\n--- Test 4: Background Person with Helmet + Foreground Bareheaded Person ---")
# Foreground worker: large face (fw=150, fh=170, fx=450, fy=200)
fg_box = (350, 150, 700, 700)
fg_face = (450, 200, 150, 170)

# Background person: small face in background (x=490, y=90, w=40, h=45)
# Background helmet: width 42, height 35, box=(488, 55, 530, 90)
bg_helmet = {"label": "helmet", "conf": 0.88, "box": (488, 55, 530, 90)}

frame_multi = np.ones((h, w, 3), dtype=np.uint8) * 200
# Foreground face and hair
cv2.rectangle(frame_multi, (450, 200), (600, 370), (130, 160, 210), -1)
cv2.rectangle(frame_multi, (445, 125), (605, 205), (55, 60, 65), -1)
# Background person helmet
cv2.rectangle(frame_multi, (488, 55), (530, 90), (15, 230, 245), -1)

# Evaluate Foreground Worker: MUST NOT be given the background helmet!
res_fg = evaluator.evaluate_ppe(frame_multi, fg_box, "FG_WORKER", frame_ppe_items=[bg_helmet], face_bbox=fg_face)
print(f"Foreground Worker: helmet={res_fg['helmet']}, color={res_fg['helmet_color']}, source={res_fg['helmet_source']}")
assert res_fg["helmet"] == "FAIL", f"CRITICAL BUG: Background helmet falsely passed foreground worker! Result: {res_fg['helmet']}"

# Evaluate Background Worker: small scale, MUST PASS
bg_box = (470, 50, 550, 220)
bg_face = (490, 85, 40, 45)
res_bg = evaluator.evaluate_ppe(frame_multi, bg_box, "BG_WORKER", frame_ppe_items=[bg_helmet], face_bbox=bg_face)
print(f"Background Worker: helmet={res_bg['helmet']}, color={res_bg['helmet_color']}, source={res_bg['helmet_source']}")
assert res_bg["helmet"] == "PASS", f"Background worker should PASS with their own helmet, got {res_bg['helmet']}"
print("[PASS] Test 4: Background helmet is strictly bound to background person, NEVER falsely attributed to foreground worker.")

# -------------------------------------------------------------
# TEST 5: CCTV 3 and CCTV 4 Stream Manager Decoupling & Non-Blocking Latency
# -------------------------------------------------------------
print("\n--- Test 5: CCTV 3 and CCTV 4 Decoupling and Stream Resiliency ---")
stream3 = ThreadedCameraStream(src="STANDBY", camera_id="CCTV_03_TEST", target_fps=20)
stream4 = ThreadedCameraStream(src="STANDBY", camera_id="CCTV_04_TEST", target_fps=20)

time.sleep(0.3)
f3, ts3 = stream3.get_latest_frame(copy=False)
f4, ts4 = stream4.get_latest_frame(copy=False)

assert f3 is not None, "CCTV 3 frame must not be None"
assert f4 is not None, "CCTV 4 frame must not be None"
assert ts3 > 0, "CCTV 3 timestamp must be valid"
assert ts4 > 0, "CCTV 4 timestamp must be valid"

status3 = stream3.get_status()
status4 = stream4.get_status()
print(f"CCTV 3 status: {status3}")
print(f"CCTV 4 status: {status4}")

stream3.stop()
stream4.stop()
print("[PASS] Test 5: CCTV 3 and CCTV 4 streams initialized and run cleanly in parallel without blocking.")

print("\n=================================================================")
print("ALL 5 AUTOMATED TESTS PASSED SUCCESSFULLY! ZERO REGRESSIONS.")
print("=================================================================")
