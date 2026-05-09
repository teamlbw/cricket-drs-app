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

uploadClipBtn.addEventListener('click', function() {
  // Create a hidden file picker and trigger it
  const filePicker = document.createElement('input');
  filePicker.type = 'file';
  filePicker.accept = 'video/*'; // Only allow video files

  filePicker.addEventListener('change', function() {
    const selectedFile = filePicker.files[0]; // The file the user chose
    if (selectedFile) {
      // Create a temporary URL for the video and load it
      const videoURL = URL.createObjectURL(selectedFile);
      videoPlayer.src = videoURL;
      videoPlayer.play();
      console.log('Video loaded:', selectedFile.name);
    }
  });

  filePicker.click(); // Open the file picker
});

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
