console.log('[Notifier] Loaded ✅');

// DOM Elements
const notifierList = document.getElementById('notifier-list');
const allEventsList = document.getElementById('all-events-list');
const seeAllButton = document.getElementById('see-all-btn');
const closeAllButton = document.getElementById('close-all-btn');
const allEventsContainer = document.getElementById('all-events-container');

// State
const maxNotifiers = 3;
const allEvents = [];

// Enhanced logging utility
function log(component, message, level = 'info', data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    component: `[Notifier-${component}]`,
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
    overwolf.windows.sendMessage('ocr_log', 'ocr_log_update', logEntry, () => {});
  }
}

log('Init', 'Notifier script loaded and initialized', 'success');

// Notification settings
let notificationEnabled = true;
let notificationSound = true;
let notificationDuration = 5000;

// Initialize notification settings
function initializeNotifications() {
  log('Init', 'Initializing notification system', 'debug');
  
  // Load settings from localStorage if available
  try {
    const savedSettings = localStorage.getItem('notificationSettings');
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      notificationEnabled = settings.enabled !== false;
      notificationSound = settings.sound !== false;
      notificationDuration = settings.duration || 5000;
      
      log('Settings', 'Loaded notification settings from storage', 'debug', settings);
    }
  } catch (error) {
    log('Settings', 'Failed to load notification settings', 'error', { error: error.message });
  }
  
  // Update UI to reflect current settings
  updateNotificationUI();
}

function updateNotificationUI() {
  const enabledCheckbox = document.getElementById('notification-enabled');
  const soundCheckbox = document.getElementById('notification-sound');
  const durationInput = document.getElementById('notification-duration');
  
  if (enabledCheckbox) enabledCheckbox.checked = notificationEnabled;
  if (soundCheckbox) soundCheckbox.checked = notificationSound;
  if (durationInput) durationInput.value = notificationDuration;
  
  log('UI', 'Updated notification UI elements', 'debug', {
    enabled: notificationEnabled,
    sound: notificationSound,
    duration: notificationDuration
  });
}

// Save settings to localStorage
function saveNotificationSettings() {
  try {
    const settings = {
      enabled: notificationEnabled,
      sound: notificationSound,
      duration: notificationDuration
    };
    
    localStorage.setItem('notificationSettings', JSON.stringify(settings));
    log('Settings', 'Saved notification settings to storage', 'debug', settings);
  } catch (error) {
    log('Settings', 'Failed to save notification settings', 'error', { error: error.message });
  }
}

// Show notification
function showNotification(title, message, type = 'info', data = null) {
  if (!notificationEnabled) {
    log('Notification', 'Notifications disabled, skipping', 'debug', { title, message, type });
    return;
  }
  
  log('Notification', 'Showing notification', 'info', {
    title,
    message,
    type,
    data
  });
  
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'error' ? '#d32f2f' : 
                 type === 'success' ? '#388e3c' : 
                 type === 'warn' ? '#f57c00' : '#1976d2'};
    color: white;
    padding: 15px 20px;
    border-radius: 5px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    max-width: 300px;
    word-wrap: break-word;
    font-family: Arial, sans-serif;
    font-size: 14px;
    line-height: 1.4;
    transform: translateX(100%);
    transition: transform 0.3s ease-in-out;
  `;
  
  // Create title element
  const titleElement = document.createElement('div');
  titleElement.style.cssText = 'font-weight: bold; margin-bottom: 5px; font-size: 16px;';
  titleElement.textContent = title;
  
  // Create message element
  const messageElement = document.createElement('div');
  messageElement.textContent = message;
  
  // Add elements to notification
  notification.appendChild(titleElement);
  notification.appendChild(messageElement);
  
  // Add data if present
  if (data) {
    const dataElement = document.createElement('div');
    dataElement.style.cssText = 'margin-top: 8px; font-size: 12px; opacity: 0.8;';
    dataElement.textContent = typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
    notification.appendChild(dataElement);
  }
  
  // Add to page
  document.body.appendChild(notification);
  
  // Animate in
  setTimeout(() => {
    notification.style.transform = 'translateX(0)';
  }, 10);
  
  // Play sound if enabled
  if (notificationSound) {
    playNotificationSound(type);
  }
  
  // Auto-remove after duration
  setTimeout(() => {
    notification.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, notificationDuration);
  
  // Add click to dismiss
  notification.addEventListener('click', () => {
    notification.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  });
  
  log('Notification', 'Notification displayed successfully', 'debug', {
    title,
    message,
    type,
    duration: notificationDuration
  });
}

// Play notification sound
function playNotificationSound(type) {
  try {
    log('Sound', 'Playing notification sound', 'debug', { type });
    
    // Create audio context for sound generation
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    // Configure sound based on type
    let frequency = 800; // Default frequency
    let duration = 0.2; // Default duration
    
    switch (type) {
      case 'error':
        frequency = 400;
        duration = 0.3;
        break;
      case 'success':
        frequency = 1000;
        duration = 0.15;
        break;
      case 'warn':
        frequency = 600;
        duration = 0.25;
        break;
    }
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);
    
    log('Sound', 'Notification sound played successfully', 'debug', {
      type,
      frequency,
      duration
    });
  } catch (error) {
    log('Sound', 'Failed to play notification sound', 'error', { error: error.message });
  }
}

// Event listeners for settings changes
document.addEventListener('DOMContentLoaded', () => {
  log('Init', 'DOM loaded, setting up event listeners', 'debug');
  
  const enabledCheckbox = document.getElementById('notification-enabled');
  const soundCheckbox = document.getElementById('notification-sound');
  const durationInput = document.getElementById('notification-duration');
  
  if (enabledCheckbox) {
    enabledCheckbox.addEventListener('change', (e) => {
      notificationEnabled = e.target.checked;
      log('Settings', 'Notification enabled setting changed', 'info', { enabled: notificationEnabled });
      saveNotificationSettings();
    });
  }
  
  if (soundCheckbox) {
    soundCheckbox.addEventListener('change', (e) => {
      notificationSound = e.target.checked;
      log('Settings', 'Notification sound setting changed', 'info', { sound: notificationSound });
      saveNotificationSettings();
    });
  }
  
  if (durationInput) {
    durationInput.addEventListener('change', (e) => {
      const newDuration = parseInt(e.target.value);
      if (newDuration > 0) {
        notificationDuration = newDuration;
        log('Settings', 'Notification duration setting changed', 'info', { duration: notificationDuration });
        saveNotificationSettings();
      }
    });
  }
  
  // Initialize notifications
  initializeNotifications();
  
  // Test notification button
  const testButton = document.getElementById('test-notification');
  if (testButton) {
    testButton.addEventListener('click', () => {
      log('Test', 'Test notification requested', 'info');
      showNotification('Test Notification', 'This is a test notification to verify the system is working correctly.', 'info', { timestamp: new Date().toISOString() });
    });
  }
});

// Message listener for receiving notifications from other windows
overwolf.windows.onMessageReceived.addListener((msg) => {
  if (msg.id === 'show_notification') {
    log('Message', 'Received notification request', 'debug', msg.content);
    showNotification(
      msg.content.title || 'Notification',
      msg.content.message || '',
      msg.content.type || 'info',
      msg.content.data
    );
  }
});

// Export functions for use by other scripts
window.notificationSystem = {
  show: showNotification,
  setEnabled: (enabled) => {
    notificationEnabled = enabled;
    saveNotificationSettings();
    updateNotificationUI();
    log('API', 'Notification enabled set via API', 'info', { enabled });
  },
  setSound: (sound) => {
    notificationSound = sound;
    saveNotificationSettings();
    updateNotificationUI();
    log('API', 'Notification sound set via API', 'info', { sound });
  },
  setDuration: (duration) => {
    if (duration > 0) {
      notificationDuration = duration;
      saveNotificationSettings();
      updateNotificationUI();
      log('API', 'Notification duration set via API', 'info', { duration });
    }
  }
};

// Add a new notification
function addNotification(type, time) {
  if (!notifierList || !allEventsList) return;

  const item = document.createElement('div');
  item.className = `notifier-item ${type}`;
  item.textContent = `${type === 'elimination' ? 'Elimination' : 'Death'} at ${time}`;
  notifierList.prepend(item);

  // Limit visible notifications
  if (notifierList.children.length > maxNotifiers) {
    notifierList.removeChild(notifierList.lastChild);
    if (seeAllButton) seeAllButton.style.display = 'block';
  }

  // Add to full history
  allEvents.unshift({ type, time });

  refreshAllEvents();
}

// Refresh full event list
function refreshAllEvents() {
  allEventsList.innerHTML = '';
  allEvents.forEach(evt => {
    const e = document.createElement('div');
    e.className = `notifier-item ${evt.type}`;
    e.textContent = `${evt.type === 'elimination' ? 'Elimination' : 'Death'} at ${evt.time}`;
    allEventsList.appendChild(e);
  });
}

// See all button
if (seeAllButton) {
  seeAllButton.onclick = () => {
    if (allEventsContainer) {
      allEventsContainer.style.display = 'block';
    }
  };
}

// Close all button
if (closeAllButton) {
  closeAllButton.onclick = () => {
    if (allEventsContainer) {
      allEventsContainer.style.display = 'none';
    }
  };
}

// Make addNotification globally available
window.addNotification = addNotification;
