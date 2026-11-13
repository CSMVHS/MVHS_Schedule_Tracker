// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyDbnzWXHsqr6rOXEq99FMYyJEgVp5QSUAo",
  authDomain: "mvhs-st.firebaseapp.com",
  databaseURL: "https://mvhs-st-default-rtdb.firebaseio.com",
  projectId: "mvhs-st",
  storageBucket: "mvhs-st.firebasestorage.app",
  messagingSenderId: "156783766681",
  appId: "1:156783766681:web:ee2d859d4372859a909c08"
};

let currentDeviceId = null;
let devicesData = {};
let activeSearchQuery = "";
let activeFilter = "all";
let currentGlobalSnow = "auto";
let currentGlobalAnnouncement = { enabled: false, text: "" };
let renderDebounceTimer = null;

// UI Elements
const loginContainer = document.getElementById('login-container');
const adminDashboard = document.getElementById('admin-dashboard');
const deviceList = document.getElementById('device-list');
const deviceCount = document.getElementById('device-count');
const controlModal = document.getElementById('control-modal');
const toastContainer = document.getElementById('toast-container');
const errorEl = document.getElementById('login-error');

// Toast Notification Helper
function showToast(message, type = 'info') {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    let icon = 'check-circle';
    if (type === 'error') icon = 'alert-circle';
    if (type === 'warning') icon = 'alert-triangle';

    toast.innerHTML = `<i data-lucide="${icon}"></i> <span>${escapeHtml(message)}</span>`;
    toastContainer.appendChild(toast);
    if (window.lucide) window.lucide.createIcons();

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.25s ease';
        setTimeout(() => toast.remove(), 250);
    }, 3000);
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function isSafeImageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
        const parsed = new URL(url.trim(), window.location.origin);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch (e) {
        return false;
    }
}

function setStatusText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function updateSummaryStats() {
    const dataStore = window.devicesData || devicesData || {};
    const ids = Object.keys(dataStore);
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;

    let onlineCount = 0;
    let inactiveCount = 0;
    let offlineCount = 0;

    ids.forEach(id => {
        const device = dataStore[id] || {};
        const isOnline = !!device.status?.isOnline;
        const lastInteraction = device.status?.lastInteraction || 0;
        const isActive = !!(lastInteraction && (now - lastInteraction < weekMs));

        if (isOnline && isActive) {
            onlineCount++;
        } else if (isOnline) {
            inactiveCount++;
        } else {
            offlineCount++;
        }
    });

    setStatusText('stat-total', String(ids.length));
    setStatusText('stat-online', String(onlineCount));
    setStatusText('stat-inactive', String(inactiveCount));
    setStatusText('stat-offline', String(offlineCount));
    setStatusText('nav-online-count', String(onlineCount));

    const snowLabels = { auto: 'Auto', on: 'Force On', off: 'Force Off' };
    setStatusText('stat-snow', snowLabels[currentGlobalSnow] || 'Auto');

    const annActive = !!(currentGlobalAnnouncement && currentGlobalAnnouncement.enabled && currentGlobalAnnouncement.text && currentGlobalAnnouncement.text.trim());
    setStatusText('stat-announcement', annActive ? 'Active' : 'Off');
}

function setupGlobalTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-tab');
            tabBtns.forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-selected', 'false');
            });
            tabPanels.forEach(p => {
                p.classList.remove('active');
                p.hidden = true;
            });
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
            const targetPanel = document.getElementById(targetId);
            if (targetPanel) {
                targetPanel.classList.add('active');
                targetPanel.hidden = false;
            }
        });
    });
}

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

if (window.lucide) {
    window.lucide.createIcons();
}

// Auth State Observer
firebase.auth().onAuthStateChanged((user) => {
    if (user && adminDashboard.style.display === 'none') {
        initDashboard();
    }
});

// Login Logic
const loginForm = document.getElementById('login-form');
const performLogin = () => {
    const email = document.getElementById('admin-email').value.trim();
    const pwd = document.getElementById('admin-password').value;

    errorEl.textContent = "Signing in...";

    firebase.auth().signInWithEmailAndPassword(email, pwd)
        .catch((error) => {
            console.error("Login failed", error);
            errorEl.textContent = error.message;
        });
};

if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        performLogin();
    });
} else {
    document.getElementById('login-btn').addEventListener('click', performLogin);
}

function initDashboard() {
    loginContainer.style.display = 'none';
    adminDashboard.style.display = 'block';

    setupGlobalTabs();

    if (window.lucide) {
        window.lucide.createIcons();
    }
    if (window.enhanceAllCustomUi) {
        window.enhanceAllCustomUi(adminDashboard);
    }

    const db = firebase.database();

    // Global Mode Toggle Logic
    const globalBgMode = document.getElementById('global-bg-mode');
    const globalBgColorGroup = document.getElementById('global-bg-color-group');
    const globalBgGradientGroup = document.getElementById('global-bg-gradient-group');
    const globalBgImageGroup = document.getElementById('global-bg-image-group');

    const syncGlobalBgModeFields = () => {
        const mode = globalBgMode.value;
        globalBgColorGroup.style.display = mode === 'color' ? 'contents' : 'none';
        globalBgGradientGroup.style.display = mode === 'gradient' ? 'contents' : 'none';
        globalBgImageGroup.style.display = mode === 'image' ? 'block' : 'none';
    };
    globalBgMode.addEventListener('change', syncGlobalBgModeFields);
    syncGlobalBgModeFields();

    // Modal Mode Toggle Logic
    const modalBgMode = document.getElementById('modal-bg-mode');
    const modalBgColorGroup = document.getElementById('modal-bg-color-group');
    const modalBgGradientGroup = document.getElementById('modal-bg-gradient-group');
    const modalBgImageGroup = document.getElementById('modal-bg-image-group');

    modalBgMode.addEventListener('change', () => {
        const mode = modalBgMode.value;
        modalBgColorGroup.style.display = mode === 'color' ? 'block' : 'none';
        modalBgGradientGroup.style.display = mode === 'gradient' ? 'block' : 'none';
        modalBgImageGroup.style.display = mode === 'image' ? 'block' : 'none';
    });

    // Modal Device Announcement Mode Toggle
    const devAnnMode = document.getElementById('input-device-announcement-mode');
    const devAnnGroup = document.getElementById('modal-device-announcement-group');
    if (devAnnMode && devAnnGroup) {
        devAnnMode.addEventListener('change', () => {
            devAnnGroup.style.display = devAnnMode.value === 'custom' ? 'flex' : 'none';
        });
    }

    // Hold to Show Device IDs logic
    const holdIdentifyBtn = document.getElementById('hold-identify-btn');
    if (holdIdentifyBtn) {
        let isHolding = false;
        const setHoldState = (active) => {
            if (isHolding === active) return;
            isHolding = active;
            if (active) {
                holdIdentifyBtn.classList.add('active');
                db.ref('global/showDeviceIDs').set(true)
                    .catch(err => showToast("Failed to activate ID Flash: " + err.message, 'error'));
            } else {
                holdIdentifyBtn.classList.remove('active');
                db.ref('global/showDeviceIDs').set(false)
                    .catch(err => showToast("Failed to deactivate ID Flash: " + err.message, 'error'));
            }
        };

        holdIdentifyBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            holdIdentifyBtn.setPointerCapture(e.pointerId);
            setHoldState(true);
        });
        holdIdentifyBtn.addEventListener('pointerup', (e) => {
            e.preventDefault();
            setHoldState(false);
        });
        holdIdentifyBtn.addEventListener('pointercancel', () => setHoldState(false));
        holdIdentifyBtn.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    // Clear All Device Names & Re-Prompt "Who's this?"
    const clearAllNamesBtn = document.getElementById('clear-all-names-btn');
    if (clearAllNamesBtn) {
        clearAllNamesBtn.addEventListener('click', () => {
            const dataStore = window.devicesData || devicesData || {};
            const deviceIds = Object.keys(dataStore);
            if (!confirm(`Clear ALL device names (${deviceIds.length} devices) and ask everyone "Who's this?" again?`)) {
                return;
            }
            const updates = {};
            deviceIds.forEach(id => {
                updates[`devices/${id}/settings/name`] = null;
                updates[`devices/${id}/status/name`] = null;
            });
            updates['global/resetNamesTs'] = Date.now();
            db.ref().update(updates)
                .then(() => showToast("All device names cleared! Displays will re-prompt."))
                .catch(e => showToast("Error: " + e.message, 'error'));
        });
    }

    // Reset Global Defaults
    const resetDefaultsBtn = document.getElementById('reset-defaults-btn');
    if (resetDefaultsBtn) {
        resetDefaultsBtn.addEventListener('click', () => {
            const dataStore = window.devicesData || devicesData || {};
            const deviceIds = Object.keys(dataStore);
            if (!confirm(`Reset global snow override and restore default green/gold MVHS theme on ALL (${deviceIds.length}) displays?`)) {
                return;
            }
            const updates = {
                'global/snowOverride': 'auto'
            };
            deviceIds.forEach(id => {
                updates[`devices/${id}/settings/bgMode`] = 'color';
                updates[`devices/${id}/settings/bgColor`] = '#00401e';
                updates[`devices/${id}/settings/bgGradient1`] = '#00401e';
                updates[`devices/${id}/settings/bgGradient2`] = '#001a0c';
                updates[`devices/${id}/settings/bgGradientAngle`] = '135';
                updates[`devices/${id}/settings/bgImage`] = '';
                updates[`devices/${id}/settings/barColor`] = '#b1953a';
                updates[`devices/${id}/settings/textColor`] = '#ffffff';
                updates[`devices/${id}/settings/animAccentColor`] = '#ffffff';
                updates[`devices/${id}/settings/barStyle`] = 'liquid';
                updates[`devices/${id}/settings/clock24h`] = false;
                updates[`devices/${id}/settings/snowOverride`] = 'global';
                updates[`devices/${id}/settings/announcementMode`] = 'global';
            });

            db.ref().update(updates)
                .then(() => {
                    document.querySelectorAll('.btn-reset').forEach(b => b.click());
                    globalBgMode.value = 'color';
                    syncGlobalBgModeFields();
                    if (globalBgMode._updateCustomSelect) globalBgMode._updateCustomSelect();
                    const barStyle = document.getElementById('global-bar-style');
                    barStyle.value = 'liquid';
                    if (barStyle._updateCustomSelect) barStyle._updateCustomSelect();
                    const clockFmt = document.getElementById('global-clock-format');
                    clockFmt.value = '12';
                    if (clockFmt._updateCustomSelect) clockFmt._updateCustomSelect();
                    setStatusText('global-theme-status', 'Defaults restored across all devices.');
                    showToast("Default MVHS theme and settings restored!");
                })
                .catch(e => showToast("Error: " + e.message, 'error'));
        });
    }

    // Snow Override Segmented Control
    const snowBtns = document.querySelectorAll('.seg-btn[data-snow]');
    const updateSnowButtonsUI = (mode) => {
        const valid = ['auto', 'on', 'off'];
        currentGlobalSnow = valid.includes(mode) ? mode : 'auto';
        snowBtns.forEach(b => {
            const active = b.getAttribute('data-snow') === currentGlobalSnow;
            b.classList.toggle('active', active);
            b.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        const descriptions = {
            auto: 'Mode: Auto (follows Highlands Ranch weather)',
            on: 'Mode: Force On (high-perf displays show snow)',
            off: 'Mode: Force Off (snow disabled globally)'
        };
        setStatusText('snow-override-status', descriptions[currentGlobalSnow]);
        updateSummaryStats();
    };

    db.ref('global/snowOverride').on('value', (snap) => {
        updateSnowButtonsUI(snap.val() || 'auto');
    });

    snowBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.getAttribute('data-snow');
            updateSnowButtonsUI(mode);
            db.ref('global/snowOverride').set(mode)
                .then(() => showToast(`Snow override set to: ${mode.toUpperCase()}`))
                .catch(e => showToast("Error: " + e.message, 'error'));
        });
    });

    // Global Lower-Bar Announcement
    const annEnabledEl = document.getElementById('input-announcement-enabled');
    const annTextEl = document.getElementById('input-announcement-text');
    const saveAnnBtn = document.getElementById('save-announcement-btn');
    const clearAnnBtn = document.getElementById('clear-announcement-btn');

    const updateAnnouncementCounter = () => {
        const len = annTextEl ? annTextEl.value.length : 0;
        setStatusText('announcement-char-count', `${len} / 200`);
    };

    const updateAnnouncementUI = (val) => {
        const safeVal = (val && typeof val === 'object') ? val : { enabled: false, text: '' };
        currentGlobalAnnouncement = {
            enabled: !!safeVal.enabled,
            text: typeof safeVal.text === 'string' ? safeVal.text : ''
        };
        if (annEnabledEl) annEnabledEl.checked = currentGlobalAnnouncement.enabled;
        if (annTextEl && document.activeElement !== annTextEl) {
            annTextEl.value = currentGlobalAnnouncement.text;
        }
        updateAnnouncementCounter();
        const isLive = currentGlobalAnnouncement.enabled && currentGlobalAnnouncement.text.trim().length > 0;
        setStatusText(
            'announcement-status',
            isLive
                ? 'Active — visible whenever the lower schedule bar is hidden'
                : (currentGlobalAnnouncement.enabled ? 'Enabled, waiting for message text' : 'Currently disabled')
        );
        updateSummaryStats();
    };

    if (annTextEl) {
        annTextEl.addEventListener('input', updateAnnouncementCounter);
    }

    db.ref('global/announcement').on('value', (snap) => {
        updateAnnouncementUI(snap.val());
    });

    if (saveAnnBtn) {
        saveAnnBtn.addEventListener('click', () => {
            const enabled = annEnabledEl ? annEnabledEl.checked : false;
            const text = annTextEl ? annTextEl.value.trim() : '';
            const payload = { enabled, text, updatedAt: Date.now() };
            updateAnnouncementUI(payload);
            db.ref('global/announcement').set(payload)
                .then(() => showToast(enabled && text ? "Announcement saved & enabled!" : "Announcement saved."))
                .catch(e => showToast("Error: " + e.message, 'error'));
        });
    }

    if (clearAnnBtn) {
        clearAnnBtn.addEventListener('click', () => {
            if (annEnabledEl) annEnabledEl.checked = false;
            if (annTextEl) annTextEl.value = '';
            const payload = { enabled: false, text: '', updatedAt: Date.now() };
            updateAnnouncementUI(payload);
            db.ref('global/announcement').set(payload)
                .then(() => showToast("Announcement cleared."))
                .catch(e => showToast("Error: " + e.message, 'error'));
        });
    }

    // Filter Buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            activeFilter = e.currentTarget.getAttribute('data-filter');
            renderDevices();
        });
    });

    // Search Controls
    const searchInput = document.getElementById('search-input');
    const clearSearchBtn = document.getElementById('clear-search-btn');

    const performSearch = () => {
        activeSearchQuery = searchInput.value.trim().toLowerCase();
        clearSearchBtn.style.display = activeSearchQuery ? 'inline-flex' : 'none';
        renderDevices();
    };

    searchInput.addEventListener('input', performSearch);
    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        activeSearchQuery = '';
        clearSearchBtn.style.display = 'none';
        renderDevices();
    });

    // Global Actions - Refresh All
    document.getElementById('refresh-all-btn').addEventListener('click', () => {
        const dataStore = window.devicesData || devicesData || {};
        const deviceIds = Object.keys(dataStore);
        if (deviceIds.length === 0) return;

        if (confirm(`Refresh ALL (${deviceIds.length}) connected displays?`)) {
            const updates = {};
            const ts = Date.now();
            deviceIds.forEach(id => {
                updates[`devices/${id}/command`] = { type: 'REFRESH', ts: ts };
            });
            db.ref().update(updates)
                .then(() => showToast("Refresh command sent to all devices!"))
                .catch(e => showToast("Error: " + e.message, 'error'));
        }
    });

    // Global Actions - Hard Reload All
    document.getElementById('hard-reload-all-btn').addEventListener('click', () => {
        const dataStore = window.devicesData || devicesData || {};
        const deviceIds = Object.keys(dataStore);
        if (deviceIds.length === 0) return;

        if (confirm(`Hard Reload ALL (${deviceIds.length}) connected displays?`)) {
            const updates = {};
            const ts = Date.now();
            deviceIds.forEach(id => {
                updates[`devices/${id}/command`] = { type: 'HARD_RELOAD', ts: ts };
            });
            db.ref().update(updates)
                .then(() => showToast("Hard reload command sent to all devices!"))
                .catch(e => showToast("Error: " + e.message, 'error'));
        }
    });

    // Save Global Theme to All
    document.getElementById('save-global-theme-btn').addEventListener('click', () => {
        const dataStore = window.devicesData || devicesData || {};
        const deviceIds = Object.keys(dataStore);
        if (deviceIds.length === 0) return;

        const mode = document.getElementById('global-bg-mode').value;
        const bg = document.getElementById('input-global-bg').value;
        const grad1 = document.getElementById('input-global-grad1').value;
        const grad2 = document.getElementById('input-global-grad2').value;
        const gradDeg = document.getElementById('input-global-grad-deg').value || "135";
        const bgImage = document.getElementById('input-global-bg-image').value.trim();
        const bar = document.getElementById('input-global-bar').value;
        const textColor = document.getElementById('input-global-text-color').value;
        const animAccent = document.getElementById('input-global-anim-accent').value;
        const barStyle = document.getElementById('global-bar-style').value;
        const clock24h = document.getElementById('global-clock-format').value === '24';

        if (confirm(`Apply this theme to ALL (${deviceIds.length}) displays?`)) {
            const updates = {};
            deviceIds.forEach(id => {
                updates[`devices/${id}/settings/bgMode`] = mode;
                updates[`devices/${id}/settings/bgColor`] = bg;
                updates[`devices/${id}/settings/bgGradient1`] = grad1;
                updates[`devices/${id}/settings/bgGradient2`] = grad2;
                updates[`devices/${id}/settings/bgGradientAngle`] = gradDeg;
                updates[`devices/${id}/settings/bgImage`] = bgImage;
                updates[`devices/${id}/settings/barColor`] = bar;
                updates[`devices/${id}/settings/textColor`] = textColor;
                updates[`devices/${id}/settings/animAccentColor`] = animAccent;
                updates[`devices/${id}/settings/barStyle`] = barStyle;
                updates[`devices/${id}/settings/clock24h`] = clock24h;
            });

            db.ref().update(updates)
                .then(() => {
                    setStatusText('global-theme-status', `Applied theme to ${deviceIds.length} displays just now.`);
                    showToast("Theme applied to all devices!");
                })
                .catch(e => showToast("Error: " + e.message, 'error'));
        }
    });

    // Handle Reset Buttons
    document.querySelectorAll('.btn-reset').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = e.currentTarget.getAttribute('data-target');
            const defaultValue = e.currentTarget.getAttribute('data-default');
            const targetEl = document.getElementById(targetId);
            if (targetEl) {
                targetEl.value = defaultValue;
                targetEl.dispatchEvent(new Event('input', { bubbles: true }));
                targetEl.dispatchEvent(new Event('change', { bubbles: true }));
                if (targetEl._updateCustomColor) {
                    targetEl._updateCustomColor();
                }
            }
        });
    });

    // Realtime listener with debounce for smooth rendering
    db.ref('devices').on('value', (snap) => {
        devicesData = snap.val() || {};
        window.devicesData = devicesData;

        if (renderDebounceTimer) clearTimeout(renderDebounceTimer);
        renderDebounceTimer = setTimeout(() => {
            updateSummaryStats();
            renderDevices();
        }, 120);

        if (controlModal.style.display === 'flex' && currentDeviceId) {
            updateModalData(currentDeviceId);
        }
    });
}

function createDeviceCard(id, device, now, weekMs) {
    const isOnline = !!device.status?.isOnline;
    const lastInteraction = device.status?.lastInteraction || 0;
    const isActive = !!(lastInteraction && (now - lastInteraction < weekMs));

    let statusClass = 'offline';
    let statusText = 'Offline';
    let statusIcon = 'wifi-off';
    if (isOnline) {
        if (isActive) {
            statusClass = 'online';
            statusText = 'Online';
            statusIcon = 'wifi';
        } else {
            statusClass = 'online-inactive';
            statusText = 'Inactive';
            statusIcon = 'clock';
        }
    }

    const name = device.settings?.name || device.status?.name || "Unnamed Device";
    const lastSeenTs = device.status?.lastSeen || 0;
    const lastSeen = lastSeenTs ? new Date(lastSeenTs).toLocaleString() : "Never";
    const firstSeenTs = device.status?.firstSeen || 0;

    let totalTimeStr = "---";
    if (lastSeenTs && firstSeenTs) {
        const diffMs = lastSeenTs - firstSeenTs;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const d = Math.floor(diffHours / 24);
        const h = diffHours % 24;
        totalTimeStr = `${d}d ${h}h`;
    }

    const hasBattery = device.status?.battery && device.status.battery !== "UNAVAIL";
    const settings = device.settings || {};
    const isOverridden = settings.overrideActive && settings.overrideText;
    const timeOffset = parseInt(settings.timeOffset, 10) || 0;
    const offsetClass = timeOffset !== 0 ? 'active' : '';
    const bgMode = settings.bgMode || 'color';

    const snowOverride = settings.snowOverride && settings.snowOverride !== 'global' ? settings.snowOverride : null;
    const annMode = settings.announcementMode && settings.announcementMode !== 'global' ? settings.announcementMode : null;

    const card = document.createElement('div');
    card.className = `device-card ${statusClass}`;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Configure ${name} (${id})`);

    card.innerHTML = `
        <div class="status-badge"><i data-lucide="${statusIcon}"></i> ${statusText}</div>
        <div class="device-name">${escapeHtml(name)}</div>

        <div class="device-previews">
            <div class="color-preview bg-preview-dot ${bgMode !== 'color' ? 'gradient-preview' : ''}" title="BG (${escapeHtml(bgMode)})"></div>
            <div class="color-preview bar-preview-dot" title="Bar Color"></div>
            <span class="bg-type-tag">${escapeHtml(bgMode)}</span>
            <div class="offset-preview ${offsetClass}" title="Time Offset">${timeOffset >= 0 ? '+' : ''}${timeOffset}m</div>
            ${hasBattery ? `<i data-lucide="battery-charging" title="Battery: ${escapeHtml(device.status.battery)}"></i>` : ''}
            ${settings.lowPerf ? `<i data-lucide="zap" title="Low Performance Mode Enabled"></i>` : ''}
            ${snowOverride ? `<span class="override-chip chip-snow">Snow: ${escapeHtml(snowOverride)}</span>` : ''}
            ${annMode ? `<span class="override-chip chip-announce">Announce: ${escapeHtml(annMode)}</span>` : ''}
            ${isOverridden ? '<div class="overridden-badge">OVERRIDDEN</div>' : ''}
        </div>

        <div class="device-id">${escapeHtml(id)}</div>
        <div class="device-info">
            <p><span>Total Time:</span> ${escapeHtml(totalTimeStr)}</p>
            <p><span>Last Seen:</span> ${escapeHtml(lastSeen)}</p>
        </div>
    `;

    // Apply preview colors/background via DOM style properties to avoid attribute injection
    const bgDot = card.querySelector('.bg-preview-dot');
    const barDot = card.querySelector('.bar-preview-dot');
    if (barDot) {
        barDot.style.backgroundColor = settings.barColor || '#b1953a';
    }
    if (bgDot) {
        if (bgMode === 'gradient') {
            const g1 = settings.bgGradient1 || '#00401e';
            const g2 = settings.bgGradient2 || '#001a0c';
            const deg = parseInt(settings.bgGradientAngle, 10) || 135;
            bgDot.style.background = `linear-gradient(${deg}deg, ${g1}, ${g2})`;
        } else if (bgMode === 'image' && isSafeImageUrl(settings.bgImage)) {
            bgDot.style.backgroundImage = `url("${encodeURI(settings.bgImage.trim())}")`;
            bgDot.style.backgroundSize = 'cover';
            bgDot.style.backgroundPosition = 'center';
        } else {
            bgDot.style.backgroundColor = settings.bgColor || '#00401e';
        }
    }

    card.onclick = () => openControlModal(id);
    card.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openControlModal(id);
        }
    };
    return card;
}

function renderDevices() {
    deviceList.replaceChildren();
    const dataStore = window.devicesData || devicesData;
    let ids = Object.keys(dataStore);

    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;

    // Filter by Status Tab
    if (activeFilter !== 'all') {
        ids = ids.filter(id => {
            const device = dataStore[id] || {};
            const isOnline = device.status?.isOnline;
            const lastInteraction = device.status?.lastInteraction || 0;
            const isActive = lastInteraction && (now - lastInteraction < weekMs);

            if (activeFilter === 'online') return isOnline && isActive;
            if (activeFilter === 'inactive') return isOnline && !isActive;
            if (activeFilter === 'offline') return !isOnline;
            return true;
        });
    }

    // Filter by Search Query
    if (activeSearchQuery) {
        ids = ids.filter(id => {
            const device = dataStore[id] || {};
            const settings = device.settings || {};
            const status = device.status || {};

            const searchTargets = [
                id,
                settings.name || status.name,
                status.browser,
                status.isOnline ? "online" : "offline",
                status.battery,
                settings.overrideText,
                settings.bgMode,
                settings.bgImage,
                settings.snowOverride,
                settings.announcementMode
            ].map(v => (v || '').toString().toLowerCase());

            return searchTargets.some(target => target.includes(activeSearchQuery));
        });
    }

    deviceCount.textContent = ids.length;

    if (ids.length === 0) {
        deviceList.innerHTML = activeSearchQuery || activeFilter !== 'all'
            ? '<p class="empty-msg">No devices matched your filter/search criteria.</p>'
            : '<p class="empty-msg">No devices found in database.</p>';
        return;
    }

    // Sort: Online/Active, then Online/Inactive, then Offline, then by ID
    ids.sort((a, b) => {
        const devA = dataStore[a];
        const devB = dataStore[b];

        const isOnlineA = devA.status?.isOnline;
        const isOnlineB = devB.status?.isOnline;
        const isActiveA = devA.status?.lastInteraction && (now - devA.status.lastInteraction < weekMs);
        const isActiveB = devB.status?.lastInteraction && (now - devB.status.lastInteraction < weekMs);

        const getRank = (online, active) => {
            if (online && active) return 0;
            if (online) return 1;
            return 2;
        };

        const rankA = getRank(isOnlineA, isActiveA);
        const rankB = getRank(isOnlineB, isActiveB);

        if (rankA !== rankB) return rankA - rankB;
        return a.localeCompare(b);
    });

    const fragment = document.createDocumentFragment();
    ids.forEach(id => {
        fragment.appendChild(createDeviceCard(id, dataStore[id], now, weekMs));
    });

    deviceList.appendChild(fragment);

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function openControlModal(id) {
    currentDeviceId = id;
    updateModalData(id, true);
    controlModal.style.display = 'flex';
    if (window.enhanceAllCustomUi) {
        window.enhanceAllCustomUi(controlModal);
    }
}

function updateModalData(id, updateInputs = false) {
    const dataStore = window.devicesData || devicesData;
    const device = dataStore[id];
    if (!device) return;
    const settings = device.settings || {};
    const status = device.status || {};

    document.getElementById('modal-device-name').textContent = settings.name || status.name || "Unnamed Device";
    document.getElementById('modal-device-id').textContent = id;

    const badgeEl = document.getElementById('modal-status-badge');
    if (badgeEl) {
        const weekMs = 7 * 24 * 60 * 60 * 1000;
        const isOnline = !!status.isOnline;
        const isActive = !!(status.lastInteraction && (Date.now() - status.lastInteraction < weekMs));
        badgeEl.className = 'status-pill ' + (isOnline ? (isActive ? 'online' : 'online-inactive') : 'offline');
        badgeEl.textContent = isOnline ? (isActive ? 'Online' : 'Inactive') : 'Offline';
    }

    if (updateInputs) {
        document.getElementById('input-name').value = settings.name || status.name || "";

        const mode = settings.bgMode || "color";
        const modalBgMode = document.getElementById('modal-bg-mode');
        modalBgMode.value = mode;

        document.getElementById('modal-bg-color-group').style.display = mode === 'color' ? 'block' : 'none';
        document.getElementById('modal-bg-gradient-group').style.display = mode === 'gradient' ? 'block' : 'none';
        document.getElementById('modal-bg-image-group').style.display = mode === 'image' ? 'block' : 'none';

        const elBgColor = document.getElementById('input-bg-color');
        const elGrad1 = document.getElementById('input-bg-grad1');
        const elGrad2 = document.getElementById('input-bg-grad2');
        const elBarColor = document.getElementById('input-bar-color');
        const elTextColor = document.getElementById('input-text-color');
        const elAnimAccent = document.getElementById('input-anim-accent');
        const elBarStyle = document.getElementById('input-bar-style');
        const elClockFmt = document.getElementById('input-clock-format');
        const elSnowOverride = document.getElementById('input-snow-override');
        const elDevAnnMode = document.getElementById('input-device-announcement-mode');
        const elDevAnnText = document.getElementById('input-device-announcement-text');
        const devAnnGroup = document.getElementById('modal-device-announcement-group');

        elBgColor.value = settings.bgColor || "#00401e";
        elGrad1.value = settings.bgGradient1 || "#00401e";
        elGrad2.value = settings.bgGradient2 || "#001a0c";
        document.getElementById('input-bg-grad-deg').value = settings.bgGradientAngle || "135";
        document.getElementById('input-bg-image').value = settings.bgImage || "";

        elBarColor.value = settings.barColor || "#b1953a";
        if (elTextColor) elTextColor.value = settings.textColor || "#ffffff";
        if (elAnimAccent) elAnimAccent.value = settings.animAccentColor || "#ffffff";
        elBarStyle.value = settings.barStyle || "liquid";
        elClockFmt.value = settings.clock24h ? "24" : "12";
        if (elSnowOverride) elSnowOverride.value = settings.snowOverride || "global";
        const devMode = settings.announcementMode || "global";
        if (elDevAnnMode) elDevAnnMode.value = devMode;
        if (elDevAnnText) elDevAnnText.value = settings.announcementText || "";
        if (devAnnGroup) devAnnGroup.style.display = devMode === 'custom' ? 'flex' : 'none';

        [modalBgMode, elBarStyle, elClockFmt, elSnowOverride, elDevAnnMode].forEach(el => {
            if (el && el._updateCustomSelect) el._updateCustomSelect();
        });
        [elBgColor, elGrad1, elGrad2, elBarColor, elTextColor, elAnimAccent].forEach(el => {
            if (el && el._updateCustomColor) el._updateCustomColor();
        });

        document.getElementById('input-offset').value = settings.timeOffset || 0;
        document.getElementById('input-show-weather').checked = settings.showWeather !== false;
        document.getElementById('input-show-total-time').checked = settings.showTotalTime !== false;
        document.getElementById('input-show-credits').checked = settings.showCredits !== false;
        document.getElementById('input-low-perf').checked = settings.lowPerf || false;

        document.getElementById('input-override-text').value = settings.overrideText || "";
        document.getElementById('input-override-active').checked = settings.overrideActive || false;
    }

    // Update Metadata
    document.getElementById('modal-browser').textContent = status.browser || "Unknown";
    document.getElementById('modal-first-seen').textContent = status.firstSeen ? new Date(status.firstSeen).toLocaleString() : "Unknown";

    if (status.currentUptime !== undefined) {
        const up = status.currentUptime;
        const h = Math.floor(up / 3600);
        const m = Math.floor((up % 3600) / 60);
        const s = up % 60;
        document.getElementById('modal-uptime').textContent = `${h}h ${m}m ${s}s`;
    } else {
        document.getElementById('modal-uptime').textContent = "Unknown";
    }

    if (status.totalUptime !== undefined) {
        const up = status.totalUptime;
        const h = Math.floor(up / 3600);
        const m = Math.floor((up % 3600) / 60);
        const s = up % 60;
        document.getElementById('modal-total-uptime').textContent = `${h}h ${m}m ${s}s`;
    } else {
        document.getElementById('modal-total-uptime').textContent = "Unknown";
    }

    document.getElementById('modal-battery').textContent = status.battery || "Unknown";
    document.getElementById('modal-touch').textContent = status.touchPoints !== undefined ? status.touchPoints : "Unknown";
    document.getElementById('modal-visibility').textContent = status.visibility || "Unknown";
    document.getElementById('modal-drift').textContent = status.drift !== undefined ? `${status.drift}ms` : "Unknown";
    document.getElementById('modal-activity-total').textContent = status.totalInteractions !== undefined ? status.totalInteractions : "0";

    if (status.lastInteraction) {
        const last = status.lastInteraction;
        document.getElementById('modal-activity-last').textContent = new Date(last).toLocaleString();
        const diffDays = (Date.now() - last) / (1000 * 60 * 60 * 24);
        document.getElementById('modal-activity-7d').textContent = diffDays <= 7 ? "Yes" : "No";
    } else {
        document.getElementById('modal-activity-last').textContent = "Never";
        document.getElementById('modal-activity-7d').textContent = "No";
    }
}

// Modal Actions
document.querySelector('.close-btn').onclick = () => controlModal.style.display = 'none';
controlModal.addEventListener('click', (e) => {
    if (e.target === controlModal) controlModal.style.display = 'none';
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (controlModal && controlModal.style.display !== 'none') {
            controlModal.style.display = 'none';
        }
    }
});

const saveAllDeviceBtn = document.getElementById('save-all-device-settings-btn');
if (saveAllDeviceBtn) {
    saveAllDeviceBtn.onclick = () => {
        if (!currentDeviceId) return;

        const name = document.getElementById('input-name').value;

        const mode = document.getElementById('modal-bg-mode').value;
        const bg = document.getElementById('input-bg-color').value;
        const grad1 = document.getElementById('input-bg-grad1').value;
        const grad2 = document.getElementById('input-bg-grad2').value;
        const gradDeg = document.getElementById('input-bg-grad-deg').value || "135";
        const bgImage = document.getElementById('input-bg-image').value.trim();

        const bar = document.getElementById('input-bar-color').value;
        const textColor = document.getElementById('input-text-color') ? document.getElementById('input-text-color').value : "#ffffff";
        const animAccent = document.getElementById('input-anim-accent') ? document.getElementById('input-anim-accent').value : "#ffffff";
        const barStyle = document.getElementById('input-bar-style').value;
        const clock24h = document.getElementById('input-clock-format').value === '24';
        const offset = document.getElementById('input-offset').value;
        const snowOverride = document.getElementById('input-snow-override') ? document.getElementById('input-snow-override').value : 'global';
        const announcementMode = document.getElementById('input-device-announcement-mode') ? document.getElementById('input-device-announcement-mode').value : 'global';
        const announcementText = document.getElementById('input-device-announcement-text') ? document.getElementById('input-device-announcement-text').value : '';

        const showWeather = document.getElementById('input-show-weather').checked;
        const showTotalTime = document.getElementById('input-show-total-time').checked;
        const showCredits = document.getElementById('input-show-credits').checked;
        const lowPerf = document.getElementById('input-low-perf').checked;

        const overrideText = document.getElementById('input-override-text').value;
        const overrideActive = document.getElementById('input-override-active').checked;

        firebase.database().ref('devices').child(currentDeviceId).child('settings').update({
            name: name,
            bgMode: mode,
            bgColor: bg,
            bgGradient1: grad1,
            bgGradient2: grad2,
            bgGradientAngle: gradDeg,
            bgImage: bgImage,
            barColor: bar,
            textColor: textColor,
            animAccentColor: animAccent,
            barStyle: barStyle,
            clock24h: clock24h,
            timeOffset: offset,
            snowOverride: snowOverride,
            announcementMode: announcementMode,
            announcementText: announcementText,
            showWeather: showWeather,
            showTotalTime: showTotalTime,
            showCredits: showCredits,
            lowPerf: lowPerf,
            overrideText: overrideText,
            overrideActive: overrideActive
        })
        .then(() => showToast("All device settings saved successfully!"))
        .catch(e => showToast("Error: " + e.message, 'error'));
    };
}

document.getElementById('refresh-device-btn').onclick = () => {
    firebase.database().ref('devices').child(currentDeviceId).child('command').set({
        type: 'REFRESH',
        ts: Date.now()
    })
    .then(() => showToast("Refresh command sent!"))
    .catch(e => showToast("Error: " + e.message, 'error'));
};

document.getElementById('hard-reload-device-btn').onclick = () => {
    firebase.database().ref('devices').child(currentDeviceId).child('command').set({
        type: 'HARD_RELOAD',
        ts: Date.now()
    })
    .then(() => showToast("Hard reload command sent!"))
    .catch(e => showToast("Error: " + e.message, 'error'));
};

document.getElementById('delete-device-btn').onclick = () => {
    if (confirm(`Are you sure you want to delete ${currentDeviceId}? It will disappear from the list until it connects again.`)) {
        firebase.database().ref('devices').child(currentDeviceId).remove()
            .then(() => {
                showToast("Device deleted");
                controlModal.style.display = 'none';
                currentDeviceId = null;
            })
            .catch(e => {
                console.error("Delete failed", e);
                showToast("Failed to delete device: " + e.message, 'error');
            });
    }
};

document.getElementById('logout-btn').onclick = () => {
    firebase.auth().signOut().then(() => {
        window.location.reload();
    });
};
