console.log('[OCR LOG] Ready to receive messages');

overwolf.windows.onMessageReceived.addListener((msg) => {
  if (msg.id === 'ocr_log_update') {
    const container = document.getElementById('ocr-log-messages');
    if (!container) return;

    const entry = document.createElement('div');
    entry.className = `ocr-log-entry ${msg.content.level}`;
    entry.style.padding = '6px 10px';
    entry.style.marginBottom = '6px';
    entry.style.fontFamily = 'monospace';
    entry.style.color = msg.content.level === 'error' ? '#FF4C4C' :
                        msg.content.level === 'warn' ? '#FFD700' :
                        msg.content.level === 'success' ? '#39FF14' :
                        '#00D4FF';

    entry.textContent = `[${msg.content.level.toUpperCase()}] ${msg.content.message}`;
    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;
  }
});
