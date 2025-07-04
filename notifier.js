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
