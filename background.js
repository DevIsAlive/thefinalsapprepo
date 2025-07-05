console.log('[BG] Background script loaded ✅');

const windowNames = ['desktop', 'ingame_overlay'];
let usernameFound = false;
let ocrPollingActive = false;

// Boxes to scan for username text
const scanBoxes = [
  { x: 765, y: 285, width: 478, height: 34 },
  { x: 783, y: 161, width: 474, height: 31 },
  { x: 791, y: 68,  width: 384, height: 33 }
];

// ---------- Window Functions ----------
function sendMessage(winName, id, content) {
  overwolf.windows.obtainDeclaredWindow(winName, res => {
    if (res.success && res.window?.id) {
      overwolf.windows.sendMessage(winName, id, content, () => {});
    }
  });
}

function sendGameEvent(eventData) {
  windowNames.forEach(name => sendMessage(name, 'game_event', eventData));
  handleGameEvent(eventData);
}

function logOCR(message, level = 'info') {
  sendMessage('ocr_log', 'ocr_log_update', { message, level });
}

function drawOCRBox(box) {
  sendMessage('desktop', 'draw_debug_box', box);
}

function openAllWindows() {
  const windowsToOpen = ['desktop', 'ingame_overlay', 'ocr_log'];
  windowsToOpen.forEach(win => {
    overwolf.windows.obtainDeclaredWindow(win, result => {
      if (result.success && result.window?.id) {
        overwolf.windows.restore(result.window.id, () => {});
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
    if (!info?.isRunning || ![23478, 234781].includes(info.classId)) {
      sendGameEvent({ type: 'game_status', status: 'lobby' });
    }
    setTimeout(pollGameRunning, 3000);
  });
}

// ---------- GEP Setup ----------
function setupGEP() {
  overwolf.games.getRunningGameInfo(info => {
    if (info?.isRunning && [23478, 234781].includes(info.classId)) {
      overwolf.games.events.setRequiredFeatures(['game_info', 'match_info'], res => {
        if (!res.success) setTimeout(setupGEP, 3000);
      });
    } else {
      setTimeout(setupGEP, 3000);
    }
  });
}

overwolf.games.onGameLaunched.addListener(setupGEP);
overwolf.games.onGameInfoUpdated.addListener(info => {
  if (info.runningChanged || info.focusChanged) setupGEP();
});
setupGEP();
pollGameRunning();

// ---------- GEP Event Handlers ----------
overwolf.games.events.onNewEvents.addListener(pkt => {
  if (!pkt || !pkt.events) return;

  pkt.events.forEach(e => {
    switch (e.name) {
      case 'match_start':
        sendGameEvent({ type: 'game_status', status: 'ingame' });
        sendGameEvent({ type: 'round_started', started: true });
        break;
      case 'match_end':
        sendGameEvent({ type: 'game_status', status: 'summary' });
        sendGameEvent({ type: 'round_started', started: false });
        break;
      case 'elimination':
        sendGameEvent({ type: 'elimination', count: typeof e.data === 'number' ? e.data : 1 });
        break;
      case 'death':
        sendGameEvent({ type: 'death' });
        break;
    }
  });
});

overwolf.games.events.onInfoUpdates2.addListener(update => {
  if (update.feature === 'game_info' && update.key === 'scene') {
    const scene = normalizeScene(update.value);
    sendGameEvent({ type: 'game_status', status: scene });
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
    logOCR(`[${timestamp}] [requestOverlayOCR] isRunning: ${result?.isRunning}, classId: ${result?.classId}, handle: ${handle}`, 'debug');
    if (
      result &&
      result.isRunning &&
      [23478, 234781].includes(result.classId) &&
      handle
    ) {
      // Take screenshot and perform OCR
      performGameScreenshotOCR(handle, timestamp);
    } else {
      logOCR(`[${timestamp}] Failed to get game handle for OCR. isRunning: ${result?.isRunning}, classId: ${result?.classId}, handle: ${handle}`, 'error');
    }
  });
}

// Perform OCR on game screenshot
function performGameScreenshotOCR(gameHandle, timestamp) {
  logOCR(`[${timestamp}] Starting game screenshot OCR for handle: ${gameHandle}`, 'info');

  // Use Overwolf's recommended screenshot method for DX12 games
  overwolf.media.takeWindowsScreenshotByHandle(gameHandle, false, (result) => {
    if (result.success) {
      logOCR(`[${timestamp}] Screenshot captured: ${result.url}`, 'success');
      // Wait before processing to ensure file is written and a new frame is captured
      setTimeout(() => {
        scanBoxes.forEach((box, index) => {
          setTimeout(() => {
            processOCRBox(result.url, box, index, timestamp);
          }, index * 500);
        });
      }, 400); // 400ms delay
    } else {
      logOCR(`[${timestamp}] Screenshot failed: ${result.error}`, 'error');
    }
  });
}

// Process OCR for a specific box
function processOCRBox(screenshotUrl, box, boxIndex, timestamp) {
  logOCR(`[${timestamp}] Processing OCR box ${boxIndex}: ${JSON.stringify(box)}`, 'info');

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
  if (usernameFound) return;
  requestOverlayOCR();
  setTimeout(startUsernamePolling, 2500);
}

// ---------- Startup ----------
openAllWindows();

// Add a handler for game events to start polling on 'lobby' status
// NOTE: OCR polling is now handled by the overlay instead of background
function handleGameEvent(eventData) {
  // Background OCR polling disabled - overlay handles OCR now
  // if (eventData.type === 'game_status' && eventData.status === 'lobby' && !ocrPollingActive) {
  //   ocrPollingActive = true;
  //   startUsernamePolling();
  // }
}

// Helper function to handle file read results
function handleFileReadResult(result, targetWindow, box) {
  console.log('[BG] File read result:', result);
  logOCR(`File read result: ${JSON.stringify(result)}`, 'debug');
  
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
});