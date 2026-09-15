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

    toast.innerHTML = `<i data-lucide="${icon}"></i> <span>${message}</span>`;
    toastContainer.appendChild(toast);
    if (window.lucide) window.lucide.createIcons();

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Auth State Observer
firebase.auth().onAuthStateChanged((user) => {
    if (user && adminDashboard.style.display === 'none') {
        initDashboard();
    }
});

// Login Logic
document.getElementById('login-btn').addEventListener('click', () => {
    const email = document.getElementById('admin-email').value;
    const pwd = document.getElementById('admin-password').value;

    errorEl.textContent = "Logging in...";

    firebase.auth().signInWithEmailAndPassword(email, pwd)
        .catch((error) => {
            console.error("Login failed", error);
            errorEl.textContent = error.message;
        });
});

function initDashboard() {
    loginContainer.style.display = 'none';
    adminDashboard.style.display = 'block';

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

    globalBgMode.addEventListener('change', () => {
        const mode = globalBgMode.value;
        globalBgColorGroup.style.display = mode === 'color' ? 'flex' : 'none';
        globalBgGradientGroup.style.display = mode === 'gradient' ? 'flex' : 'none';
        globalBgImageGroup.style.display = mode === 'image' ? 'flex' : 'none';
    });

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
        const deviceIds = Object.keys(devicesData);
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
        const deviceIds = Object.keys(devicesData);
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
        const deviceIds = Object.keys(devicesData);
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

        if (confirm(`Apply this theme settings to ALL (${deviceIds.length}) displays?`)) {
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
                .then(() => showToast("Theme applied to all devices!"))
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
            }
        });
    });

    // Realtime listener with debounce for smooth rendering
    db.ref('devices').on('value', (snap) => {
        devicesData = snap.val() || {};

        if (renderDebounceTimer) clearTimeout(renderDebounceTimer);
        renderDebounceTimer = setTimeout(() => {
            renderDevices();
        }, 150);

        if (controlModal.style.display === 'flex' && currentDeviceId) {
            updateModalData(currentDeviceId);
        }
    });
}

function renderDevices() {
    deviceList.innerHTML = '';
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
                settings.name,
                status.browser,
                status.isOnline ? "online" : "offline",
                status.battery,
                settings.overrideText,
                settings.bgMode,
                settings.bgImage
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
        const device = dataStore[id];
        const isOnline = device.status?.isOnline;
        const lastInteraction = device.status?.lastInteraction || 0;
        const isActive = lastInteraction && (now - lastInteraction < weekMs);

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

        const name = device.settings?.name || "Unnamed Device";
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
        const timeOffset = parseInt(settings.timeOffset) || 0;
        const offsetClass = timeOffset !== 0 ? 'active' : '';

        // BG Preview Styling
        const bgMode = settings.bgMode || 'color';
        let bgStyle = `background-color: ${settings.bgColor || '#00401e'}`;
        if (bgMode === 'gradient') {
            const g1 = settings.bgGradient1 || '#00401e';
            const g2 = settings.bgGradient2 || '#001a0c';
            const deg = settings.bgGradientAngle || '135';
            bgStyle = `background: linear-gradient(${deg}deg, ${g1}, ${g2})`;
        } else if (bgMode === 'image' && settings.bgImage) {
            bgStyle = `background: url('${settings.bgImage}') center/cover no-repeat`;
        }

        const card = document.createElement('div');
        card.className = `device-card ${statusClass}`;
        card.innerHTML = `
            <div class="status-badge"><i data-lucide="${statusIcon}"></i> ${statusText}</div>
            <div class="device-name">${name}</div>

            <div class="device-previews">
                <div class="color-preview ${bgMode !== 'color' ? 'gradient-preview' : ''}" style="${bgStyle}" title="BG (${bgMode})"></div>
                <div class="color-preview" style="background-color: ${settings.barColor || '#b1953a'}" title="Bar Color"></div>
                <span class="bg-type-tag">${bgMode}</span>
                <div class="offset-preview ${offsetClass}" title="Time Offset">${timeOffset >= 0 ? '+' : ''}${timeOffset}m</div>
                ${hasBattery ? `<i data-lucide="battery-charging" title="Battery: ${device.status.battery}"></i>` : ''}
                ${settings.lowPerf ? `<i data-lucide="zap" title="Low Performance Mode Enabled"></i>` : ''}
                ${isOverridden ? '<div class="overridden-badge">OVERRIDDEN</div>' : ''}
            </div>

            <div class="device-id">${id}</div>
            <div class="device-info">
                <p><span>Total Time:</span> ${totalTimeStr}</p>
                <p><span>Last Seen:</span> ${lastSeen}</p>
            </div>
        `;
        card.onclick = () => openControlModal(id);
        fragment.appendChild(card);
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

    document.getElementById('modal-device-name').textContent = settings.name || "Unnamed Device";
    document.getElementById('modal-device-id').textContent = id;

    if (updateInputs) {
        document.getElementById('input-name').value = settings.name || "";

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

        [modalBgMode, elBarStyle, elClockFmt].forEach(el => { if (el && el._updateCustomSelect) el._updateCustomSelect(); });
        [elBgColor, elGrad1, elGrad2, elBarColor, elTextColor, elAnimAccent].forEach(el => { if (el && el._updateCustomColor) el._updateCustomColor(); });

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