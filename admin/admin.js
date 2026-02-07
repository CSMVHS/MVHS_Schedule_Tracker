// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDbnzWXHsqr6rOXEq99FMYyJEgVp5QSUAo",
  authDomain: "mvhs-st.firebaseapp.com",
  projectId: "mvhs-st",
  storageBucket: "mvhs-st.firebasestorage.app",
  messagingSenderId: "156783766681",
  appId: "1:156783766681:web:ee2d859d4372859a909c08",
  measurementId: "G-RM0Q3H3XYL"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Admin Config
const ADMIN_PASSWORD = "change_me"; // The shared password

let currentDeviceId = null;
let devicesData = {};

// UI Elements
const loginContainer = document.getElementById('login-container');
const adminDashboard = document.getElementById('admin-dashboard');
const deviceList = document.getElementById('device-list');
const deviceCount = document.getElementById('device-count');
const controlModal = document.getElementById('control-modal');

// Login Logic
document.getElementById('login-btn').addEventListener('click', () => {
    const pwd = document.getElementById('admin-password').value;
    if (pwd === ADMIN_PASSWORD) {
        initDashboard();
    } else {
        document.getElementById('login-error').textContent = "Incorrect password.";
    }
});

function initDashboard() {
    loginContainer.style.display = 'none';
    adminDashboard.style.display = 'block';

    if (CONFIG.FIREBASE.apiKey === "YOUR_API_KEY") {
        alert("Please configure your Firebase credentials in admin.js");
        return;
    }

    firebase.initializeApp(CONFIG.FIREBASE);
    const db = firebase.database();

    // Listen for all devices
    db.ref('devices').on('value', (snap) => {
        devicesData = snap.val() || {};
        renderDevices();
    });

    // Global Actions
    document.getElementById('refresh-all-btn').addEventListener('click', () => {
        if (confirm("Refresh ALL connected displays?")) {
            Object.keys(devicesData).forEach(id => {
                db.ref(`devices/${id}/command`).set({ type: 'REFRESH', ts: Date.now() });
            });
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
        const period = device.status?.currentPeriod || "Unknown";

        const card = document.createElement('div');
        card.className = `device-card ${isOnline ? 'online' : 'offline'}`;
        card.innerHTML = `
            <div class="status-badge">${isOnline ? 'Online' : 'Offline'}</div>
            <div class="device-name">${name}</div>
            <div class="device-id">${id}</div>
            <div class="device-info">
                <p><span>Period:</span> ${period}</p>
                <p><span>Last Seen:</span> ${lastSeen}</p>
            </div>
        `;
        card.onclick = () => openControlModal(id);
        deviceList.appendChild(card);
    });
}

function openControlModal(id) {
    currentDeviceId = id;
    const device = devicesData[id];
    const settings = device.settings || {};

    document.getElementById('modal-device-name').textContent = settings.name || "Unnamed Device";
    document.getElementById('modal-device-id').textContent = id;
    document.getElementById('input-name').value = settings.name || "";
    document.getElementById('input-color').value = settings.themeColor || "#b1953a";
    document.getElementById('input-offset').value = settings.timeOffset || 0;
    document.getElementById('input-override-text').value = settings.overrideText || "";
    document.getElementById('input-override-active').checked = settings.overrideActive || false;

    controlModal.style.display = 'flex';
}

// Modal Actions
document.querySelector('.close-btn').onclick = () => controlModal.style.display = 'none';

document.getElementById('save-name-btn').onclick = () => {
    const name = document.getElementById('input-name').value;
    firebase.database().ref(`devices/${currentDeviceId}/settings/name`).set(name);
};

document.getElementById('save-settings-btn').onclick = () => {
    const color = document.getElementById('input-color').value;
    const offset = document.getElementById('input-offset').value;
    firebase.database().ref(`devices/${currentDeviceId}/settings`).update({
        themeColor: color,
        timeOffset: offset
    });
};

document.getElementById('save-override-btn').onclick = () => {
    const text = document.getElementById('input-override-text').value;
    const active = document.getElementById('input-override-active').checked;
    firebase.database().ref(`devices/${currentDeviceId}/settings`).update({
        overrideText: text,
        overrideActive: active
    });
};

document.getElementById('refresh-device-btn').onclick = () => {
    firebase.database().ref(`devices/${currentDeviceId}/command`).set({ type: 'REFRESH', ts: Date.now() });
};

document.getElementById('delete-device-btn').onclick = () => {
    if (confirm(`Are you sure you want to delete ${currentDeviceId}? It will disappear from the list until it connects again.`)) {
        firebase.database().ref(`devices/${currentDeviceId}`).remove();
        controlModal.style.display = 'none';
    }
};

document.getElementById('logout-btn').onclick = () => window.location.reload();
