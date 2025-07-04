console.log('[Main] Script loaded ✅');

// --- Elements ---
const arcElimination = document.getElementById('arc-elimination');
const arcDeath = document.getElementById('arc-death');
const roundStatus = document.getElementById('round-status') || document.getElementById('overlay-status');
const usernameDisplay = document.getElementById('username-display');
const debugOverlay = document.getElementById('debug-overlay');

// --- Game State ---
let totalKills = 0;
let totalDeaths = 0;

// --- Current Visual State ---
let currentKills = 0;
let currentDeaths = 0;
let animationStartTime = null;
let animationInProgress = false;

const animationDuration = 700;
const circumference = 2 * Math.PI * 100;

// --- OCR Logic for Overlay ---
const scanBoxes = [
  { x: 765, y: 285, width: 478, height: 34 },
  { x: 783, y: 161, width: 474, height: 31 },
  { x: 791, y: 68,  width: 384, height: 33 }
];

// --- Animate Donut ---
function animateDonut(timestamp) {
  if (!animationStartTime) animationStartTime = timestamp;
  const elapsed = timestamp - animationStartTime;
  const progress = Math.min(elapsed / animationDuration, 1);
  const ease = progress * (2 - progress);

  const kills = currentKills + (totalKills - currentKills) * ease;
  const deaths = currentDeaths + (totalDeaths - currentDeaths) * ease;

  const total = kills + deaths || 1;
  const killFraction = kills / total;
  const deathFraction = deaths / total;

  const killArc = circumference * killFraction;
  const deathArc = circumference * deathFraction;

  if (arcElimination) {
    arcElimination.setAttribute('stroke-dasharray', `${killArc} ${circumference - killArc}`);
  }
  if (arcDeath) {
    arcDeath.setAttribute('stroke-dasharray', `${deathArc} ${circumference - deathArc}`);
    arcDeath.setAttribute('stroke-dashoffset', `-${killArc}`);
  }

  if (progress < 1) {
    requestAnimationFrame(animateDonut);
  } else {
    currentKills = totalKills;
    currentDeaths = totalDeaths;
    animationInProgress = false;
    animationStartTime = null;
  }
}

function startAnimation() {
  if (!animationInProgress) {
    animationInProgress = true;
    animationStartTime = null;
    requestAnimationFrame(animateDonut);
  }
}

// --- OCR Debug Box Drawing ---
function drawOCRBox({ x, y, width, height }) {
  const overlay = document.getElementById('debug-overlay');
  if (!overlay) {
    console.warn('[Main] No debug overlay container found!');
    return;
  }

  const box = document.createElement('div');
  box.className = 'debug-box';
  box.style.position = 'absolute';
  box.style.border = '2px solid lime';
  box.style.left = `${x}px`;
  box.style.top = `${y}px`;
  box.style.width = `${width}px`;
  box.style.height = `${height}px`;
  box.style.zIndex = 9999;
  box.style.pointerEvents = 'none';

  overlay.appendChild(box);
  setTimeout(() => box.remove(), 4000);
}

// --- Message Handler ---
overwolf.windows.getCurrentWindow(result => {
  console.log('[Main] Running in window:', result.window.name);
});

// --- Request OCR from background window using plugin ---
function requestOcrFromBackground(filePath, box) {
  overwolf.windows.getCurrentWindow(result => {
    const windowName = result.window.name;
    overwolf.windows.sendMessage('background', 'start_ocr', { filePath, box, targetWindow: windowName }, () => {});
  });
}

// --- Listen for OCR result and debug box from background ---
overwolf.windows.onMessageReceived.addListener(message => {
  if (message.id === 'game_event') {
    const data = message.content;
    console.log('[Main] Received game_event:', JSON.stringify(data));

    switch (data.type) {
      case 'game_status':
        if (roundStatus) {
          roundStatus.textContent = ({
            lobby: 'In Lobby',
            ingame: 'In Game',
            death: 'You Died!',
            summary: 'Match Summary'
          })[data.status] || data.status;
          roundStatus.className = `overlay-status ${data.status}`;
        }
        break;

      case 'round_started':
        if (roundStatus && data.started) {
          roundStatus.textContent = 'Round Started';
          roundStatus.className = 'overlay-status ingame';
        }
        break;

      case 'elimination':
        totalKills += data.count || 1;
        startAnimation();
        if (typeof addNotification === 'function') {
          addNotification('elimination', new Date().toLocaleTimeString());
        }
        break;

      case 'death':
        totalDeaths += 1;
        startAnimation();
        if (typeof addNotification === 'function') {
          addNotification('death', new Date().toLocaleTimeString());
        }
        break;
    }
  }

  if (message.id === 'username_found') {
    const name = message.content;
    if (usernameDisplay) {
      usernameDisplay.textContent = `Username: ${name}`;
    }
  }

  if (message.id === 'ocr_username_found') {
    const { username, box, boxIndex, timestamp } = message.content;
    console.log('[Main] OCR username found:', username, 'in box:', boxIndex);
    
    // Update the main username display
    if (usernameDisplay) {
      usernameDisplay.textContent = `Username: ${username}`;
    }
    
    // Add to the usernames list
    addUsernameToList(username, timestamp, boxIndex);
  }

  if (message.id === 'draw_debug_box') {
    drawOCRBox(message.content);
  }

  if (message.id === 'initiate_ocr') {
    console.log('[Main] OCR initiated from background');
    const handle = message.content && message.content.handle;
    const timestamp = message.content && message.content.timestamp;
    // Placeholder for the removed runWindowScreenshotOCR function
  }

  if (message.id === 'ocr_result') {
    if (message.content.success) {
      // Show OCR result in your UI (e.g., log or display)
      console.log('OCR result:', message.content.text);
      // Optionally, display in overlay
    } else {
      console.error('OCR error:', message.content.error);
    }
    // Optionally, draw the debug box (redundant if background already sends it)
    if (message.content.box) drawOCRBox(message.content.box);
  }
});

// --- OCR Log Button ---
const ocrButton = document.getElementById('open-ocr-log');
if (ocrButton) {
  ocrButton.addEventListener('click', () => {
    overwolf.windows.obtainDeclaredWindow('ocr_log', result => {
      if (result.success) {
        overwolf.windows.restore(result.window.id);
      } else {
        console.warn('[Main] Failed to open OCR log:', result.error);
      }
    });
  });
}

function logOCR(message) {
  console.log(`[OCR] ${message.message}`);
  overwolf.windows.sendMessage('ocr_log', 'ocr_log_update', message, () => {});
}

// First draw
startAnimation();

// Add plugin test functionality
const testPluginBtn = document.getElementById('test-plugin-btn');
if (testPluginBtn) {
  testPluginBtn.addEventListener('click', () => {
    console.log('[Main] Testing plugin...');
    overwolf.windows.sendMessage('background', 'test_plugin', {}, () => {});
  });
}

// Add OCR test functionality
const testOcrBtn = document.getElementById('test-ocr-btn');
if (testOcrBtn) {
  testOcrBtn.addEventListener('click', () => {
    console.log('[Main] Testing OCR...');
    overwolf.windows.sendMessage('background', 'test_ocr', {}, () => {});
  });
}

// Add screenshot test functionality
const testScreenshotBtn = document.getElementById('test-screenshot-btn');
if (testScreenshotBtn) {
  testScreenshotBtn.addEventListener('click', () => {
    console.log('[Main] Testing screenshot...');
    overwolf.windows.sendMessage('background', 'test_screenshot', {}, () => {});
  });
}

// Function to add username to the list
function addUsernameToList(username, timestamp, boxIndex) {
  const usernamesList = document.getElementById('usernames-list');
  if (!usernamesList) return;
  
  // Remove "no results" message if it exists
  const noResults = usernamesList.querySelector('.no-results');
  if (noResults) {
    noResults.remove();
  }
  
  // Create new username item
  const usernameItem = document.createElement('div');
  usernameItem.className = 'username-item';
  
  const time = new Date(timestamp).toLocaleTimeString();
  
  usernameItem.innerHTML = `
    <span class="username-text">${username}</span>
    <span class="username-time">${time} (Box ${boxIndex})</span>
  `;
  
  // Add to the top of the list
  usernamesList.insertBefore(usernameItem, usernamesList.firstChild);
  
  // Limit the list to 10 items
  const items = usernamesList.querySelectorAll('.username-item');
  if (items.length > 10) {
    items[items.length - 1].remove();
  }
}

// Listen for plugin test results
overwolf.windows.onMessageReceived.addListener((message) => {
  if (message.id === 'plugin_test_result') {
    console.log('[Main] Plugin test result:', message.content);
          if (message.content.success) {
        const fileMethods = message.content.fileMethods || [];
        alert(`Plugin test successful!\n\nFile methods: ${fileMethods.join(', ')}\n\nAll methods: ${message.content.methods.join(', ')}`);
      } else {
        alert(`Plugin test failed: ${message.content.error}`);
      }
  }
});

// --- OCR Integration for Ingame Overlay ---
overwolf.windows.onMessageReceived.addListener(async (message) => {
  if (message.id === 'perform_ocr') {
    const { screenshotUrl, box, boxIndex, timestamp } = message.content;
    const text = await runOcrOnScreenshot(screenshotUrl, box);
    overwolf.windows.sendMessage('desktop', 'ocr_username_found', {
      username: text,
      box,
      boxIndex,
      timestamp
    });
  }
});

async function runOcrOnScreenshot(screenshotUrl, box) {
  function overwolfPathToWindows(path) {
    let winPath = path.replace('overwolf://media/screenshots/', '');
    winPath = winPath.replace(/\//g, '\\');
    winPath = decodeURIComponent(winPath);
    if (!winPath.match(/^([a-zA-Z]:\\|\\\\)/)) {
      winPath = `${overwolf.settings.getExtensionSettings().screenshot_folder || ''}\\${winPath}`;
    }
    return winPath;
  }

  return new Promise((resolve) => {
    const windowsPath = overwolfPathToWindows(screenshotUrl);
    overwolf.extensions.current.getExtraObject('simple-io-plugin', (result) => {
      if (result.status === 'success') {
        result.object.getBinaryFile(windowsPath, (fileResult) => {
          if (fileResult.success && fileResult.content) {
            const dataUrl = 'data:image/jpeg;base64,' + fileResult.content;
            console.log('[OCR DEBUG] Data URL:', dataUrl.substring(0, 100) + '...'); // Log first 100 chars
            const img = new Image();
            img.onload = async () => {
              const canvas = document.createElement('canvas');
              canvas.width = box.width;
              canvas.height = box.height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
              // Debug: show the cropped canvas in the overlay
              canvas.style.position = 'fixed';
              canvas.style.top = (10 + 60 * box.y / 1000) + 'px';
              canvas.style.left = (10 + 320 * box.x / 2000) + 'px';
              canvas.style.zIndex = 99999;
              canvas.style.border = '2px solid red';
              document.body.appendChild(canvas);
              setTimeout(() => canvas.remove(), 5000);
              // OCR
              const { data: { text } } = await Tesseract.recognize(canvas, 'eng');
              resolve(text.trim());
            };
            img.onerror = () => resolve('');
            img.src = dataUrl;
          } else {
            resolve('');
          }
        });
      } else {
        resolve('');
      }
    });
  });
}
