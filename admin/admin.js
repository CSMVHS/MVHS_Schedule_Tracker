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

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 50;

let currentDeviceId = null;
let devicesData = {};
window.devicesData = devicesData;

let activeSearchQuery = "";
let activeFilter = "online";
let visibleLimit = PAGE_SIZE;
let currentFilteredIds = [];
const rowElements = new Map();

let isHydrating = true;
let listenersAttached = false;
let statsCoalesceTimer = null;
let statsRafId = null;

let currentGlobalSnow = "auto";
let currentGlobalAnnouncement = { enabled: false, text: "" };

// Pre-cached inline SVG strings so dynamic rows & toasts never trigger document-wide lucide scans
const INLINE_SVGS = {
    chevronRight: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="lucide icon-xs" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
    checkCircle: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="lucide icon-sm" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>',
    alertCircle: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="lucide icon-sm" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>',
    alertTriangle: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="lucide icon-sm" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>'
};

// UI Elements
const loginContainer = document.getElementById('login-container');
const adminDashboard = document.getElementById('admin-dashboard');
const deviceList = document.getElementById('device-list');
const deviceCount = document.getElementById('device-count');
const deviceListFooter = document.getElementById('device-list-footer');
const loadMoreBtn = document.getElementById('load-more-btn');
const controlModal = document.getElementById('control-modal');
const inspectorEmpty = document.getElementById('inspector-empty');
const inspectorContent = document.getElementById('inspector-content');
const toastContainer = document.getElementById('toast-container');
const errorEl = document.getElementById('login-error');

// Toast Notification Helper (uses cached SVG, zero lucide.createIcons rescans)
function showToast(message, type = 'info') {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    let iconSvg = INLINE_SVGS.checkCircle;
    if (type === 'error') iconSvg = INLINE_SVGS.alertCircle;
    if (type === 'warning') iconSvg = INLINE_SVGS.alertTriangle;

    toast.innerHTML = `${iconSvg}<span>${escapeHtml(message)}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.22s ease';
        setTimeout(() => toast.remove(), 220);
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

function setStatusText(id, text) {
    const el = document.getElementById(id);
    if (el && el.textContent !== text) {
        el.textContent = text;
    }
}

function getDeviceBucket(device, now = Date.now()) {
    const status = device?.status;
    const isOnline = !!status?.isOnline;
    if (!isOnline) return 'offline';
    const lastInteraction = status?.lastInteraction || 0;
    const isActive = !!(lastInteraction && (now - lastInteraction < WEEK_MS));
    return isActive ? 'online' : 'inactive';
}

function getBucketRank(bucket) {
    if (bucket === 'online') return 0;
    if (bucket === 'inactive') return 1;
    return 2;
}

function formatRelativeTime(ts, now = Date.now()) {
    if (!ts) return 'Never';
    const diffSec = Math.max(0, Math.floor((now - ts) / 1000));
    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
}

function doesDeviceMatchQuery(id, device, query) {
    if (!query) return true;
    const settings = device?.settings || {};
    const status = device?.status || {};
    const targets = [
        id,
        settings.name || status.name,
        status.browser,
        status.isOnline ? 'online' : 'offline',
        status.currentPeriod,
        status.battery,
        settings.overrideText,
        settings.bgMode,
        settings.bgImage,
        settings.snowOverride,
        settings.announcementMode
    ];

    for (let i = 0; i < targets.length; i++) {
        const val = targets[i];
        if (val !== undefined && val !== null && String(val).toLowerCase().includes(query)) {
            return true;
        }
    }
    return false;
}

function renderSkeletonRows(count = 7) {
    if (!deviceList) return;
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
        const row = document.createElement('div');
        row.className = 'skeleton-row';
        row.setAttribute('aria-hidden', 'true');
        row.innerHTML = `
            <div class="skeleton-left">
                <div class="skeleton-dot"></div>
                <div class="skeleton-lines">
                    <div class="skeleton-bar w-name"></div>
                    <div class="skeleton-bar w-id"></div>
                </div>
            </div>
            <div class="skeleton-bar w-meta"></div>
        `;
        fragment.appendChild(row);
    }
    deviceList.replaceChildren(fragment);
    if (deviceListFooter) deviceListFooter.style.display = 'none';
}

function updateSummaryStats() {
    const dataStore = window.devicesData || devicesData || {};
    const ids = Object.keys(dataStore);
    const now = Date.now();

    let onlineCount = 0;
    let inactiveCount = 0;
    let offlineCount = 0;

    if (isHydrating && ids.length === 0) {
        setStatusText('stat-total', '--');
        setStatusText('stat-online', '--');
        setStatusText('stat-inactive', '--');
        setStatusText('stat-offline', '--');
        setStatusText('filter-count-online', '--');
        setStatusText('filter-count-all', '--');
        setStatusText('filter-count-inactive', '--');
        setStatusText('filter-count-offline', '--');
    } else {
        for (let i = 0; i < ids.length; i++) {
            const bucket = getDeviceBucket(dataStore[ids[i]], now);
            if (bucket === 'online') onlineCount++;
            else if (bucket === 'inactive') inactiveCount++;
            else offlineCount++;
        }

        setStatusText('stat-total', String(ids.length));
        setStatusText('stat-online', String(onlineCount));
        setStatusText('stat-inactive', String(inactiveCount));
        setStatusText('stat-offline', String(offlineCount));

        setStatusText('filter-count-online', String(onlineCount));
        setStatusText('filter-count-all', String(ids.length));
        setStatusText('filter-count-inactive', String(inactiveCount));
        setStatusText('filter-count-offline', String(offlineCount));
    }

    const snowLabels = { auto: 'Auto', on: 'Force On', off: 'Force Off' };
    setStatusText('stat-snow', snowLabels[currentGlobalSnow] || 'Auto');

    const annActive = !!(currentGlobalAnnouncement && currentGlobalAnnouncement.enabled && currentGlobalAnnouncement.text && currentGlobalAnnouncement.text.trim());
    setStatusText('stat-announcement', annActive ? 'Active' : 'Off');
}

function scheduleStatsUpdate() {
    if (statsCoalesceTimer) return;
    statsCoalesceTimer = setTimeout(() => {
        statsCoalesceTimer = null;
        if (statsRafId) cancelAnimationFrame(statsRafId);
        statsRafId = requestAnimationFrame(() => {
            statsRafId = null;
            updateSummaryStats();
        });
    }, 200);
}

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Render static Lucide icons once on initial load
if (window.lucide) {
    window.lucide.createIcons();
}

// Auth State Observer
firebase.auth().onAuthStateChanged((user) => {
    if (user && adminDashboard && adminDashboard.style.display === 'none') {
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
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) loginBtn.addEventListener('click', performLogin);
}

function setupGlobalControlsToggle() {
    const section = document.getElementById('global-controls-section');
    const toggleBtn = document.getElementById('global-controls-toggle');
    if (!section || !toggleBtn) return;

    toggleBtn.addEventListener('click', () => {
        const isCollapsed = section.classList.toggle('mobile-collapsed');
        toggleBtn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
    });
}

function initDashboard() {
    if (loginContainer) loginContainer.style.display = 'none';
    if (adminDashboard) adminDashboard.style.display = 'flex';

    setupGlobalControlsToggle();

    // Render static dashboard icons once and initialize custom selects/color pickers
    if (window.lucide) {
        window.lucide.createIcons();
    }
    if (window.enhanceAllCustomUi) {
        window.enhanceAllCustomUi(adminDashboard);
    }

    // Show immediate skeleton loading placeholders while Firebase hydrates
    isHydrating = true;
    updateSummaryStats();
    renderSkeletonRows(7);

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

    // Inspector Mode Toggle Logic
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

    // Inspector Device Announcement Mode Toggle
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
            auto: 'Mode: Auto (follows weather)',
            on: 'Mode: Force On (high-perf)',
            off: 'Mode: Force Off (disabled)'
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
                ? 'Active on lower bar'
                : (currentGlobalAnnouncement.enabled ? 'Enabled (empty text)' : 'Currently disabled')
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
            const nextFilter = e.currentTarget.getAttribute('data-filter');
            if (!nextFilter || nextFilter === activeFilter) return;
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            activeFilter = nextFilter;
            visibleLimit = PAGE_SIZE;
            renderDevices();
        });
    });

    // Search Controls
    const searchInput = document.getElementById('search-input');
    const clearSearchBtn = document.getElementById('clear-search-btn');

    const performSearch = () => {
        activeSearchQuery = searchInput.value.trim().toLowerCase();
        clearSearchBtn.style.display = activeSearchQuery ? 'inline-flex' : 'none';
        visibleLimit = PAGE_SIZE;
        renderDevices();
    };

    searchInput.addEventListener('input', performSearch);
    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        activeSearchQuery = '';
        clearSearchBtn.style.display = 'none';
        visibleLimit = PAGE_SIZE;
        renderDevices();
    });

    // Pagination Load More
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            const prevLimit = visibleLimit;
            visibleLimit += PAGE_SIZE;
            appendPaginatedRows(prevLimit, visibleLimit);
        });
    }

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
                    setStatusText('global-theme-status', `Applied to ${deviceIds.length} displays`);
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

    // Hydrate once quickly, then listen incrementally with child_added / child_changed / child_removed
    const devicesRef = db.ref('devices');
    devicesRef.once('value', (snap) => {
        devicesData = snap.val() || {};
        window.devicesData = devicesData;
        isHydrating = false;

        updateSummaryStats();
        renderDevices();

        if (!listenersAttached) {
            listenersAttached = true;

            devicesRef.on('child_added', (childSnap) => {
                const id = childSnap.key;
                if (Object.prototype.hasOwnProperty.call(devicesData, id)) {
                    return;
                }
                handleDeviceAdded(id, childSnap.val());
            });

            devicesRef.on('child_changed', (childSnap) => {
                handleDeviceChanged(childSnap.key, childSnap.val());
            });

            devicesRef.on('child_removed', (childSnap) => {
                handleDeviceRemoved(childSnap.key);
            });
        }
    }, (err) => {
        isHydrating = false;
        console.error("Failed to load devices:", err);
        showToast("Failed to load devices: " + err.message, 'error');
        updateSummaryStats();
        renderDevices();
    });
}

function handleDeviceAdded(id, device) {
    const dataStore = window.devicesData || devicesData;
    dataStore[id] = device || {};
    devicesData = dataStore;
    window.devicesData = dataStore;

    scheduleStatsUpdate();

    const now = Date.now();
    const bucket = getDeviceBucket(device, now);
    const matchesFilter = activeFilter === 'all' || bucket === activeFilter;
    const matchesSearch = doesDeviceMatchQuery(id, device, activeSearchQuery);

    if (matchesFilter && matchesSearch) {
        renderDevices({ preserveScroll: true });
    }
}

function handleDeviceChanged(id, newDevice) {
    const dataStore = window.devicesData || devicesData;
    const prevDevice = dataStore[id];
    if (!prevDevice) {
        handleDeviceAdded(id, newDevice);
        return;
    }

    const now = Date.now();
    const prevBucket = getDeviceBucket(prevDevice, now);
    const newBucket = getDeviceBucket(newDevice, now);
    const prevMatchesSearch = doesDeviceMatchQuery(id, prevDevice, activeSearchQuery);
    const newMatchesSearch = doesDeviceMatchQuery(id, newDevice, activeSearchQuery);

    dataStore[id] = newDevice || {};
    scheduleStatsUpdate();

    const bucketChanged = prevBucket !== newBucket;
    const searchMatchChanged = prevMatchesSearch !== newMatchesSearch;
    const affectsActiveView = (activeFilter === 'all') ||
        (prevBucket === activeFilter) ||
        (newBucket === activeFilter);

    if (!bucketChanged && !searchMatchChanged) {
        // Surgical in-place DOM patch of only this single row
        const existingRow = rowElements.get(id);
        if (existingRow) {
            patchDeviceRow(existingRow, id, newDevice, now);
        }
    } else if (affectsActiveView && (prevMatchesSearch || newMatchesSearch)) {
        renderDevices({ preserveScroll: true });
    }

    // Surgical Inspector Metadata update: never overwrite unsaved form inputs
    if (currentDeviceId === id) {
        updateModalData(id, false);
    }
}

function handleDeviceRemoved(id) {
    const dataStore = window.devicesData || devicesData;
    if (!Object.prototype.hasOwnProperty.call(dataStore, id)) return;

    delete dataStore[id];
    scheduleStatsUpdate();

    const existingRow = rowElements.get(id);
    if (existingRow) {
        existingRow.remove();
        rowElements.delete(id);
    }

    const idx = currentFilteredIds.indexOf(id);
    if (idx !== -1) {
        currentFilteredIds.splice(idx, 1);
        if (deviceCount) deviceCount.textContent = String(currentFilteredIds.length);
        updatePaginationFooter();
        if (currentFilteredIds.length === 0) {
            renderDevices();
        }
    }

    if (currentDeviceId === id) {
        closeInspector();
    }
}

function getRowSnapshot(id, device, now) {
    const bucket = getDeviceBucket(device, now);
    const status = device?.status || {};
    const settings = device?.settings || {};
    const name = settings.name || status.name || "Unnamed Device";

    const bgMode = settings.bgMode || 'color';
    const bgColor = (settings.bgColor || '#00401e').toLowerCase();
    const barColor = (settings.barColor || '#b1953a').toLowerCase();
    const textColor = (settings.textColor || '#ffffff').toLowerCase();
    const hasCustomTheme = bgMode !== 'color' || bgColor !== '#00401e' || barColor !== '#b1953a' || textColor !== '#ffffff';
    const swatchColor = bgColor !== '#00401e' ? (settings.bgColor || '#00401e') : (settings.barColor || '#b1953a');

    const hasOverrideMsg = !!(settings.overrideActive && settings.overrideText);
    const hasSnowOverride = !!(settings.snowOverride && settings.snowOverride !== 'global');
    const hasAnnOverride = !!(settings.announcementMode && settings.announcementMode !== 'global');
    const overrideLabel = hasOverrideMsg
        ? 'Override'
        : (hasSnowOverride ? `Snow:${settings.snowOverride}` : (hasAnnOverride ? `Ann:${settings.announcementMode}` : ''));

    const timeOffset = parseInt(settings.timeOffset, 10) || 0;
    const offsetLabel = timeOffset !== 0 ? `${timeOffset > 0 ? '+' : ''}${timeOffset}m` : '';

    const period = status.currentPeriod;
    const isOnline = bucket !== 'offline';
    const submeta = (isOnline && period && period !== 'None')
        ? period
        : formatRelativeTime(status.lastSeen || 0, now);

    return {
        bucket,
        name,
        hasCustomTheme,
        swatchColor,
        overrideLabel,
        offsetLabel,
        submeta
    };
}

function createDeviceRow(id, device, now) {
    const snap = getRowSnapshot(id, device, now);

    const row = document.createElement('div');
    row.className = 'device-row' + (currentDeviceId === id ? ' selected' : '');
    row.dataset.deviceId = id;
    row.tabIndex = 0;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', currentDeviceId === id ? 'true' : 'false');
    row.setAttribute('aria-label', `Configure ${snap.name} (${id})`);

    const left = document.createElement('div');
    left.className = 'row-left';

    const dot = document.createElement('span');
    dot.className = `status-dot ${snap.bucket}`;
    dot.setAttribute('aria-hidden', 'true');

    const main = document.createElement('div');
    main.className = 'row-main';

    const titleLine = document.createElement('div');
    titleLine.className = 'row-title-line';

    const nameEl = document.createElement('span');
    nameEl.className = 'row-name';
    nameEl.textContent = snap.name;

    const swatchEl = document.createElement('span');
    swatchEl.className = 'row-swatch';
    swatchEl.title = 'Custom theme active';
    if (snap.hasCustomTheme) {
        swatchEl.style.backgroundColor = snap.swatchColor;
    } else {
        swatchEl.style.display = 'none';
    }

    const overrideEl = document.createElement('span');
    overrideEl.className = 'row-override-tag';
    if (snap.overrideLabel) {
        overrideEl.textContent = snap.overrideLabel;
    } else {
        overrideEl.style.display = 'none';
    }

    titleLine.append(nameEl, swatchEl, overrideEl);

    const metaLine = document.createElement('div');
    metaLine.className = 'row-meta-line';

    const idEl = document.createElement('span');
    idEl.className = 'row-id';
    idEl.textContent = id;

    metaLine.appendChild(idEl);
    main.append(titleLine, metaLine);
    left.append(dot, main);

    const right = document.createElement('div');
    right.className = 'row-right';

    const offsetEl = document.createElement('span');
    offsetEl.className = 'row-offset';
    if (snap.offsetLabel) {
        offsetEl.textContent = snap.offsetLabel;
    } else {
        offsetEl.style.display = 'none';
    }

    const submetaEl = document.createElement('span');
    submetaEl.className = 'row-submeta';
    submetaEl.textContent = snap.submeta;

    const chevronEl = document.createElement('span');
    chevronEl.className = 'row-chevron';
    chevronEl.innerHTML = INLINE_SVGS.chevronRight;

    right.append(offsetEl, submetaEl, chevronEl);
    row.append(left, right);

    row._refs = { dot, nameEl, swatchEl, overrideEl, offsetEl, submetaEl };
    row._state = snap;

    row.addEventListener('click', () => openControlModal(id));
    row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openControlModal(id);
        }
    });

    return row;
}

function patchDeviceRow(row, id, device, now = Date.now()) {
    const refs = row._refs;
    const prev = row._state;
    if (!refs || !prev) return;

    const next = getRowSnapshot(id, device, now);

    if (next.bucket !== prev.bucket) {
        refs.dot.className = `status-dot ${next.bucket}`;
    }
    if (next.name !== prev.name) {
        refs.nameEl.textContent = next.name;
        row.setAttribute('aria-label', `Configure ${next.name} (${id})`);
    }
    if (next.hasCustomTheme !== prev.hasCustomTheme || next.swatchColor !== prev.swatchColor) {
        if (next.hasCustomTheme) {
            refs.swatchEl.style.display = '';
            refs.swatchEl.style.backgroundColor = next.swatchColor;
        } else {
            refs.swatchEl.style.display = 'none';
        }
    }
    if (next.overrideLabel !== prev.overrideLabel) {
        if (next.overrideLabel) {
            refs.overrideEl.style.display = '';
            refs.overrideEl.textContent = next.overrideLabel;
        } else {
            refs.overrideEl.style.display = 'none';
        }
    }
    if (next.offsetLabel !== prev.offsetLabel) {
        if (next.offsetLabel) {
            refs.offsetEl.style.display = '';
            refs.offsetEl.textContent = next.offsetLabel;
        } else {
            refs.offsetEl.style.display = 'none';
        }
    }
    if (next.submeta !== prev.submeta) {
        refs.submetaEl.textContent = next.submeta;
    }

    row._state = next;
}

function updatePaginationFooter() {
    if (!deviceListFooter || !loadMoreBtn) return;
    const renderedCount = Math.min(visibleLimit, currentFilteredIds.length);
    const remaining = currentFilteredIds.length - renderedCount;
    if (remaining > 0) {
        const nextBatch = Math.min(PAGE_SIZE, remaining);
        loadMoreBtn.textContent = `Load ${nextBatch} more (${remaining} remaining)`;
        deviceListFooter.style.display = 'block';
    } else {
        deviceListFooter.style.display = 'none';
    }
}

function appendPaginatedRows(startIndex, endIndex) {
    if (!deviceList) return;
    const dataStore = window.devicesData || devicesData;
    const now = Date.now();
    const slice = currentFilteredIds.slice(startIndex, endIndex);
    if (slice.length === 0) return;

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < slice.length; i++) {
        const id = slice[i];
        const row = createDeviceRow(id, dataStore[id], now);
        rowElements.set(id, row);
        fragment.appendChild(row);
    }
    deviceList.appendChild(fragment);
    updatePaginationFooter();
}

function renderDevices({ preserveScroll = false } = {}) {
    if (isHydrating || !deviceList) return;

    const prevScrollTop = preserveScroll ? deviceList.scrollTop : 0;
    const dataStore = window.devicesData || devicesData || {};
    const allIds = Object.keys(dataStore);
    const now = Date.now();

    const filtered = [];
    for (let i = 0; i < allIds.length; i++) {
        const id = allIds[i];
        const device = dataStore[id] || {};
        if (activeFilter !== 'all') {
            const bucket = getDeviceBucket(device, now);
            if (bucket !== activeFilter) continue;
        }
        if (activeSearchQuery && !doesDeviceMatchQuery(id, device, activeSearchQuery)) {
            continue;
        }
        filtered.push(id);
    }

    // Sort: Online, then Inactive, then Offline, then by ID
    filtered.sort((a, b) => {
        const rankA = getBucketRank(getDeviceBucket(dataStore[a], now));
        const rankB = getBucketRank(getDeviceBucket(dataStore[b], now));
        if (rankA !== rankB) return rankA - rankB;
        return a.localeCompare(b);
    });

    currentFilteredIds = filtered;
    if (deviceCount) deviceCount.textContent = String(filtered.length);

    rowElements.clear();

    if (filtered.length === 0) {
        const msg = activeSearchQuery || activeFilter !== 'all'
            ? 'No displays match the current filter or search.'
            : 'No displays found in database.';
        deviceList.innerHTML = `<p class="empty-msg">${msg}</p>`;
        updatePaginationFooter();
        return;
    }

    const sliceEnd = Math.min(visibleLimit, filtered.length);
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < sliceEnd; i++) {
        const id = filtered[i];
        const row = createDeviceRow(id, dataStore[id], now);
        rowElements.set(id, row);
        fragment.appendChild(row);
    }

    deviceList.replaceChildren(fragment);
    updatePaginationFooter();

    if (preserveScroll) {
        deviceList.scrollTop = prevScrollTop;
    } else {
        deviceList.scrollTop = 0;
    }
}

function openControlModal(id) {
    if (!id) return;
    const prevId = currentDeviceId;
    currentDeviceId = id;

    if (prevId && prevId !== id && rowElements.has(prevId)) {
        const prevRow = rowElements.get(prevId);
        prevRow.classList.remove('selected');
        prevRow.setAttribute('aria-selected', 'false');
    }
    if (rowElements.has(id)) {
        const nextRow = rowElements.get(id);
        nextRow.classList.add('selected');
        nextRow.setAttribute('aria-selected', 'true');
    }

    updateModalData(id, true);

    if (inspectorEmpty) inspectorEmpty.style.display = 'none';
    if (inspectorContent) inspectorContent.style.display = 'flex';
    if (controlModal) controlModal.classList.add('mobile-open');

    if (window.enhanceAllCustomUi && controlModal) {
        window.enhanceAllCustomUi(controlModal);
    }
}

function closeInspector() {
    if (currentDeviceId && rowElements.has(currentDeviceId)) {
        const row = rowElements.get(currentDeviceId);
        row.classList.remove('selected');
        row.setAttribute('aria-selected', 'false');
    }
    currentDeviceId = null;

    if (controlModal) controlModal.classList.remove('mobile-open');
    if (inspectorContent) inspectorContent.style.display = 'none';
    if (inspectorEmpty) inspectorEmpty.style.display = 'flex';
}

function updateModalData(id, updateInputs = false) {
    const dataStore = window.devicesData || devicesData;
    const device = dataStore[id];
    if (!device) return;
    const settings = device.settings || {};
    const status = device.status || {};

    setStatusText('modal-device-name', settings.name || status.name || "Unnamed Device");
    setStatusText('modal-device-id', id);

    const badgeEl = document.getElementById('modal-status-badge');
    if (badgeEl) {
        const bucket = getDeviceBucket(device, Date.now());
        const badgeClass = bucket === 'online' ? 'online' : (bucket === 'inactive' ? 'online-inactive' : 'offline');
        const badgeText = bucket === 'online' ? 'Online' : (bucket === 'inactive' ? 'Inactive' : 'Offline');
        badgeEl.className = 'status-pill ' + badgeClass;
        badgeEl.textContent = badgeText;
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

    // Update Read-Only Metadata & Health
    setStatusText('modal-browser', status.browser || "Unknown");
    setStatusText('modal-first-seen', status.firstSeen ? new Date(status.firstSeen).toLocaleString() : "Unknown");

    if (status.currentUptime !== undefined) {
        const up = status.currentUptime;
        const h = Math.floor(up / 3600);
        const m = Math.floor((up % 3600) / 60);
        const s = up % 60;
        setStatusText('modal-uptime', `${h}h ${m}m ${s}s`);
    } else {
        setStatusText('modal-uptime', "Unknown");
    }

    if (status.totalUptime !== undefined) {
        const up = status.totalUptime;
        const h = Math.floor(up / 3600);
        const m = Math.floor((up % 3600) / 60);
        const s = up % 60;
        setStatusText('modal-total-uptime', `${h}h ${m}m ${s}s`);
    } else {
        setStatusText('modal-total-uptime', "Unknown");
    }

    setStatusText('modal-battery', status.battery || "Unknown");
    setStatusText('modal-touch', status.touchPoints !== undefined ? String(status.touchPoints) : "Unknown");
    setStatusText('modal-visibility', status.visibility || "Unknown");
    setStatusText('modal-drift', status.drift !== undefined ? `${status.drift}ms` : "Unknown");
    setStatusText('modal-activity-total', status.totalInteractions !== undefined ? String(status.totalInteractions) : "0");

    if (status.lastInteraction) {
        const last = status.lastInteraction;
        setStatusText('modal-activity-last', new Date(last).toLocaleString());
        const diffDays = (Date.now() - last) / (1000 * 60 * 60 * 24);
        setStatusText('modal-activity-7d', diffDays <= 7 ? "Yes" : "No");
    } else {
        setStatusText('modal-activity-last', "Never");
        setStatusText('modal-activity-7d', "No");
    }
}

// Inspector Close / Back Actions
const closeInspectorBtn = document.querySelector('.close-btn');
if (closeInspectorBtn) {
    closeInspectorBtn.addEventListener('click', closeInspector);
}

const inspectorBackBtn = document.getElementById('inspector-back-btn');
if (inspectorBackBtn) {
    inspectorBackBtn.addEventListener('click', closeInspector);
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && currentDeviceId) {
        if (document.querySelector('.custom-dropdown-container.open, .custom-picker-popover')) {
            return;
        }
        closeInspector();
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
    if (!currentDeviceId) return;
    firebase.database().ref('devices').child(currentDeviceId).child('command').set({
        type: 'REFRESH',
        ts: Date.now()
    })
    .then(() => showToast("Refresh command sent!"))
    .catch(e => showToast("Error: " + e.message, 'error'));
};

document.getElementById('hard-reload-device-btn').onclick = () => {
    if (!currentDeviceId) return;
    firebase.database().ref('devices').child(currentDeviceId).child('command').set({
        type: 'HARD_RELOAD',
        ts: Date.now()
    })
    .then(() => showToast("Hard reload command sent!"))
    .catch(e => showToast("Error: " + e.message, 'error'));
};

document.getElementById('delete-device-btn').onclick = () => {
    if (!currentDeviceId) return;
    const targetId = currentDeviceId;
    if (confirm(`Are you sure you want to delete ${targetId}? It will disappear from the list until it connects again.`)) {
        firebase.database().ref('devices').child(targetId).remove()
            .then(() => {
                showToast("Device deleted");
                closeInspector();
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
