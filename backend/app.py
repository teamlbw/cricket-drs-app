# =============================================
# CRICKET DRS APP — Backend (app.py)
# =============================================

# Import the tools we need
from flask import Flask, request, jsonify  # Flask tools
from flask_cors import CORS                # Allows frontend to talk to backend
import datetime                            # For timestamps

# Create the Flask app
app = Flask(__name__)
CORS(app)  # Enable communication between frontend and backend

# ---- STORAGE: Last 6 deliveries ----
# This list temporarily stores the last 6 delivery clips' data
delivery_history = []

# ====================================================
# ROUTE 1: Test if the backend is running
# Visit http://localhost:5000/ to check
# ====================================================
@app.route('/', methods=['GET'])
def home():
    return jsonify({
        "message": "🏏 Cricket DRS Backend is running!",
        "status": "OK"
    })

# ====================================================
# ROUTE 2: Receive ball trajectory data
# The frontend sends ball coordinates + timestamps here
# ====================================================
@app.route('/api/trajectory', methods=['POST'])
def receive_trajectory():
    """
    Expects JSON data like:
    {
      "delivery_id": "del_001",
      "coordinates": [
        {"x": 100, "y": 50,  "timestamp": 0.0},
        {"x": 180, "y": 120, "timestamp": 0.1},
        ...
      ]
    }
    """
    # Get the data sent from the frontend
    data = request.get_json()

    # Check that data was actually received
    if not data:
        return jsonify({"error": "No data received"}), 400

    delivery_id  = data.get('delivery_id', 'unknown')
    coordinates  = data.get('coordinates', [])

    # Add a timestamp of when we received this
    record = {
        "delivery_id":  delivery_id,
        "coordinates":  coordinates,
        "received_at":  datetime.datetime.now().isoformat(),
        "total_points": len(coordinates)
    }

    # Store in history (keep only last 6)
    delivery_history.append(record)
    if len(delivery_history) > 6:
        delivery_history.pop(0)  # Remove oldest delivery

    print(f"✅ Received delivery {delivery_id} with {len(coordinates)} points")

    # Send a response back to the frontend
    return jsonify({
        "message": "Trajectory received successfully!",
        "delivery_id": delivery_id,
        "points_received": len(coordinates)
    }), 200

# ====================================================
# ROUTE 3: Get the last 6 deliveries
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

    # Find the delivery in history
    found = next((d for d in delivery_history if d['delivery_id'] == delivery_id), None)

    if found:
        found['saved'] = True  # Mark it as saved
        return jsonify({"message": f"Delivery {delivery_id} saved!", "delivery": found})
    else:
        return jsonify({"error": "Delivery not found"}), 404

# ---- Start the Backend Server ----
if __name__ == '__main__':
    # debug=True means errors show clearly — helpful while building!
    app.run(debug=True, host='0.0.0.0', port=5000)
