// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDbnzWXHsqr6rOXEq99FMYyJEgVp5QSUAo",
  authDomain: "mvhs-st.firebaseapp.com",
  databaseURL: "https://mvhs-st-default-rtdb.firebaseio.com",
  projectId: "mvhs-st",
  storageBucket: "mvhs-st.firebasestorage.app",
  messagingSenderId: "156783766681",
  appId: "1:156783766681:web:ee2d859d4372859a909c08"
};

// Admin Config
let currentDeviceId = null;
let devicesData = {};

// UI Elements
const loginContainer = document.getElementById('login-container');
const adminDashboard = document.getElementById('admin-dashboard');
const deviceList = document.getElementById('device-list');
const deviceCount = document.getElementById('device-count');
const controlModal = document.getElementById('control-modal');

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

const errorEl = document.getElementById('login-error');

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

    const db = firebase.database();

    // Global Actions
    document.getElementById('refresh-all-btn').addEventListener('click', () => {
        if (confirm("Refresh ALL connected displays?")) {
            Object.keys(devicesData).forEach(id => {
                db.ref(`devices/${id}/command`).set({ type: 'REFRESH', ts: Date.now() });
            });
        }
    });

    document.getElementById('save-global-theme-btn').addEventListener('click', () => {
        const bg = document.getElementById('input-global-bg').value;
        const bar = document.getElementById('input-global-bar').value;
        if (confirm(`Apply these theme colors to ALL displays?`)) {
            Object.keys(devicesData).forEach(id => {
                db.ref(`devices/${id}/settings`).update({
                    bgColor: bg,
                    barColor: bar
                });
            });
        }
    });

    // Handle Reset Buttons
    document.querySelectorAll('.btn-reset').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = e.target.getAttribute('data-target');
            const defaultValue = e.target.getAttribute('data-default');
            const targetEl = document.getElementById(targetId);
            if (targetEl) {
                targetEl.value = defaultValue;
            }
        });
    });

    // Auto-update modal if open
    db.ref('devices').on('value', (snap) => {
        devicesData = snap.val() || {};
        renderDevices();
        if (controlModal.style.display === 'flex' && currentDeviceId) {
            updateModalData(currentDeviceId);
        }
    });
}

function renderDevices() {
    deviceList.innerHTML = '';
    const ids = Object.keys(devicesData);
    deviceCount.textContent = ids.length;

    if (ids.length === 0) {
        deviceList.innerHTML = '<p class="empty-msg">No devices found in database.</p>';
        return;
    }

    // Sort: Online first, then by name
    ids.sort((a, b) => {
        const aOnline = devicesData[a].status?.isOnline;
        const bOnline = devicesData[b].status?.isOnline;
        if (aOnline !== bOnline) return aOnline ? -1 : 1;
        const aName = devicesData[a].settings?.name || a;
        const bName = devicesData[b].settings?.name || b;
        return aName.localeCompare(bName);
    });

    ids.forEach(id => {
        const device = devicesData[id];
        const isOnline = device.status?.isOnline;
        const name = device.settings?.name || "Unnamed Device";
        const lastSeen = device.status?.lastSeen ? new Date(device.status.lastSeen).toLocaleString() : "Never";
        const ip = device.status?.ip || "?.?.?.?";
        const settings = device.settings || {};
        const isOverridden = settings.overrideActive && settings.overrideText;
        const timeOffset = parseInt(settings.timeOffset) || 0;
        const offsetClass = timeOffset !== 0 ? 'active' : '';

        const card = document.createElement('div');
        card.className = `device-card ${isOnline ? 'online' : 'offline'}`;
        card.innerHTML = `
            <div class="status-badge">${isOnline ? 'Online' : 'Offline'}</div>
            <div class="device-name">${name}</div>

            <div class="device-previews">
                <div class="color-preview" style="background-color: ${settings.bgColor || '#00401e'}"></div>
                <div class="color-preview" style="background-color: ${settings.barColor || '#b1953a'}"></div>
                <div class="offset-preview ${offsetClass}">${timeOffset >= 0 ? '+' : ''}${timeOffset}m</div>
                ${isOverridden ? '<div class="overridden-badge">OVERRIDDEN</div>' : ''}
            </div>

            <div class="device-id">${id}</div>
            <div class="device-info">
                <p><span>IP:</span> ${ip}</p>
                <p><span>Last Seen:</span> ${lastSeen}</p>
            </div>
        `;
        card.onclick = () => openControlModal(id);
        deviceList.appendChild(card);
    });
}

function openControlModal(id) {
    currentDeviceId = id;
    updateModalData(id, true);
    controlModal.style.display = 'flex';
}

function updateModalData(id, updateInputs = false) {
    const device = devicesData[id];
    if (!device) return;
    const settings = device.settings || {};
    const status = device.status || {};

    document.getElementById('modal-device-name').textContent = settings.name || "Unnamed Device";
    document.getElementById('modal-device-id').textContent = id;

    if (updateInputs) {
        document.getElementById('input-name').value = settings.name || "";
        document.getElementById('input-bg-color').value = settings.bgColor || "#00401e";
        document.getElementById('input-bar-color').value = settings.barColor || "#b1953a";
        document.getElementById('input-offset').value = settings.timeOffset || 0;
        document.getElementById('input-override-text').value = settings.overrideText || "";
        document.getElementById('input-override-active').checked = settings.overrideActive || false;
    }

    // Update Metadata
    document.getElementById('modal-ip').textContent = status.ip || "Unknown";
    document.getElementById('modal-browser').textContent = status.browser || "Unknown";
    document.getElementById('modal-first-seen').textContent = status.firstSeen ? new Date(status.firstSeen).toLocaleString() : "Unknown";

    if (status.uptime !== undefined) {
        const up = status.uptime;
        const h = Math.floor(up / 3600);
        const m = Math.floor((up % 3600) / 60);
        const s = up % 60;
        document.getElementById('modal-uptime').textContent = `${h}h ${m}m ${s}s`;
    } else {
        document.getElementById('modal-uptime').textContent = "Unknown";
    }
}

// Modal Actions
document.querySelector('.close-btn').onclick = () => controlModal.style.display = 'none';

document.getElementById('save-name-btn').onclick = () => {
    const name = document.getElementById('input-name').value;
    firebase.database().ref('devices').child(currentDeviceId).child('settings').update({ name: name })
        .then(() => alert("Name updated!"))
        .catch(e => alert("Error: " + e.message));
};

document.getElementById('save-settings-btn').onclick = () => {
    const bg = document.getElementById('input-bg-color').value;
    const bar = document.getElementById('input-bar-color').value;
    const offset = document.getElementById('input-offset').value;
    firebase.database().ref('devices').child(currentDeviceId).child('settings').update({
        bgColor: bg,
        barColor: bar,
        timeOffset: offset
    })
    .then(() => alert("Settings updated!"))
    .catch(e => alert("Error: " + e.message));
};

document.getElementById('save-override-btn').onclick = () => {
    const text = document.getElementById('input-override-text').value;
    const active = document.getElementById('input-override-active').checked;
    firebase.database().ref('devices').child(currentDeviceId).child('settings').update({
        overrideText: text,
        overrideActive: active
    })
    .then(() => alert("Override updated!"))
    .catch(e => alert("Error: " + e.message));
};

document.getElementById('refresh-device-btn').onclick = () => {
    firebase.database().ref('devices').child(currentDeviceId).child('command').set({
        type: 'REFRESH',
        ts: Date.now()
    })
    .then(() => alert("Refresh command sent!"))
    .catch(e => alert("Error: " + e.message));
};

document.getElementById('delete-device-btn').onclick = () => {
    if (confirm(`Are you sure you want to delete ${currentDeviceId}? It will disappear from the list until it connects again.`)) {
        firebase.database().ref('devices').child(currentDeviceId).remove()
            .then(() => {
                controlModal.style.display = 'none';
                currentDeviceId = null;
            })
            .catch(e => {
                console.error("Delete failed", e);
                alert("Failed to delete device: " + e.message);
            });
    }
};

document.getElementById('logout-btn').onclick = () => {
    firebase.auth().signOut().then(() => {
        window.location.reload();
    });
};
