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

// New function using takeWindowsScreenshotByHandle
async function runWindowScreenshotOCR(handle, timestamp) {
  logOCR({ message: `[runWindowScreenshotOCR] Called with handle: ${handle}, timestamp: ${timestamp}` });
  if (!handle) {
    logOCR({ message: 'No game window handle provided for OCR', level: 'error' });
    return;
  }
  try {
    overwolf.media.takeWindowsScreenshotByHandle(
      handle,
      false,
      result => {
        const now = new Date().toISOString();
        logOCR({ message: `[${now}] Screenshot result: success=${result.success}, url=${result.url}, error=${result.error}` });
        if (!result.success) {
          logOCR({ message: `Window screenshot OCR error: ${result.error}`, level: 'error' });
          return;
        }
        logOCR({ message: `🔍 Starting window screenshot OCR...`, level: 'info' });
        // Take screenshot of the entire game window
        const screenshotPath = result.path;
        logOCR({ message: `📸 Screenshot saved: ${screenshotPath}`, level: 'info' });
        // --- Fix: Check if screenshotPath is the same as last time ---
        if (window._lastScreenshotPath === screenshotPath) {
          logOCR({ message: `⚠️ Screenshot path did not change! Possible stale image.`, level: 'warn' });
        }
        window._lastScreenshotPath = screenshotPath;

        // Process each scan box
        for (const box of scanBoxes) {
          try {
            drawOCRBox(box);
            logOCR({ message: `🔍 Processing box at (${box.x}, ${box.y})...`, level: 'info' });

            // Load the screenshot directly from the file path
            const img = new Image();
            img.onload = () => {
              // Create canvas and crop the image
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              canvas.width = box.width;
              canvas.height = box.height;
              
              // Draw the cropped portion
              ctx.drawImage(img, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
              
              // Convert canvas to blob for Tesseract
              const blob = canvas.toBlob(
                b => {
                  if (b) {
                    processOCR(b);
                  } else {
                    logOCR({ message: '❌ Canvas toBlob error: blob is null', level: 'error' });
                  }
                },
                'image/jpeg'
              );
            };
            img.onerror = (e) => {
              // --- Fix: Log the full error event for better debugging ---
              logOCR({ message: `❌ Image load error: ${e?.message || e?.type || e}`, level: 'error', event: JSON.stringify(e) });
            };
            // Use file:/// protocol for local files
            // --- Fix: Increase delay to 500ms to ensure file is written ---
            setTimeout(() => {
              const cacheBuster = `?_cb=${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
              img.src = 'file:///' + screenshotPath.replace(/\\/g, '/') + cacheBuster;
            }, 500); // 500ms delay (was 100ms)
          } catch (err) {
            logOCR({ message: `❌ Box processing error: ${err.message}`, level: 'error' });
          }
        }
      }
    );
  } catch (err) {
    logOCR({ message: `Window screenshot OCR error: ${err.message}`, level: 'error' });
  }
}

// Keep existing function for fallback
async function runOverlayOCR() {
  for (const box of scanBoxes) {
    try {
      drawOCRBox(box);
      logOCR({ message: `🔍 Scanning box at (${box.x}, ${box.y})...`, level: 'info' });

      const screenshotParams = {
        roundAwayFromZero: true,
        crop: {
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height
        }
      };

      const url = await new Promise((resolve, reject) => {
        overwolf.media.getScreenshotUrl(screenshotParams, res => {
          if (res.success) resolve(res.url);
          else reject(new Error(`getScreenshotUrl failed: ${res.error}`));
        });
      });

      const result = await Tesseract.recognize(url, 'eng', {
        logger: m => logOCR({ message: `[Tesseract] ${m.status} - ${Math.floor(m.progress * 100)}%`, level: 'debug' })
      });

      const text = result.data.text.trim().replace(/\n/g, ' ');
      const match = text.match(/[A-Za-z0-9_]{3,20}/);

      if (match) {
        const username = match[0];
        logOCR({ message: `✅ Username detected: ${username}`, level: 'success' });
        overwolf.windows.sendMessage('background', 'username_found', username, () => {});
        overwolf.windows.sendMessage('ocr_log', 'ocr_log_update', { message: `✅ Username detected: ${username}`, level: 'success' }, () => {});
        return;
      } else {
        logOCR({ message: `⚠️ No match found in box (${box.x},${box.y})`, level: 'warn' });
      }
    } catch (err) {
      logOCR({ message: `❌ OCR error: ${err.message}`, level: 'error' });
    }
  }
}

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

  if (message.id === 'draw_debug_box') {
    drawOCRBox(message.content);
  }

  if (message.id === 'initiate_ocr') {
    console.log('[Main] OCR initiated from background');
    const handle = message.content && message.content.handle;
    const timestamp = message.content && message.content.timestamp;
    runWindowScreenshotOCR(handle, timestamp);
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
