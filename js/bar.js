
const CONFIG = {
    WEATHER_API_KEY: "7a08aa9c10a1a7edae637fa85fc3ecae",
    CITY: "Highlands Ranch, CO",
    LAT: 39.5481,
    LON: -104.9739,
    SCHOOL_END_TIME: "14:50",
    FIREBASE: {
        apiKey: "AIzaSyDbnzWXHsqr6rOXEq99FMYyJEgVp5QSUAo",
        authDomain: "mvhs-st.firebaseapp.com",
        databaseURL: "https://mvhs-st-default-rtdb.firebaseio.com",
        projectId: "mvhs-st",
        storageBucket: "mvhs-st.firebasestorage.app",
        messagingSenderId: "156783766681",
        appId: "1:156783766681:web:ee2d859d4372859a909c08"
    }
};

class RemoteManager {
    constructor(tracker) {
        this.tracker = tracker;
        this.id = this.getOrCreateId();
        this.firstSeen = this.getOrCreateFirstSeen();
        this.sessionStart = Date.now();
        this.totalUptime = parseInt(localStorage.getItem('mvhs_total_uptime') || '0');
        this.lastTotalTick = Date.now();
        this.browserInfo = this.getBrowserInfo();
        this.maxTouchPoints = navigator.maxTouchPoints || 0;
        this.batteryInfo = "UNAVAIL";
        this.serverOffset = 0;
        this.lowPerf = false;
        this.statusInterval = null;
        this.uptimeInterval = null;

        // Activity tracking
        this.totalInteractions = parseInt(localStorage.getItem('mvhs_total_interactions') || '0');
        this.lastInteraction = parseInt(localStorage.getItem('mvhs_last_interaction') || '0');
        this.setupActivityTracking();

        this.db = null;
        this.deviceRef = null;
        this.connected = false;

        // Initialize Firebase
        firebase.initializeApp(CONFIG.FIREBASE);
        this.db = firebase.database();
        this.deviceRef = this.db.ref(`devices/${this.id}`);

        this.setupBatteryTracking();
        this.setupSync();
    }

    setupActivityTracking() {
        const events = ['mousemove', 'mousedown', 'keydown', 'touchstart'];
        const record = () => {
            this.totalInteractions++;
            this.lastInteraction = Date.now();
            localStorage.setItem('mvhs_total_interactions', this.totalInteractions);
            localStorage.setItem('mvhs_last_interaction', this.lastInteraction);
        };
        events.forEach(e => window.addEventListener(e, record, { passive: true }));
    }

    async setupBatteryTracking() {
        if (navigator.getBattery) {
            try {
                const batt = await navigator.getBattery();
                const update = () => {
                    this.batteryInfo = `${Math.round(batt.level * 100)}% (${batt.charging ? 'Charging' : 'Discharging'})`;
                };
                batt.addEventListener('levelchange', update);
                batt.addEventListener('chargingchange', update);
                update();
            } catch (e) {
                this.batteryInfo = "UNAVAIL";
            }
        }
    }

    getOrCreateId() {
        let id = localStorage.getItem('mvhs_device_id');
        if (!id) {
            id = Math.random().toString(36).substring(2, 8).toUpperCase();
            localStorage.setItem('mvhs_device_id', id);
        }
        return id;
    }

    getOrCreateFirstSeen() {
        let fs = localStorage.getItem('mvhs_first_seen');
        if (!fs) {
            fs = Date.now();
            localStorage.setItem('mvhs_first_seen', fs);
        }
        return parseInt(fs);
    }

    getBrowserInfo() {
        const ua = navigator.userAgent;
        let b = "Unknown Browser";
        if (ua.indexOf("Chrome") > -1) b = "Chrome";
        else if (ua.indexOf("Safari") > -1) b = "Safari";
        else if (ua.indexOf("Firefox") > -1) b = "Firefox";
        else if (ua.indexOf("MSIE") > -1 || !!document.documentMode) b = "IE";

        // Simple OS detection
        let os = "Unknown OS";
        if (ua.indexOf("Win") > -1) os = "Windows";
        else if (ua.indexOf("Mac") > -1) os = "MacOS";
        else if (ua.indexOf("Linux") > -1) os = "Linux";
        else if (ua.indexOf("Android") > -1) os = "Android";
        else if (ua.indexOf("like Mac") > -1) os = "iOS";

        return `${b} on ${os}`;
    }

    getContrastColor(hex) {
        if (!hex || hex.length !== 7) return '#ffffff';
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.5 ? '#000000' : '#ffffff';
    }

    setupSync() {
        // Track time drift
        this.db.ref(".info/serverTimeOffset").on("value", (snap) => {
            this.serverOffset = snap.val() || 0;
        });

        // Handle connections/disconnections
        const connectedRef = this.db.ref(".info/connected");
        connectedRef.on("value", (snap) => {
            if (snap.val() === true) {
                this.connected = true;
                // Set online status and onDisconnect hook
                this.deviceRef.child('status/isOnline').set(true);
                this.deviceRef.child('status/isOnline').onDisconnect().set(false);
                this.deviceRef.child('status/lastSeen').onDisconnect().set(firebase.database.ServerValue.TIMESTAMP);
            } else {
                this.connected = false;
            }
        });

        // Listen for settings and commands
        this.deviceRef.on('value', (snap) => {
            const data = snap.val();
            if (!data) return;

            // Apply Theme & Background Modes
            const settings = data.settings || {};
            const bgMode = settings.bgMode || 'color';

            // Reset body background properties to ensure clean switching
            document.body.style.backgroundImage = 'none';
            document.body.style.backgroundSize = '';
            document.body.style.backgroundPosition = '';
            document.body.style.backgroundRepeat = '';

            if (bgMode === 'gradient') {
                const g1 = settings.bgGradient1 || '#00401e';
                const g2 = settings.bgGradient2 || '#001a0c';
                const deg = settings.bgGradientAngle || '135';
                document.body.style.background = `linear-gradient(${deg}deg, ${g1}, ${g2})`;
                document.documentElement.style.setProperty('--text-color', this.getContrastColor(g1));
            } else if (bgMode === 'image' && settings.bgImage) {
                document.body.style.backgroundImage = `url('${settings.bgImage}')`;
                document.body.style.backgroundSize = 'cover';
                document.body.style.backgroundPosition = 'center';
                document.body.style.backgroundRepeat = 'no-repeat';
                document.body.style.backgroundColor = settings.bgColor || '#00401e';
                document.documentElement.style.setProperty('--text-color', '#ffffff');
            } else {
                // Default Solid Color
                const bgColor = settings.bgColor || '#00401e';
                document.body.style.background = bgColor;
                document.documentElement.style.setProperty('--bg-color', bgColor);
                document.documentElement.style.setProperty('--text-color', this.getContrastColor(bgColor));
            }

            // Progress Bar Color
            if (settings.barColor) {
                document.documentElement.style.setProperty('--bar-color', settings.barColor);
            } else {
                document.documentElement.style.setProperty('--bar-color', '#b1953a');
            }

            // Apply Time Offset
            if (data.settings && data.settings.timeOffset !== undefined) {
                this.tracker.timeOffset = parseInt(data.settings.timeOffset) || 0;
            }

            // Apply Override
            if (data.settings && data.settings.overrideText) {
                this.tracker.setOverride(data.settings.overrideText, data.settings.overrideActive);
            } else {
                this.tracker.setOverride(null, false);
            }

            // Apply Low Perf Mode
            const newLowPerf = !!settings.lowPerf;
            if (this.lowPerf !== newLowPerf) {
                this.lowPerf = newLowPerf;
                this.setupIntervals();
                this.tracker.setLowPerf(this.lowPerf);
            }

            // Handle Commands
            if (data.command && data.command.type === 'REFRESH') {
                const lastRefresh = localStorage.getItem('mvhs_last_refresh_ts');
                if (!lastRefresh || parseInt(lastRefresh) < data.command.ts) {
                    localStorage.setItem('mvhs_last_refresh_ts', data.command.ts);
                    window.location.reload();
                }
            }

            if (data.command && data.command.type === 'HARD_RELOAD') {
                const lastHardReload = localStorage.getItem('mvhs_last_hard_reload_ts');
                if (!lastHardReload || parseInt(lastHardReload) < data.command.ts) {
                    localStorage.setItem('mvhs_last_hard_reload_ts', data.command.ts);
                    window.location.href = window.location.pathname + '?v=' + Date.now();
                }
            }

            if (data.command && data.command.type === 'REDIRECT') {
                const lastRedirect = localStorage.getItem('mvhs_last_redirect_ts');
                if (!lastRedirect || parseInt(lastRedirect) < data.command.ts) {
                    localStorage.setItem('mvhs_last_redirect_ts', data.command.ts);
                    window.location.href = data.command.url;
                }
            }
        });

        // Periodic status updates
        this.setupIntervals();
    }

    setupIntervals() {
        if (this.statusInterval) clearInterval(this.statusInterval);
        if (this.uptimeInterval) clearInterval(this.uptimeInterval);

        const statusTime = this.lowPerf ? 10000 : 5000;
        const uptimeTime = this.lowPerf ? 120000 : 30000;

        this.statusInterval = setInterval(() => this.updateStatus(), statusTime);
        this.uptimeInterval = setInterval(() => this.updateTotalUptime(), uptimeTime);
    }

    updateTotalUptime() {
        if (!this.connected) return;
        const now = Date.now();
        const delta = Math.floor((now - this.lastTotalTick) / 1000);
        this.totalUptime += delta;
        this.lastTotalTick = now;

        localStorage.setItem('mvhs_total_uptime', this.totalUptime);
        this.deviceRef.child('status').update({
            totalUptime: this.totalUptime
        });
    }

    updateStatus() {
        if (!this.connected) return;
        const currentUptime = Math.floor((Date.now() - this.sessionStart) / 1000);
        this.deviceRef.child('status').update({
            lastSeen: firebase.database.ServerValue.TIMESTAMP,
            currentPeriod: this.tracker.currentPeriodName || "None",
            id: this.id,
            browser: this.browserInfo,
            firstSeen: this.firstSeen,
            currentUptime: currentUptime,
            battery: this.batteryInfo,
            touchPoints: this.maxTouchPoints,
            visibility: document.visibilityState || "unknown",
            drift: this.serverOffset,
            totalInteractions: this.totalInteractions,
            lastInteraction: this.lastInteraction
        });
    }
}

class ScheduleTracker {
    constructor() {
        document.title = "Schedule Tracker";
        this.schedules = [];
        this.weatherInterval = null;
        this.lastDay = new Date().getDay();
        this.timeOffset = 0; // In minutes
        this.currentPeriodName = "";

        // Remote Management
        this.remote = new RemoteManager(this);
        this.updateCredits();

        // Cache DOM elements
        this.dateDisplay = document.getElementById("date-display");
        this.clockDisplay = document.getElementById("clock-display");
        this.weatherDisplay = document.getElementById("weather-display");
        this.endMessage = document.getElementById('end');
        this.scheduleWrapper = document.querySelector('.schedule-wrapper');
        this.totalTimeRemaining = document.querySelector(".total-time-remaining");
        this.totalTimeLeftContainer = document.querySelector(".total-time-left");

        this.trackerItems = Array.from(document.querySelectorAll('.tracker-item')).map(item => ({
            container: item,
            title: item.querySelector('.period'),
            bar: item.querySelector('.progress_bar'),
            time: item.querySelector('.progress_time')
        }));
    }

    async init() {
        this.setupWeather();
        await this.loadSchedules();
        this.startUpdateLoop();
    }

    updateTotalTimeRemaining(now) {
        // Try to find the end of the day from the first schedule
        let endTimeStr = CONFIG.SCHOOL_END_TIME;
        if (this.schedules[0] && this.schedules[0].length > 0) {
            endTimeStr = this.schedules[0][this.schedules[0].length - 1].end;
        }

        const [endH, endM] = endTimeStr.split(':').map(Number);
        const end = new Date(now);
        end.setHours(endH, endM, 0, 0);

        const diff = end - now;

        if (this.totalTimeRemaining && this.totalTimeLeftContainer) {
            if (diff <= 0) {
                this.totalTimeLeftContainer.style.display = 'none';
            } else {
                this.totalTimeLeftContainer.style.display = 'block';
                const totalMinutes = Math.ceil(diff / 60000);
                const h = Math.floor(totalMinutes / 60);
                const m = totalMinutes % 60;
                this.totalTimeRemaining.textContent = `${h}h ${m}m`;
            }
        }
    }

    async setupWeather() {
        const weatherDisplay = document.getElementById("weather-display");
        const fetchWeather = async () => {
            if (CONFIG.WEATHER_API_KEY === "YOUR_OPENWEATHERMAP_API_KEY") {
                if (weatherDisplay) weatherDisplay.textContent = "72°";
                return;
            }
            try {
                const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${CONFIG.LAT}&lon=${CONFIG.LON}&appid=${CONFIG.WEATHER_API_KEY}&units=imperial`);
                const data = await res.json();
                if (weatherDisplay) weatherDisplay.textContent = `${Math.round(data.main.temp)}°`;
            } catch (e) {
                console.error("Weather fetch failed", e);
            }
        };

        fetchWeather();
        this.weatherInterval = setInterval(fetchWeather, 600000); // 10 mins
    }

    async loadSchedules() {
        const now = new Date();
        this.schedules = this.getDefaultSchedules(now.getDay());
    }

    parseScheduleString(str) {
        // Format: start;name;end,start;name;end...
        return str.split(',').map(p => {
            const parts = p.split(';');
            if (parts.length === 3) {
                return { start: parts[0], name: parts[1], end: parts[2] };
            } else if (parts.length === 2) {
                 return { start: parts[0], name: "Period", end: parts[1] };
            }
            return null;
        }).filter(p => p !== null);
    }

    getDefaultSchedules(day) {
        let s1 = "", s2 = "";

        switch (day) {
            case 1: // Monday
                s1 = "7:00;Good Morning!;7:50,7:50;Period 1;9:25,9:25;Passing Period;9:30,9:30;Period 2;11:05,11:05;A Lunch;11:35,11:35;Passing Period;11:40,11:40;Period 3;13:15,13:15;Passing Period;13:20,13:20;Period 4;14:55";
                s2 = "11:05;Period 3;12:40,12:40;Passing Period;12:45,12:45;B Lunch;13:15";
                break;
            case 2: // Tuesday
                s1 = "7:00;Good Morning!;7:50,7:50;Period 5;9:25,9:25;Homeroom;9:35,9:35;SAS & Eagle Time;10:05,10:05;Eagle Time;11:00,11:00;Passing Period;11:05,11:05;A Lunch;11:35,11:35;Passing Period;11:40,11:40;Period 6;13:15,13:15;Passing Period;13:20,13:20;Period 7;14:55";
                s2 = "11:05;Period 6;12:40,12:40;Passing Period;12:45,12:45;B Lunch;13:15";
                break;
            case 3: // Wednesday
                s1 = "7:00;Good Morning!;7:50,7:50;Period 1;9:25,9:25;Passing Period;9:30,9:30;Period 2;11:05,11:05;A Lunch;11:35,11:35;Passing Period;11:40,11:40;Period 3;13:15,13:15;Passing Period;13:20,13:20;Period 4;14:55";
                s2 = "11:05;Period 3;12:40,12:40;Passing Period;12:45,12:45;B Lunch;13:15";
                break;
            case 4: // Thursday
                s1 = "7:00;Good Morning!;7:50,7:50;Period 5;9:25,9:25;Homeroom;9:35,9:35;SAS & Eagle Time;10:05,10:05;Eagle Time;11:00,11:00;Passing Period;11:05,11:05;A Lunch;11:35,11:35;Passing Period;11:40,11:40;Period 6;13:15,13:15;Passing Period;13:20,13:20;Period 7;14:55";
                s2 = "11:05;Period 6;12:40,12:40;Passing Period;12:45,12:45;B Lunch;13:15";
                break;
            /*
            case 5: // Friday
                s1 = "7:00;Happy Friday!;7:35,7:35;PLC;8:35,8:35;Period 1;9:20,9:20;Passing Period;9:25,9:25;Period 2;10:10,10:10;Passing Period;10:15,10:15;Period 3;11:00,11:00;Passing Period;11:05,11:05;A Lunch;11:35,11:35;Passing Period;11:40,11:40;Period 4;12:25,12:25;Passing Period;12:30,12:30;Period 5;13:15,13:15;Passing Period;13:20,13:20;Period 6;14:05,14:05;Passing Period;14:10,14:10;Period 7;14:55";
                s2 = "11:05;Period 4;11:50,11:50;Passing Period;11:55,11:55;B Lunch;12:25";
                break;
            */
            case 5: // Friday (temp)
                s1 = "7:00;Happy Friday!;7:35,7:35;PLC;8:35,8:35;Period 1;9:55,9:55;Passing Period;10:00,10:00;Period 2;11:20,11:20;Passing Period;11:25,11:25;A Lunch;12:05,12:05;Passing Period;12:10,12:10;Period 3;13:30,13:30;Passing Period;13:35,13:35;Period 4;14:55";
                s2 = "11:25;Period 3;12:45,12:45;Passing Period;12:50,12:50;B Lunch;13:30";
                break;
            default:
                s1 = "0:00;It's the weekend!;23:59";
                s2 = "12:00;well hello there;12:01";
        }
        return [this.parseScheduleString(s1), this.parseScheduleString(s2)];
    }

    parseTime(timeStr, baseDate) {
        if (!timeStr) return null;
        const [h, m] = timeStr.split(':').map(Number);
        const d = new Date(baseDate);
        d.setHours(h, m, 0, 0);
        return d;
    }

    updateCredits() {
        const creditsEl = document.querySelector('.credits');
        if (creditsEl) {
            creditsEl.textContent = `Created by Austin Strong • Version 3.2.0 • ${this.remote.id}`;
        }
    }

    startUpdateLoop() {
        const loop = () => {
            this.updateUI();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    updateUI() {
        let now = new Date();
        if (this.timeOffset !== 0) {
            now = new Date(now.getTime() + (this.timeOffset * 60000));
        }

        // 1. Synchronized Header Updates (Clock & Date)
        if (now.getDay() !== this.lastDay) {
            this.lastDay = now.getDay();
            this.loadSchedules();
        }

        if (this.dateDisplay) {
            this.dateDisplay.textContent = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }

        if (this.clockDisplay) {
            let h = now.getHours();
            const m = String(now.getMinutes()).padStart(2, '0');
            const s = String(now.getSeconds()).padStart(2, '0');
            h = h % 12 || 12;
            this.clockDisplay.textContent = `${String(h).padStart(2, '0')}:${m}:${s}`;
        }

        // 2. Synchronized Total Time Remaining
        this.updateTotalTimeRemaining(now);

        // 3. Synchronized Period Updates
        let anyVisible = false;

        this.schedules.forEach((periods, idx) => {
            const item = this.trackerItems[idx];
            if (!item) return;

            const container = item.container;
            const titleEl = item.title;
            const barEl = item.bar;
            const timeEl = item.time;

            if (periods.length === 0) {
                container.style.display = 'none';
                return;
            }

            const startTime = this.parseTime(periods[0].start, now);
            const endTime = this.parseTime(periods[periods.length - 1].end, now);

            if (idx === 1 && (now < startTime || now >= endTime)) {
                container.style.display = 'none';
                return;
            }

            if (idx === 0 && now >= endTime) {
                container.style.display = 'none';
            } else {
                container.style.display = 'flex';
                anyVisible = true;
            }

            if (container.style.display === 'flex') {
                const currentPeriod = periods.find(p => {
                    const start = this.parseTime(p.start, now);
                    const end = this.parseTime(p.end, now);
                    return now >= start && now < end;
                });

                if (currentPeriod) {
                    titleEl.textContent = currentPeriod.name;
                    if (idx === 0) this.currentPeriodName = currentPeriod.name;
                    const start = this.parseTime(currentPeriod.start, now);
                    const end = this.parseTime(currentPeriod.end, now);
                    const total = end - start;
                    const elapsed = now - start;
                    const percent = Math.min(100, (elapsed / total) * 100);
                    barEl.style.width = `${percent}%`;

                    const remaining = Math.max(0, Math.ceil((end - now) / 1000));
                    timeEl.textContent = this.formatTimeRemaining(remaining);
                } else {
                    const nextPeriod = periods.find(p => this.parseTime(p.start, now) > now);
                    if (nextPeriod) {
                        titleEl.textContent = `Next: ${nextPeriod.name}`;
                        barEl.style.width = '0%';
                        const start = this.parseTime(nextPeriod.start, now);
                        const remaining = Math.max(0, Math.floor((start - now) / 1000));
                        timeEl.textContent = this.formatTimeRemaining(remaining);
                    }
                }
            }
        });

        if (!anyVisible) {
            if (this.endMessage) this.endMessage.style.display = 'block';
            if (this.scheduleWrapper) this.scheduleWrapper.style.display = 'none';
        } else {
            if (this.endMessage) this.endMessage.style.display = 'none';
            if (this.scheduleWrapper) this.scheduleWrapper.style.display = 'flex';
        }
    }

    formatTimeRemaining(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;

        if (h >= 1) {
            return `${h}h ${m}m ${s}s`;
        } else if (m >= 1) {
            return `${m}m ${s}s`;
        } else {
            return `${s}s`;
        }
    }

    setOverride(text, active) {
        const overlay = document.getElementById('override-overlay');
        const overlayText = document.getElementById('override-text');
        if (overlay && overlayText) {
            if (active && text) {
                overlayText.textContent = text;
                overlay.style.display = 'flex';
            } else {
                overlay.style.display = 'none';
            }
        }
    }

    setLowPerf(active) {
        this.trackerItems.forEach(item => {
            if (active) {
                item.bar.classList.add('low-perf');
            } else {
                item.bar.classList.remove('low-perf');
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const tracker = new ScheduleTracker();
    tracker.init();
});
