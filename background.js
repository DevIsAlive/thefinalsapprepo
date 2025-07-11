// Enhanced logging utility
function log(component, message, level = 'info', data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    component: `[BG-${component}]`,
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
  
  // Don't call logOCR from log function to prevent infinite recursion
  // logOCR will be called separately when needed
}

// Advanced structured logging
function logAdvanced(context, message, data = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    context,
    message,
    ...data
  };
  // Print to console
  console.log(`[ADVANCED][${context}] ${timestamp} - ${message}`, data);
  // Optionally, send to a log window or file here
  // sendMessage('ocr_log', 'advanced_log', logEntry);
}

// Basic initialization check
try {
  console.log('Background.js script file loaded');
  log('Init', 'Background script loaded and initialized', 'success');
  
  // Check if Overwolf is available
  if (typeof overwolf === 'undefined') {
    log('Init', 'Overwolf API not available', 'error');
  } else {
    log('Init', 'Overwolf API available', 'success');
  }
  
  // Test basic functionality
  setTimeout(() => {
    log('Test', 'Background script is running and functional', 'success');
  }, 1000);
  
} catch (error) {
  console.error('Background script initialization error:', error);
}

const windowNames = ['desktop', 'ingame_overlay'];
let usernameFound = false;
let ocrPollingActive = false;
let lastScene = null;

// New state tracking for 3 criteria workflow
let criteria1LobbyEventReceived = false;
let criteria2GEPWorking = false;
let criteria3PixelMonitoringActive = false;
let pixelMonitoringStarted = false;

// Boxes to scan for username text
const scanBoxes = [
  { x: 765, y: 285, width: 478, height: 34 },
  { x: 783, y: 161, width: 474, height: 31 },
  { x: 791, y: 68,  width: 384, height: 33 }
];

log('Config', 'Scan boxes configured', 'debug', { scanBoxes });

// ---------- Window Functions ----------
function sendMessage(winName, id, content) {
  // Only log important messages to prevent spam
  if (id === 'ocr_log_update') {
    // Don't log OCR log messages to prevent recursion
    console.debug(`[BG-Window] Sending OCR log message to ${winName}`);
  } else {
    log('Window', 'Sending message to window', 'debug', {
      window: winName,
      messageId: id,
      content: content
    });
  }
  
  overwolf.windows.obtainDeclaredWindow(winName, res => {
    if (res.success && res.window?.id) {
      overwolf.windows.sendMessage(winName, id, content, () => {
        // Only log success for non-OCR messages
        if (id !== 'ocr_log_update') {
          log('Window', 'Message sent successfully', 'debug', {
            window: winName,
            messageId: id
          });
        }
      });
    } else {
      log('Window', 'Failed to obtain window for message', 'error', {
        window: winName,
        success: res.success,
        error: res.error
      });
    }
  });
}

function sendGameEvent(eventData) {
  log('GameEvent', 'Broadcasting game event', 'debug', eventData);
  windowNames.forEach(name => sendMessage(name, 'game_event', eventData));
  handleGameEvent(eventData);
}

function logOCR(message, level = 'info') {
  // Simple function to send logs to OCR log window without recursion
  const logEntry = typeof message === 'string' ? { message, level } : message;
  sendMessage('ocr_log', 'ocr_log_update', logEntry);
}

function drawOCRBox(box) {
  log('Debug', 'Drawing OCR debug box', 'debug', box);
  sendMessage('desktop', 'draw_debug_box', box);
}

function openAllWindows() {
  log('Window', 'Opening all application windows', 'info');
  const windowsToOpen = ['desktop', 'ingame_overlay', 'ocr_log'];
  windowsToOpen.forEach(win => {
    overwolf.windows.obtainDeclaredWindow(win, result => {
      if (result.success && result.window?.id) {
        overwolf.windows.restore(result.window.id, () => {
          log('Window', 'Window restored successfully', 'debug', { window: win });
        });
      } else {
        log('Window', 'Failed to restore window', 'error', {
          window: win,
          success: result.success,
          error: result.error
        });
      }
    });
  });
}

// ---------- Scene Helpers ----------
function normalizeScene(scene) {
  if (!scene) return 'lobby';
  if (scene === 'menu' || scene === 'loading') return 'lobby';
  return scene;
}

function pollGameRunning() {
  overwolf.games.getRunningGameInfo(info => {
    const isRunning = info?.isRunning;
    const classId = info?.classId;
    const isTargetGame = [23478, 234781].includes(classId);
    
    log('GamePoll', 'Game running status check', 'debug', {
      isRunning,
      classId,
      isTargetGame,
      gameInfo: info?.gameInfo
    });
    
    // Set criteria 1 when game is detected as running (more reliable than waiting for GEP events)
    if (isRunning && isTargetGame && !criteria1LobbyEventReceived) {
      criteria1LobbyEventReceived = true;
      logAdvanced('Criteria', 'Criteria 1 met: Game detected as running', { 
        isRunning, 
        classId, 
        isTargetGame 
      });
      checkAllCriteriaReady();
    }
    
    if (!isRunning || !isTargetGame) {
      sendGameEvent({ type: 'game_status', status: 'lobby' });
    }
    setTimeout(pollGameRunning, 3000);
  });
}

// ---------- GEP Setup ----------
function setupGEP() {
  overwolf.games.getRunningGameInfo(info => {
    const isRunning = info?.isRunning;
    const classId = info?.classId;
    const isTargetGame = [23478, 234781].includes(classId);
    
    log('GEP', 'Setting up Game Events Protocol', 'debug', {
      isRunning,
      classId,
      isTargetGame
    });
    
    if (isRunning && isTargetGame) {
      overwolf.games.events.setRequiredFeatures(['game_info', 'match_info'], res => {
        if (res.success) {
          log('GEP', 'Game Events Protocol setup successful', 'success');
          criteria2GEPWorking = true;
          checkAllCriteriaReady();
        } else {
          log('GEP', 'Game Events Protocol setup failed, but game is running', 'warn', {
            error: res.error
          });
          // Even if GEP fails, if game is running and in focus, we can still proceed
          // This handles cases where GEP doesn't work but game is detected
          if (info?.gameInfo?.handle) {
            log('GEP', 'Game handle available, setting criteria 2 as fallback', 'info');
            criteria2GEPWorking = true;
            checkAllCriteriaReady();
          } else {
            criteria2GEPWorking = false;
            setTimeout(setupGEP, 3000);
          }
        }
      });
    } else {
      log('GEP', 'Target game not running, retrying setup...', 'debug');
      criteria2GEPWorking = false;
      setTimeout(setupGEP, 3000);
    }
  });
}

overwolf.games.onGameLaunched.addListener(setupGEP);
overwolf.games.onGameInfoUpdated.addListener(info => {
  log('GEP', 'Game info updated', 'debug', {
    runningChanged: info.runningChanged,
    focusChanged: info.focusChanged
  });
  if (info.runningChanged || info.focusChanged) setupGEP();
});
setupGEP();
pollGameRunning();

// ---------- GEP Event Handlers ----------
overwolf.games.events.onNewEvents.addListener(pkt => {
  if (!pkt || !pkt.events) {
    log('GEP', 'Received empty or invalid event packet', 'warn');
    return;
  }

  log('GEP', 'Processing game events', 'debug', {
    eventCount: pkt.events.length,
    events: pkt.events.map(e => e.name)
  });

  pkt.events.forEach(e => {
    log('GEP', 'Processing game event', 'debug', {
      eventName: e.name,
      eventData: e.data
    });
    
    // Set criteria 1 when any game event is received (indicating lobby event)
    if (!criteria1LobbyEventReceived) {
      criteria1LobbyEventReceived = true;
      logAdvanced('Criteria', 'Criteria 1 met: Lobby event received', { event: e });
      checkAllCriteriaReady();
    }
    
    // Capture screenshot for all game events (except repeated lobby)
    captureEventScreenshot(e.name, e.data);
    
    switch (e.name) {
      case 'match_start':
        log('GEP', 'Match started', 'info');
        sendGameEvent({ type: 'game_status', status: 'ingame' });
        sendGameEvent({ type: 'round_started', started: true });
        break;
      case 'match_end':
        log('GEP', 'Match ended', 'info');
        sendGameEvent({ type: 'game_status', status: 'summary' });
        sendGameEvent({ type: 'round_started', started: false });
        break;
      case 'elimination':
        const eliminationCount = typeof e.data === 'number' ? e.data : 1;
        log('GEP', 'Elimination event', 'info', { count: eliminationCount });
        sendGameEvent({ type: 'elimination', count: eliminationCount });
        break;
      case 'death':
        log('GEP', 'Death event', 'info');
        sendGameEvent({ type: 'death' });
        break;
      default:
        log('GEP', 'Unhandled game event', 'debug', {
          eventName: e.name,
          eventData: e.data
        });
    }
  });
});

// ---------- Event Screenshot Capture ----------
function captureEventScreenshot(eventName, eventData) {
  log('Screenshot', 'Capturing event screenshot', 'info', {
    eventName: eventName,
    eventData: eventData
  });

  overwolf.games.getRunningGameInfo(result => {
    if (!result || !result.isRunning || ![23478, 234781].includes(result.classId)) {
      log('Screenshot', 'Game not running, skipping event screenshot', 'debug');
      return;
    }

    const handle = result?.gameInfo?.handle || result?.windowHandle?.value;
    if (!handle) {
      log('Screenshot', 'No game handle available for event screenshot', 'warn');
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const eventType = eventName.replace(/[^a-zA-Z0-9]/g, '_');
    
    log('Screenshot', 'Taking event screenshot with plugin', 'debug', {
      eventName: eventName,
      eventType: eventType,
      handle: handle,
      timestamp: timestamp
    });

    // Use the plugin for window-specific screenshots
    sendMessage('ingame_overlay', 'take_event_screenshot', {
      eventName: eventName,
      eventData: eventData,
      handle: handle,
      timestamp: timestamp
    });
  });
}

function resetCriteria() {
  criteria1LobbyEventReceived = false;
  criteria2GEPWorking = false;
  criteria3PixelMonitoringActive = false;
  pixelMonitoringStarted = false;
  logAdvanced('Criteria', 'All criteria reset', {
    criteria1LobbyEventReceived,
    criteria2GEPWorking,
    criteria3PixelMonitoringActive,
    pixelMonitoringStarted
  });
}

// Update the scene change handler to reset criteria when leaving lobby
overwolf.games.events.onInfoUpdates2.addListener(update => {
  if (update.feature === 'game_info' && update.key === 'scene') {
    const originalScene = update.value;
    const normalizedScene = normalizeScene(originalScene);
    
    log('GEP', 'Scene update received', 'debug', {
      originalScene,
      normalizedScene,
      feature: update.feature,
      key: update.key
    });
    
    // Reset criteria when leaving lobby
    if (lastScene === 'lobby' && normalizedScene !== 'lobby') {
      resetCriteria();
    }
    
    // Set criteria 1 when scene change is detected (indicating lobby event)
    if (!criteria1LobbyEventReceived) {
      criteria1LobbyEventReceived = true;
      logAdvanced('Criteria', 'Criteria 1 met: Scene change detected (lobby event)', { scene: normalizedScene });
      checkAllCriteriaReady();
    }
    
    // Only capture screenshot for scene changes (not repeated lobby events)
    if (normalizedScene !== 'lobby' || !lastScene || lastScene !== 'lobby') {
      captureEventScreenshot('scene_change', { from: lastScene, to: normalizedScene });
    }
    
    lastScene = normalizedScene;
    sendGameEvent({ type: 'game_status', status: normalizedScene });
  }
});

// ---------- Username OCR Detection ----------
function requestOverlayOCR() {
  overwolf.games.getRunningGameInfo(result => {
    const timestamp = new Date().toISOString();
    // Prefer gameInfo.handle, fallback to windowHandle.value
    let handle = result?.gameInfo?.handle;
    if (!handle && result?.windowHandle?.value) {
      handle = result.windowHandle.value;
    }
    
    log('OCR', 'Requesting overlay OCR', 'debug', {
      isRunning: result?.isRunning,
      classId: result?.classId,
      handle: handle,
      gameInfo: result?.gameInfo
    });
    
    if (
      result &&
      result.isRunning &&
      [23478, 234781].includes(result.classId) &&
      handle
    ) {
      // Take screenshot and perform OCR
      performGameScreenshotOCR(handle, timestamp);
    } else {
      log('OCR', 'Failed to get game handle for OCR', 'error', {
        isRunning: result?.isRunning,
        classId: result?.classId,
        handle: handle
      });
    }
  });
}

// Perform OCR on game screenshot
function performGameScreenshotOCR(gameHandle, timestamp) {
  log('OCR', 'Starting game screenshot OCR', 'info', {
    handle: gameHandle,
    timestamp: timestamp
  });

  // Use Overwolf's recommended screenshot method for DX12 games
  overwolf.media.takeWindowsScreenshotByHandle(gameHandle, false, (result) => {
    if (result.success) {
      log('OCR', 'Screenshot captured successfully', 'success', {
        url: result.url,
        handle: gameHandle
      });
      // Wait before processing to ensure file is written and a new frame is captured
      setTimeout(() => {
        scanBoxes.forEach((box, index) => {
          setTimeout(() => {
            processOCRBox(result.url, box, index, timestamp);
          }, index * 500);
        });
      }, 400); // 400ms delay
    } else {
      log('OCR', 'Screenshot failed', 'error', {
        error: result.error,
        handle: gameHandle
      });
    }
  });
}

// Process OCR for a specific box
function processOCRBox(screenshotUrl, box, boxIndex, timestamp) {
  log('OCR', 'Processing OCR box', 'debug', {
    boxIndex: boxIndex,
    box: box,
    screenshotUrl: screenshotUrl,
    timestamp: timestamp
  });

  // Only draw debug box on overlay
  sendMessage('ingame_overlay', 'draw_debug_box', box);

  // Send screenshot and box to overlay for OCR
  sendMessage('ingame_overlay', 'perform_ocr', {
    screenshotUrl,
    box,
    boxIndex,
    timestamp
  });
}

function startUsernamePolling() {
  if (usernameFound) {
    log('Polling', 'Username already found, skipping polling', 'debug');
    return;
  }
  log('Polling', 'Starting username polling cycle', 'debug');
  requestOverlayOCR();
  setTimeout(startUsernamePolling, 2500);
}

// ---------- Startup ----------
openAllWindows();

// Add a handler for game events to start polling on 'lobby' status
// NOTE: OCR polling is now handled by the overlay instead of background
function handleGameEvent(eventData) {
  log('GameEvent', 'Handling game event', 'debug', eventData);
  
  // Background OCR polling disabled - overlay handles OCR now
  // if (eventData.type === 'game_status' && eventData.status === 'lobby' && !ocrPollingActive) {
  //   ocrPollingActive = true;
  //   startUsernamePolling();
  // }
}

// Helper function to handle file read results
function handleFileReadResult(result, targetWindow, box) {
  log('FileRead', 'Handling file read result', 'debug', {
    success: result?.status === 'success',
    targetWindow: targetWindow,
    box: box
  });
  
  if (result && result.status === 'success') {
    // For now, just return success - we can add OCR processing later
    sendMessage(targetWindow, 'ocr_result', { 
      success: true, 
      text: 'File read successfully', 
      box,
      fileData: result.data 
    });
  } else {
    sendMessage(targetWindow, 'ocr_result', { 
      success: false, 
      error: result ? result.error : 'Failed to read file', 
      box 
    });
  }
}

// --- Simple IO Plugin Integration ---
let simpleIOPlugin = null;

// Load the Simple IO Plugin
overwolf.extensions.current.getExtraObject('simple-io-plugin', result => {
  console.log('[BG] Plugin load attempt result:', JSON.stringify(result));
  if (result.status === 'success') {
    simpleIOPlugin = result.object;
    console.log('[BG] Simple IO Plugin loaded successfully');
    logOCR('Simple IO Plugin loaded successfully', 'success');
    
    // Test the plugin to make sure it's working
    console.log('[BG] Plugin object properties:', Object.getOwnPropertyNames(simpleIOPlugin));
    logOCR(`Plugin object properties: ${Object.getOwnPropertyNames(simpleIOPlugin).join(', ')}`, 'info');
    
    if (simpleIOPlugin && typeof simpleIOPlugin.readFile === 'function') {
      console.log('[BG] Plugin readFile method is available');
      logOCR('Plugin readFile method is available', 'success');
    } else {
      console.warn('[BG] Plugin loaded but readFile method not found');
      logOCR('Plugin readFile method not found - checking for alternative methods', 'warn');
      
      // Check for other file-related methods
      const methods = Object.getOwnPropertyNames(simpleIOPlugin);
      const fileMethods = methods.filter(m => m.toLowerCase().includes('file') || m.toLowerCase().includes('read'));
      if (fileMethods.length > 0) {
        console.log('[BG] Found file-related methods:', fileMethods);
        logOCR(`Found file-related methods: ${fileMethods.join(', ')}`, 'info');
      }
    }
  } else {
    console.error('[BG] Failed to load Simple IO Plugin');
    console.error('[BG] Result:', result);
    logOCR(`Failed to load Simple IO Plugin: ${result.error || 'Unknown error'}`, 'error');
    
    // Try to get more info about available plugins
    overwolf.extensions.current.getExtraObjects(extraObjects => {
      console.log('[BG] Available extra objects:', JSON.stringify(extraObjects));
      logOCR(`Available extra objects: ${JSON.stringify(extraObjects)}`, 'debug');
    });
  }
});

// --- RapidOcrNetPlugin Integration ---
let plugin = null;

// Load the RapidOcrNetPlugin
overwolf.extensions.current.getExtraObject('RapidOcrNetPlugin', result => {
  console.log('[BG] RapidOcrNetPlugin load attempt result:', JSON.stringify(result));
  if (result.status === 'success') {
    plugin = result;
    console.log('[BG] RapidOcrNetPlugin loaded successfully');
    logOCR('RapidOcrNetPlugin loaded successfully', 'success');
    
    // Test the plugin to make sure it's working
    if (plugin.object && typeof plugin.object.ScanUsernameRegions === 'function') {
      console.log('[BG] RapidOcrNetPlugin ScanUsernameRegions method is available');
      logOCR('RapidOcrNetPlugin ScanUsernameRegions method is available', 'success');
    } else {
      console.warn('[BG] RapidOcrNetPlugin loaded but ScanUsernameRegions method not found');
      logOCR('RapidOcrNetPlugin loaded but ScanUsernameRegions method not found', 'warn');
    }
    
    // Check for the new PerformOcrFromBase64 method
    if (plugin.object && typeof plugin.object.PerformOcrFromBase64 === 'function') {
      console.log('[BG] RapidOcrNetPlugin PerformOcrFromBase64 method is available');
      logOCR('RapidOcrNetPlugin PerformOcrFromBase64 method is available', 'success');
    } else {
      console.warn('[BG] RapidOcrNetPlugin loaded but PerformOcrFromBase64 method not found');
      logOCR('RapidOcrNetPlugin loaded but PerformOcrFromBase64 method not found', 'warn');
    }
    
    // Check for available methods
    if (plugin.object) {
      const methods = Object.getOwnPropertyNames(plugin.object);
      console.log('[BG] Available RapidOcrNetPlugin methods:', methods);
      logOCR(`Available RapidOcrNetPlugin methods: ${methods.join(', ')}`, 'info');
    }
  } else {
    console.error('[BG] Failed to load RapidOcrNetPlugin');
    console.error('[BG] Result:', result);
    logOCR(`Failed to load RapidOcrNetPlugin: ${result.error || 'Unknown error'}`, 'error');
  }
});

overwolf.windows.onMessageReceived.addListener((message) => {
  if (message.id === 'start_ocr') {
    const { filePath, box, targetWindow } = message.content || {};
    if (!simpleIOPlugin) {
      sendMessage(targetWindow, 'ocr_result', { success: false, error: 'Simple IO plugin not loaded', box });
      return;
    }
    
    // Use simple-io-plugin to read the image file
    console.log('[BG] Attempting to read file:', filePath);
    logOCR(`Attempting to read file: ${filePath}`, 'info');
    
    // Check what methods are available
    const methods = Object.getOwnPropertyNames(simpleIOPlugin);
    console.log('[BG] Available methods for file reading:', methods);
    
    // Use the correct Simple IO Plugin method for reading binary files (images)
    if (typeof simpleIOPlugin.getBinaryFile === 'function') {
      console.log('[BG] Using getBinaryFile method to read image');
      logOCR('Using getBinaryFile method to read image', 'info');
      
      simpleIOPlugin.getBinaryFile(filePath, result => {
        handleFileReadResult(result, targetWindow, box);
      });
    } else if (typeof simpleIOPlugin.getTextFile === 'function') {
      console.log('[BG] Using getTextFile method as fallback');
      logOCR('Using getTextFile method as fallback', 'warn');
      
      simpleIOPlugin.getTextFile(filePath, result => {
        handleFileReadResult(result, targetWindow, box);
      });
    } else {
      console.error('[BG] No file reading method found in plugin');
      logOCR('No file reading method found in plugin', 'error');
      sendMessage(targetWindow, 'ocr_result', { 
        success: false, 
        error: 'No file reading method available in plugin', 
        box 
      });
    }
    
    // Always send a draw_debug_box for UI feedback
    sendMessage(targetWindow, 'draw_debug_box', box);
  }
  
  // Add a test message handler for debugging
  if (message.id === 'test_plugin') {
    console.log('[BG] Received test_plugin message from:', message.source);
    logOCR(`Received test_plugin message from: ${message.source}`, 'info');
    
    if (!simpleIOPlugin) {
      console.log('[BG] Plugin not loaded, sending error response');
      logOCR('Plugin not loaded, sending error response', 'error');
      // Send to desktop window since that's where the test button is
      sendMessage('desktop', 'plugin_test_result', { 
        success: false, 
        error: 'Simple IO plugin not loaded' 
      });
      return;
    }
    
    // Test the plugin with a simple operation
    console.log('[BG] Testing Simple IO Plugin...');
    logOCR('Testing Simple IO Plugin...', 'info');
    
    // Check if the plugin has the expected methods
    const methods = Object.getOwnPropertyNames(simpleIOPlugin);
    const fileMethods = methods.filter(m => m.toLowerCase().includes('file') || m.toLowerCase().includes('read') || m.toLowerCase().includes('binary') || m.toLowerCase().includes('text'));
    
    console.log('[BG] Available plugin methods:', methods);
    console.log('[BG] File-related methods:', fileMethods);
    logOCR(`Available plugin methods: ${methods.join(', ')}`, 'debug');
    logOCR(`File-related methods: ${fileMethods.join(', ')}`, 'info');
    
    // Send to desktop window since that's where the test button is
    sendMessage('desktop', 'plugin_test_result', { 
      success: true, 
      methods: methods,
      fileMethods: fileMethods,
      message: 'Plugin test completed - getBinaryFile available for OCR!'
    });
  }
  
  // Add OCR test handler
  if (message.id === 'test_ocr') {
    console.log('[BG] Received test_ocr message');
    logOCR('Received test_ocr message - starting OCR test', 'info');
    
    // Trigger OCR manually for testing
    const timestamp = new Date().toISOString();
    performGameScreenshotOCR('test', timestamp);
  }
  
  // Add screenshot test handler
  if (message.id === 'test_screenshot') {
    console.log('[BG] Received test_screenshot message');
    logOCR('Received test_screenshot message - testing screenshot methods', 'info');
    
    // Test different screenshot methods
    testScreenshotMethods();
  }

  // Handle test OCR region requests from the test app
  if (message.id === 'test_ocr_region') {
    const { region, fileName, appPath, screenshotsPath } = message.content || {};
    console.log('[BG] Testing OCR region:', region, 'file:', fileName);
    logOCR(`Testing OCR region: ${JSON.stringify(region)} file: ${fileName}`, 'info');
    
    if (!plugin || !plugin.object || !plugin.object.ScanUsernameRegions) {
      console.error('[BG] Plugin not available for OCR');
      logOCR('Plugin not available for OCR', 'error');
      overwolf.windows.sendMessage(message.source, 'test_ocr_region_result', {
        success: false,
        error: 'Plugin not available',
        region: region
      }, () => {});
      return;
    }
    
    try {
      // Try app root directory first
      console.log('[BG] Calling plugin with app path:', appPath);
      logOCR(`Calling plugin with app path: ${appPath}`, 'info');
      
      const result = plugin.object.ScanUsernameRegions(appPath, (ocrResult) => {
        if (ocrResult && ocrResult.success) {
          console.log('[BG] Test OCR result (app path):', ocrResult);
          logOCR(`Test OCR result (app path): ${JSON.stringify(ocrResult)}`, 'info');
          
          // Send result back
          overwolf.windows.sendMessage(message.source, 'test_ocr_region_result', {
            success: true,
            results: ocrResult.results || [],
            region: region
          }, () => {});
        } else if (ocrResult && ocrResult.error && ocrResult.error.includes('Image file not found')) {
          // Try screenshots folder as fallback
          console.log('[BG] File not found in app directory, trying screenshots folder:', screenshotsPath);
          logOCR(`File not found in app directory, trying screenshots folder: ${screenshotsPath}`, 'warn');
          
          plugin.object.ScanUsernameRegions(screenshotsPath, (ocrResult2) => {
            if (ocrResult2 && ocrResult2.success) {
              console.log('[BG] Test OCR result (screenshots):', ocrResult2);
              logOCR(`Test OCR result (screenshots): ${JSON.stringify(ocrResult2)}`, 'info');
              
              // Send result back
              overwolf.windows.sendMessage(message.source, 'test_ocr_region_result', {
                success: true,
                results: ocrResult2.results || [],
                region: region
              }, () => {});
            } else {
              console.error('[BG] Test OCR failed (screenshots):', ocrResult2);
              logOCR(`Test OCR failed (screenshots): ${JSON.stringify(ocrResult2)}`, 'error');
              
              overwolf.windows.sendMessage(message.source, 'test_ocr_region_result', {
                success: false,
                error: ocrResult2 ? ocrResult2.error : 'Unknown error',
                region: region
              }, () => {});
            }
          });
        } else {
          console.error('[BG] Test OCR failed (app path):', ocrResult);
          logOCR(`Test OCR failed (app path): ${JSON.stringify(ocrResult)}`, 'error');
          
          overwolf.windows.sendMessage(message.source, 'test_ocr_region_result', {
            success: false,
            error: ocrResult ? ocrResult.error : 'Unknown error',
            region: region
          }, () => {});
        }
      });
    } catch (error) {
      console.error('[BG] Test OCR error:', error);
      logOCR(`Test OCR error: ${error.message}`, 'error');
      overwolf.windows.sendMessage(message.source, 'test_ocr_region_result', {
        success: false,
        error: error.message,
        region: region
      }, () => {});
    }
  }

  // Handle test full image OCR requests
  if (message.id === 'test_ocr_full_image') {
    const { fileName, appPath, screenshotsPath } = message.content || {};
    console.log('[BG] 🔧 Testing full image OCR:', fileName);
    logOCR(`🔧 Testing full image OCR: ${fileName}`, 'info');
    logOCR(`📁 App path: ${appPath}`, 'debug');
    logOCR(`📁 Screenshots path: ${screenshotsPath}`, 'debug');
    
    if (!plugin || !plugin.object || !plugin.object.ScanUsernameRegions) {
      console.error('[BG] ❌ Plugin not available for full image OCR');
      logOCR('❌ Plugin not available for full image OCR', 'error');
      logOCR(`🔍 Plugin object: ${typeof plugin}`, 'debug');
      logOCR(`🔍 Plugin.object: ${typeof plugin?.object}`, 'debug');
      logOCR(`🔍 ScanUsernameRegions method: ${typeof plugin?.object?.ScanUsernameRegions}`, 'debug');
      
      overwolf.windows.sendMessage(message.source, 'test_ocr_full_image_result', {
        success: false,
        error: 'Plugin not available',
        fileName: fileName
      }, () => {});
      return;
    }
    
    logOCR(`✅ Plugin available, calling ScanUsernameRegions`, 'debug');
    
    try {
      // Try app root directory first
      console.log('[BG] 📁 Calling plugin with app path:', appPath);
      logOCR(`📁 Calling plugin with app path: ${appPath}`, 'info');
      
      const result = plugin.object.ScanUsernameRegions(appPath, (ocrResult) => {
        logOCR(`📋 Full image OCR callback received: ${JSON.stringify(ocrResult)}`, 'debug');
        
        if (ocrResult && ocrResult.success) {
          console.log('[BG] ✅ Full image OCR result (app path):', ocrResult);
          logOCR(`✅ Full image OCR result (app path): ${JSON.stringify(ocrResult)}`, 'info');
          logOCR(`📝 Found ${ocrResult.results ? ocrResult.results.length : 0} text elements`, 'info');
          
          // Send result back
          overwolf.windows.sendMessage(message.source, 'test_ocr_full_image_result', {
            success: true,
            results: ocrResult.results || [],
            fileName: fileName
          }, () => {});
        } else if (ocrResult && ocrResult.error && ocrResult.error.includes('Image file not found')) {
          // Try screenshots folder as fallback
          console.log('[BG] ⚠️ File not found in app directory, trying screenshots folder:', screenshotsPath);
          logOCR(`⚠️ File not found in app directory, trying screenshots folder: ${screenshotsPath}`, 'warn');
          
          plugin.object.ScanUsernameRegions(screenshotsPath, (ocrResult2) => {
            logOCR(`📋 Full image OCR callback (screenshots): ${JSON.stringify(ocrResult2)}`, 'debug');
            
            if (ocrResult2 && ocrResult2.success) {
              console.log('[BG] ✅ Full image OCR result (screenshots):', ocrResult2);
              logOCR(`✅ Full image OCR result (screenshots): ${JSON.stringify(ocrResult2)}`, 'info');
              logOCR(`📝 Found ${ocrResult2.results ? ocrResult2.results.length : 0} text elements`, 'info');
              
              // Send result back
              overwolf.windows.sendMessage(message.source, 'test_ocr_full_image_result', {
                success: true,
                results: ocrResult2.results || [],
                fileName: fileName
              }, () => {});
            } else {
              console.error('[BG] ❌ Full image OCR failed (screenshots):', ocrResult2);
              logOCR(`❌ Full image OCR failed (screenshots): ${JSON.stringify(ocrResult2)}`, 'error');
              
              overwolf.windows.sendMessage(message.source, 'test_ocr_full_image_result', {
                success: false,
                error: ocrResult2 ? ocrResult2.error : 'Unknown error',
                fileName: fileName
              }, () => {});
            }
          });
        } else {
          console.error('[BG] ❌ Full image OCR failed (app path):', ocrResult);
          logOCR(`❌ Full image OCR failed (app path): ${JSON.stringify(ocrResult)}`, 'error');
          
          overwolf.windows.sendMessage(message.source, 'test_ocr_full_image_result', {
            success: false,
            error: ocrResult ? ocrResult.error : 'Unknown error',
            fileName: fileName
          }, () => {});
        }
      });
      
      logOCR(`🔄 ScanUsernameRegions called, waiting for callback...`, 'debug');
    } catch (error) {
      console.error('[BG] ❌ Full image OCR error:', error);
      logOCR(`❌ Full image OCR error: ${error.message}`, 'error');
      logOCR(`🔍 Error stack: ${error.stack}`, 'debug');
      
      overwolf.windows.sendMessage(message.source, 'test_ocr_full_image_result', {
        success: false,
        error: error.message,
        fileName: fileName
      }, () => {});
    }
  }

  // Handle PerformOcrFromBase64 requests
  if (message.id === 'perform_ocr_from_base64') {
    const { base64Image, regionId } = message.content || {};
    console.log('[BG] 🔧 Performing OCR from base64 for region:', regionId || 'full image');
    logOCR(`🔧 Performing OCR from base64 for region: ${regionId || 'full image'}`, 'info');
    
    if (!plugin || !plugin.object || !plugin.object.PerformOcrFromBase64) {
      console.error('[BG] ❌ Plugin not available for PerformOcrFromBase64');
      logOCR('❌ Plugin not available for PerformOcrFromBase64', 'error');
      logOCR(`🔍 Plugin object: ${typeof plugin}`, 'debug');
      logOCR(`🔍 Plugin.object: ${typeof plugin?.object}`, 'debug');
      logOCR(`🔍 PerformOcrFromBase64 method: ${typeof plugin?.object?.PerformOcrFromBase64}`, 'debug');
      
      overwolf.windows.sendMessage(message.source, 'perform_ocr_from_base64_result', {
        success: false,
        error: 'Plugin not available',
        regionId: regionId
      }, () => {});
      return;
    }
    
    if (!base64Image) {
      console.error('[BG] ❌ No base64 image provided');
      logOCR('❌ No base64 image provided', 'error');
      
      overwolf.windows.sendMessage(message.source, 'perform_ocr_from_base64_result', {
        success: false,
        error: 'No base64 image provided',
        regionId: regionId
      }, () => {});
      return;
    }
    
    logOCR(`✅ Plugin available, calling PerformOcrFromBase64`, 'debug');
    logOCR(`📊 Base64 image length: ${base64Image.length} characters`, 'debug');
    
    try {
      console.log('[BG] 🔧 Calling plugin.PerformOcrFromBase64');
      logOCR(`🔧 Calling plugin.PerformOcrFromBase64`, 'debug');
      
      const result = plugin.object.PerformOcrFromBase64(base64Image, (ocrResult) => {
        logOCR(`📋 PerformOcrFromBase64 callback received: ${JSON.stringify(ocrResult)}`, 'debug');
        
        if (ocrResult && ocrResult.success) {
          console.log('[BG] ✅ PerformOcrFromBase64 result:', ocrResult);
          logOCR(`✅ PerformOcrFromBase64 result: ${JSON.stringify(ocrResult)}`, 'info');
          logOCR(`📝 Found ${ocrResult.results ? ocrResult.results.length : 0} text elements`, 'info');
          
          // Send result back
          overwolf.windows.sendMessage(message.source, 'perform_ocr_from_base64_result', {
            success: true,
            results: ocrResult.results || [],
            text: ocrResult.text || '',
            confidence: ocrResult.confidence || 0,
            regionId: regionId
          }, () => {});
        } else {
          console.error('[BG] ❌ PerformOcrFromBase64 failed:', ocrResult);
          logOCR(`❌ PerformOcrFromBase64 failed: ${JSON.stringify(ocrResult)}`, 'error');
          
          overwolf.windows.sendMessage(message.source, 'perform_ocr_from_base64_result', {
            success: false,
            error: ocrResult ? ocrResult.error : 'Unknown error',
            regionId: regionId
          }, () => {});
        }
      });
      
      logOCR(`🔄 PerformOcrFromBase64 called, waiting for callback...`, 'debug');
    } catch (error) {
      console.error('[BG] ❌ PerformOcrFromBase64 error:', error);
      logOCR(`❌ PerformOcrFromBase64 error: ${error.message}`, 'error');
      logOCR(`🔍 Error stack: ${error.stack}`, 'debug');
      
      overwolf.windows.sendMessage(message.source, 'perform_ocr_from_base64_result', {
        success: false,
        error: error.message,
        regionId: regionId
      }, () => {});
    }
  }

  // Manual trigger for testing
  if (message.id === 'manual_trigger_pixel_monitoring') {
    manualTriggerPixelMonitoring();
  }
  
  // Manual trigger for color monitoring testing
  if (message.id === 'manual_trigger_color_monitoring') {
    manualTriggerColorMonitoring();
  }
});

function debugCriteriaStatus() {
  logAdvanced('Debug', 'Current criteria status', {
    criteria1LobbyEventReceived,
    criteria2GEPWorking,
    criteria3PixelMonitoringActive,
    pixelMonitoringStarted,
    timestamp: new Date().toISOString()
  });
}

function checkAllCriteriaReady() {
  debugCriteriaStatus();
  
  if (criteria1LobbyEventReceived && criteria2GEPWorking && !pixelMonitoringStarted) {
    logAdvanced('Criteria', 'All criteria met! Starting pixel monitoring', {
      criteria1LobbyEventReceived,
      criteria2GEPWorking
    });
    startPixelMonitoring();
  } else {
    logAdvanced('Criteria', 'Not all criteria met yet', {
      criteria1LobbyEventReceived,
      criteria2GEPWorking,
      pixelMonitoringStarted
    });
  }
}

function startPixelMonitoring() {
  if (pixelMonitoringStarted) {
    logAdvanced('PixelMonitor', 'Region color monitoring already started', {});
    return;
  }
  
  logAdvanced('PixelMonitor', 'Starting region color monitoring for yellow-orange color', {});
  pixelMonitoringStarted = true;
  
  // Monitor a region around coordinates (1517, 862) for yellow-orange color #f7bb2b
  const centerX = 1517;
  const centerY = 862;
  const regionWidth = 100; // 100 pixel wide region
  const regionHeight = 100; // 100 pixel tall region
  const targetColor = '#f7bb2b';
  const tolerance = 80; // Increased tolerance for color range matching
  const intervalMs = 200; // Check every 200ms (slightly slower due to region scanning)
  
  if (plugin && plugin.object && typeof plugin.object.StartRegionColorMonitoring === 'function') {
    plugin.object.StartRegionColorMonitoring(centerX, centerY, regionWidth, regionHeight, targetColor, tolerance, intervalMs, (result) => {
      logAdvanced('RegionColorMonitor', 'Region color monitoring callback (plugin)', result);
      handleColorMonitoringCallback(result);
    });
    logAdvanced('RegionColorMonitor', 'Region color monitoring started via plugin', {
      centerX: centerX,
      centerY: centerY,
      regionWidth: regionWidth,
      regionHeight: regionHeight,
      targetColor: targetColor,
      tolerance: tolerance,
      intervalMs: intervalMs
    });
  } else if (plugin && plugin.object && typeof plugin.object.StartColorMonitoring === 'function') {
    // Fallback to single pixel monitoring
    plugin.object.StartColorMonitoring(centerX, centerY, targetColor, tolerance, intervalMs, (result) => {
      logAdvanced('ColorMonitor', 'Color monitoring callback (plugin)', result);
      handleColorMonitoringCallback(result);
    });
    logAdvanced('ColorMonitor', 'Fallback to single pixel color monitoring', {
      x: centerX,
      y: centerY,
      targetColor: targetColor,
      tolerance: tolerance,
      intervalMs: intervalMs
    });
  } else {
    logAdvanced('ColorMonitor', 'Plugin not available for color monitoring', {});
    // Fallback to old pixel monitoring if color monitoring not available
    startPixelPolling(centerX, centerY, intervalMs);
  }
}

function startPixelPolling(x, y, intervalMs) {
  const pollInterval = setInterval(() => {
    if (plugin && plugin.object && typeof plugin.object.ScanPixelColor === 'function') {
      plugin.object.ScanPixelColor(x, y, (result) => {
        logAdvanced('PixelMonitor', 'Pixel polling result', result);
        if (result && result.success && !result.isBlack) {
          clearInterval(pollInterval);
          handlePixelMonitoringCallback({
            success: true,
            trigger: 'screen_not_black',
            pixelData: result
          });
        }
      });
    } else {
      logAdvanced('PixelMonitor', 'Plugin not available for pixel scanning', {});
      clearInterval(pollInterval);
    }
  }, intervalMs);
}

function handleColorMonitoringCallback(result) {
  logAdvanced('ColorMonitor', 'Color monitoring callback received', result);
  
  if (result && result.success && result.trigger === 'color_detected') {
    criteria3PixelMonitoringActive = true;
    
    // Log the detection details
    if (result.foundX && result.foundY) {
      logAdvanced('ColorMonitor', `Target color detected at (${result.foundX}, ${result.foundY})! Taking screenshot and running OCR`, {
        foundX: result.foundX,
        foundY: result.foundY,
        foundColor: result.foundColor,
        colorDistance: result.colorDistance,
        regionCenter: result.regionCenter,
        regionSize: result.regionSize
      });
    } else {
      logAdvanced('ColorMonitor', 'Target color detected! Taking screenshot and running OCR', result);
    }
    
    // Take screenshot and run OCR immediately
    requestOverlayOCR();
  } else {
    logAdvanced('ColorMonitor', 'Color callback received but conditions not met', {
      result: result,
      success: result?.success,
      trigger: result?.trigger,
      colorDistance: result?.colorDistance
    });
  }
}

function handlePixelMonitoringCallback(result) {
  logAdvanced('PixelMonitor', 'Pixel monitoring callback received', result);
  
  if (result && result.success && result.trigger === 'screen_not_black') {
    criteria3PixelMonitoringActive = true;
    logAdvanced('PixelMonitor', 'Screen is no longer black! Taking screenshot and running OCR', result);
    // Take screenshot and run OCR
    requestOverlayOCR();
  } else {
    logAdvanced('PixelMonitor', 'Pixel callback received but conditions not met', {
      result: result,
      success: result?.success,
      trigger: result?.trigger,
      isBlack: result?.isBlack
    });
  }
}

// Manual trigger for testing
function manualTriggerPixelMonitoring() {
  logAdvanced('Manual', 'Manual trigger activated - starting pixel monitoring', {});
  criteria1LobbyEventReceived = true;
  criteria2GEPWorking = true;
  startPixelMonitoring();
}

// Manual trigger for color monitoring testing
function manualTriggerColorMonitoring() {
  logAdvanced('Manual', 'Manual trigger activated - starting color monitoring', {});
  criteria1LobbyEventReceived = true;
  criteria2GEPWorking = true;
  startPixelMonitoring(); // This now starts color monitoring
}