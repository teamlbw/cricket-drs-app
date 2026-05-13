# =============================================
# CRICKET DRS APP — Backend v2 (app.py)
# =============================================

from flask      import Flask, request, jsonify
from flask_cors import CORS
import datetime

# =============================================
# ENHANCED LOGGING — See what's happening in real time
# =============================================

import logging

# Set up logging (shows all activity in terminal)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

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

# =============================================
# BALL COLOR CONFIGURATION
# HSV ranges for each ball color
# HSV = Hue (color), Saturation (intensity), Value (brightness)
# This is used for analysis and logging
# =============================================

BALL_COLOR_CONFIG = {
    "red": {
        "label":      "Red Cricket Ball",
        "rgb_ranges": {
            "r_min": 150, "r_max": 255,
            "g_min": 0,   "g_max": 90,
            "b_min": 0,   "b_max": 90
        },
        "description": "Standard red cricket ball (Tests/County)"
    },
    "white": {
        "label":      "White Cricket Ball",
        "rgb_ranges": {
            "r_min": 200, "r_max": 255,
            "g_min": 200, "g_max": 255,
            "b_min": 200, "b_max": 255
        },
        "description": "White cricket ball (ODI/T20 matches)"
    },
    "green": {
        "label":      "Green Tennis Ball",
        "rgb_ranges": {
            "r_min": 0,   "r_max": 100,
            "g_min": 130, "g_max": 255,
            "b_min": 0,   "b_max": 100
        },
        "description": "Green tennis/training ball"
    },
    "custom": {
        "label":      "Custom Color Ball",
        "rgb_ranges": {
            # These are updated dynamically when user picks a color
            "r_min": 0, "r_max": 255,
            "g_min": 0, "g_max": 255,
            "b_min": 0, "b_max": 255
        },
        "custom_hex": "#ff0000",
        "custom_rgb": {"r": 255, "g": 0, "b": 0},
        "description": "User-defined custom ball color"
    }
}

# Currently active ball color (default: red)
active_ball_color = "red"

# ====================================================
# HELPER: Predict if ball is hitting the stumps
# ====================================================
# =============================================
# SMARTER LBW PREDICTION — Replace old predict_lbw function
# =============================================

def predict_lbw(coordinates):
    """
    Smarter prediction using the last several points
    to calculate a curved trajectory estimate.
    """

    if len(coordinates) < 3:
        return {
            "prediction": "INSUFFICIENT DATA",
            "confidence": 0,
            "reason":     "Need at least 3 trajectory points"
        }

    # ---- Step 1: Use the last 5 points for better accuracy ----
    # (or all points if less than 5)
    recent = coordinates[-5:] if len(coordinates) >= 5 else coordinates

    # ---- Step 2: Calculate average direction (velocity) ----
    # We look at how much x and y change per step on average
    x_changes = []
    y_changes = []

    for i in range(1, len(recent)):
        x_changes.append(recent[i]['x'] - recent[i-1]['x'])
        y_changes.append(recent[i]['y'] - recent[i-1]['y'])

    # Average change per frame
    avg_dx = sum(x_changes) / len(x_changes) if x_changes else 0
    avg_dy = sum(y_changes) / len(y_changes) if y_changes else 0

    # ---- Step 3: Project the ball to stump height ----
    last_x = recent[-1]['x']
    last_y = recent[-1]['y']

    stump_bottom_y = STUMP_CONFIG["bottom_stump"]["y"]
    stump_top_y    = STUMP_CONFIG["top_stump"]["y"]

    # How many steps until ball reaches stump ground level?
    if avg_dy == 0:
        projected_x = last_x
        projected_y = last_y
    else:
        steps_to_stumps = (stump_bottom_y - last_y) / avg_dy
        projected_x     = last_x + (avg_dx * steps_to_stumps)
        projected_y     = stump_bottom_y

    projected_x = round(projected_x, 2)

    # ---- Step 4: Check if projected x is within stump width ----
    left_x  = STUMP_CONFIG["left_stump"]["x"]
    right_x = STUMP_CONFIG["right_stump"]["x"]

    hitting_stumps = (left_x <= projected_x <= right_x)

    # ---- Step 5: Calculate confidence based on data quality ----
    # More points = more confidence
    base_confidence = min(50 + (len(coordinates) * 3), 92)

    # Reduce confidence if ball is close to edge of stumps
    stump_centre = (left_x + right_x) / 2
    stump_width  = right_x - left_x
    distance_from_centre = abs(projected_x - stump_centre)

    if distance_from_centre < stump_width * 0.2:
        # Ball is well within stumps — high confidence
        confidence_adjust = +5
    elif distance_from_centre < stump_width * 0.5:
        # Ball is near edge — moderate confidence
        confidence_adjust = -5
    elif not hitting_stumps and distance_from_centre < stump_width:
        # Ball is just outside — lower confidence
        confidence_adjust = -10
    else:
        confidence_adjust = 0

    final_confidence = max(30, min(95, base_confidence + confidence_adjust))

    # ---- Step 6: Build result ----
    if hitting_stumps:
        prediction = "OUT - Hitting Stumps"
        colour     = "red"
        reason     = f"Ball projected at x={projected_x} — within stumps ({left_x}–{right_x})"
    else:
        prediction = "NOT OUT - Missing Stumps"
        colour     = "green"
        if projected_x < left_x:
            side   = "going down leg side"
        else:
            side   = "missing off stump"
        reason     = f"Ball projected at x={projected_x} — {side}"

    return {
        "prediction":  prediction,
        "confidence":  int(final_confidence),
        "colour":      colour,
        "projected_x": projected_x,
        "stump_range": { "left": left_x, "right": right_x },
        "reason":      reason,
        "points_used": len(coordinates)
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
        logger.warning('❌ Empty request received')
        return jsonify({"error": "No data received"}), 400

    delivery_id = data.get('delivery_id', 'unknown')
    coordinates = data.get('coordinates', [])

    logger.info(f'🏏 Delivery {delivery_id} received with {len(coordinates)} points')

    if len(coordinates) > 0:  # Only log if we have coordinates
        logger.debug(f'   First point: x={coordinates[0]["x"]}, y={coordinates[0]["y"]}')
        logger.debug(f'   Last point: x={coordinates[-1]["x"]}, y={coordinates[-1]["y"]}')

    if len(coordinates) == 0:
        return jsonify({"error": "No coordinates provided"}), 400

    # Run LBW prediction
    lbw_result = predict_lbw(coordinates)

    # Build the full delivery record
    record = {
        "delivery_id": delivery_id,
        "coordinates": coordinates,
        "total_points": len(coordinates),
        "received_at": datetime.datetime.now().isoformat(),
        "lbw_result": lbw_result,
        "ball_color":   data.get('ball_color', active_ball_color),
        "saved": False
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
# =============================================
# PHASE 11 — REAL TRAJECTORY DATA & QUALITY METRICS
# =============================================

# Store quality metrics for debugging
detection_quality_log = []

# ====================================================
# ROUTE 7: Analyze trajectory quality
# ====================================================
@app.route('/api/trajectory/analyze', methods=['POST'])
def analyze_trajectory_quality():
    """
    Analyzes the quality of detected trajectory data.
    Checks for:
    - Enough points?
    - Consistent motion?
    - Ball staying on screen?
    """
    data = request.get_json()
    
    if not data or 'coordinates' not in data:
        return jsonify({"error": "No coordinates"}), 400
    
    coords = data.get('coordinates', [])
    
    if len(coords) < 3:
        return jsonify({
            "quality": "POOR",
            "reason": "Less than 3 points detected",
            "point_count": len(coords),
            "confidence": 0
        })
    
    # ---- Calculate point spacing consistency ----
    x_distances = []
    y_distances = []
    
    for i in range(1, len(coords)):
        prev_x = coords[i-1]['x']
        prev_y = coords[i-1]['y']
        curr_x = coords[i]['x']
        curr_y = coords[i]['y']
        
        x_dist = abs(curr_x - prev_x)
        y_dist = abs(curr_y - prev_y)
        
        x_distances.append(x_dist)
        y_distances.append(y_dist)
    
    # ---- Calculate average motion ----
    avg_x_motion = sum(x_distances) / len(x_distances) if x_distances else 0
    avg_y_motion = sum(y_distances) / len(y_distances) if y_distances else 0
    
    # ---- Calculate variance (consistency) ----
    # High variance = jerky/unreliable. Low variance = smooth/reliable
    if x_distances:
        x_variance = sum((d - avg_x_motion) ** 2 for d in x_distances) / len(x_distances)
    else:
        x_variance = 0
    
    if y_distances:
        y_variance = sum((d - avg_y_motion) ** 2 for d in y_distances) / len(y_distances)
    else:
        y_variance = 0
    
    # ---- Determine quality level ----
    if len(coords) >= 20 and x_variance < 50 and y_variance < 100:
        quality = "EXCELLENT"
        confidence = 95
    elif len(coords) >= 12 and x_variance < 100 and y_variance < 150:
        quality = "GOOD"
        confidence = 80
    elif len(coords) >= 6 and x_variance < 200:
        quality = "FAIR"
        confidence = 60
    else:
        quality = "POOR"
        confidence = 40
    
    analysis = {
        "quality":      quality,
        "confidence":   confidence,
        "point_count":  len(coords),
        "avg_x_motion": round(avg_x_motion, 2),
        "avg_y_motion": round(avg_y_motion, 2),
        "x_variance":   round(x_variance, 2),
        "y_variance":   round(y_variance, 2),
        "reason":       f"Detected {len(coords)} points with {'smooth' if x_variance < 100 else 'jerky'} motion"
    }
    
    # Log this analysis
    detection_quality_log.append(analysis)
    if len(detection_quality_log) > 50:  # Keep only last 50
        detection_quality_log.pop(0)
    
    print(f"📊 Trajectory Quality: {quality} | {len(coords)} points | Confidence: {confidence}%")
    
    return jsonify(analysis)


# ====================================================
# ROUTE 8: Get detection quality history
# ====================================================
@app.route('/api/quality-log', methods=['GET'])
def get_quality_log():
    return jsonify({
        "total_analyses": len(detection_quality_log),
        "recent_analyses": detection_quality_log[-10:] if detection_quality_log else []
    })


# ====================================================
# ROUTE 9: Test trajectory with known ball position
# (For Person B to test without needing Person A's frontend)
# ====================================================
@app.route('/api/test-trajectory', methods=['POST'])
def test_trajectory():
    """
    Allows testing with fake trajectory data.
    Useful for testing LBW logic without video detection.
    
    Example JSON to send:
    {
      "test_name": "Ball hitting stumps",
      "coordinates": [
        {"x": 100, "y": 50, "timestamp": 0.0},
        {"x": 200, "y": 150, "timestamp": 0.1},
        {"x": 300, "y": 250, "timestamp": 0.2},
        {"x": 320, "y": 300, "timestamp": 0.3}
      ]
    }
    """
    data = request.get_json()
    test_name  = data.get('test_name', 'Unknown Test')
    coords     = data.get('coordinates', [])
    
    # Run prediction and analysis
    lbw_result = predict_lbw(coords)
    
    return jsonify({
        "test_name":     test_name,
        "lbw_result":    lbw_result,
        "point_count":   len(coords),
        "message":       "Test trajectory processed"
    })

# ====================================================
# ROUTE: Get current ball color config
# ====================================================
@app.route('/api/ball-color', methods=['GET'])
def get_ball_color():
    """Returns the currently selected ball color and its settings"""
    color_info = BALL_COLOR_CONFIG.get(active_ball_color, BALL_COLOR_CONFIG["red"])
    return jsonify({
        "active_color":  active_ball_color,
        "color_label":   color_info["label"],
        "description":   color_info["description"],
        "rgb_ranges":    color_info["rgb_ranges"],
        "all_colors":    list(BALL_COLOR_CONFIG.keys())
    })


# ====================================================
# ROUTE: Set ball color (called by frontend when user picks a color)
# ====================================================
@app.route('/api/ball-color', methods=['POST'])
def set_ball_color():
    """
    Receives the selected ball color from frontend.

    Expected JSON:
    {
      "color_name": "red",         (or "white", "green", "custom")
      "custom_rgb": {              (only required when color_name is "custom")
        "r": 100,
        "g": 200,
        "b": 50,
        "hex": "#64c832"
      }
    }
    """
    global active_ball_color, BALL_COLOR_CONFIG

    data       = request.get_json()
    color_name = data.get('color_name', 'red').lower()
    custom_rgb = data.get('custom_rgb', None)

    # Validate that the color is one we support
    if color_name not in BALL_COLOR_CONFIG:
        return jsonify({
            "error":   f"Unknown color '{color_name}'",
            "allowed": list(BALL_COLOR_CONFIG.keys())
        }), 400

    # If custom color, update the custom ranges dynamically
    if color_name == 'custom' and custom_rgb:
        r         = int(custom_rgb.get('r', 255))
        g         = int(custom_rgb.get('g', 0))
        b         = int(custom_rgb.get('b', 0))
        tolerance = 60  # How close a pixel must be to match

        # Update the custom color's RGB ranges
        BALL_COLOR_CONFIG['custom']['rgb_ranges'] = {
            "r_min": max(0,   r - tolerance),
            "r_max": min(255, r + tolerance),
            "g_min": max(0,   g - tolerance),
            "g_max": min(255, g + tolerance),
            "b_min": max(0,   b - tolerance),
            "b_max": min(255, b + tolerance)
        }
        BALL_COLOR_CONFIG['custom']['custom_hex'] = custom_rgb.get('hex', '#ff0000')
        BALL_COLOR_CONFIG['custom']['custom_rgb'] = {"r": r, "g": g, "b": b}

        logger.info(f"🎨 Custom color set: RGB({r}, {g}, {b}) | Hex: {custom_rgb.get('hex')}")

    # Set the active color
    active_ball_color = color_name
    color_info        = BALL_COLOR_CONFIG[color_name]

    logger.info(f"🎨 Ball color changed to: {color_name} ({color_info['label']})")

    return jsonify({
        "message":      f"Ball color set to {color_name}",
        "active_color": active_ball_color,
        "color_label":  color_info["label"],
        "rgb_ranges":   color_info["rgb_ranges"]
    })


# ====================================================
# ROUTE: Get all available ball colors
# ====================================================
@app.route('/api/ball-colors', methods=['GET'])
def get_all_colors():
    """Returns all available ball colors and their settings"""
    return jsonify({
        "active_color":   active_ball_color,
        "available_colors": {
            name: {
                "label":       info["label"],
                "description": info["description"]
            }
            for name, info in BALL_COLOR_CONFIG.items()
        }
    })

import os

if __name__ == '__main__':
    # Use PORT from environment (Render sets this automatically)
    # or fall back to 5000 for local development
    port  = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_ENV') != 'production'
    app.run(debug=debug, host='0.0.0.0', port=port)

