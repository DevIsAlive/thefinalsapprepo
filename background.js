console.log('[BG] Background script loaded ✅');

const windowNames = ['desktop', 'ingame_overlay'];
let usernameFound = false;

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
    logOCR(JSON.stringify(result), 'debug');
    // Prefer gameInfo.handle, fallback to windowHandle.value
    let handle = result?.gameInfo?.handle;
    if (!handle && result?.windowHandle?.value) {
      handle = result.windowHandle.value;
    }
    if (
      result &&
      result.isRunning &&
      [23478, 234781].includes(result.classId) &&
      handle
    ) {
      sendMessage('ingame_overlay', 'initiate_ocr', { handle });
    } else {
      logOCR('Failed to get game handle for OCR. isRunning: ' + result?.isRunning + ', classId: ' + result?.classId + ', handle: ' + handle, 'error');
    }
  });
}

function startUsernamePolling() {
  if (usernameFound) return;
  requestOverlayOCR();
  setTimeout(startUsernamePolling, 2500);
}

// ---------- Startup ----------
openAllWindows();
setTimeout(startUsernamePolling, 8000);