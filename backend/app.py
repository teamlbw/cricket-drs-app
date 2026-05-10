# =============================================
# CRICKET DRS APP — Backend v2 (app.py)
# =============================================

from flask      import Flask, request, jsonify
from flask_cors import CORS
import datetime

app = Flask(__name__)
CORS(app)

# ---- Temporary storage for last 6 deliveries ----
delivery_history = []

# ====================================================
# STUMP POSITIONS (reference points on the canvas)
# These represent where the stumps are on screen
# We'll make this configurable later!
# ====================================================
STUMP_CONFIG = {
    "left_stump":   {"x": 290},   # Left edge of stumps
    "right_stump":  {"x": 350},   # Right edge of stumps
    "top_stump":    {"y": 160},   # Top of stumps (bail height)
    "bottom_stump": {"y": 300},   # Bottom of stumps (ground)
}

# ====================================================
# HELPER: Predict if ball is hitting the stumps
# ====================================================
def predict_lbw(coordinates):
    """
    Takes the ball's trajectory points and predicts
    if the ball would have hit the stumps.

    Returns: dict with prediction result and reason
    """

    if len(coordinates) < 2:
        return {
            "prediction": "INSUFFICIENT DATA",
            "confidence": 0,
            "reason":     "Not enough trajectory points"
        }

    # Get the last known position of the ball
    last_point = coordinates[-1]
    ball_x     = last_point.get('x', 0)
    ball_y     = last_point.get('y', 0)

    # Calculate the ball's direction (where it's heading)
    # We compare the last two points to find the trend
    second_last = coordinates[-2]
    direction_x = ball_x - second_last.get('x', 0)
    direction_y = ball_y - second_last.get('y', 0)

    # Project where the ball will be at stump height (bottom_stump y level)
    stump_y = STUMP_CONFIG["bottom_stump"]["y"]

    # Avoid division by zero
    if direction_y == 0:
        projected_x = ball_x
    else:
        # Simple linear projection formula:
        # projected_x = ball_x + (direction_x / direction_y) * (stump_y - ball_y)
        steps       = (stump_y - ball_y) / direction_y
        projected_x = ball_x + (direction_x * steps)

    # Check if projected position is within stump width
    hitting_stumps = (
        STUMP_CONFIG["left_stump"]["x"] <= projected_x <= STUMP_CONFIG["right_stump"]["x"]
    )

    # Build the result
    if hitting_stumps:
        prediction = "OUT - Hitting Stumps"
        confidence = 85  # Simplified confidence for now
        colour     = "red"
    else:
        prediction = "NOT OUT - Missing Stumps"
        confidence = 80
        colour     = "green"

    return {
        "prediction":  prediction,
        "confidence":  confidence,
        "colour":      colour,
        "projected_x": round(projected_x, 2),
        "stump_range": {
            "left":  STUMP_CONFIG["left_stump"]["x"],
            "right": STUMP_CONFIG["right_stump"]["x"]
        },
        "reason": f"Ball projected to land at x={round(projected_x, 2)}"
    }


# ====================================================
# ROUTE 1: Health check
# ====================================================
@app.route('/', methods=['GET'])
def home():
    return jsonify({
        "message": "🏏 Cricket DRS Backend v2 is running!",
        "status":  "OK",
        "routes": [
            "POST /api/trajectory  → Send ball coordinates",
            "GET  /api/deliveries  → Get last 6 deliveries",
            "POST /api/save        → Save a delivery",
            "GET  /api/stumps      → Get stump config",
            "POST /api/stumps      → Update stump config"
        ]
    })


# ====================================================
# ROUTE 2: Receive trajectory + run LBW prediction
# ====================================================
@app.route('/api/trajectory', methods=['POST'])
def receive_trajectory():
    data = request.get_json()

    if not data:
        return jsonify({"error": "No data received"}), 400

    delivery_id = data.get('delivery_id', 'unknown')
    coordinates = data.get('coordinates', [])

    if len(coordinates) == 0:
        return jsonify({"error": "No coordinates provided"}), 400

    # Run LBW prediction
    lbw_result = predict_lbw(coordinates)

    # Build the full delivery record
    record = {
        "delivery_id":  delivery_id,
        "coordinates":  coordinates,
        "total_points": len(coordinates),
        "received_at":  datetime.datetime.now().isoformat(),
        "lbw_result":   lbw_result,
        "saved":        False
    }

    # Store it — keep only last 6
    delivery_history.append(record)
    if len(delivery_history) > 6:
        delivery_history.pop(0)

    print(f"✅ Delivery {delivery_id} | {lbw_result['prediction']} | Confidence: {lbw_result['confidence']}%")

    return jsonify({
        "message":        "Trajectory received!",
        "delivery_id":    delivery_id,
        "points_received": len(coordinates),
        "lbw_result":     lbw_result
    }), 200


# ====================================================
# ROUTE 3: Get last 6 deliveries
# ====================================================
@app.route('/api/deliveries', methods=['GET'])
def get_deliveries():
    return jsonify({
        "total_stored": len(delivery_history),
        "deliveries":   delivery_history
    })


# ====================================================
# ROUTE 4: Save a specific delivery
# ====================================================
@app.route('/api/save', methods=['POST'])
def save_delivery():
    data        = request.get_json()
    delivery_id = data.get('delivery_id')

    found = next(
        (d for d in delivery_history if d['delivery_id'] == delivery_id),
        None
    )

    if found:
        found['saved'] = True
        print(f"💾 Delivery {delivery_id} marked as saved")
        return jsonify({
            "message":  f"Delivery {delivery_id} saved!",
            "delivery": found
        })
    else:
        return jsonify({"error": "Delivery not found"}), 404


# ====================================================
# ROUTE 5: Get stump configuration
# ====================================================
@app.route('/api/stumps', methods=['GET'])
def get_stumps():
    return jsonify(STUMP_CONFIG)


# ====================================================
# ROUTE 6: Update stump configuration (angle flexibility)
# ====================================================
@app.route('/api/stumps', methods=['POST'])
def update_stumps():
    """
    Allows updating stump positions for different camera angles.
    Send JSON like:
    {
      "left_stump":  {"x": 280},
      "right_stump": {"x": 360}
    }
    """
    global STUMP_CONFIG
    new_config = request.get_json()

    if not new_config:
        return jsonify({"error": "No config provided"}), 400

    # Update only the fields that are sent
    for key, value in new_config.items():
        if key in STUMP_CONFIG:
            STUMP_CONFIG[key] = value

    print(f"⚙️ Stump config updated: {STUMP_CONFIG}")
    return jsonify({
        "message":    "Stump config updated!",
        "new_config": STUMP_CONFIG
    })


# ---- Start Server ----
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
