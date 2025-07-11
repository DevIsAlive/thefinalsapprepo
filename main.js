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
        
        // Use the new TakeScreenshotByHandle method
        ocrPlugin.TakeScreenshotByHandle(handle, (result) => {
          if (result.success) {
            log('Screenshot', 'Plugin window screenshot taken successfully', 'success', {
              path: result.path,
              handle: handle
            });
            resolve(result.path);
          } else {
            log('Screenshot', 'Plugin window screenshot failed, trying fallback', 'warn', {
              error: result.error,
              handle: handle
            });
            
            // Fallback to regular screenshot
            ocrPlugin.TakeScreenshot((fallbackResult) => {
              if (fallbackResult.success) {
                log('Screenshot', 'Plugin fallback screenshot taken successfully', 'success', {
                  path: fallbackResult.path,
                  handle: handle
                });
                resolve(fallbackResult.path);
              } else {
                log('Screenshot', 'Plugin fallback screenshot failed', 'error', {
                  error: fallbackResult.error,
                  handle: handle
                });
                resolve(null);
              }
            });
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
        
        // Handle lobby events with new 3-criteria workflow
        if (data.status === 'lobby') {
          if (lobbyEventProcessed) {
            log('Lobby', 'Lobby event already processed, skipping', 'debug');
            return;
          }
          
          if (lobbyEventInProgress) {
            log('Lobby', 'Lobby event already in progress, skipping', 'debug');
            return;
          }
          
          log('Lobby', 'Lobby detected - setting criteria 1 for new workflow', 'info');
          lobbyEventInProgress = true;
          
          // Set criteria 1: Lobby event received
          // The background.js will handle the rest of the 3-criteria workflow
          lobbyEventProcessed = true;
          lobbyEventInProgress = false;
          
          log('Lobby', 'Criteria 1 set: Lobby event received', 'success');
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
  }

  if (message.id === 'take_event_screenshot') {
    const { eventName, eventData, handle, timestamp } = message.content;
    log('Screenshot', 'Taking event screenshot with plugin', 'info', {
      eventName: eventName,
      handle: handle,
      timestamp: timestamp
    });

    if (ocrPlugin && pluginInitialized) {
      ocrPlugin.TakeScreenshotByHandle(handle, (result) => {
        if (result.success) {
          log('Screenshot', 'Event screenshot captured successfully', 'success', {
            eventName: eventName,
            path: result.path,
            handle: handle
          });
          
          // Send event notification to overlay
          showEventNotification(eventName, eventData);
        } else {
          log('Screenshot', 'Event screenshot failed, trying fallback', 'warn', {
            eventName: eventName,
            error: result.error,
            handle: handle
          });
          
          // Fallback to regular screenshot
          ocrPlugin.TakeScreenshot((fallbackResult) => {
            if (fallbackResult.success) {
              log('Screenshot', 'Event fallback screenshot captured successfully', 'success', {
                eventName: eventName,
                path: fallbackResult.path
              });
              
              // Send event notification to overlay
              showEventNotification(eventName, eventData);
            } else {
              log('Screenshot', 'Event fallback screenshot failed', 'error', {
                eventName: eventName,
                error: fallbackResult.error
              });
            }
          });
        }
      });
    } else {
      log('Screenshot', 'OCR plugin not available for event screenshot', 'error', {
        eventName: eventName
      });
    }
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

// --- Event Notifier Functionality ---
function showEventNotification(eventName, eventData) {
  const notifier = document.getElementById('event-notifier');
  const notifierText = document.getElementById('event-notifier-text');
  
  if (!notifier || !notifierText) {
    console.log('[Main] Event notifier elements not found');
    return;
  }
  
  // Map event names to display text
  const eventDisplayNames = {
    'elimination': 'ELIMINATION',
    'death': 'DEATH',
    'match_start': 'MATCH START',
    'match_end': 'MATCH END',
    'scene_change': 'SCENE CHANGE'
  };
  
  const displayText = eventDisplayNames[eventName] || eventName.toUpperCase();
  
  // Set the text
  notifierText.textContent = displayText;
  
  // Remove any existing event classes
  notifier.className = 'event-notifier';
  
  // Add event-specific styling
  if (eventName === 'elimination') {
    notifier.classList.add('elimination');
  } else if (eventName === 'death') {
    notifier.classList.add('death');
  } else if (eventName === 'match_start') {
    notifier.classList.add('match_start');
  } else if (eventName === 'match_end') {
    notifier.classList.add('match_end');
  }
  
  // Show the notifier
  notifier.classList.add('show');
  
  // Hide after 3 seconds
  setTimeout(() => {
    notifier.classList.remove('show');
  }, 3000);
  
  console.log('[Main] Event notification shown:', eventName, displayText);
}

// Listen for event notifications from background
overwolf.windows.onMessageReceived.addListener((message) => {
  if (message.id === 'show_event_notification') {
    const { eventName, eventData } = message.content;
    showEventNotification(eventName, eventData);
  }
});

// Test pixel monitoring manually
function testPixelMonitoring() {
  log('Test', 'Manual pixel monitoring test triggered', 'info');
  
  // Send message to background to manually trigger pixel monitoring
  overwolf.windows.sendMessage('background', 'manual_trigger_pixel_monitoring', {}, (result) => {
    log('Test', 'Manual trigger message sent to background', 'debug', result);
  });
}

// Test region color monitoring manually
function testColorMonitoring() {
  log('Test', 'Manual region color monitoring test triggered', 'info');
  
  // Send message to background to manually trigger color monitoring
  overwolf.windows.sendMessage('background', 'manual_trigger_color_monitoring', {}, (result) => {
    log('Test', 'Manual region color trigger message sent to background', 'debug', result);
  });
}
