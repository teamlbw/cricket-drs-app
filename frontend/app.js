// =============================================
// CRICKET DRS APP — Frontend Logic (app.js)
// =============================================

// These lines "grab" the HTML elements so we can control them with code
const videoPlayer    = document.getElementById('videoPlayer');
const canvas         = document.getElementById('trajectoryCanvas');
const ctx            = canvas.getContext('2d'); // This lets us draw on the canvas
const clipList       = document.getElementById('clipList');
const gameModeBtn    = document.getElementById('gameModeBtn');
const coachingModeBtn = document.getElementById('coachingModeBtn');
const saveClipBtn    = document.getElementById('saveClipBtn');
const uploadClipBtn  = document.getElementById('uploadClipBtn');

// ---- STEP A: MODE SWITCHING ----

// When user clicks "Game Mode" button
gameModeBtn.addEventListener('click', function() {
  alert('🎮 Game Mode Activated! Recording last 6 deliveries.');
  // TODO: Start camera / delivery detection in future steps
});

// When user clicks "Coaching Mode" button
coachingModeBtn.addEventListener('click', function() {
  alert('📋 Coaching Mode Activated! You can now upload clips.');
  uploadClipBtn.style.display = 'inline-block'; // Show upload button
});

// ---- STEP B: UPLOAD A VIDEO CLIP (Coaching Mode) ----

// =============================================
// PHASE 9 — IMPROVED VIDEO UPLOAD
// =============================================

uploadClipBtn.addEventListener('click', function() {
  const filePicker   = document.createElement('input');
  filePicker.type    = 'file';
  filePicker.accept  = 'video/*';

  filePicker.addEventListener('change', function() {
    const selectedFile = filePicker.files[0];

    if (!selectedFile) return; // User cancelled — do nothing

    // Check file size — warn if over 100MB
    const fileSizeMB = selectedFile.size / (1024 * 1024);
    if (fileSizeMB > 100) {
      alert('⚠️ That video is ' + fileSizeMB.toFixed(1) + 'MB. Try a shorter clip (10-20 seconds) for best results.');
      return;
    }

    // Load the video into the player
    const videoURL   = URL.createObjectURL(selectedFile);
    videoPlayer.src  = videoURL;
    videoPlayer.load();
    videoPlayer.play();

    // Store the clip name for later use
    videoPlayer.dataset.clipName = selectedFile.name;

    showStatusMessage('📂 Loaded: ' + selectedFile.name);
    console.log('Video loaded:', selectedFile.name, '| Size:', fileSizeMB.toFixed(1) + 'MB');

    // Auto-detect when video ends (simulates "delivery complete")
    videoPlayer.addEventListener('ended', function() {
      showStatusMessage('🏏 Delivery complete! Review the trajectory.');
      addClipToHistory(selectedFile.name);
    });
  });

  filePicker.click();
});

// ---- IMPROVED SAVE BUTTON ----
saveClipBtn.addEventListener('click', async function() {

  // Find the most recent delivery in history
  const lastDelivery = delivery_history_local[delivery_history_local.length - 1];

  if (!lastDelivery) {
    alert('⚠️ No delivery to save yet. Send a trajectory first!');
    return;
  }

  try {
    const response = await fetch(BACKEND_URL + '/api/save', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ delivery_id: lastDelivery })
    });

    const result = await response.json();
    showStatusMessage('💾 ' + result.message);

  } catch (error) {
    showStatusMessage('❌ Could not save. Is the backend running?');
  }
});

// Keep a local list of sent delivery IDs for the save button
const delivery_history_local = [];

// Update local history whenever we send to backend
const originalSend = sendTrajectoryToBackend;
// (The save button uses delivery_history_local to know what to save)

// ---- STEP C: DRAW BALL TRAJECTORY ON CANVAS ----

// Example trajectory points — in future, these will come from your backend!
// Each point is: { x: horizontal position, y: vertical position }
const exampleTrajectory = [
  { x: 100, y: 50  },
  { x: 180, y: 120 },
  { x: 260, y: 200 },
  { x: 340, y: 290 },
  { x: 420, y: 330 },
  { x: 500, y: 340 },
];

// This function draws a line connecting all the trajectory points
function drawTrajectory(points) {
  ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear previous drawing
  ctx.beginPath();                     // Start drawing
  ctx.strokeStyle = '#ff4444';         // Red line for the ball path
  ctx.lineWidth = 4;                   // Line thickness

  // Move to the first point
  ctx.moveTo(points[0].x, points[0].y);

  // Draw a line to each following point
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }

  ctx.stroke(); // Actually draw the line on screen

  // Draw a dot at each point
  points.forEach(function(point) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 6, 0, Math.PI * 2); // Small circle
    ctx.fillStyle = '#ffdd00'; // Yellow dot
    ctx.fill();
  });
}

// Draw the example trajectory when the page loads
drawTrajectory(exampleTrajectory);

// ---- STEP D: SAVE CLIP BUTTON ----

saveClipBtn.addEventListener('click', function() {
  alert('💾 Clip saved to your device! (Full save feature coming soon)');
  addClipToHistory('Saved Clip ' + (clipList.children.length + 1));
});

// ---- STEP E: DELIVERY HISTORY (Last 6 clips) ----

// This function adds a clip entry to the "Last 6 Deliveries" panel
function addClipToHistory(clipName) {
  // Only keep the last 6 deliveries
  if (clipList.children.length >= 6) {
    clipList.removeChild(clipList.firstChild); // Remove oldest clip
  }

  // Create a new entry
  const clipEntry = document.createElement('div');
  clipEntry.style.padding = '8px';
  clipEntry.style.margin = '4px';
  clipEntry.style.background = '#0f3460';
  clipEntry.style.borderRadius = '6px';
  clipEntry.textContent = '🎬 ' + clipName;

  clipList.appendChild(clipEntry); // Add it to the list
}
// =============================================
// PHASE 5 — CONNECTING TO THE BACKEND
// =============================================

// This is your backend's address — where we send data to
const BACKEND_URL = 'http://localhost:5000';

// ---- FUNCTION: Send trajectory data to the backend ----
async function sendTrajectoryToBackend(deliveryId, trajectoryPoints) {

  // Tell the user something is happening
  console.log('📡 Sending trajectory to backend...');

  try {
    // Build the data package to send
    const dataToSend = {
      delivery_id: deliveryId,
      coordinates: trajectoryPoints.map(function(point, index) {
        return {
          x:         point.x,
          y:         point.y,
          timestamp: index * 0.1   // Fake timestamps: 0.0, 0.1, 0.2 etc.
        };
      })
    };

    // Send the data to the backend using fetch
    const response = await fetch(BACKEND_URL + '/api/trajectory', {
      method:  'POST',                          // We are SENDING data
      headers: { 'Content-Type': 'application/json' }, // Tell backend it's JSON
      body:    JSON.stringify(dataToSend)        // Convert data to text format
    });

    // Wait for the backend's reply
    const result = await response.json();
    console.log('✅ Backend replied:', result.message);

    // Show a success message on screen
    showStatusMessage('✅ Trajectory sent! Delivery: ' + deliveryId);
        // If the backend returned an LBW result, display it on canvas
    if (result && result.lbw_result) {
      displayLBWVerdict(result.lbw_result);
    }


    return result;

  } catch (error) {
    // Something went wrong — show an error
    console.error('❌ Could not reach backend:', error);
    showStatusMessage('❌ Backend not reachable. Is it running?');
  }
}

// ---- FUNCTION: Show a small status message on screen ----
function showStatusMessage(message) {
  // Check if a status box already exists
  let statusBox = document.getElementById('statusMessage');

  // If not, create one
  if (!statusBox) {
    statusBox = document.createElement('div');
    statusBox.id = 'statusMessage';
    statusBox.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #00d4aa;
      color: #1a1a2e;
      padding: 12px 20px;
      border-radius: 8px;
      font-weight: bold;
      font-size: 14px;
      z-index: 1000;
    `;
    document.body.appendChild(statusBox);
  }

  statusBox.textContent = message;

  // Hide it after 3 seconds
  setTimeout(function() {
    statusBox.textContent = '';
  }, 3000);
}

// ---- FUNCTION: Load and display last 6 deliveries from backend ----
async function loadDeliveryHistory() {
  try {
    const response = await fetch(BACKEND_URL + '/api/deliveries');
    const data     = await response.json();

    // Clear the current list
    clipList.innerHTML = '';

    // Add each delivery to the panel
    data.deliveries.forEach(function(delivery) {
      addClipToHistory(delivery.delivery_id + ' (' + delivery.total_points + ' pts)');
    });

    console.log('📋 Loaded', data.total_stored, 'deliveries from backend');

  } catch (error) {
    console.error('❌ Could not load deliveries:', error);
  }
}

// ---- TEST BUTTON: Send example trajectory to backend ----
// Add a test button to the page automatically
const testBtn = document.createElement('button');
testBtn.textContent = '🧪 Test: Send Trajectory to Backend';
testBtn.style.background = '#ff6b35';
testBtn.addEventListener('click', async function() {
  const deliveryId = 'del_' + Date.now(); // Unique ID using current time
  await sendTrajectoryToBackend(deliveryId, exampleTrajectory);
  await loadDeliveryHistory(); // Refresh the delivery list
});

// Add the test button to the page
document.querySelector('.action-buttons').appendChild(testBtn);

// Load delivery history when page first opens
loadDeliveryHistory();
// =============================================
// PHASE 6 — LBW VERDICT DISPLAY ON CANVAS
// =============================================

// ---- Draw the stumps on the canvas ----
function drawStumps() {
  // Stump positions — should match backend STUMP_CONFIG
  const leftX   = 290;
  const rightX  = 350;
  const topY    = 160;
  const bottomY = 300;

  ctx.strokeStyle = '#ffffff'; // White stumps
  ctx.lineWidth   = 4;

  // Draw 3 stumps (left, middle, right)
  const stumpPositions = [leftX, (leftX + rightX) / 2, rightX];

  stumpPositions.forEach(function(x) {
    ctx.beginPath();
    ctx.moveTo(x, topY);    // Top of stump
    ctx.lineTo(x, bottomY); // Bottom of stump
    ctx.stroke();
  });

  // Draw the bails (the little pieces on top)
  ctx.beginPath();
  ctx.moveTo(leftX,  topY);
  ctx.lineTo(rightX, topY);
  ctx.strokeStyle = '#ffdd00'; // Yellow bails
  ctx.lineWidth   = 3;
  ctx.stroke();
}

// ---- Show the LBW verdict as a big overlay on the canvas ----
function displayLBWVerdict(lbwResult) {
  // First redraw the trajectory + stumps
  drawTrajectory(exampleTrajectory);
  drawStumps();

  // Choose colour based on result
  const isOut      = lbwResult.prediction.includes('OUT -');
  const bgColour   = isOut ? 'rgba(255, 0, 0, 0.75)' : 'rgba(0, 200, 100, 0.75)';
  const textColour = '#ffffff';

  // Draw a coloured box at the top of the canvas
  ctx.fillStyle = bgColour;
  ctx.fillRect(0, 0, canvas.width, 80); // Box across top

  // Draw the verdict text
  ctx.fillStyle  = textColour;
  ctx.font       = 'bold 28px Arial';
  ctx.textAlign  = 'center';
  ctx.fillText(lbwResult.prediction, canvas.width / 2, 35);

  // Draw the confidence text
  ctx.font      = '16px Arial';
  ctx.fillText(
    'Confidence: ' + lbwResult.confidence + '%  |  ' + lbwResult.reason,
    canvas.width / 2,
    62
  );

  // Reset text alignment
  ctx.textAlign = 'left';

  // Also show the status message
  showStatusMessage(
    (isOut ? '🔴 OUT!' : '🟢 NOT OUT!') +
    ' — ' + lbwResult.confidence + '% confident'
  );
}

// ---- Draw stumps when page loads ----
drawStumps();
