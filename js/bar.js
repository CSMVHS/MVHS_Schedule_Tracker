const CONFIG = {
    WEATHER_API_KEY: "7a08aa9c10a1a7edae637fa85fc3ecae",
    CITY: "Highlands Ranch, CO",
    LAT: 39.5481,
    LON: -104.9739,
    SCHOOL_END_TIME: "14:50",
    APP_VERSION: "4.0",
    AUTHOR_NAME: "Austin Strong",
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
            if (this.tracker) this.tracker.onUserInteraction();
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
            this.tracker.serverOffset = this.serverOffset;
        });

        // Track global "Hold to Show Device IDs" state
        this.db.ref("global/showDeviceIDs").on("value", (snap) => {
            this.tracker.setShowDeviceIDFlash(!!snap.val());
        });

        // Handle connections/disconnections
        const connectedRef = this.db.ref(".info/connected");
        connectedRef.on("value", (snap) => {
            if (snap.val() === true) {
                this.connected = true;
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

            const settings = data.settings || {};
            const bgMode = settings.bgMode || 'color';

            // Reset body background properties
            document.body.style.backgroundImage = 'none';
            document.body.style.backgroundSize = '';
            document.body.style.backgroundPosition = '';
            document.body.style.backgroundRepeat = '';

            if (bgMode === 'gradient') {
                const g1 = settings.bgGradient1 || '#00401e';
                const g2 = settings.bgGradient2 || '#001a0c';
                const deg = settings.bgGradientAngle || '135';
                document.body.style.background = `linear-gradient(${deg}deg, ${g1}, ${g2})`;
            } else if (bgMode === 'image' && settings.bgImage) {
                document.body.style.backgroundImage = `url('${settings.bgImage}')`;
                document.body.style.backgroundSize = 'cover';
                document.body.style.backgroundPosition = 'center';
                document.body.style.backgroundRepeat = 'no-repeat';
                document.body.style.backgroundColor = settings.bgColor || '#00401e';
            } else {
                const bgColor = settings.bgColor || '#00401e';
                document.body.style.background = bgColor;
                document.documentElement.style.setProperty('--bg-color', bgColor);
            }

            // Text Color & Smart Background Pill Adaptation
            const textColor = settings.textColor || '#ffffff';
            document.documentElement.style.setProperty('--text-color', textColor);

            // Compute luminance of text color to adapt background pill contrast
            if (textColor.length === 7 && textColor.startsWith('#')) {
                const r = parseInt(textColor.slice(1, 3), 16);
                const g = parseInt(textColor.slice(3, 5), 16);
                const b = parseInt(textColor.slice(5, 7), 16);
                const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                if (lum < 0.3) {
                    // Dark text -> Light pill overlay
                    document.documentElement.style.setProperty('--pill-bg', 'rgba(255, 255, 255, 0.75)');
                    document.documentElement.style.setProperty('--pill-border', 'rgba(0, 0, 0, 0.2)');
                    document.documentElement.style.setProperty('--text-shadow', '0 1px 3px rgba(255, 255, 255, 0.4)');
                } else {
                    // Light text -> Dark pill overlay
                    document.documentElement.style.setProperty('--pill-bg', 'rgba(0, 0, 0, 0.55)');
                    document.documentElement.style.setProperty('--pill-border', 'rgba(255, 255, 255, 0.2)');
                    document.documentElement.style.setProperty('--text-shadow', '0 2px 8px rgba(0, 0, 0, 0.6)');
                }
            }

            // Progress Bar Color & Accent Animation Color
            document.documentElement.style.setProperty('--bar-color', settings.barColor || '#b1953a');
            document.documentElement.style.setProperty('--anim-accent-color', settings.animAccentColor || '#ffffff');

            // Apply Time Offset
            if (settings.timeOffset !== undefined) {
                this.tracker.timeOffset = parseInt(settings.timeOffset) || 0;
            }

            // Apply Override
            if (settings.overrideText) {
                this.tracker.setOverride(settings.overrideText, settings.overrideActive);
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

            // Customization Options
            this.tracker.setUse24HourClock(!!settings.clock24h);
            this.tracker.setWeatherVisible(settings.showWeather !== false);
            this.tracker.setTotalTimeVisible(settings.showTotalTime !== false);
            this.tracker.setCreditsVisible(settings.showCredits !== false);
            this.tracker.setBarStyle(settings.barStyle || 'liquid');

            // Handle Remote Commands
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
        });

        this.setupIntervals();
    }

    setDeviceName(name) {
        if (!name || !this.deviceRef) return;
        this.deviceRef.child('settings').update({
            name: `${name.trim()} [write-in]`
        });
    }

    setupIntervals() {
        if (this.statusInterval) clearInterval(this.statusInterval);
        if (this.uptimeInterval) clearInterval(this.uptimeInterval);

        const statusTime = this.lowPerf ? 15000 : 5000;
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
        this.lastWeatherFetchTs = 0;
        this.lastDay = -1;
        this.timeOffset = 0;
        this.serverOffset = 0;
        this.currentPeriodName = "";
        this.clock24h = false;
        this.barStyle = "liquid";
        this.lowPerf = false;
        this.showDeviceIDFlash = false;
        this.hasUserInteracted = false;

        // Remote Management
        this.remote = new RemoteManager(this);

        // Cache DOM elements
        this.dateContainer = document.getElementById("date-container");
        this.dateDisplay = document.getElementById("date-display");
        this.clockDisplay = document.getElementById("clock-display");
        this.weatherContainer = document.getElementById("weather-container");
        this.weatherDisplay = document.getElementById("weather-display");
        this.endMessage = document.getElementById('end');
        this.scheduleWrapper = document.querySelector('.schedule-wrapper');
        this.totalTimeRemaining = document.querySelector(".total-time-remaining");
        this.totalTimeContainer = document.getElementById("total-time-container");
        this.deviceIdDisplay = document.getElementById("device-id-display");

        // Customize Modal Elements
        this.customizeModal = document.getElementById("local-customize-modal");
        this.openCustomizeBtn = document.getElementById("open-customize-btn");
        this.closeCustomizeBtn = document.getElementById("close-customize-btn");
        this.saveCustomizeBtn = document.getElementById("save-customize-btn");

        // First Time User Prompt Elements
        this.identifyModal = document.getElementById("user-identify-modal");
        this.identifyInput = document.getElementById("identify-input");
        this.identifySubmitBtn = document.getElementById("identify-submit-btn");
        this.identifySkipBtn = document.getElementById("identify-skip-btn");

        this.trackerItems = Array.from(document.querySelectorAll('.tracker-item')).map(item => ({
            container: item,
            title: item.querySelector('.period'),
            bar: item.querySelector('.progress_bar'),
            time: item.querySelector('.progress_time')
        }));

        this.lastState = {
            dateStr: "",
            clockStr: "",
            totalTimeStr: "",
            totalTimeVisible: true,
            endVisible: false,
            items: [{}, {}]
        };

        this.updateDeviceIdDisplay();
        this.setupVisibilityHandler();
        this.setupFirstTimeIdentifyPrompt();
        this.setupCustomizeModal();
    }

    async init() {
        this.setupWeather();
        this.loadSchedules();
        this.loadLocalCustomizations();
        this.startUpdateLoop();
    }

    setupCustomizeModal() {
        if (!this.openCustomizeBtn || !this.customizeModal) return;

        this.openCustomizeBtn.addEventListener('click', () => {
            this.customizeModal.style.display = 'flex';
            if (window.enhanceAllCustomUi) {
                window.enhanceAllCustomUi(this.customizeModal);
            }
        });

        if (this.closeCustomizeBtn) {
            this.closeCustomizeBtn.addEventListener('click', () => {
                this.customizeModal.style.display = 'none';
            });
        }

        if (this.saveCustomizeBtn) {
            this.saveCustomizeBtn.addEventListener('click', () => {
                const bg = document.getElementById('cust-bg-color').value;
                const bar = document.getElementById('cust-bar-color').value;
                const format = document.getElementById('cust-clock-format').value;
                const weather = document.getElementById('cust-show-weather').checked;

                const localSettings = { bg, bar, format, weather };
                localStorage.setItem('mvhs_local_customizations', JSON.stringify(localSettings));

                this.applyLocalSettings(localSettings);
                this.customizeModal.style.display = 'none';
            });
        }
    }

    loadLocalCustomizations() {
        const saved = localStorage.getItem('mvhs_local_customizations');
        if (saved) {
            try {
                const settings = JSON.parse(saved);
                this.applyLocalSettings(settings);
            } catch (e) {
                console.error("Failed to parse local customizations", e);
            }
        }
    }

    applyLocalSettings(settings) {
        if (settings.bg) {
            document.body.style.background = settings.bg;
            document.documentElement.style.setProperty('--bg-color', settings.bg);
            document.documentElement.style.setProperty('--text-color', this.remote.getContrastColor(settings.bg));
            const bgInput = document.getElementById('cust-bg-color');
            if (bgInput) {
                bgInput.value = settings.bg;
                if (bgInput._updateCustomColor) bgInput._updateCustomColor();
            }
        }
        if (settings.bar) {
            document.documentElement.style.setProperty('--bar-color', settings.bar);
            const barInput = document.getElementById('cust-bar-color');
            if (barInput) {
                barInput.value = settings.bar;
                if (barInput._updateCustomColor) barInput._updateCustomColor();
            }
        }
        if (settings.style) {
            this.setBarStyle(settings.style);
        }
        if (settings.format) {
            this.setUse24HourClock(settings.format === '24');
        }
        if (settings.weather !== undefined) {
            this.setWeatherVisible(settings.weather);
        }
        if (settings.totalTime !== undefined) {
            this.setTotalTimeVisible(settings.totalTime);
        }
    }

    setupFirstTimeIdentifyPrompt() {
        const hasPrompted = localStorage.getItem("mvhs_identify_prompted");
        if (hasPrompted) return;

        if (this.identifyModal) {
            this.identifyModal.style.display = "block";
        }

        let maxSeconds = 10;
        let timer = null;

        const dismiss = (inputVal = null) => {
            if (timer) clearInterval(timer);
            localStorage.setItem("mvhs_identify_prompted", "true");
            if (this.identifyModal) {
                this.identifyModal.style.display = "none";
            }
            if (inputVal && inputVal.trim()) {
                this.remote.setDeviceName(inputVal);
            }
        };

        const startTimer = () => {
            if (timer) clearInterval(timer);
            timer = setInterval(() => {
                maxSeconds--;
                if (maxSeconds <= 0) {
                    dismiss();
                }
            }, 1000);
        };

        this.onUserInteraction = () => {
            if (!this.hasUserInteracted) {
                this.hasUserInteracted = true;
                if (!localStorage.getItem("mvhs_identify_prompted")) {
                    maxSeconds = 60; // Extend to 60s if user interacts
                    startTimer();
                }
            }
        };

        if (this.identifySubmitBtn) {
            this.identifySubmitBtn.addEventListener("click", () => {
                const val = this.identifyInput ? this.identifyInput.value : "";
                dismiss(val);
            });
        }

        if (this.identifySkipBtn) {
            this.identifySkipBtn.addEventListener("click", () => dismiss());
        }

        if (this.identifyInput) {
            this.identifyInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    dismiss(this.identifyInput.value);
                }
            });
        }

        startTimer();
    }

    setShowDeviceIDFlash(show) {
        this.showDeviceIDFlash = show;
        this.updateUI(true);
    }

    updateDeviceIdDisplay() {
        if (this.deviceIdDisplay) {
            this.deviceIdDisplay.textContent = this.remote.id;
        }
    }

    setupVisibilityHandler() {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.updateUI(true);
            }
        });
    }

    getExactNow() {
        return new Date(Date.now() + this.serverOffset + (this.timeOffset * 60000));
    }

    updateTotalTimeRemaining(now) {
        let endTimeStr = CONFIG.SCHOOL_END_TIME;
        if (this.schedules[0] && this.schedules[0].length > 0) {
            endTimeStr = this.schedules[0][this.schedules[0].length - 1].end;
        }

        const [endH, endM] = endTimeStr.split(':').map(Number);
        const end = new Date(now);
        end.setHours(endH, endM, 0, 0);

        const diff = end - now;

        if (this.totalTimeRemaining && this.totalTimeContainer) {
            if (diff <= 0) {
                if (this.lastState.totalTimeVisible !== false) {
                    this.totalTimeContainer.style.display = 'none';
                    this.lastState.totalTimeVisible = false;
                }
            } else {
                if (this.lastState.totalTimeVisible !== true) {
                    this.totalTimeContainer.style.display = 'flex';
                    this.lastState.totalTimeVisible = true;
                }
                const totalMinutes = Math.ceil(diff / 60000);
                const h = Math.floor(totalMinutes / 60);
                const m = totalMinutes % 60;
                const str = `${h}h ${m}m`;
                if (this.lastState.totalTimeStr !== str) {
                    this.totalTimeRemaining.textContent = str;
                    this.lastState.totalTimeStr = str;
                }
            }
        }
    }

    async setupWeather() {
        const fetchWeather = async () => {
            if (CONFIG.WEATHER_API_KEY === "YOUR_OPENWEATHERMAP_API_KEY") {
                if (this.weatherDisplay) this.weatherDisplay.textContent = "72°";
                this.lastWeatherFetchTs = Date.now();
                return;
            }
            try {
                const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${CONFIG.LAT}&lon=${CONFIG.LON}&appid=${CONFIG.WEATHER_API_KEY}&units=imperial`);
                const data = await res.json();
                if (this.weatherDisplay && data.main) {
                    this.weatherDisplay.textContent = `${Math.round(data.main.temp)}°`;
                    this.weatherDisplay.style.display = 'inline-block';
                    this.lastWeatherFetchTs = Date.now();
                }
            } catch (e) {
                console.error("Weather fetch failed", e);
            }
        };

        fetchWeather();
        this.weatherInterval = setInterval(fetchWeather, 600000); // 10 mins
    }

    checkWeatherExpiration() {
        if (!this.weatherDisplay) return;
        // If weather data is older than 30 minutes (1800000 ms), hide it
        if (this.lastWeatherFetchTs > 0 && (Date.now() - this.lastWeatherFetchTs > 1800000)) {
            this.weatherDisplay.style.display = 'none';
        }
    }

    loadSchedules() {
        const now = this.getExactNow();
        this.schedules = this.getDefaultSchedules(now.getDay());
    }

    parseScheduleString(str) {
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
                s1 = "7:00;Good Morning!;7:50,7:50;Period 5;9:25,9:25;Homeroom;9:35,9:35;Passing Period;9:40,9:40;SAS (9/10);10:10,10:10;Eagle Time (All);11:00,11:00;Passing Period;11:05,11:05;A Lunch;11:35,11:35;Passing Period;11:40,11:40;Period 6;13:15,13:15;Passing Period;13:20,13:20;Period 7;14:55";
                s2 = "9:40;Eagle Time (11/12);10:10,11:05;Period 6;12:40,12:40;Passing Period;12:45,12:45;B Lunch;13:15";
                break;
            case 3: // Wednesday
                s1 = "7:00;Good Morning!;7:50,7:50;Period 1;9:25,9:25;Passing Period;9:30,9:30;Period 2;11:05,11:05;A Lunch;11:35,11:35;Passing Period;11:40,11:40;Period 3;13:15,13:15;Passing Period;13:20,13:20;Period 4;14:55";
                s2 = "11:05;Period 3;12:40,12:40;Passing Period;12:45,12:45;B Lunch;13:15";
                break;
            case 4: // Thursday
                s1 = "7:00;Good Morning!;7:50,7:50;Period 5;9:25,9:25;Homeroom;9:35,9:35;Passing Period;9:40,9:40;SAS (9/10);10:10,10:10;Eagle Time (All);11:00,11:00;Passing Period;11:05,11:05;A Lunch;11:35,11:35;Passing Period;11:40,11:40;Period 6;13:15,13:15;Passing Period;13:20,13:20;Period 7;14:55";
                s2 = "9:40;Eagle Time (11/12);10:10,11:05;Period 6;12:40,12:40;Passing Period;12:45,12:45;B Lunch;13:15";
                break;
            case 5: // Friday
                s1 = "7:00;Happy Friday!;7:35,7:35;PLC;8:35,8:35;Period 1;9:20,9:20;Passing Period;9:25,9:25;Period 2;10:10,10:10;Passing Period;10:15,10:15;Period 3;11:00,11:00;Passing Period;11:05,11:05;A Lunch;11:35,11:35;Passing Period;11:40,11:40;Period 4;12:25,12:25;Passing Period;12:30,12:30;Period 5;13:15,13:15;Passing Period;13:20,13:20;Period 6;14:05,14:05;Passing Period;14:10,14:10;Period 7;14:55";
                s2 = "11:05;Period 4;11:50,11:50;Passing Period;11:55,11:55;B Lunch;12:25";
                break;
            default:
                s1 = "0:00;It's the weekend!;23:59";
                s2 = "12:00;Weekend;12:01";
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

    startUpdateLoop() {
        const scheduleNextTick = () => {
            if (document.hidden) {
                setTimeout(scheduleNextTick, 1000);
                return;
            }

            this.updateUI();

            if (this.lowPerf) {
                setTimeout(scheduleNextTick, 1000);
            } else {
                requestAnimationFrame(scheduleNextTick);
            }
        };

        scheduleNextTick();
    }

    updateUI(force = false) {
        const now = this.getExactNow();
        this.checkWeatherExpiration();

        if (now.getDay() !== this.lastDay) {
            this.lastDay = now.getDay();
            this.loadSchedules();
        }

        // 1. Date with Day of Week (e.g. Mon Sep 14)
        if (this.dateDisplay) {
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const dayName = days[now.getDay()];
            const dateStr = `${dayName} ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
            if (force || this.lastState.dateStr !== dateStr) {
                this.dateDisplay.textContent = dateStr;
                this.lastState.dateStr = dateStr;
            }
        }

        // 2. Main Clock / Device ID Flash
        if (this.clockDisplay) {
            if (this.showDeviceIDFlash) {
                const flashStr = this.remote.id;
                if (force || this.lastState.clockStr !== flashStr) {
                    this.clockDisplay.textContent = flashStr;
                    this.lastState.clockStr = flashStr;
                }
            } else {
                let h = now.getHours();
                const m = String(now.getMinutes()).padStart(2, '0');
                const s = String(now.getSeconds()).padStart(2, '0');
                let clockStr = "";
                if (this.clock24h) {
                    clockStr = `${String(h).padStart(2, '0')}:${m}:${s}`;
                } else {
                    h = h % 12 || 12;
                    clockStr = `${String(h).padStart(2, '0')}:${m}:${s}`;
                }

                if (force || this.lastState.clockStr !== clockStr) {
                    this.clockDisplay.textContent = clockStr;
                    this.lastState.clockStr = clockStr;
                }
            }
        }

        // 3. Total Time Remaining
        this.updateTotalTimeRemaining(now);

        // 4. Period Updates
        let anyVisible = false;

        this.schedules.forEach((periods, idx) => {
            const item = this.trackerItems[idx];
            if (!item) return;

            const container = item.container;
            const titleEl = item.title;
            const barEl = item.bar;
            const timeEl = item.time;
            const state = this.lastState.items[idx];

            if (periods.length === 0) {
                if (state.display !== 'none') {
                    container.style.display = 'none';
                    state.display = 'none';
                }
                return;
            }

            const startTime = this.parseTime(periods[0].start, now);
            const endTime = this.parseTime(periods[periods.length - 1].end, now);

            let shouldDisplay = true;
            if (idx === 1 && (now < startTime || now >= endTime)) {
                shouldDisplay = false;
            } else if (idx === 0 && now >= endTime) {
                shouldDisplay = false;
            }

            if (!shouldDisplay) {
                if (state.display !== 'none') {
                    container.style.display = 'none';
                    state.display = 'none';
                }
            } else {
                if (state.display !== 'flex') {
                    container.style.display = 'flex';
                    state.display = 'flex';
                }
                anyVisible = true;
            }

            if (state.display === 'flex') {
                const currentPeriod = periods.find(p => {
                    const start = this.parseTime(p.start, now);
                    const end = this.parseTime(p.end, now);
                    return now >= start && now < end;
                });

                if (currentPeriod) {
                    if (state.title !== currentPeriod.name) {
                        titleEl.textContent = currentPeriod.name;
                        state.title = currentPeriod.name;
                    }
                    if (idx === 0) this.currentPeriodName = currentPeriod.name;

                    const start = this.parseTime(currentPeriod.start, now);
                    const end = this.parseTime(currentPeriod.end, now);
                    const total = end - start;
                    const elapsed = now - start;
                    const percent = Math.min(100, Math.max(0, (elapsed / total) * 100)).toFixed(2);

                    if (state.width !== percent) {
                        barEl.style.width = `${percent}%`;
                        state.width = percent;
                    }

                    const remaining = Math.max(0, Math.ceil((end - now) / 1000));
                    const timeStr = this.formatTimeRemaining(remaining);
                    if (state.time !== timeStr) {
                        timeEl.textContent = timeStr;
                        state.time = timeStr;
                    }
                } else {
                    const nextPeriod = periods.find(p => this.parseTime(p.start, now) > now);
                    if (nextPeriod) {
                        const nextTitle = `Next: ${nextPeriod.name}`;
                        if (state.title !== nextTitle) {
                            titleEl.textContent = nextTitle;
                            state.title = nextTitle;
                        }
                        if (state.width !== '0') {
                            barEl.style.width = '0%';
                            state.width = '0';
                        }
                        const start = this.parseTime(nextPeriod.start, now);
                        const remaining = Math.max(0, Math.floor((start - now) / 1000));
                        const timeStr = this.formatTimeRemaining(remaining);
                        if (state.time !== timeStr) {
                            timeEl.textContent = timeStr;
                            state.time = timeStr;
                        }
                    }
                }
            }
        });

        // Toggle End of Day Message
        if (!anyVisible) {
            if (!this.lastState.endVisible) {
                if (this.endMessage) this.endMessage.style.display = 'block';
                if (this.scheduleWrapper) this.scheduleWrapper.style.display = 'none';
                this.lastState.endVisible = true;
            }
        } else {
            if (this.lastState.endVisible) {
                if (this.endMessage) this.endMessage.style.display = 'none';
                if (this.scheduleWrapper) this.scheduleWrapper.style.display = 'flex';
                this.lastState.endVisible = false;
            }
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
        this.lowPerf = active;
        this.trackerItems.forEach(item => {
            if (active) {
                item.bar.classList.add('low-perf');
            } else {
                item.bar.classList.remove('low-perf');
            }
        });
    }

    setUse24HourClock(enabled) {
        this.clock24h = enabled;
        this.updateUI(true);
    }

    setWeatherVisible(visible) {
        if (this.weatherContainer) {
            this.weatherContainer.style.display = visible ? 'inline-flex' : 'none';
        }
    }

    setTotalTimeVisible(visible) {
        if (this.totalTimeContainer) {
            this.totalTimeContainer.style.display = visible ? 'flex' : 'none';
            this.lastState.totalTimeVisible = visible;
        }
    }

    setCreditsVisible(visible) {
        const credits = document.querySelector('.credits');
        if (credits) {
            credits.style.display = visible ? 'flex' : 'none';
        }
    }

    setBarStyle(style) {
        const validStyles = ['liquid', 'glow', 'pulse', 'solid'];
        const chosen = validStyles.includes(style) ? style : 'liquid';
        this.barStyle = chosen;

        this.trackerItems.forEach(item => {
            validStyles.forEach(s => item.bar.classList.remove(`bar-style-${s}`));
            item.bar.classList.add(`bar-style-${chosen}`);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const tracker = new ScheduleTracker();
    tracker.init();
});