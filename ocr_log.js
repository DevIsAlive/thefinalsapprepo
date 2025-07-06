// Enhanced OCR Log Viewer
console.log('[OCR-Log] Log viewer initialized');

// Log levels and their colors
const LOG_LEVELS = {
  'ERROR': '#FF4C4C',
  'WARN': '#FFD700', 
  'INFO': '#00D4FF',
  'DEBUG': '#888888',
  'SUCCESS': '#39FF14'
};

// Log filtering
let currentFilter = 'all';
let logEntries = [];

// Initialize log viewer
function initializeLogViewer() {
  console.log('[OCR-Log] Setting up log viewer interface');
  
  // Add filter controls if they don't exist
  addFilterControls();
  
  // Set up auto-scroll
  setupAutoScroll();
  
  // Add clear logs button
  addClearButton();
}

function addFilterControls() {
  const container = document.getElementById('ocr-log-messages');
  if (!container) return;
  
  // Check if filter controls already exist
  if (document.getElementById('log-filters')) return;
  
  const filterDiv = document.createElement('div');
  filterDiv.id = 'log-filters';
  filterDiv.style.cssText = `
    position: sticky;
    top: 0;
    background: #1a1a1a;
    padding: 10px;
    border-bottom: 1px solid #333;
    z-index: 10;
  `;
  
  const filterLabel = document.createElement('label');
  filterLabel.textContent = 'Filter: ';
  filterLabel.style.cssText = 'color: #fff; margin-right: 10px; font-size: 12px;';
  
  const filterSelect = document.createElement('select');
  filterSelect.style.cssText = 'background: #333; color: #fff; border: 1px solid #555; padding: 2px 5px; font-size: 12px;';
  
  const options = [
    { value: 'all', text: 'All Logs' },
    { value: 'error', text: 'Errors Only' },
    { value: 'warn', text: 'Warnings & Errors' },
    { value: 'info', text: 'Info & Above' },
    { value: 'debug', text: 'Debug & Above' }
  ];
  
  options.forEach(option => {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.text;
    filterSelect.appendChild(opt);
  });
  
  filterSelect.addEventListener('change', (e) => {
    currentFilter = e.target.value;
    applyFilter();
  });
  
  filterDiv.appendChild(filterLabel);
  filterDiv.appendChild(filterSelect);
  
  // Insert before the log container
  container.parentNode.insertBefore(filterDiv, container);
}

function addClearButton() {
  const container = document.getElementById('ocr-log-messages');
  if (!container) return;
  
  // Check if clear button already exists
  if (document.getElementById('clear-logs-btn')) return;
  
  const clearBtn = document.createElement('button');
  clearBtn.id = 'clear-logs-btn';
  clearBtn.textContent = 'Clear Logs';
  clearBtn.style.cssText = `
    position: absolute;
    top: 10px;
    right: 10px;
    background: #d32f2f;
    color: white;
    border: none;
    padding: 5px 10px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
  `;
  
  clearBtn.addEventListener('click', clearLogs);
  
  // Add to the page
  document.body.appendChild(clearBtn);
}

function setupAutoScroll() {
  const container = document.getElementById('ocr-log-messages');
  if (!container) return;
  
  // Auto-scroll to bottom when new logs arrive
  const observer = new MutationObserver(() => {
    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 10) {
      container.scrollTop = container.scrollHeight;
    }
  });
  
  observer.observe(container, { childList: true });
}

function clearLogs() {
  const container = document.getElementById('ocr-log-messages');
  if (container) {
    container.innerHTML = '';
    logEntries = [];
    console.log('[OCR-Log] Logs cleared');
  }
}

function applyFilter() {
  const container = document.getElementById('ocr-log-messages');
  if (!container) return;
  
  // Clear current display
  container.innerHTML = '';
  
  // Filter and display logs
  const filteredEntries = logEntries.filter(entry => {
    if (currentFilter === 'all') return true;
    if (currentFilter === 'error') return entry.level === 'ERROR';
    if (currentFilter === 'warn') return ['ERROR', 'WARN'].includes(entry.level);
    if (currentFilter === 'info') return ['ERROR', 'WARN', 'INFO'].includes(entry.level);
    if (currentFilter === 'debug') return true;
    return true;
  });
  
  // Re-add filtered entries
  filteredEntries.forEach(entry => {
    addLogEntry(entry, false); // false = don't add to logEntries again
  });
}

function addLogEntry(logData, addToArray = true) {
    const container = document.getElementById('ocr-log-messages');
    if (!container) return;

  // Parse log data
  let entry;
  if (typeof logData === 'string') {
    // Legacy format
    entry = {
      timestamp: new Date().toISOString(),
      component: '[Unknown]',
      level: 'INFO',
      message: logData,
      data: null
    };
  } else if (logData.content) {
    // New format from background/main
    entry = {
      timestamp: logData.timestamp || new Date().toISOString(),
      component: logData.component || '[Unknown]',
      level: logData.level || 'INFO',
      message: logData.message || logData.content.message,
      data: logData.data || logData.content.data
    };
  } else {
    // Direct format
    entry = logData;
  }
  
  // Add to log entries array
  if (addToArray) {
    logEntries.push(entry);
    // Keep only last 1000 entries to prevent memory issues
    if (logEntries.length > 1000) {
      logEntries = logEntries.slice(-1000);
    }
  }
  
  // Check if this entry should be displayed based on current filter
  if (currentFilter !== 'all') {
    if (currentFilter === 'error' && entry.level !== 'ERROR') return;
    if (currentFilter === 'warn' && !['ERROR', 'WARN'].includes(entry.level)) return;
    if (currentFilter === 'info' && !['ERROR', 'WARN', 'INFO'].includes(entry.level)) return;
  }
  
  // Create log entry element
  const logElement = document.createElement('div');
  logElement.className = `ocr-log-entry ${entry.level.toLowerCase()}`;
  logElement.style.cssText = `
    padding: 8px 12px;
    margin-bottom: 4px;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    font-size: 11px;
    line-height: 1.4;
    border-left: 3px solid ${LOG_LEVELS[entry.level] || LOG_LEVELS['INFO']};
    background: rgba(0, 0, 0, 0.1);
    word-wrap: break-word;
    white-space: pre-wrap;
  `;
  
  // Format timestamp
  const timestamp = new Date(entry.timestamp).toLocaleTimeString();
  
  // Create log content
  let logContent = `[${timestamp}] ${entry.component} [${entry.level}] ${entry.message}`;
  
  // Add data if present
  if (entry.data) {
    if (typeof entry.data === 'object') {
      logContent += '\n' + JSON.stringify(entry.data, null, 2);
    } else {
      logContent += '\n' + entry.data;
    }
  }
  
  logElement.textContent = logContent;
  
  // Add hover effect for better readability
  logElement.addEventListener('mouseenter', () => {
    logElement.style.background = 'rgba(255, 255, 255, 0.05)';
  });
  
  logElement.addEventListener('mouseleave', () => {
    logElement.style.background = 'rgba(0, 0, 0, 0.1)';
  });
  
  // Add to container
  container.appendChild(logElement);
  
  // Auto-scroll to bottom
  if (container.scrollTop + container.clientHeight >= container.scrollHeight - 10) {
    container.scrollTop = container.scrollHeight;
  }
}

// Message listener for receiving logs
overwolf.windows.onMessageReceived.addListener((msg) => {
  if (msg.id === 'ocr_log_update') {
    addLogEntry(msg.content);
  }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeLogViewer);
} else {
  initializeLogViewer();
}

// Add initial log entry
addLogEntry({
  timestamp: new Date().toISOString(),
  component: '[OCR-Log]',
  level: 'INFO',
  message: 'Log viewer ready to receive messages',
  data: null
});
