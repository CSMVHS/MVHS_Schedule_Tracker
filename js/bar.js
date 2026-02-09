/**
 * MVHS Schedule Tracker
 * Optimized & Refactored for Hallway TV Display
 */

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
        this.browserInfo = this.getBrowserInfo();
        this.ip = "Unknown";
        this.db = null;
        this.deviceRef = null;
        this.connected = false;

        // Initialize Firebase
        firebase.initializeApp(CONFIG.FIREBASE);
        this.db = firebase.database();
        this.deviceRef = this.db.ref(`devices/${this.id}`);

        this.fetchIp();
        this.setupSync();
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

    async fetchIp() {
        try {
            // Use api.ipify.org for IPv4
            const res = await fetch('https://api.ipify.org?format=json');
            const data = await res.json();
            this.ip = data.ip;
            this.updateStatus();
        } catch (e) {
            console.warn("Failed to fetch IP", e);
        }
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

            // Apply Theme
            const settings = data.settings || {};

            // Background Color & Auto Text Color
            if (settings.bgColor) {
                document.documentElement.style.setProperty('--bg-color', settings.bgColor);
                document.documentElement.style.setProperty('--text-color', this.getContrastColor(settings.bgColor));
            } else {
                document.documentElement.style.setProperty('--bg-color', '#00401e');
                document.documentElement.style.setProperty('--text-color', '#ffffff');
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

            // Handle Commands
            if (data.command && data.command.type === 'REFRESH') {
                const lastRefresh = localStorage.getItem('mvhs_last_refresh_ts');
                if (!lastRefresh || parseInt(lastRefresh) < data.command.ts) {
                    localStorage.setItem('mvhs_last_refresh_ts', data.command.ts);
                    window.location.reload();
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

        // Periodic status update (current period)
        setInterval(() => this.updateStatus(), 5000);
    }

    updateStatus() {
        if (!this.connected) return;
        const uptimeSeconds = Math.floor((Date.now() - this.sessionStart) / 1000);
        this.deviceRef.child('status').update({
            lastSeen: firebase.database.ServerValue.TIMESTAMP,
            currentPeriod: this.tracker.currentPeriodName || "None",
            id: this.id,
            ip: this.ip,
            browser: this.browserInfo,
            firstSeen: this.firstSeen,
            uptime: uptimeSeconds
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
                 // Support simple start;end if name is missing?
                 // But original strings are usually full.
                 return { start: parts[0], name: "Period", end: parts[1] };
            }
            return null;
        }).filter(p => p !== null);
    }

    getDefaultSchedules(day) {
        let s1 = "", s2 = "";

        switch (day) {
            case 1: case 3: // Monday / Wednesday
                s1 = "7:00;Good Morning!;7:30,7:30;Teacher Office Hours;7:45,7:45;Period 1;9:19,9:19;Passing Period;9:24,9:24;Period 2;10:58,10:58;A Lunch;11:32,11:32;Passing Period;11:37,11:37;Period 3;13:11,13:11;Passing Period;13:16,13:16;Period 4;14:50";
                s2 = "10:58;Passing Period;11:03,11:03;Period 3;12:37,12:37;B Lunch;13:11";
                break;
            case 2: case 4: // Tuesday / Thursday
                const et = day === 2 ? "S.A.S." : "Eagle Time";
                s1 = `7:00;Good Morning!;7:30,7:30;Teacher PLC;8:05,8:05;Period 5;9:39,9:39;Homeroom;9:49,9:49;${et};10:56,10:56;A Lunch;11:32,11:32;Passing Period;11:37,11:37;Period 6;13:11,13:11;Passing Period;13:16,13:16;Period 7;14:50`;
                s2 = `10:56;Passing Period;11:01,11:01;Period 6;12:35,12:35;B Lunch;13:11`;
                break;
            case 5: // Sunday / Friday / Saturday
                s1 = "7:00;Happy Friday!;7:30,7:30;Teacher Office Hours;7:45,7:45;Period 1;8:36,8:36;Passing Period;8:41,8:41;Period 2;9:32,9:32;Passing Period;9:37,9:37;Period 3;10:28,10:28;Passing Period;10:33,10:33;Period 4;11:24,11:24;A Lunch;12:02,12:02;Passing Period;12:07,12:07;Period 5;12:58,12:58;Passing Period;13:03,13:03;Period 6;13:54,13:54;Passing Period;13:59,13:59;Period 7;14:50";
                s2 = "11:24;Passing Period;11:29,11:29;Period 5;12:20,12:20;B Lunch;12:58";
                break;
            default:
                s1 = "0:00;It's the weekend!;23:59";
                s2 = "";
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
            creditsEl.textContent = `Created by Austin Strong • Version 3.0.0 • ${this.remote.id}`;
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
        // Reload schedules if the day changes
        if (now.getDay() !== this.lastDay) {
            this.lastDay = now.getDay();
            this.loadSchedules();
        }

        // Date: MMM DD
        if (this.dateDisplay) {
            this.dateDisplay.textContent = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }

        // Time: HH:MM:SS (12h)
        if (this.clockDisplay) {
            let h = now.getHours();
            const m = String(now.getMinutes()).padStart(2, '0');
            const s = String(now.getSeconds()).padStart(2, '0');
            h = h % 12 || 12;
            // Ensure no spaces around colons
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

            // Second bar is only visible during its scheduled range
            if (idx === 1 && (now < startTime || now >= endTime)) {
                container.style.display = 'none';
                return;
            }

            // First bar is visible if school hasn't ended
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
                    const rh = Math.floor(remaining / 3600);
                    const rm = Math.floor((remaining % 3600) / 60);
                    const rs = remaining % 60;
                    
                    if (rh > 0) {
                        timeEl.textContent = `${rh}h ${rm}m ${rs}s`;
                    } else if (rm > 0) {
                        timeEl.textContent = `${rm}m ${rs}s`;
                    } else {
                        timeEl.textContent = `${rs}s`;
                    }
                } else {
                    // Pre-school or Passing
                    const nextPeriod = periods.find(p => this.parseTime(p.start, now) > now);
                    if (nextPeriod) {
                        titleEl.textContent = `Next: ${nextPeriod.name}`;
                        barEl.style.width = '0%';
                        const start = this.parseTime(nextPeriod.start, now);
                        const remaining = Math.max(0, Math.floor((start - now) / 1000));
                        const rh = Math.floor(remaining / 3600);
                        const rm = Math.floor((remaining % 3600) / 60);
                        const rs = remaining % 60;
                        
                        if (rh > 0) {
                            timeEl.textContent = `${rh}h ${rm}m ${rs}s`;
                        } else if (rm > 0) {
                            timeEl.textContent = `${rm}m ${rs}s`;
                        } else {
                            timeEl.textContent = `${rs}s`;
                        }
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

    startUpdateLoop() {
        const loop = () => {
            this.updateUI();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const tracker = new ScheduleTracker();
    tracker.init();
});


