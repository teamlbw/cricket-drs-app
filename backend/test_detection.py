# =============================================
# TEST SCRIPT — Test ball detection logic
# Run this to verify your backend works!
# =============================================

import requests
import json

# Your backend URL (change if deployed)
BACKEND_URL = 'http://localhost:5000'

print("=" * 50)
print("🏏 Cricket DRS Ball Detection Tests")
print("=" * 50)

# ---- TEST 1: Ball hitting stumps (OUT) ----
print("\n✅ TEST 1: Ball trajectory HITTING STUMPS (should be OUT)")
print("-" * 50)

test1_trajectory = [
    {"x": 100, "y": 50,   "timestamp": 0.0},
    {"x": 180, "y": 120,  "timestamp": 0.1},
    {"x": 260, "y": 200,  "timestamp": 0.2},
    {"x": 320, "y": 280,  "timestamp": 0.3},
    {"x": 330, "y": 300,  "timestamp": 0.4},
]

response = requests.post(
    BACKEND_URL + '/api/test-trajectory',
    json={
        'test_name': 'Ball hitting stumps',
        'coordinates': test1_trajectory
    }
)

result = response.json()
print(f"Prediction: {result['lbw_result']['prediction']}")
print(f"Confidence: {result['lbw_result']['confidence']}%")
print(f"Reason: {result['lbw_result']['reason']}")

# ---- TEST 2: Ball missing stumps (NOT OUT) ----
print("\n✅ TEST 2: Ball trajectory MISSING STUMPS (should be NOT OUT)")
print("-" * 50)

test2_trajectory = [
    {"x": 100, "y": 50,   "timestamp": 0.0},
    {"x": 180, "y": 120,  "timestamp": 0.1},
    {"x": 260, "y": 200,  "timestamp": 0.2},
    {"x": 240, "y": 280,  "timestamp": 0.3},
    {"x": 200, "y": 300,  "timestamp": 0.4},
]

response = requests.post(
    BACKEND_URL + '/api/test-trajectory',
    json={
        'test_name': 'Ball missing stumps (leg side)',
        'coordinates': test2_trajectory
    }
)

result = response.json()
print(f"Prediction: {result['lbw_result']['prediction']}")
print(f"Confidence: {result['lbw_result']['confidence']}%")
print(f"Reason: {result['lbw_result']['reason']}")

# ---- TEST 3: Analyze trajectory quality ----
print("\n✅ TEST 3: Analyze trajectory quality")
print("-" * 50)

test3_trajectory = [
    {"x": 150 + i*20, "y": 100 + i*30, "timestamp": i*0.05}
    for i in range(8)
]

response = requests.post(
    BACKEND_URL + '/api/trajectory/analyze',
    json={'coordinates': test3_trajectory}
)

result = response.json()
print(f"Quality: {result['quality']}")
print(f"Confidence: {result['confidence']}%")
print(f"Points: {result['point_count']}")
print(f"X Motion (avg): {result['avg_x_motion']} pixels")
print(f"Y Motion (avg): {result['avg_y_motion']} pixels")
print(f"X Variance: {result['x_variance']}")
print(f"Y Variance: {result['y_variance']}")

# ---- TEST 4: Check quality log ----
print("\n✅ TEST 4: Retrieve quality log")
print("-" * 50)

response = requests.get(BACKEND_URL + '/api/quality-log')
result = response.json()
print(f"Total analyses stored: {result['total_analyses']}")
if result['recent_analyses']:
    print(f"Recent quality scores:")
    for i, analysis in enumerate(result['recent_analyses'][-3:], 1):
        print(f"  {i}. {analysis['quality']} — {analysis['confidence']}% confidence")

# ---- BONUS: Test with realistic cricket ball trajectory ----
print("\n🎯 BONUS: Realistic cricket delivery trajectory")
print("-" * 50)

# Simulate a real delivery:
# Ball starts from bowler's hand, curves toward batter
realistic = []
for frame in range(1, 16):
    x = 150 + (frame * 11)           # Moving right
    y = 80 + (frame * 15)            # Moving down
    x += frame * 0.5                 # Slight curve
    realistic.append({
        "x": int(x),
        "y": int(y),
        "timestamp": frame * 0.067
    })

response = requests.post(
    BACKEND_URL + '/api/trajectory',
    json={
        'delivery_id': 'bonus_test',
        'coordinates': realistic
    }
)

result = response.json()
print(f"🎬 Realistic delivery: {result['lbw_result']['prediction']}")
print(f"✅ Points captured: {result['points_received']}")
print(f"📊 Confidence: {result['lbw_result']['confidence']}%")

print("\n" + "=" * 50)
print("✅ ALL TESTS COMPLETE!")
print("=" * 50)
