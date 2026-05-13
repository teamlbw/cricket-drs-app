// =============================================
// CRICKET DRS APP — Full app.js (Phase 11-14)
// =============================================

// ---- BACKEND URL ----
const BACKEND_URL = 'http://localhost:5000';

// ---- GRAB ALL HTML ELEMENTS WE NEED ----
const videoPlayer        = document.getElementById('videoPlayer');
const trajectoryCanvas   = document.getElementById('trajectoryCanvas');
const frameCanvas        = document.getElementById('frameCanvas');
const ctx                = trajectoryCanvas.getContext('2d');
const frameCtx           = frameCanvas.getContext('2d');
const clipList           = document.getElementById('clipList');
const detectionStatus    = document.getElementById('detectionStatus');
const startDetectionBtn  = document.getElementById('startDetectionBtn');
const stopDetectionBtn   = document.getElementById('stopDetectionBtn');
const gameModeBtn        = document.getElementById('gameModeBtn');
const coachingModeBtn    = document.getElementById('coachingModeBtn');
const saveClipBtn        = document.getElementById('saveClipBtn');
const uploadClipBtn      = document.getElementById('uploadClipBtn');
const clearTrajectoryBtn = document.getElementById('clearTrajectoryBtn');

// =============================================
// COLOR CONFIGURATION
// Defines the RGB detection ranges for each ball color
// Each color has: min and max values for Red, Green, Blue
// =============================================
const BALL_COLORS = {

  red: {
    label:     '🔴 Red Ball',
    badgeClass: 'red-badge',
    // Red ball: HIGH red, LOW green, LOW blue
    detect: function(r, g, b) {
      return (r > 150 && g < 90 && b < 90);
    },
    dotColor:  '#ff4444',
    lineColor: '#ff0000'
  },

  white: {
    label:     '⚪ White Ball',
    badgeClass: 'white-badge',
    // White ball: ALL channels HIGH (bright pixel)
    detect: function(r, g, b) {
      return (r > 200 && g > 200 && b > 200);
    },
    dotColor:  '#ffffff',
    lineColor: '#dddddd'
  },

  green: {
    label:     '🟢 Green Ball',
    badgeClass: 'green-badge',
    // Green ball: HIGH green, LOW red, LOW blue
    detect: function(r, g, b) {
      return (g > 130 && r < 100 && b < 100);
    },
    dotColor:  '#44ff44',
    lineColor: '#00cc00'
  },

  custom: {
    label:      '🎨 Custom Ball',
    badgeClass: 'custom-badge',
    // Custom: set dynamically by user's color picker
    // These values update when the user picks a color
    targetR: 255,
    targetG: 0,
    targetB: 0,
    detect: function(r, g, b) {
      // Check if pixel is within ±60 of the chosen color on all channels
      const tolerance = 60;
      return (
        Math.abs(r - this.targetR) < tolerance &&
        Math.abs(g - this.targetG) < tolerance &&
        Math.abs(b - this.targetB) < tolerance
      );
    },
    dotColor:  '#dd88ff',
    lineColor: '#aa44ff'
  }

};

// ---- Currently Selected Ball Color ----
// Default: red. This changes when user clicks a color button.
let selectedBallColor = 'red';

// ---- APP STATE ----
// Think of "state" as the app's memory of what's happening right now
let appState = {
  mode:              'idle',
  isDetecting:       false,
  detectionInterval: null,
  trajectoryPoints:  [],
  deliveryCount:     0,
  localDeliveryIds:  [],
  selectedColor:     'red',     // ← NEW: tracks selected ball color
  stumps: {
    leftX:   290,
    rightX:  350,
    topY:    160,
    bottomY: 300
  }
};


// =============================================
// SECTION 1 — CANVAS SIZING
// Make canvas match video size exactly
// =============================================
function resizeCanvas() {
  const wrapper = document.querySelector('.video-wrapper');
  trajectoryCanvas.width  = wrapper.offsetWidth;
  trajectoryCanvas.height = wrapper.offsetHeight;
  frameCanvas.width       = wrapper.offsetWidth;
  frameCanvas.height      = wrapper.offsetHeight;
  // Redraw stumps after resize
  drawStumps();
}

// Resize when video loads and when window is resized
videoPlayer.addEventListener('loadedmetadata', resizeCanvas);
window.addEventListener('resize', resizeCanvas);

// =============================================
// COLOR SELECTION — Handle Button Clicks
// =============================================

// Grab all color buttons and badge display
const colorButtons    = document.querySelectorAll('.color-btn');
const colorBadge      = document.getElementById('currentColorBadge');
const customPicker    = document.getElementById('customColorPicker');
const colorPickerInput = document.getElementById('colorPickerInput');
const colorPreview    = document.getElementById('selectedColorPreview');

// ---- When user clicks a color button ----
colorButtons.forEach(function(btn) {
  btn.addEventListener('click', function() {

    // Remove "active" highlight from ALL buttons
    colorButtons.forEach(function(b) {
      b.classList.remove('active-color');
    });

    // Highlight the clicked button
    btn.classList.add('active-color');

    // Get which color was selected (from data-color attribute)
    const chosenColor = btn.getAttribute('data-color');
    selectedBallColor  = chosenColor;
    appState.selectedColor = chosenColor;

    // Show/hide custom color picker
    if (chosenColor === 'custom') {
      customPicker.style.display = 'flex';
    } else {
      customPicker.style.display = 'none';
    }

    // Update the badge display
    const colorInfo    = BALL_COLORS[chosenColor];
    colorBadge.textContent  = colorInfo.label;
    colorBadge.className    = 'color-badge ' + colorInfo.badgeClass;

    // Tell the backend about the color change
    sendColorToBackend(chosenColor);

    showStatusMessage('🎨 Ball color changed to: ' + colorInfo.label);
    console.log('Ball color set to:', chosenColor);
  });
});

// ---- When user picks a custom color from the color picker ----
colorPickerInput.addEventListener('input', function() {
  const hexColor = colorPickerInput.value; // e.g. "#3a7bd5"
  colorPreview.textContent = 'Selected: ' + hexColor;

  // Convert hex (#RRGGBB) to individual R, G, B numbers
  const r = parseInt(hexColor.slice(1, 3), 16); // Characters 1-2
  const g = parseInt(hexColor.slice(3, 5), 16); // Characters 3-4
  const b = parseInt(hexColor.slice(5, 7), 16); // Characters 5-6

  // Update the custom detection targets
  BALL_COLORS.custom.targetR = r;
  BALL_COLORS.custom.targetG = g;
  BALL_COLORS.custom.targetB = b;

  // Update custom dot/line color to match selected color
  BALL_COLORS.custom.dotColor  = hexColor;
  BALL_COLORS.custom.lineColor = hexColor;

  // Update badge
  colorBadge.textContent = '🎨 Custom (' + hexColor + ')';

  // Tell the backend about this custom color
  sendColorToBackend('custom', { r, g, b, hex: hexColor });

  console.log('Custom color set:', hexColor, '→ RGB(', r, g, b, ')');
});

// ---- Send selected color to backend ----
async function sendColorToBackend(colorName, customRgb = null) {
  try {
    const payload = {
      color_name: colorName,
      custom_rgb: customRgb   // Only used when colorName is "custom"
    };

    await fetch(BACKEND_URL + '/api/ball-color', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    });

    console.log('✅ Color sent to backend:', colorName);
  } catch (error) {
    // Don't show an error — backend color sync is optional
    console.log('Backend color sync skipped (backend may be offline)');
  }
}

// =============================================
// SECTION 2 — MODE BUTTONS
// =============================================
gameModeBtn.addEventListener('click', function () {
  appState.mode = 'game';
  gameModeBtn.style.background    = '#ff6b35'; // Highlight active mode
  coachingModeBtn.style.background = '#00d4aa';
  showStatusMessage('🎮 Game Mode ON — Upload a delivery clip!');
});

coachingModeBtn.addEventListener('click', function () {
  appState.mode = 'coaching';
  coachingModeBtn.style.background = '#ff6b35';
  gameModeBtn.style.background     = '#00d4aa';
  showStatusMessage('📋 Coaching Mode ON — Upload any clip to review!');
});

// =============================================
// SECTION 3 — VIDEO UPLOAD
// =============================================
uploadClipBtn.addEventListener('click', function () {
  const filePicker  = document.createElement('input');
  filePicker.type   = 'file';
  filePicker.accept = 'video/*';

  filePicker.addEventListener('change', function () {
    const file = filePicker.files[0];
    if (!file) return;

    // Warn if file is too large
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > 150) {
      alert('⚠️ File is ' + sizeMB.toFixed(1) + 'MB — try a 10-20 second clip!');
      return;
    }

    // Load video into player
    videoPlayer.src = URL.createObjectURL(file);
    videoPlayer.load();

    // Reset trajectory when new video loads
    appState.trajectoryPoints = [];
    ctx.clearRect(0, 0, trajectoryCanvas.width, trajectoryCanvas.height);

    videoPlayer.addEventListener('canplay', function () {
      resizeCanvas();
      drawStumps();
      showStatusMessage('✅ Loaded: ' + file.name);
    }, { once: true }); // "once: true" means this only fires one time

    // Auto-record delivery when video ends
    videoPlayer.addEventListener('ended', function () {
      showStatusMessage('🏏 Delivery complete!');
      if (appState.trajectoryPoints.length > 0) {
        sendTrajectoryToBackend();
      }
    }, { once: true });
  });

  filePicker.click();
});

// =============================================
// SECTION 4 — BALL DETECTION (Frame by Frame)
// =============================================

// ---- Start Detection ----
startDetectionBtn.addEventListener('click', function () {
  if (!videoPlayer.src) {
    alert('⚠️ Please upload a video first!');
    return;
  }

  appState.isDetecting      = true;
  appState.trajectoryPoints = []; // Clear old points
  startDetectionBtn.disabled = true;
  stopDetectionBtn.disabled  = false;
  detectionStatus.textContent = 'Detection: 🔍 Running...';
  detectionStatus.style.color = '#00d4aa';

  videoPlayer.play();

  // Run detection every 80 milliseconds (~12 frames per second)
  // This gives us enough points without being too slow
  appState.detectionInterval = setInterval(detectBallInFrame, 80);

  showStatusMessage('🔍 Ball detection started!');
});

// ---- Stop Detection ----
stopDetectionBtn.addEventListener('click', stopDetection);

function stopDetection() {
  appState.isDetecting = false;
  clearInterval(appState.detectionInterval);
  startDetectionBtn.disabled  = false;
  stopDetectionBtn.disabled   = true;
  detectionStatus.textContent = 'Detection: ⏹ Stopped';
  detectionStatus.style.color = '#aaaaaa';

  showStatusMessage('⏹ Detection stopped — ' + appState.trajectoryPoints.length + ' points captured');

  // If we have points, send them to the backend automatically
  if (appState.trajectoryPoints.length >= 3) {
    sendTrajectoryToBackend();
  }
}

// ---- THE CORE DETECTION FUNCTION (Now Color-Aware!) ----
function detectBallInFrame() {
  if (!appState.isDetecting || videoPlayer.paused || videoPlayer.ended) {
    stopDetection();
    return;
  }

  // Step 1: Capture current video frame into hidden canvas
  frameCtx.drawImage(videoPlayer, 0, 0, frameCanvas.width, frameCanvas.height);
  const imageData = frameCtx.getImageData(0, 0, frameCanvas.width, frameCanvas.height);
  const pixels    = imageData.data;

  // Step 2: Get the CURRENT color's detection function
  // This is the key change — instead of always checking red,
  // we look up whichever color the user selected!
  const colorConfig  = BALL_COLORS[appState.selectedColor];
  const detectPixel  = colorConfig.detect.bind(colorConfig);
  // .bind(colorConfig) is needed so "this" works inside the detect function

  let ballX     = 0;
  let ballY     = 0;
  let ballCount = 0;

  // Step 3: Scan every pixel
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];       // Red
    const g = pixels[i + 1];   // Green
    const b = pixels[i + 2];   // Blue
    // pixels[i + 3] is Alpha (transparency) — we ignore it

    // Use the color-specific detection function
    if (detectPixel(r, g, b)) {
      const pixelIndex = i / 4;
      const pixelX     = pixelIndex % frameCanvas.width;
      const pixelY     = Math.floor(pixelIndex / frameCanvas.width);

      ballX     += pixelX;
      ballY     += pixelY;
      ballCount++;
    }
  }

  // Step 4: If enough matching pixels found → record ball position
  // We use different thresholds per color:
  // White needs more pixels (background noise), red/green need fewer
  const minPixelThreshold = appState.selectedColor === 'white' ? 25 : 10;

  if (ballCount > minPixelThreshold) {
    const avgX = Math.round(ballX / ballCount);
    const avgY = Math.round(ballY / ballCount);

    const point = {
      x:         avgX,
      y:         avgY,
      timestamp: parseFloat(videoPlayer.currentTime.toFixed(3)),
      color:     appState.selectedColor  // ← Store which color was used
    };

    appState.trajectoryPoints.push(point);

    // Draw trajectory using the correct color for the ball
    drawTrajectory(appState.trajectoryPoints);
    drawStumps();

    detectionStatus.textContent =
      'Detection: 🔍 ' + appState.trajectoryPoints.length +
      ' pts (' + colorConfig.label + ')';
  }
}


// =============================================
// SECTION 5 — DRAWING FUNCTIONS
// =============================================

// ---- Draw the Ball Trajectory ----
function drawTrajectory(points) {
  if (points.length < 2) return;

  ctx.clearRect(0, 0, trajectoryCanvas.width, trajectoryCanvas.height);

  // Get the color config for the CURRENT selected color
  const colorConfig = BALL_COLORS[appState.selectedColor];

  // Draw the trajectory line using the ball's color
  ctx.beginPath();
  ctx.strokeStyle = colorConfig.lineColor;  // ← Dynamic color!
  ctx.lineWidth   = 3;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';

  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();

  // Draw dots at each point using the ball's color
  points.forEach(function(point, index) {
    ctx.beginPath();
    const radius = (index === points.length - 1) ? 8 : 5;
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    // Last dot is white (most recent position)
    ctx.fillStyle = index === points.length - 1 ? '#ffffff' : colorConfig.dotColor;
    ctx.fill();
  });

  drawStumps();
}


// ---- Draw the Stumps ----
function drawStumps() {
  const { leftX, rightX, topY, bottomY } = appState.stumps;
  const midX = Math.round((leftX + rightX) / 2);

  ctx.lineWidth = 4;

  // Draw 3 stumps
  [leftX, midX, rightX].forEach(function (x) {
    ctx.beginPath();
    ctx.strokeStyle = '#ffffff';
    ctx.moveTo(x, topY);
    ctx.lineTo(x, bottomY);
    ctx.stroke();
  });

  // Draw bails (top crossbar)
  ctx.beginPath();
  ctx.strokeStyle = '#ffdd00';
  ctx.lineWidth   = 3;
  ctx.moveTo(leftX,  topY);
  ctx.lineTo(rightX, topY);
  ctx.stroke();
}

// ---- Display LBW Verdict on Canvas ----
function displayLBWVerdict(lbwResult) {
  const isOut    = lbwResult.prediction.includes('OUT -');
  const bgColour = isOut ? 'rgba(200,0,0,0.82)' : 'rgba(0,160,80,0.82)';

  // Draw verdict banner at top of canvas
  ctx.fillStyle = bgColour;
  ctx.fillRect(0, 0, trajectoryCanvas.width, 76);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';

  ctx.font = 'bold 26px Arial';
  ctx.fillText(lbwResult.prediction, trajectoryCanvas.width / 2, 34);

  ctx.font = '14px Arial';
  ctx.fillText(
    'Confidence: ' + lbwResult.confidence + '%   |   ' + lbwResult.reason,
    trajectoryCanvas.width / 2,
    60
  );

  ctx.textAlign = 'left';

  showStatusMessage(
    (isOut ? '🔴 OUT!' : '🟢 NOT OUT!') + ' ' + lbwResult.confidence + '% confident'
  );
}

// ---- Clear Trajectory ----
clearTrajectoryBtn.addEventListener('click', function () {
  appState.trajectoryPoints = [];
  ctx.clearRect(0, 0, trajectoryCanvas.width, trajectoryCanvas.height);
  drawStumps();
  showStatusMessage('🗑 Trajectory cleared');
});

// =============================================
// SECTION 6 — BACKEND COMMUNICATION
// =============================================

// ---- Send Trajectory to Backend ----
async function sendTrajectoryToBackend() {
  if (appState.trajectoryPoints.length < 2) {
    showStatusMessage('⚠️ Not enough points yet — keep detecting!');
    return;
  }

  const deliveryId = 'del_' + Date.now();
  appState.localDeliveryIds.push(deliveryId);

  // Keep only last 6 IDs
  if (appState.localDeliveryIds.length > 6) {
    appState.localDeliveryIds.shift();
  }

  try {
    const response = await fetch(BACKEND_URL + '/api/trajectory', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        delivery_id: deliveryId,
        coordinates: appState.trajectoryPoints,
        ball_color:   appState.selectedColor    // ← Send color to backend!
      })
    });

    const result = await response.json();

    // Show the LBW verdict on canvas
    if (result.lbw_result) {
      displayLBWVerdict(result.lbw_result);
    }

    // Update delivery history panel
    addClipToHistory(
      deliveryId,
      result.lbw_result ? result.lbw_result.prediction : 'Sent',
      appState.trajectoryPoints.length
    );

    console.log('✅ Backend replied:', result);

  } catch (error) {
    showStatusMessage('❌ Cannot reach backend — is it running?');
    console.error(error);
  }
}

// ---- Load Delivery History from Backend ----
async function loadDeliveryHistory() {
  try {
    const response = await fetch(BACKEND_URL + '/api/deliveries');
    const data     = await response.json();

    clipList.innerHTML = '';
    data.deliveries.forEach(function (delivery) {
      const verdict = delivery.lbw_result
        ? delivery.lbw_result.prediction
        : 'No verdict';
      addClipToHistory(delivery.delivery_id, verdict, delivery.total_points);
    });
  } catch (error) {
    console.log('Backend not reachable yet — that is OK!');
  }
}

// ---- Add a Delivery to the History Panel ----
function addClipToHistory(id, verdict, pointCount) {
  // Keep max 6
  while (clipList.children.length >= 6) {
    clipList.removeChild(clipList.firstChild);
  }

  const isOut  = verdict && verdict.includes('OUT -');
  const colour = isOut ? '#ff4444' : '#00d4aa';

  const entry           = document.createElement('div');
  entry.innerHTML       = `
    <span style="color:${colour}; font-weight:bold;">
      ${isOut ? '🔴' : '🟢'} ${verdict || 'Pending'}
    </span>
    <br/>
    <small style="color:#aaa;">ID: ${id} | ${pointCount} pts</small>
  `;
  clipList.appendChild(entry);
}

// ---- Save Clip Button ----
saveClipBtn.addEventListener('click', async function () {
  const lastId = appState.localDeliveryIds[appState.localDeliveryIds.length - 1];

  if (!lastId) {
    alert('⚠️ No delivery to save yet!');
    return;
  }

  try {
    const response = await fetch(BACKEND_URL + '/api/save', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ delivery_id: lastId })
    });
    const result = await response.json();
    showStatusMessage('💾 ' + result.message);
  } catch (error) {
    showStatusMessage('❌ Could not save — is backend running?');
  }
});

// =============================================
// STUMP CALIBRATION — Drag & Drop Corner System
// =============================================

// ---- Calibration State ----
// Tracks everything about the calibration mode
let calibState = {
  isActive:       false,   // Is calibration mode on?
  isDragging:     false,   // Is user currently dragging a handle?
  activeHandle:   null,    // Which handle is being dragged? ('topLeft', 'topRight', etc.)
  handleRadius:   14,      // Size of the draggable corner circles (pixels)
  touchStartX:    0,       // For mobile touch support
  touchStartY:    0
};

// ---- Default Stump Positions ----
// These match the backend STUMP_CONFIG defaults
const DEFAULT_STUMPS = {
  leftX:   290,
  rightX:  350,
  topY:    160,
  bottomY: 300
};

// ---- The 4 Corner Handles ----
// Each handle has a name, and functions to get/set its x,y position
// This design means: moving one handle only affects its corner
function getHandles() {
  return {
    topLeft: {
      name: 'topLeft',
      x:    appState.stumps.leftX,
      y:    appState.stumps.topY,
      // When this handle moves, update leftX and topY
      setPos: function(x, y) {
        appState.stumps.leftX = x;
        appState.stumps.topY  = y;
      }
    },
    topRight: {
      name: 'topRight',
      x:    appState.stumps.rightX,
      y:    appState.stumps.topY,
      // When this handle moves, update rightX and topY
      setPos: function(x, y) {
        appState.stumps.rightX = x;
        appState.stumps.topY   = y;
      }
    },
    bottomLeft: {
      name: 'bottomLeft',
      x:    appState.stumps.leftX,
      y:    appState.stumps.bottomY,
      setPos: function(x, y) {
        appState.stumps.leftX   = x;
        appState.stumps.bottomY = y;
      }
    },
    bottomRight: {
      name: 'bottomRight',
      x:    appState.stumps.rightX,
      y:    appState.stumps.bottomY,
      setPos: function(x, y) {
        appState.stumps.rightX  = x;
        appState.stumps.bottomY = y;
      }
    }
  };
}

// =============================================
// DRAWING — Stumps WITH drag handles
// =============================================

function drawStumps() {
  const { leftX, rightX, topY, bottomY } = appState.stumps;
  const midX = Math.round((leftX + rightX) / 2);

  // ---- Draw 3 stump posts ----
  ctx.lineWidth   = 4;
  ctx.strokeStyle = '#ffffff';

  [leftX, midX, rightX].forEach(function(x) {
    ctx.beginPath();
    ctx.moveTo(x, topY);
    ctx.lineTo(x, bottomY);
    ctx.stroke();
  });

  // ---- Draw bails ----
  ctx.beginPath();
  ctx.strokeStyle = '#ffdd00';
  ctx.lineWidth   = 3;
  ctx.moveTo(leftX,  topY);
  ctx.lineTo(rightX, topY);
  ctx.stroke();

  // ---- If in calibration mode, draw the corner handles ----
  if (calibState.isActive) {
    drawCalibrationHandles();
  }
}

// ---- Draw the 4 draggable corner handles ----
function drawCalibrationHandles() {
  const handles = getHandles();
  const radius  = calibState.handleRadius;

  Object.values(handles).forEach(function(handle) {
    const isActive = (calibState.activeHandle === handle.name);

    // Outer glow ring (makes handle easier to see)
    ctx.beginPath();
    ctx.arc(handle.x, handle.y, radius + 4, 0, Math.PI * 2);
    ctx.fillStyle = isActive
      ? 'rgba(255, 107, 53, 0.35)'   // Orange glow when dragging
      : 'rgba(255, 221, 0, 0.20)';   // Yellow glow when idle
    ctx.fill();

    // Main handle circle
    ctx.beginPath();
    ctx.arc(handle.x, handle.y, radius, 0, Math.PI * 2);
    ctx.fillStyle   = isActive ? '#ff6b35' : '#ffdd00';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 2;
    ctx.fill();
    ctx.stroke();

    // Small dot in centre of handle
    ctx.beginPath();
    ctx.arc(handle.x, handle.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = isActive ? '#ffffff' : '#1a1a2e';
    ctx.fill();
  });

  // Draw a dashed bounding box around the stump area
  // This helps users see what they're resizing
  const { leftX, rightX, topY, bottomY } = appState.stumps;
  ctx.beginPath();
  ctx.setLineDash([6, 4]);           // Dashed line
  ctx.strokeStyle = 'rgba(255, 221, 0, 0.5)';
  ctx.lineWidth   = 1.5;
  ctx.rect(leftX, topY, rightX - leftX, bottomY - topY);
  ctx.stroke();
  ctx.setLineDash([]);               // Reset to solid line

  // Draw calibration mode label at top of canvas
  ctx.fillStyle = 'rgba(255, 107, 53, 0.85)';
  ctx.fillRect(0, 0, trajectoryCanvas.width, 30);
  ctx.fillStyle = '#ffffff';
  ctx.font      = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(
    '📐 CALIBRATION MODE — Drag the yellow handles to resize stumps',
    trajectoryCanvas.width / 2,
    20
  );
  ctx.textAlign = 'left';
}

// ---- Update live coordinate display below canvas ----
function updateCoordDisplay() {
  const { leftX, rightX, topY, bottomY } = appState.stumps;

  document.getElementById('coordTopLeft').textContent
    = `x:${Math.round(leftX)}, y:${Math.round(topY)}`;

  document.getElementById('coordTopRight').textContent
    = `x:${Math.round(rightX)}, y:${Math.round(topY)}`;

  document.getElementById('coordBotLeft').textContent
    = `x:${Math.round(leftX)}, y:${Math.round(bottomY)}`;

  document.getElementById('coordBotRight').textContent
    = `x:${Math.round(rightX)}, y:${Math.round(bottomY)}`;
}

// =============================================
// CALIBRATION MODE TOGGLE
// =============================================

const toggleCalibBtn   = document.getElementById('toggleCalibrationBtn');
const resetStumpsBtn   = document.getElementById('resetStumpsBtn');
const saveCalibBtn     = document.getElementById('saveCalibrationBtn');

// ---- Enter / Exit Calibration Mode ----
toggleCalibBtn.addEventListener('click', function() {

  calibState.isActive = !calibState.isActive;   // Flip the mode

  if (calibState.isActive) {
    // --- ENTERING calibration mode ---
    toggleCalibBtn.textContent = '✅ Exit Calibration Mode';
    toggleCalibBtn.classList.add('calibrating');
    trajectoryCanvas.classList.add('calibration-active');
    saveCalibBtn.disabled = false;
    showStatusMessage('📐 Calibration Mode ON — drag the yellow corners!');

  } else {
    // --- EXITING calibration mode ---
    toggleCalibBtn.textContent = '📐 Enter Calibration Mode';
    toggleCalibBtn.classList.remove('calibrating');
    trajectoryCanvas.classList.remove('calibration-active');
    trajectoryCanvas.classList.remove('dragging-handle');
    calibState.isDragging   = false;
    calibState.activeHandle = null;
    showStatusMessage('📐 Calibration Mode OFF');
  }

  // Redraw canvas to show/hide handles
  ctx.clearRect(0, 0, trajectoryCanvas.width, trajectoryCanvas.height);
  if (appState.trajectoryPoints.length > 0) {
    drawTrajectory(appState.trajectoryPoints);
  }
  drawStumps();
});

// ---- Reset stumps to default positions ----
resetStumpsBtn.addEventListener('click', function() {
  appState.stumps.leftX   = DEFAULT_STUMPS.leftX;
  appState.stumps.rightX  = DEFAULT_STUMPS.rightX;
  appState.stumps.topY    = DEFAULT_STUMPS.topY;
  appState.stumps.bottomY = DEFAULT_STUMPS.bottomY;

  updateCoordDisplay();

  ctx.clearRect(0, 0, trajectoryCanvas.width, trajectoryCanvas.height);
  if (appState.trajectoryPoints.length > 0) {
    drawTrajectory(appState.trajectoryPoints);
  }
  drawStumps();

  showStatusMessage('🔄 Stumps reset to default position');
});

// =============================================
// MOUSE EVENT HANDLERS — Desktop
// =============================================

// ---- Helper: Get mouse position relative to canvas ----
function getCanvasPos(event) {
  const rect  = trajectoryCanvas.getBoundingClientRect();

  // Scale factor: canvas internal size vs display size
  // This is important because CSS may scale the canvas differently
  const scaleX = trajectoryCanvas.width  / rect.width;
  const scaleY = trajectoryCanvas.height / rect.height;

  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top)  * scaleY
  };
}

// ---- Helper: Check if position is inside a handle circle ----
function getHandleAtPos(x, y) {
  const handles = getHandles();
  const radius  = calibState.handleRadius + 6;  // Slightly bigger hit area

  for (const handle of Object.values(handles)) {
    const dist = Math.sqrt(
      Math.pow(x - handle.x, 2) +
      Math.pow(y - handle.y, 2)
    );
    if (dist <= radius) {
      return handle;   // Return the handle that was clicked
    }
  }
  return null;   // Nothing found
}

// ---- Mouse Down — start dragging ----
trajectoryCanvas.addEventListener('mousedown', function(e) {
  if (!calibState.isActive) return;  // Only work in calibration mode

  const pos    = getCanvasPos(e);
  const handle = getHandleAtPos(pos.x, pos.y);

  if (handle) {
    calibState.isDragging   = true;
    calibState.activeHandle = handle.name;
    trajectoryCanvas.classList.add('dragging-handle');
    e.preventDefault();   // Prevent text selection while dragging
  }
});

// ---- Mouse Move — update handle position ----
trajectoryCanvas.addEventListener('mousemove', function(e) {
  if (!calibState.isActive) return;

  const pos = getCanvasPos(e);

  if (calibState.isDragging && calibState.activeHandle) {
    // Get the handle being dragged
    const handles      = getHandles();
    const activeHandle = handles[calibState.activeHandle];

    // Clamp position so handle can't go outside canvas
    const clampedX = Math.max(10, Math.min(trajectoryCanvas.width  - 10, pos.x));
    const clampedY = Math.max(10, Math.min(trajectoryCanvas.height - 10, pos.y));

    // Move the handle
    activeHandle.setPos(clampedX, clampedY);

    // Ensure stumps don't invert (left can't go past right, top can't go past bottom)
    const minWidth  = 30;   // Minimum stump width in pixels
    const minHeight = 60;   // Minimum stump height in pixels

    if (appState.stumps.rightX - appState.stumps.leftX < minWidth) {
      if (calibState.activeHandle.includes('Left')) {
        appState.stumps.leftX = appState.stumps.rightX - minWidth;
      } else {
        appState.stumps.rightX = appState.stumps.leftX + minWidth;
      }
    }

    if (appState.stumps.bottomY - appState.stumps.topY < minHeight) {
      if (calibState.activeHandle.includes('top')) {
        appState.stumps.topY = appState.stumps.bottomY - minHeight;
      } else {
        appState.stumps.bottomY = appState.stumps.topY + minHeight;
      }
    }

    // Redraw canvas with updated stump positions
    ctx.clearRect(0, 0, trajectoryCanvas.width, trajectoryCanvas.height);
    if (appState.trajectoryPoints.length > 0) {
      drawTrajectory(appState.trajectoryPoints);
    } else {
      drawStumps();
    }

    // Update live coordinate readout
    updateCoordDisplay();

  } else {
    // Not dragging — just check if hovering over a handle
    // Change cursor to "grab" if hovering over one
    const handle = getHandleAtPos(pos.x, pos.y);
    trajectoryCanvas.style.cursor = handle ? 'grab' : 'crosshair';
  }
});

// ---- Mouse Up — stop dragging ----
trajectoryCanvas.addEventListener('mouseup', function() {
  if (calibState.isDragging) {
    calibState.isDragging   = false;
    calibState.activeHandle = null;
    trajectoryCanvas.classList.remove('dragging-handle');
    trajectoryCanvas.style.cursor = 'crosshair';
  }
});

// ---- Mouse Leave canvas — stop dragging (safety) ----
trajectoryCanvas.addEventListener('mouseleave', function() {
  if (calibState.isDragging) {
    calibState.isDragging   = false;
    calibState.activeHandle = null;
    trajectoryCanvas.classList.remove('dragging-handle');
  }
});

// =============================================
// TOUCH EVENT HANDLERS — Mobile Support
// =============================================

// ---- Touch Start ----
trajectoryCanvas.addEventListener('touchstart', function(e) {
  if (!calibState.isActive) return;

  const touch  = e.touches[0];
  const rect   = trajectoryCanvas.getBoundingClientRect();
  const scaleX = trajectoryCanvas.width  / rect.width;
  const scaleY = trajectoryCanvas.height / rect.height;

  const pos    = {
    x: (touch.clientX - rect.left) * scaleX,
    y: (touch.clientY - rect.top)  * scaleY
  };

  const handle = getHandleAtPos(pos.x, pos.y);

  if (handle) {
    calibState.isDragging   = true;
    calibState.activeHandle = handle.name;
    e.preventDefault();   // Prevent page scrolling while dragging
  }
}, { passive: false });

// ---- Touch Move ----
trajectoryCanvas.addEventListener('touchmove', function(e) {
  if (!calibState.isActive || !calibState.isDragging) return;

  const touch  = e.touches[0];
  const rect   = trajectoryCanvas.getBoundingClientRect();
  const scaleX = trajectoryCanvas.width  / rect.width;
  const scaleY = trajectoryCanvas.height / rect.height;

  const pos = {
    x: (touch.clientX - rect.left) * scaleX,
    y: (touch.clientY - rect.top)  * scaleY
  };

  if (calibState.activeHandle) {
    const handles      = getHandles();
    const activeHandle = handles[calibState.activeHandle];

    const clampedX = Math.max(10, Math.min(trajectoryCanvas.width  - 10, pos.x));
    const clampedY = Math.max(10, Math.min(trajectoryCanvas.height - 10, pos.y));

    activeHandle.setPos(clampedX, clampedY);

    // Enforce minimum stump size
    const minWidth  = 30;
    const minHeight = 60;

    if (appState.stumps.rightX - appState.stumps.leftX < minWidth) {
      if (calibState.activeHandle.includes('Left')) {
        appState.stumps.leftX = appState.stumps.rightX - minWidth;
      } else {
        appState.stumps.rightX = appState.stumps.leftX + minWidth;
      }
    }

    if (appState.stumps.bottomY - appState.stumps.topY < minHeight) {
      if (calibState.activeHandle.includes('top')) {
        appState.stumps.topY = appState.stumps.bottomY - minHeight;
      } else {
        appState.stumps.bottomY = appState.stumps.topY + minHeight;
      }
    }

    ctx.clearRect(0, 0, trajectoryCanvas.width, trajectoryCanvas.height);
    if (appState.trajectoryPoints.length > 0) {
      drawTrajectory(appState.trajectoryPoints);
    } else {
      drawStumps();
    }

    updateCoordDisplay();
  }

  e.preventDefault();
}, { passive: false });

// ---- Touch End ----
trajectoryCanvas.addEventListener('touchend', function() {
  calibState.isDragging   = false;
  calibState.activeHandle = null;
});

// =============================================
// SAVE CALIBRATION — Sends to Backend
// =============================================

saveCalibBtn.addEventListener('click', async function() {
  const { leftX, rightX, topY, bottomY } = appState.stumps;

  const config = {
    left_stump:   { x: Math.round(leftX)   },
    right_stump:  { x: Math.round(rightX)  },
    top_stump:    { y: Math.round(topY)     },
    bottom_stump: { y: Math.round(bottomY) }
  };

  // Save to localStorage so calibration persists after refresh!
  localStorage.setItem('stumpCalibration', JSON.stringify(config));

  try {
    // Also send to backend
    const response = await fetch(BACKEND_URL + '/api/stumps', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(config)
    });
    const result = await response.json();
    showStatusMessage('💾 Calibration saved! ' + result.message);
  } catch (error) {
    // If backend is offline, at least local save worked
    showStatusMessage('💾 Calibration saved locally!');
  }

  console.log('📐 Calibration saved:', config);
});

// ---- Load saved calibration on startup ----
function loadSavedCalibration() {
  const saved = localStorage.getItem('stumpCalibration');
  if (saved) {
    try {
      const config = JSON.parse(saved);
      appState.stumps.leftX   = config.left_stump.x;
      appState.stumps.rightX  = config.right_stump.x;
      appState.stumps.topY    = config.top_stump.y;
      appState.stumps.bottomY = config.bottom_stump.y;
      updateCoordDisplay();
      console.log('📐 Loaded saved calibration from device');
      showStatusMessage('📐 Previous calibration loaded!');
    } catch (e) {
      console.log('No saved calibration found — using defaults');
    }
  }
}


// =============================================
// SECTION 8 — STATUS MESSAGE POPUP
// =============================================
function showStatusMessage(message) {
  let box = document.getElementById('statusMessage');
  if (!box) {
    box    = document.createElement('div');
    box.id = 'statusMessage';
    document.body.appendChild(box);
  }
  box.textContent = message;
  box.style.opacity = '1';

  clearTimeout(box._timer);
  box._timer = setTimeout(function () {
    box.style.opacity = '0';
  }, 3000);
}

// =============================================
// SECTION 9 — STARTUP
// =============================================
resizeCanvas();
loadSavedCalibration();    // ← Load any previously saved calibration
drawStumps();
updateCoordDisplay();      // ← Show initial coordinates
loadDeliveryHistory();
console.log('🏏 Cricket DRS App loaded — Drag & Drop calibration ready!');
