// Enhanced logging utility
function log(component, message, level = 'info', data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    component: `[Main-${component}]`,
    level: level.toUpperCase(),
    message,
    data
  };
  
  const logString = `${logEntry.timestamp} ${logEntry.component} [${logEntry.level}] ${logEntry.message}`;
  
  switch (level) {
    case 'error':
      console.error(logString, data || '');
      break;
    case 'warn':
      console.warn(logString, data || '');
      break;
    case 'debug':
      console.debug(logString, data || '');
      break;
    default:
      console.log(logString, data || '');
  }
  
  // Send to OCR log window if available
  if (window.overwolf) {
    overwolf.windows.sendMessage('ocr_log', 'ocr_log_update', logEntry, () => {
      // Callback to handle any send message errors
    });
  }
}

log('Init', 'Script loaded and initialized', 'success');

// --- Elements ---
const arcElimination = document.getElementById('arc-elimination');
const arcDeath = document.getElementById('arc-death');
const roundStatus = document.getElementById('round-status') || document.getElementById('overlay-status');
const usernameDisplay = document.getElementById('username-display');
const debugOverlay = document.getElementById('debug-overlay');

log('Elements', 'DOM elements initialized', 'debug', {
  arcElimination: !!arcElimination,
  arcDeath: !!arcDeath,
  roundStatus: !!roundStatus,
  usernameDisplay: !!usernameDisplay,
  debugOverlay: !!debugOverlay
});

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

log('Config', 'Scan boxes configured', 'debug', { scanBoxes });

// --- Lobby Event Control ---
let lobbyEventProcessed = false;
let lobbyEventInProgress = false;

// --- Custom OCR Plugin Integration ---
let ocrPlugin = null;
let pluginInitialized = false;

function initializeOcrPlugin() {
  log('Plugin', 'Initializing OCR plugin...', 'info');
  
  overwolf.extensions.current.getExtraObject('RapidOcrNetPlugin', (result) => {
    log('Plugin', 'getExtraObject result:', 'debug', {
      status: result.status,
      error: result.error,
      object: result.object ? 'object exists' : 'no object'
    });
    
    if (result.status === 'success') {
      ocrPlugin = result.object;
      pluginInitialized = true;
      log('Plugin', 'Custom OCR plugin initialized successfully', 'success');
      
      // Test the plugin
      ocrPlugin.Test((testResult) => {
        log('Plugin', 'OCR Plugin test completed', 'debug', testResult);
        
        if (testResult.success) {
          log('Plugin', 'Minimal OCR plugin is ready and operational', 'success');
        } else {
          log('Plugin', 'OCR plugin test failed', 'error', {
            success: testResult.success,
            message: testResult.message,
            error: testResult.error
          });
        }
      });
    } else {
      log('Plugin', 'Failed to initialize OCR plugin', 'error', {
        status: result.status,
        error: result.error
      });
    }
  });
}

// Initialize plugin when script loads
initializeOcrPlugin();

// --- Custom Plugin OCR Functions ---
function takeScreenshotWithPlugin() {
  return new Promise((resolve) => {
    if (!ocrPlugin) {
      log('Screenshot', 'OCR plugin not available for screenshot', 'warn');
      resolve(null);
      return;
    }
    
    log('Screenshot', 'Taking screenshot with plugin...', 'debug');
    
    ocrPlugin.TakeScreenshot((result) => {
      if (result.success) {
        log('Screenshot', 'Plugin screenshot taken successfully', 'success', {
          path: result.path,
          size: result.size || 'unknown'
        });
        resolve(result.path);
      } else {
        log('Screenshot', 'Plugin screenshot failed', 'error', {
          error: result.error,
          details: result.details
        });
        resolve(null);
      }
    });
  });
}

function takeGameScreenshotWithPlugin() {
  return new Promise((resolve) => {
    if (!ocrPlugin) {
      log('Screenshot', 'OCR plugin not available for game screenshot', 'warn');
      resolve(null);
      return;
    }
    
    // Get game window handle using Overwolf API
    overwolf.games.getRunningGameInfo(info => {
      if (info && info.isRunning && info.gameInfo && info.gameInfo.handle) {
        const handle = info.gameInfo.handle;
        log('Screenshot', 'Got game window handle', 'debug', {
          handle: handle,
          gameInfo: info.gameInfo
        });
        
        // For now, use the regular TakeScreenshot method since TakeScreenshotByHandle doesn't exist
        // TODO: Add TakeScreenshotByHandle method to plugin
        ocrPlugin.TakeScreenshot((result) => {
          if (result.success) {
            log('Screenshot', 'Plugin screenshot taken successfully (fallback)', 'success', {
              path: result.path,
              handle: handle
            });
            resolve(result.path);
          } else {
            log('Screenshot', 'Plugin screenshot failed', 'error', {
              error: result.error,
              handle: handle
            });
            resolve(null);
          }
        });
      } else {
        log('Screenshot', 'No game window handle available', 'warn', {
          isRunning: info?.isRunning,
          gameInfo: info?.gameInfo,
          classId: info?.classId
        });
        resolve(null);
      }
    });
  });
}

function performOcrWithPlugin(imagePath, x, y, width, height) {
  return new Promise((resolve) => {
    if (!ocrPlugin) {
      log('OCR', 'OCR plugin not available', 'warn');
      resolve('');
      return;
    }
    
    log('OCR', 'Performing OCR with plugin', 'debug', {
      imagePath,
      region: { x, y, width, height }
    });
    
    ocrPlugin.PerformOCR(imagePath, x, y, width, height, (result) => {
      if (result.success) {
        log('OCR', 'Plugin OCR completed successfully', 'success', {
          text: result.text,
          confidence: result.confidence,
          region: { x, y, width, height }
        });
        resolve(result.text);
      } else {
        log('OCR', 'Plugin OCR failed', 'error', {
          error: result.error,
          region: { x, y, width, height }
        });
        resolve('');
      }
    });
  });
}

function scanUsernameRegionsWithPlugin(imagePath) {
  return new Promise((resolve) => {
    if (!ocrPlugin) {
      log('OCR', 'OCR plugin not available for username scan', 'warn');
      resolve([]);
      return;
    }
    
    log('OCR', 'Scanning username regions with plugin', 'debug', { imagePath });
    
    // Call the plugin's ScanUsernameRegions method
    ocrPlugin.ScanUsernameRegions(imagePath, (result) => {
      if (result.success) {
        log('OCR', 'Plugin username scan completed', 'success', {
          resultsCount: result.results?.length || 0,
          results: result.results
        });
        
        // Clear existing boxes before drawing new ones
        clearOCRBoxes();
        
        // Draw green rectangles for each result
        if (result.results && result.results.length > 0) {
          result.results.forEach((ocrResult) => {
            if (ocrResult.region) {
              drawOCRBox(ocrResult.region);
            }
          });
        }
        
        resolve(result.results || []);
      } else {
        log('OCR', 'Plugin username scan failed', 'error', {
          error: result.error,
          details: result.details
        });
        resolve([]);
      }
    });
  });
}

function getGameWindowInfoWithPlugin() {
  return new Promise((resolve) => {
    if (!ocrPlugin) {
      log('Plugin', 'OCR plugin not available for window info', 'warn');
      resolve(null);
      return;
    }
    
    log('Plugin', 'Getting game window info with plugin', 'debug');
    
    ocrPlugin.GetGameWindowInfo((result) => {
      if (result.success) {
        log('Plugin', 'Game window info retrieved', 'debug', {
          windowsCount: result.windows?.length || 0,
          windows: result.windows
        });
        resolve(result.windows);
      } else {
        log('Plugin', 'Failed to get game window info', 'error', {
          error: result.error
        });
        resolve(null);
      }
    });
  });
}

// --- OCR.space Lobby Event Workflow (Replaces Old Polling) ---
// --- DEPRECATED: Custom Plugin OCR Polling (Replaced by HandleLobbyEvent) ---
// These functions are no longer used. The new workflow uses HandleLobbyEvent()
// which automatically handles the 10-second wait, screenshot, cropping, and OCR.
// 
// let customPluginOcrPolling = false;
// let pollingInterval = null;
// 
// function startCustomPluginOcrPolling() { /* DEPRECATED */ }
// function stopCustomPluginOcrPolling() { /* DEPRECATED */ }

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
function clearOCRBoxes() {
  const overlay = document.getElementById('debug-overlay');
  if (!overlay) return;
  overlay.querySelectorAll('.debug-box').forEach(box => box.remove());
}

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

// Draw the exact OCR scan regions from the logs
function drawOCRScanRegions() {
  clearOCRBoxes();
  
  // These are the exact regions from the plugin logs
  const scanRegions = [
    { x: 765, y: 285, width: 478, height: 34, label: 'Region 0' },
    { x: 783, y: 161, width: 474, height: 31, label: 'Region 1' },
    { x: 791, y: 68, width: 384, height: 33, label: 'Region 2' }
  ];
  
  scanRegions.forEach((region, index) => {
    const overlay = document.getElementById('debug-overlay');
    if (!overlay) return;
    
    const box = document.createElement('div');
    box.className = 'debug-box scan-region';
    box.style.position = 'absolute';
    box.style.border = '3px solid #39FF14';
    box.style.backgroundColor = 'rgba(57, 255, 20, 0.1)';
    box.style.left = `${region.x}px`;
    box.style.top = `${region.y}px`;
    box.style.width = `${region.width}px`;
    box.style.height = `${region.height}px`;
    box.style.zIndex = 9999;
    box.style.pointerEvents = 'none';
    box.style.fontSize = '12px';
    box.style.color = '#39FF14';
    box.style.fontWeight = 'bold';
    box.style.textAlign = 'center';
    box.style.lineHeight = `${region.height}px`;
    box.textContent = region.label;
    
    overlay.appendChild(box);
  });
  
  console.log('[Main] Drew OCR scan regions:', scanRegions);
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
        
        // Handle lobby events with new OCR.space workflow (only once per lobby)
        if (data.status === 'lobby') {
          if (lobbyEventProcessed) {
            log('Lobby', 'Lobby event already processed, skipping', 'debug');
            return;
          }
          
          if (lobbyEventInProgress) {
            log('Lobby', 'Lobby event already in progress, skipping', 'debug');
            return;
          }
          
          log('Lobby', 'Lobby detected, calling HandleLobbyEvent', 'info');
          lobbyEventInProgress = true;
          
          if (ocrPlugin && pluginInitialized) {
            ocrPlugin.HandleLobbyEvent((result) => {
              lobbyEventInProgress = false;
              
              if (result.success) {
                lobbyEventProcessed = true;
                log('Lobby', 'Lobby event processed successfully', 'success', {
                  resultsCount: result.results ? result.results.length : 0,
                  sessionFolder: result.sessionFolder
                });
                
                // Process any found usernames
                if (result.results && result.results.length > 0) {
                  result.results.forEach((ocrResult) => {
                    const timestamp = new Date().toISOString();
                    log('Lobby', 'Username found in lobby', 'info', {
                      text: ocrResult.text,
                      region: ocrResult.region,
                      confidence: ocrResult.confidence
                    });
                    
                    // Send to desktop window
                    overwolf.windows.sendMessage('desktop', 'ocr_username_found', {
                      username: ocrResult.text,
                      box: ocrResult.region,
                      boxIndex: ocrResult.region,
                      timestamp: timestamp,
                      confidence: ocrResult.confidence
                    }, () => {
                      // Callback to handle any send message errors
                    });
                  });
                }
              } else {
                log('Lobby', 'Lobby event processing failed', 'error', {
                  error: result.error
                });
              }
            });
          } else {
            lobbyEventInProgress = false;
            log('Lobby', 'OCR plugin not available for lobby event', 'error');
          }
        }
        
        // Reset flags when leaving lobby
        if (data.status === 'ingame' || data.status === 'summary') {
          if (lobbyEventProcessed || lobbyEventInProgress) {
            log('Lobby', 'Leaving lobby, resetting flags', 'info');
            lobbyEventProcessed = false;
            lobbyEventInProgress = false;
            
            // Reset the C# plugin flag too
            if (ocrPlugin && pluginInitialized) {
              ocrPlugin.ResetLobbyEvent((result) => {
                log('Lobby', 'Plugin lobby event flag reset', 'debug', result);
              });
            }
          }
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

// Draw OCR scan regions on startup so you can see where it's looking
// Only run this in the overlay window, not the desktop window
overwolf.windows.getCurrentWindow(result => {
  if (result.window.name === 'ingame_overlay') {
    setTimeout(() => {
      if (typeof drawOCRScanRegions === 'function') {
        drawOCRScanRegions();
        console.log('[Main] Auto-drew OCR scan regions on startup');
      } else {
        console.warn('[Main] drawOCRScanRegions function not available');
      }
    }, 2000);
  }
});

// Test results display functions
function showTestResults() {
  const testResults = document.getElementById('test-results');
  if (testResults) {
    testResults.style.display = 'block';
  }
}

function updateTestStatus(message, type = 'info') {
  const testStatus = document.getElementById('test-status');
  if (testStatus) {
    testStatus.textContent = message;
    testStatus.className = `test-status ${type}`;
  }
}

function addTestLog(message) {
  const testLog = document.getElementById('test-log');
  if (testLog) {
    const timestamp = new Date().toLocaleTimeString();
    testLog.innerHTML += `[${timestamp}] ${message}\n`;
    testLog.scrollTop = testLog.scrollHeight;
  }
}

// Add OCR regions button functionality (only in overlay)
overwolf.windows.getCurrentWindow(result => {
  if (result.window.name === 'ingame_overlay') {
    const showOcrRegionsBtn = document.getElementById('show-ocr-regions');
    if (showOcrRegionsBtn) {
      showOcrRegionsBtn.addEventListener('click', () => {
        console.log('[Main] Showing OCR scan regions...');
        drawOCRScanRegions();
      });
    }

    // Add force show regions button functionality
    const forceShowRegionsBtn = document.getElementById('force-show-regions');
    if (forceShowRegionsBtn) {
      forceShowRegionsBtn.addEventListener('click', () => {
        console.log('[Main] Force showing OCR scan regions...');
        if (typeof drawOCRScanRegions === 'function') {
          drawOCRScanRegions();
        } else {
          console.error('[Main] drawOCRScanRegions function not found!');
          // Fallback: manually create the boxes
          const overlay = document.getElementById('debug-overlay');
          if (overlay) {
            overlay.innerHTML = '';
            const regions = [
              { x: 765, y: 285, width: 478, height: 34, label: 'Region 0' },
              { x: 783, y: 161, width: 474, height: 31, label: 'Region 1' },
              { x: 791, y: 68, width: 384, height: 33, label: 'Region 2' }
            ];
            regions.forEach(region => {
              const box = document.createElement('div');
              box.style.position = 'absolute';
              box.style.border = '3px solid #39FF14';
              box.style.backgroundColor = 'rgba(57, 255, 20, 0.1)';
              box.style.left = region.x + 'px';
              box.style.top = region.y + 'px';
              box.style.width = region.width + 'px';
              box.style.height = region.height + 'px';
              box.style.zIndex = 9999;
              box.style.pointerEvents = 'none';
              box.style.fontSize = '12px';
              box.style.color = '#39FF14';
              box.style.fontWeight = 'bold';
              box.style.textAlign = 'center';
              box.style.lineHeight = region.height + 'px';
              box.textContent = region.label;
              overlay.appendChild(box);
            });
            console.log('[Main] Manually created OCR scan regions');
          }
        }
      });
    }
  }
});

// Add OCR test window functionality
const openOcrTestBtn = document.getElementById('open-ocr-test-btn');
if (openOcrTestBtn) {
  openOcrTestBtn.addEventListener('click', () => {
    console.log('[Main] Opening OCR test app window...');
    overwolf.windows.obtainDeclaredWindow('ocr_test_app', result => {
      if (result.success) {
        overwolf.windows.restore(result.window.id);
        console.log('[Main] OCR test app window opened successfully');
      } else {
        console.warn('[Main] Failed to open OCR test app window:', result.error);
        // Fallback to old OCR test window
        overwolf.windows.obtainDeclaredWindow('ocr_test', result2 => {
          if (result2.success) {
            overwolf.windows.restore(result2.window.id);
            console.log('[Main] Fallback OCR test window opened successfully');
          } else {
            console.warn('[Main] Failed to open fallback OCR test window:', result2.error);
          }
        });
      }
    });
  });
}

// Add plugin test functionality
const testPluginBtn = document.getElementById('test-plugin-btn');
if (testPluginBtn) {
  testPluginBtn.addEventListener('click', async () => {
    console.log('[Main] Testing plugin...');
    showTestResults();
    updateTestStatus('Testing plugin...', 'info');
    addTestLog('Starting plugin test...');
    
    try {
      // Test the custom OCR plugin directly
      const result = await testCustomPlugin();
      if (result.success) {
        updateTestStatus('✅ Plugin working correctly', 'success');
        addTestLog(`Plugin test successful: ${result.message}`);
        if (result.engineInitialized) {
          addTestLog('✅ Tesseract engine initialized successfully');
        } else {
          addTestLog('⚠️ Tesseract engine failed to initialize (RapidOcrNet)');
          if (result.errorDetails) {
            addTestLog(`Error details: ${result.errorDetails}`);
          }
        }
      } else {
        updateTestStatus('❌ Plugin test failed', 'error');
        addTestLog(`Plugin test failed: ${result.error}`);
      }
    } catch (error) {
      updateTestStatus('❌ Plugin test error', 'error');
      addTestLog(`Plugin test error: ${error.message}`);
    }
  });
}

// Add OCR test functionality
const testOcrBtn = document.getElementById('test-ocr-btn');
if (testOcrBtn) {
  testOcrBtn.addEventListener('click', async () => {
    console.log('[Main] Testing OCR...');
    showTestResults();
    updateTestStatus('Testing OCR...', 'info');
    addTestLog('Starting OCR test...');
    
    try {
      const screenshotPath = await takeScreenshotWithPlugin();
      if (screenshotPath) {
        addTestLog(`Screenshot taken: ${screenshotPath}`);
        
        // Test OCR on a small region
        const ocrResult = await performOcrWithPlugin(screenshotPath, 100, 100, 200, 50);
        if (ocrResult.success) {
          updateTestStatus('✅ OCR working correctly', 'success');
          addTestLog(`OCR result: "${ocrResult.text}" (confidence: ${Math.round(ocrResult.confidence * 100)}%)`);
        } else {
          updateTestStatus('❌ OCR failed', 'error');
          addTestLog(`OCR failed: ${ocrResult.error}`);
        }
      } else {
        updateTestStatus('❌ Screenshot failed', 'error');
        addTestLog('Failed to take screenshot');
      }
    } catch (error) {
      updateTestStatus('❌ OCR test error', 'error');
      addTestLog(`OCR test error: ${error.message}`);
    }
  });
}

// Add screenshot test functionality
const testScreenshotBtn = document.getElementById('test-screenshot-btn');
if (testScreenshotBtn) {
  testScreenshotBtn.addEventListener('click', async () => {
    console.log('[Main] Testing screenshot...');
    showTestResults();
    updateTestStatus('Testing screenshot...', 'info');
    addTestLog('Starting screenshot test...');
    
    try {
      const screenshotPath = await takeScreenshotWithPlugin();
      if (screenshotPath) {
        updateTestStatus('✅ Screenshot working correctly', 'success');
        addTestLog(`Screenshot saved to: ${screenshotPath}`);
      } else {
        updateTestStatus('❌ Screenshot failed', 'error');
        addTestLog('Failed to take screenshot');
      }
    } catch (error) {
      updateTestStatus('❌ Screenshot test error', 'error');
      addTestLog(`Screenshot test error: ${error.message}`);
    }
  });
}

// Function to test the custom plugin
async function testCustomPlugin() {
  return new Promise((resolve) => {
    if (ocrPlugin && pluginInitialized) {
      ocrPlugin.Test((result) => {
        resolve(result);
      });
    } else {
      resolve({ success: false, error: 'Custom OCR plugin not available' });
    }
  });
}

// Add custom plugin OCR test functionality
const testOverlayOcrBtn = document.getElementById('test-overlay-ocr');
if (testOverlayOcrBtn) {
  testOverlayOcrBtn.addEventListener('click', async () => {
    console.log('[Main] Testing custom plugin OCR...');
    
    // Debug: Check if plugin is available
    if (!ocrPlugin) {
      console.log('[Main] OCR plugin not available!');
      alert('OCR plugin not available. Check console for details.');
      return;
    }
    
    console.log('[Main] OCR plugin is available:', ocrPlugin);
    
    // Take a screenshot first
    let screenshotPath = await takeScreenshotWithPlugin();
    if (!screenshotPath) {
      console.log('[Main] Screenshot failed, trying full screen...');
      screenshotPath = await takeScreenshotWithPlugin();
    }
    
    if (screenshotPath) {
      console.log('[Main] Screenshot taken, scanning username regions...');
      const results = await scanUsernameRegionsWithPlugin(screenshotPath);
      
      if (results && results.length > 0) {
        const resultText = results.map(r => `Box ${r.boxIndex}: "${r.text}" (${Math.round(r.confidence * 100)}%)`).join('\n');
        alert(`OCR Results:\n${resultText}`);
      } else {
        alert('No usernames found in scan regions');
      }
    } else {
      alert('Failed to take screenshot');
    }
  });
}

// Add test green rectangles functionality
const testGreenRectanglesBtn = document.getElementById('test-green-rectangles');
if (testGreenRectanglesBtn) {
  testGreenRectanglesBtn.style.display = 'none'; // Hide the button
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

// Remove the runOcrOnScreenshot function
