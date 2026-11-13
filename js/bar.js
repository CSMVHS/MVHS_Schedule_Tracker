const CONFIG = {
    WEATHER_API_KEY: "7a08aa9c10a1a7edae637fa85fc3ecae",
    CITY: "Highlands Ranch, CO",
    LAT: 39.522644613,
    LON: -104.965323092,
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
        this.deviceName = localStorage.getItem('mvhs_device_name') || null;
        this._hadRemoteName = false;

        // Activity tracking
        this.totalInteractions = parseInt(localStorage.getItem('mvhs_total_interactions') || '0', 10) || 0;
        this.lastInteraction = parseInt(localStorage.getItem('mvhs_last_interaction') || '0', 10) || 0;
        this._activityDirty = false;
        this._activitySaveTimeout = null;
        this._lastContrastBg = null;
        this._lastBgKey = null;
        this._lastTextColor = null;
        this._lastBarColor = null;
        this._lastAnimAccentColor = null;
        this._lastSettingsJson = null;
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
            this._activityDirty = true;

            if (this.tracker && typeof this.tracker.onUserInteraction === 'function') {
                this.tracker.onUserInteraction();
            }

            if (!this._activitySaveTimeout) {
                this._activitySaveTimeout = setTimeout(() => {
                    this._activitySaveTimeout = null;
                    this.flushActivity();
                }, 3000);
            }
        };

        events.forEach(e => window.addEventListener(e, record, { passive: true }));

        const flush = () => this.flushActivity();
        window.addEventListener('beforeunload', flush);
        window.addEventListener('pagehide', flush);
    }

    flushActivity() {
        if (!this._activityDirty) return;
        this._activityDirty = false;
        if (this._activitySaveTimeout) {
            clearTimeout(this._activitySaveTimeout);
            this._activitySaveTimeout = null;
        }
        try {
            localStorage.setItem('mvhs_total_interactions', this.totalInteractions.toString());
            localStorage.setItem('mvhs_last_interaction', this.lastInteraction.toString());
        } catch (e) {
            console.error("Failed to save activity tracking:", e);
        }
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

    updateContrast(bgColor, barColor) {
        if (!bgColor || this._lastContrastBg === bgColor) return;
        this._lastContrastBg = bgColor;
        const contrastText = this.getContrastColor(bgColor);
        document.documentElement.style.setProperty('--text-color', contrastText);

        if (contrastText === '#000000') {
            // Light background -> dark pill overlay & dark text shadow
            document.documentElement.style.setProperty('--pill-bg', 'rgba(255, 255, 255, 0.85)');
            document.documentElement.style.setProperty('--pill-border', 'rgba(0, 0, 0, 0.25)');
            document.documentElement.style.setProperty('--text-shadow', '0 1px 3px rgba(255, 255, 255, 0.5)');
        } else {
            // Dark background -> dark translucent pill overlay & light text shadow
            document.documentElement.style.setProperty('--pill-bg', 'rgba(0, 0, 0, 0.55)');
            document.documentElement.style.setProperty('--pill-border', 'rgba(255, 255, 255, 0.2)');
            document.documentElement.style.setProperty('--text-shadow', '0 2px 8px rgba(0, 0, 0, 0.6)');
        }
    }

    setupSync() {
        // Track time drift
        this.db.ref(".info/serverTimeOffset").on("value", (snap) => {
            this.serverOffset = snap.val() || 0;
            this.tracker.serverOffset = this.serverOffset;
            if (this.tracker && this.tracker.updateTimer !== null && typeof this.tracker.scheduleNextTick === 'function') {
                this.tracker.updateUI(true);
                this.tracker.scheduleNextTick();
            }
        });

        // Track global "Hold to Show Device IDs" state
        this.db.ref("global/showDeviceIDs").on("value", (snap) => {
            this.tracker.setShowDeviceIDFlash(!!snap.val());
        });

        // Track global snow override ('auto' | 'on' | 'off')
        this.db.ref("global/snowOverride").on("value", (snap) => {
            this.tracker.setGlobalSnowOverride(snap.val() || 'auto');
        });

        // Track global lower-bar announcement
        this.db.ref("global/announcement").on("value", (snap) => {
            this.tracker.setGlobalAnnouncement(snap.val());
        });

        // Track global "Clear All Device Names" reset timestamp
        this.db.ref("global/resetNamesTs").on("value", (snap) => {
            const ts = parseInt(snap.val(), 10) || 0;
            if (ts <= 0) return;
            const lastSeenReset = parseInt(localStorage.getItem('mvhs_last_name_reset_ts') || '0', 10) || 0;
            if (ts > lastSeenReset) {
                const hadPromptedOrNamed = !!(
                    localStorage.getItem('mvhs_identify_prompted') ||
                    localStorage.getItem('mvhs_device_name')
                );
                const approxServerNow = Date.now() + this.serverOffset;
                const isRecentReset = ts >= (this.sessionStart + this.serverOffset - 5000);
                try {
                    localStorage.setItem('mvhs_last_name_reset_ts', String(ts));
                } catch (e) {}

                if (hadPromptedOrNamed || isRecentReset) {
                    try {
                        localStorage.removeItem('mvhs_device_name');
                        localStorage.removeItem('mvhs_identify_prompted');
                    } catch (e) {}
                    this.deviceName = null;
                    this._hadRemoteName = false;
                    if (this.tracker && typeof this.tracker.reopenIdentifyPrompt === 'function') {
                        this.tracker.reopenIdentifyPrompt();
                    }
                }
            }
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
            const currentSettingsJson = JSON.stringify(settings);
            const settingsChanged = currentSettingsJson !== this._lastSettingsJson;

            if (settings.name || (data.status && data.status.name)) {
                this._hadRemoteName = true;
            } else if (this._hadRemoteName && this.deviceName) {
                this._hadRemoteName = false;
                this.deviceName = null;
                try {
                    localStorage.removeItem('mvhs_device_name');
                } catch (e) {}
            }

            if (settings.name && settings.name !== this.deviceName) {
                this.deviceName = settings.name;
                try {
                    localStorage.setItem('mvhs_device_name', settings.name);
                } catch (e) {}
            }
            const bgMode = settings.bgMode || 'color';

            // Reset body background properties
            document.body.style.backgroundImage = 'none';
            document.body.style.backgroundSize = '';
            document.body.style.backgroundPosition = '';
            document.body.style.backgroundRepeat = '';

            const effectiveBgColor = settings.bgColor || '#00401e';

            if (bgMode === 'gradient') {
                const g1 = settings.bgGradient1 || '#00401e';
                const g2 = settings.bgGradient2 || '#001a0c';
                const deg = settings.bgGradientAngle || '135';
                document.body.style.background = `linear-gradient(${deg}deg, ${g1}, ${g2})`;
                this.updateContrast(g1);
            } else if (bgMode === 'image' && settings.bgImage) {
                document.body.style.backgroundImage = `url('${settings.bgImage}')`;
                document.body.style.backgroundSize = 'cover';
                document.body.style.backgroundPosition = 'center';
                document.body.style.backgroundRepeat = 'no-repeat';
                document.body.style.backgroundColor = effectiveBgColor;
                this.updateContrast(effectiveBgColor);
            } else {
                document.body.style.background = effectiveBgColor;
                document.documentElement.style.setProperty('--bg-color', effectiveBgColor);
                this.updateContrast(effectiveBgColor);
            }

            // Check if local customizations apply contrast override
            const savedLocal = localStorage.getItem('mvhs_local_customizations');
            if (savedLocal) {
                try {
                    const localCustoms = JSON.parse(savedLocal);
                    if (localCustoms.bg) {
                        this.updateContrast(localCustoms.bg);
                    }
                } catch (e) {}
            }

            // Text Color Override if explicitly provided
            if (settings.textColor && settings.textColor !== '#ffffff') {
                document.documentElement.style.setProperty('--text-color', settings.textColor);
            }

            // Progress Bar Color & Accent Animation Color
            document.documentElement.style.setProperty('--bar-color', settings.barColor || '#b1953a');
            document.documentElement.style.setProperty('--anim-accent-color', settings.animAccentColor || '#ffffff');

            // Apply Time Offset
            if (settings.timeOffset !== undefined) {
                const newOffset = parseInt(settings.timeOffset, 10) || 0;
                if (this.tracker.timeOffset !== newOffset) {
                    this.tracker.timeOffset = newOffset;
                    if (this.tracker.updateTimer !== null && typeof this.tracker.scheduleNextTick === 'function') {
                        this.tracker.updateUI(true);
                        this.tracker.scheduleNextTick();
                    }
                }
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

            if (settingsChanged) {
                this._lastSettingsJson = currentSettingsJson;

                // Customization Options
                this.tracker.setUse24HourClock(!!settings.clock24h);
                this.tracker.setWeatherVisible(settings.showWeather !== false);
                this.tracker.setTotalTimeVisible(settings.showTotalTime !== false);
                this.tracker.setCreditsVisible(settings.showCredits !== false);
                this.tracker.setBarStyle(settings.barStyle || 'liquid');
                this.tracker.setDeviceSnowOverride(settings.snowOverride || 'global');
                this.tracker.setDeviceAnnouncement(settings.announcementMode || 'global', settings.announcementText || '');

                // Apply persistent local customizations if saved so local front-end changes override global settings
                this.tracker.loadLocalCustomizations();
            }

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
        if (!name) return;
        const trimmed = name.trim();
        if (!trimmed) return;
        const formatted = trimmed.endsWith('(write-in)') ? trimmed : `${trimmed} (write-in)`;
        this.deviceName = formatted;
        this._hadRemoteName = true;
        try {
            localStorage.setItem('mvhs_device_name', formatted);
        } catch (e) {}

        if (this.deviceRef) {
            this.deviceRef.child('status').update({
                name: formatted
            }).catch(err => {
                console.error("Failed to set device name in status:", err);
            });
            this.deviceRef.child('settings').update({
                name: formatted
            }).catch(() => {});
        }
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
        this.flushActivity();
        const currentUptime = Math.floor((Date.now() - this.sessionStart) / 1000);
        const statusData = {
            lastSeen: firebase.database.ServerValue.TIMESTAMP,
            currentPeriod: (this.tracker && typeof this.tracker.getCurrentPeriodName === 'function') ? this.tracker.getCurrentPeriodName() : (this.tracker.currentPeriodName || "None"),
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
        };
        if (this.deviceName) {
            statusData.name = this.deviceName;
        }
        this.deviceRef.child('status').update(statusData);
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
        this.updateTimer = null;
        this.lastDateDay = -1;
        this.lastDayOfWeek = -1;
        this._barStyleApplied = false;
        this._lowPerfApplied = false;

        // Remote Management
        this.remote = new RemoteManager(this);

        // Cache DOM elements
        this.dateContainer = document.getElementById("date-container");
        this.dateDisplay = document.getElementById("date-display");
        this.clockDisplay = document.getElementById("clock-display");
        this.weatherContainer = document.getElementById("weather-container");
        this.weatherIconEl = document.getElementById("weather-icon");
        this.weatherDisplay = document.getElementById("weather-display");
        this.endMessage = document.getElementById('end');
        this.scheduleWrapper = document.querySelector('.schedule-wrapper');
        this.announcementContainer = document.getElementById("announcement-container");
        this.announcementTextEl = document.getElementById("announcement-text");
        this.snowCanvas = document.getElementById("snow-canvas");
        this.totalTimeRemaining = document.querySelector(".total-time-remaining");
        this.totalTimeContainer = document.getElementById("total-time-container");
        this.deviceIdDisplay = document.getElementById("device-id-display");

        // Weather, NWS Alert, Snow & Announcement State
        this.globalSnowOverride = "auto";
        this.deviceSnowOverride = "global";
        this.isWeatherSnowing = false;
        this.hasNwsAlert = false;
        this.nwsAlertLabel = "";
        this.lastNwsFetchTs = 0;
        this.lastWeatherCode = null;
        this.lastWeatherIconCode = null;
        this.globalAnnouncement = { enabled: false, text: "" };
        this.deviceAnnouncementMode = "global";
        this.deviceAnnouncementText = "";
        this._announcementVisible = false;
        this._lastFittedText = null;
        this._lastFittedWidth = 0;
        this._lastFittedHeight = 0;
        this._perfThrottled = false;
        this._snowRaf = null;
        this._snowParticles = [];
        this._snowLastTs = 0;
        this._snowSlowFrames = 0;
        this._snowCanvasWidth = 0;
        this._snowCanvasHeight = 0;
        this._identifyCleanup = null;

        window.addEventListener('resize', () => {
            this.fitAnnouncementText();
            this.resizeSnowCanvas();
        });

        if (window.ResizeObserver && this.announcementContainer) {
            this._announcementObserver = new ResizeObserver(() => {
                if (this._announcementVisible) {
                    this.fitAnnouncementText();
                }
            });
            this._announcementObserver.observe(this.announcementContainer);
        }

        if (window.matchMedia) {
            const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
            const onMotionChange = () => this.updateSnowState();
            if (motionQuery.addEventListener) {
                motionQuery.addEventListener('change', onMotionChange);
            } else if (motionQuery.addListener) {
                motionQuery.addListener(onMotionChange);
            }
        }

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
            totalTimeVisible: false,
            endVisible: false,
            items: [{}, {}]
        };

        this.totalTimeSettingVisible = true;
        this.updateDeviceIdDisplay();
        this.setupVisibilityHandler();
        this.setupFirstTimeIdentifyPrompt();
        this.setupEscKeyHandler();
        this.lastActivePeriods = [null, null];
        this.setupRippleListeners();
    }

    setupRippleListeners() {
        this.trackerItems.forEach((item, idx) => {
            if (item.time) {
                item.time.title = "Click to trigger ripple";
                item.time.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.triggerRipple(idx);
                });
            }
        });
    }

    triggerRipple(idx) {
        const item = this.trackerItems[idx];
        if (!item || !item.bar) return;
        item.bar.classList.remove('ripple-active');
        void item.bar.offsetWidth; // Force reflow
        item.bar.classList.add('ripple-active');
        setTimeout(() => {
            if (item.bar) item.bar.classList.remove('ripple-active');
        }, 950);
    }

    setupEscKeyHandler() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.customizeModal && this.customizeModal.style.display !== 'none') {
                    this.customizeModal.style.display = 'none';
                }
                if (this.identifyModal && this.identifyModal.style.display !== 'none') {
                    if (this.dismissIdentifyPrompt) {
                        this.dismissIdentifyPrompt(false);
                    } else {
                        this.identifyModal.style.display = 'none';
                    }
                }
            }
        });
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
            this.remote.updateContrast(settings.bg);
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
            const formatSelect = document.getElementById('cust-clock-format');
            if (formatSelect) formatSelect.value = settings.format;
        }
        if (settings.weather !== undefined) {
            this.setWeatherVisible(settings.weather);
            const weatherCheck = document.getElementById('cust-show-weather');
            if (weatherCheck) weatherCheck.checked = settings.weather;
        }
        if (settings.totalTime !== undefined) {
            this.setTotalTimeVisible(settings.totalTime);
        }
    }

    reopenIdentifyPrompt() {
        if (this._identifyCleanup) {
            this._identifyCleanup();
        }
        if (this.identifyInput) {
            this.identifyInput.value = "";
        }
        this.setupFirstTimeIdentifyPrompt(true);
    }

    setupFirstTimeIdentifyPrompt(forceReopen = false) {
        if (!forceReopen) {
            const hasPrompted = localStorage.getItem("mvhs_identify_prompted");
            if (hasPrompted) return;
        }

        if (this._identifyCleanup) {
            this._identifyCleanup();
        }

        if (this.identifyModal) {
            this.identifyModal.style.display = "block";
        }

        const INITIAL_TIMEOUT_MS = 15000;
        const INTERACTION_TIMEOUT_MS = 30000;
        let dismissTimeout = null;

        const dismiss = (shouldSave = false, inputVal = undefined) => {
            if (this._identifyCleanup) {
                this._identifyCleanup();
            }
            localStorage.setItem("mvhs_identify_prompted", "true");
            if (this.identifyModal) {
                this.identifyModal.style.display = "none";
            }
            if (shouldSave) {
                const finalVal = inputVal !== undefined ? inputVal : (this.identifyInput ? this.identifyInput.value : "");
                if (finalVal && finalVal.trim()) {
                    this.remote.setDeviceName(finalVal);
                }
            }
        };

        this.dismissIdentifyPrompt = dismiss;

        // 15s initial timeout if untouched; clicking, focusing, or typing keeps it open and resets a 30s inactivity timeout
        const scheduleDismiss = (ms) => {
            if (dismissTimeout) clearTimeout(dismissTimeout);
            dismissTimeout = setTimeout(() => dismiss(false), ms);
        };

        const onInteract = () => {
            scheduleDismiss(INTERACTION_TIMEOUT_MS);
        };

        scheduleDismiss(INITIAL_TIMEOUT_MS);

        const onSubmitClick = () => {
            const val = this.identifyInput ? this.identifyInput.value : "";
            dismiss(true, val);
        };

        const onSkipClick = () => dismiss(false);

        const onInputKeyDown = (e) => {
            if (e.key === "Enter") {
                dismiss(true, this.identifyInput ? this.identifyInput.value : "");
            } else {
                onInteract();
            }
        };

        const onModalKeyDown = (e) => {
            if (e.key !== "Enter") {
                onInteract();
            }
        };

        if (this.identifyInput) {
            this.identifyInput.addEventListener("focus", onInteract);
            this.identifyInput.addEventListener("input", onInteract);
            this.identifyInput.addEventListener("click", onInteract);
            this.identifyInput.addEventListener("pointerdown", onInteract);
            this.identifyInput.addEventListener("keydown", onInputKeyDown);
        }

        if (this.identifyModal) {
            this.identifyModal.addEventListener("pointerdown", onInteract);
            this.identifyModal.addEventListener("click", onInteract);
            this.identifyModal.addEventListener("keydown", onModalKeyDown);
        }

        if (this.identifySubmitBtn) {
            this.identifySubmitBtn.addEventListener("click", onSubmitClick);
        }

        if (this.identifySkipBtn) {
            this.identifySkipBtn.addEventListener("click", onSkipClick);
        }

        this._identifyCleanup = () => {
            if (dismissTimeout) {
                clearTimeout(dismissTimeout);
                dismissTimeout = null;
            }
            if (this.identifyInput) {
                this.identifyInput.removeEventListener("focus", onInteract);
                this.identifyInput.removeEventListener("input", onInteract);
                this.identifyInput.removeEventListener("click", onInteract);
                this.identifyInput.removeEventListener("pointerdown", onInteract);
                this.identifyInput.removeEventListener("keydown", onInputKeyDown);
            }
            if (this.identifyModal) {
                this.identifyModal.removeEventListener("pointerdown", onInteract);
                this.identifyModal.removeEventListener("click", onInteract);
                this.identifyModal.removeEventListener("keydown", onModalKeyDown);
            }
            if (this.identifySubmitBtn) {
                this.identifySubmitBtn.removeEventListener("click", onSubmitClick);
            }
            if (this.identifySkipBtn) {
                this.identifySkipBtn.removeEventListener("click", onSkipClick);
            }
            this._identifyCleanup = null;
        };
    }

    setShowDeviceIDFlash(show) {
        this.showDeviceIDFlash = show;
        this.updateUI(true);
    }

    updateDeviceIdDisplay() {
        if (this.deviceIdDisplay) {
            this.deviceIdDisplay.textContent = this.remote.id;
            this.deviceIdDisplay.title = "Click to copy Device ID";
            this.deviceIdDisplay.addEventListener('click', () => {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(this.remote.id).catch(() => {});
                } else {
                    const temp = document.createElement('textarea');
                    temp.value = this.remote.id;
                    document.body.appendChild(temp);
                    temp.select();
                    try { document.execCommand('copy'); } catch(e) {}
                    document.body.removeChild(temp);
                }
            });
        }
    }

    setupVisibilityHandler() {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this._snowLastTs = performance.now();
                this.updateUI(true);
                this.scheduleNextTick();
            } else {
                if (this.remote && typeof this.remote.flushActivity === 'function') {
                    this.remote.flushActivity();
                }
            }
        });
    }

    getExactNow() {
        return new Date(Date.now() + this.serverOffset + (this.timeOffset * 60000));
    }

    updateTotalTimeRemaining(now) {
        if (!this.totalTimeRemaining || !this.totalTimeContainer) return;
        if (this.totalTimeSettingVisible === false) {
            if (this.lastState.totalTimeVisible !== false) {
                this.totalTimeContainer.style.display = 'none';
                this.lastState.totalTimeVisible = false;
            }
            return;
        }

        // Hide on weekends or when there are no scheduled periods
        const dayOfWeek = now.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6 || !this.schedules[0] || this.schedules[0].length === 0) {
            if (this.lastState.totalTimeVisible !== false) {
                this.totalTimeContainer.style.display = 'none';
                this.lastState.totalTimeVisible = false;
            }
            return;
        }

        let endH = 14, endM = 50;
        const lastPeriod = this.schedules[0][this.schedules[0].length - 1];
        if (lastPeriod.endH !== undefined) {
            endH = lastPeriod.endH;
            endM = lastPeriod.endM;
        } else if (lastPeriod.end) {
            const colonIdx = lastPeriod.end.indexOf(':');
            endH = parseInt(lastPeriod.end.substring(0, colonIdx), 10);
            endM = parseInt(lastPeriod.end.substring(colonIdx + 1), 10);
        }

        const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
        const endSec = endH * 3600 + endM * 60;
        const diffSec = endSec - nowSec;

        // Hide total time remaining pill once it reaches 0h 0m or when school day has ended
        if (diffSec <= 0) {
            if (this.lastState.totalTimeVisible !== false) {
                this.totalTimeContainer.style.display = 'none';
                this.lastState.totalTimeVisible = false;
            }
            return;
        }

        if (this.lastState.totalTimeVisible !== true) {
            this.totalTimeContainer.style.display = 'flex';
            this.lastState.totalTimeVisible = true;
        }

        const totalMinutes = Math.ceil(diffSec / 60);
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        const str = `${h}h ${m}m`;

        if (this.lastState.totalTimeStr !== str) {
            this.totalTimeRemaining.textContent = str;
            this.lastState.totalTimeStr = str;
        }
    }

    filterNwsAlerts(features) {
        if (!Array.isArray(features)) return [];
        return features.filter(f => {
            const props = f && f.properties;
            if (!props) return false;
            const status = String(props.status || '').toLowerCase();
            const msgType = String(props.messageType || '').toLowerCase();
            const event = String(props.event || '').toLowerCase();
            if (status !== 'actual' || msgType === 'cancel') return false;
            return (event.includes('warning') || event.includes('advisory')) && !event.includes('watch');
        });
    }

    async setupWeather() {
        const fetchWeather = async () => {
            if (CONFIG.WEATHER_API_KEY === "YOUR_OPENWEATHERMAP_API_KEY") {
                if (this.weatherDisplay) this.weatherDisplay.textContent = "72°";
                this.lastWeatherCode = null;
                this.lastWeatherIconCode = null;
                this.isWeatherSnowing = false;
                this.hasNwsAlert = false;
                this.nwsAlertLabel = "";
                this.lastWeatherFetchTs = Date.now();
                this.updateWeatherIcon();
                this.updateSnowState();
                return;
            }
            try {
                const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${CONFIG.LAT}&lon=${CONFIG.LON}&appid=${CONFIG.WEATHER_API_KEY}&units=imperial`);
                if (!res.ok) {
                    throw new Error(`Weather HTTP ${res.status}`);
                }
                const data = await res.json();
                if (this.weatherDisplay && data && data.main && typeof data.main.temp === 'number') {
                    this.weatherDisplay.textContent = `${Math.round(data.main.temp)}°`;
                    this.weatherDisplay.style.display = 'inline-block';
                    this.lastWeatherFetchTs = Date.now();

                    const w = Array.isArray(data.weather) && data.weather.length > 0 ? data.weather[0] : null;
                    this.lastWeatherCode = w && typeof w.id === 'number' ? w.id : null;
                    this.lastWeatherIconCode = w && typeof w.icon === 'string' ? w.icon : null;
                    this.isWeatherSnowing = this.lastWeatherCode !== null && this.lastWeatherCode >= 600 && this.lastWeatherCode < 700;
                } else {
                    this.lastWeatherCode = null;
                    this.lastWeatherIconCode = null;
                    this.isWeatherSnowing = false;
                }
            } catch (e) {
                console.error("Weather fetch failed", e);
                this.lastWeatherCode = null;
                this.lastWeatherIconCode = null;
                this.isWeatherSnowing = false;
            }

            // Query active NWS Warnings and Advisories for the school's coordinates (exclude Watches)
            try {
                const nwsRes = await fetch(`https://api.weather.gov/alerts/active?point=${CONFIG.LAT},${CONFIG.LON}`, {
                    headers: { 'Accept': 'application/geo+json' }
                });
                if (nwsRes.ok) {
                    const nwsData = await nwsRes.json();
                    const activeWarningsOrAdvisories = this.filterNwsAlerts(nwsData && nwsData.features);
                    this.hasNwsAlert = activeWarningsOrAdvisories.length > 0;
                    this.nwsAlertLabel = activeWarningsOrAdvisories
                        .map(f => f.properties && f.properties.event)
                        .filter(Boolean)
                        .join(', ');
                    this.lastNwsFetchTs = Date.now();
                }
            } catch (e) {
                console.warn("NWS alert fetch failed", e);
            }

            this.updateWeatherIcon(this.lastWeatherCode, this.lastWeatherIconCode);
            this.updateSnowState();
        };

        fetchWeather();
        this.weatherInterval = setInterval(fetchWeather, 600000); // 10 mins
    }

    getWeatherSvg(code, iconCode) {
        if (typeof code !== 'number' || Number.isNaN(code)) return null;
        const isNight = typeof iconCode === 'string' && iconCode.endsWith('n');

        // Thunderstorm (200-232)
        if (code >= 200 && code <= 232) {
            return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"/><polyline points="13 11 9 17 15 17 11 23"/></svg>`;
        }
        // Drizzle / Rain (300-321, 500-531)
        if ((code >= 300 && code <= 321) || (code >= 500 && code <= 531)) {
            return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>`;
        }
        // Snow (600-622)
        if (code >= 600 && code <= 622) {
            return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M8 15h.01"/><path d="M8 19h.01"/><path d="M12 17h.01"/><path d="M12 21h.01"/><path d="M16 15h.01"/><path d="M16 19h.01"/></svg>`;
        }
        // Mist / Smoke / Haze / Fog (701, 711, 721, 741)
        if (code === 701 || code === 711 || code === 721 || code === 741) {
            return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M3 19h18"/><path d="M5 22h14"/></svg>`;
        }
        // Clear sky (800)
        if (code === 800) {
            if (isNight) {
                return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;
            }
            return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`;
        }
        // Partly cloudy (801-802)
        if (code === 801 || code === 802) {
            if (isNight) {
                return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 0 0 5 5 6 6 0 0 1-5-5Z"/><path d="M17.5 19H9a5 5 0 1 1 2.2-9.5A5.5 5.5 0 0 1 21 13.5a3.5 3.5 0 0 1-3.5 5.5Z"/></svg>`;
            }
            return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="M20 12h2"/><path d="m19.07 4.93-1.41 1.41"/><path d="M15.947 12.65a4 4 0 0 0-5.925-4.128"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/></svg>`;
        }
        // Cloudy / Overcast (803-804)
        if (code === 803 || code === 804) {
            return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>`;
        }
        // Unclear / unknown weather condition -> revert to temperature-only pill
        return null;
    }

    updateWeatherIcon(code = this.lastWeatherCode, iconCode = this.lastWeatherIconCode) {
        if (!this.weatherIconEl) return;
        if (this.hasNwsAlert) {
            this.weatherIconEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#facc15" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" fill="rgba(250, 204, 21, 0.2)"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
            this.weatherIconEl.classList.add('weather-warning');
            this.weatherIconEl.style.display = 'inline-flex';
            this.weatherIconEl.title = this.nwsAlertLabel ? `Active Weather Alert: ${this.nwsAlertLabel}` : 'Active NWS Weather Warning/Advisory';
            return;
        }

        this.weatherIconEl.classList.remove('weather-warning');
        this.weatherIconEl.removeAttribute('title');

        const svg = this.getWeatherSvg(code, iconCode);
        if (svg) {
            this.weatherIconEl.innerHTML = svg;
            this.weatherIconEl.style.display = 'inline-flex';
        } else {
            this.weatherIconEl.innerHTML = '';
            this.weatherIconEl.style.display = 'none';
        }
    }

    checkWeatherExpiration() {
        if (!this.weatherDisplay) return;
        const now = Date.now();
        if (this.lastNwsFetchTs > 0 && (now - this.lastNwsFetchTs > 1800000)) {
            this.hasNwsAlert = false;
            this.nwsAlertLabel = "";
            this.lastNwsFetchTs = 0;
            this.updateWeatherIcon();
        }
        // If weather data is older than 30 minutes (1800000 ms), hide it
        if (this.lastWeatherFetchTs > 0 && (now - this.lastWeatherFetchTs > 1800000)) {
            this.weatherDisplay.style.display = 'none';
            this.hasNwsAlert = false;
            this.nwsAlertLabel = "";
            this.lastNwsFetchTs = 0;
            if (this.weatherIconEl) {
                this.weatherIconEl.classList.remove('weather-warning');
                this.weatherIconEl.removeAttribute('title');
                this.weatherIconEl.innerHTML = '';
                this.weatherIconEl.style.display = 'none';
            }
            if (this.isWeatherSnowing) {
                this.isWeatherSnowing = false;
                this.updateSnowState();
            }
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
                const colonStart = parts[0].indexOf(':');
                const startH = parseInt(parts[0].substring(0, colonStart), 10);
                const startM = parseInt(parts[0].substring(colonStart + 1), 10);
                const colonEnd = parts[2].indexOf(':');
                const endH = parseInt(parts[2].substring(0, colonEnd), 10);
                const endM = parseInt(parts[2].substring(colonEnd + 1), 10);
                return {
                    start: parts[0],
                    name: parts[1],
                    end: parts[2],
                    startH,
                    startM,
                    endH,
                    endM
                };
            } else if (parts.length === 2) {
                const colonStart = parts[0].indexOf(':');
                const startH = parseInt(parts[0].substring(0, colonStart), 10);
                const startM = parseInt(parts[0].substring(colonStart + 1), 10);
                const colonEnd = parts[1].indexOf(':');
                const endH = parseInt(parts[1].substring(0, colonEnd), 10);
                const endM = parseInt(parts[1].substring(colonEnd + 1), 10);
                return {
                    start: parts[0],
                    name: "Period",
                    end: parts[1],
                    startH,
                    startM,
                    endH,
                    endM
                };
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
                
                // s1 = "7:30;Happy Friday!;8:30,8:30;Passing Period;8:35,8:35;Period 1;9:55,9:55;Passing Period;10:00,10:00;Period 2;11:20,11:20;A Lunch;12:05,12:05;Passing Period;12:10,12:10;Period 3;13:30,13:30;Passing Period;13:35,13:35;Period 4;14:55";
                // s2 = "11:20;Passing Period;11:25,11:25;Period 3;12:45,12:45;Passing Period;12:50,12:50;B Lunch;13:30";
                
                break;
            
            
            default:
                s1 = "12:00;Weekend;12:01";
                s2 = "12:00;Weekend;12:01";
            
        }
        return [this.parseScheduleString(s1), this.parseScheduleString(s2)];
    }

    parseTime(timeStr, baseDate) {
        if (!timeStr) return null;
        const colonIdx = timeStr.indexOf(':');
        const h = parseInt(timeStr.substring(0, colonIdx), 10);
        const m = parseInt(timeStr.substring(colonIdx + 1), 10);
        const d = new Date(baseDate ? (baseDate.getTime ? baseDate.getTime() : baseDate) : Date.now());
        d.setHours(h, m, 0, 0);
        return d;
    }

    getCurrentPeriodName() {
        const now = this.getExactNow();
        if (this.schedules && this.schedules[0]) {
            const currentSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
            const currentPeriod = this.schedules[0].find(p => {
                const startSec = p.startH * 3600 + p.startM * 60;
                const endSec = p.endH * 3600 + p.endM * 60;
                return currentSeconds >= startSec && currentSeconds < endSec;
            });
            if (currentPeriod) return currentPeriod.name;
        }
        return this.currentPeriodName || "None";
    }

    startUpdateLoop() {
        this.updateUI(true);
        this.scheduleNextTick();
    }

    scheduleNextTick() {
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
            this.updateTimer = null;
        }

        const currentMs = Date.now() + this.serverOffset + (this.timeOffset * 60000);
        const msIntoSecond = ((currentMs % 1000) + 1000) % 1000;
        // Calibrate delay so the timer wakes up right as the second rolls over.
        // If msIntoSecond is 0, wait 1000ms.
        // Otherwise wait (1000 - msIntoSecond + 1)ms to land 1ms into the next second,
        // preventing premature firing in the current second due to timer jitter.
        const delay = msIntoSecond === 0 ? 1000 : (1000 - msIntoSecond + 1);

        this.updateTimer = setTimeout(() => {
            if (!document.hidden) {
                this.updateUI();
            }
            this.scheduleNextTick();
        }, delay);
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
            const dayOfWeek = now.getDay();
            const dateNum = now.getDate();
            if (force || this.lastDateDay !== dateNum || this.lastDayOfWeek !== dayOfWeek) {
                const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const dayName = days[dayOfWeek];
                const dateStr = `${dayName} ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
                if (force || this.lastState.dateStr !== dateStr) {
                    this.dateDisplay.textContent = dateStr;
                    this.lastState.dateStr = dateStr;
                }
                this.lastDateDay = dateNum;
                this.lastDayOfWeek = dayOfWeek;
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
        const currentSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
        const currentMs = now.getTime();

        this.schedules.forEach((periods, idx) => {
            const item = this.trackerItems[idx];
            if (!item) return;

            const container = item.container;
            const titleEl = item.title;
            const barEl = item.bar;
            const timeEl = item.time;
            const state = this.lastState.items[idx];

            if (periods.length === 0) {
                this.lastActivePeriods[idx] = null;
                if (timeEl) timeEl.classList.remove('urgent-minute', 'pill-translucent');
                if (state.display !== 'none') {
                    container.style.display = 'none';
                    state.display = 'none';
                }
                return;
            }

            const dayStartSec = periods[0].startH * 3600 + periods[0].startM * 60;
            const dayEndSec = periods[periods.length - 1].endH * 3600 + periods[periods.length - 1].endM * 60;

            let shouldDisplay = true;
            if (idx === 1 && (currentSeconds < dayStartSec || currentSeconds >= dayEndSec)) {
                shouldDisplay = false;
            } else if (idx === 0 && currentSeconds >= dayEndSec) {
                shouldDisplay = false;
            }

            if (!shouldDisplay) {
                this.lastActivePeriods[idx] = null;
                if (timeEl) timeEl.classList.remove('urgent-minute', 'pill-translucent');
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
                    const startSec = p.startH * 3600 + p.startM * 60;
                    const endSec = p.endH * 3600 + p.endM * 60;
                    return currentSeconds >= startSec && currentSeconds < endSec;
                });

                if (currentPeriod) {
                    if (state.title !== currentPeriod.name) {
                        titleEl.textContent = currentPeriod.name;
                        state.title = currentPeriod.name;
                    }
                    if (idx === 0) this.currentPeriodName = currentPeriod.name;

                    // Trigger ripple at the start of a new period
                    if (this.lastActivePeriods[idx] !== currentPeriod.name) {
                        this.lastActivePeriods[idx] = currentPeriod.name;
                        this.triggerRipple(idx);
                    }

                    const startMs = this.parseTime(currentPeriod.start, now).getTime();
                    const endMs = this.parseTime(currentPeriod.end, now).getTime();
                    const total = endMs - startMs;
                    const elapsed = currentMs - startMs;
                    const percent = total > 0 ? Math.min(100, Math.max(0, (elapsed / total) * 100)).toFixed(2) : "0.00";

                    if (state.width !== percent) {
                        barEl.style.width = `${percent}%`;
                        state.width = percent;
                    }

                    const remaining = Math.max(0, Math.ceil((endMs - currentMs) / 1000));
                    const timeStr = this.formatTimeRemaining(remaining);
                    if (state.time !== timeStr) {
                        timeEl.textContent = timeStr;
                        state.time = timeStr;
                    }

                    // Thicker and more white border when less than 1 minute remains
                    const isUnderMinute = remaining > 0 && remaining <= 60;
                    if (isUnderMinute) {
                        if (!timeEl.classList.contains('urgent-minute')) timeEl.classList.add('urgent-minute');
                    } else {
                        if (timeEl.classList.contains('urgent-minute')) timeEl.classList.remove('urgent-minute');
                    }

                    // More clear/translucent pill at <= 5% time left in the period so the end of the bar is visible
                    const isLast5Percent = total > 0 && (elapsed / total >= 0.95);
                    if (isLast5Percent) {
                        if (!timeEl.classList.contains('pill-translucent')) timeEl.classList.add('pill-translucent');
                    } else {
                        if (timeEl.classList.contains('pill-translucent')) timeEl.classList.remove('pill-translucent');
                    }
                } else {
                    this.lastActivePeriods[idx] = null;
                    if (timeEl.classList.contains('urgent-minute')) timeEl.classList.remove('urgent-minute');
                    if (timeEl.classList.contains('pill-translucent')) timeEl.classList.remove('pill-translucent');
                    if (idx === 0) this.currentPeriodName = "None";
                    const nextPeriod = periods.find(p => (p.startH * 3600 + p.startM * 60) > currentSeconds);
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
                        const startMs = this.parseTime(nextPeriod.start, now).getTime();
                        const remaining = Math.max(0, Math.floor((startMs - currentMs) / 1000));
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

        // Toggle Announcement Card when second (lower) bar isn't shown
        const secondBarVisible = !!(this.lastState.items[1] && this.lastState.items[1].display === 'flex');
        this.updateAnnouncementVisibility(secondBarVisible, anyVisible);
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
        if (this.lowPerf === active && this._lowPerfApplied) return;
        this.lowPerf = active;
        this._lowPerfApplied = true;
        this.trackerItems.forEach(item => {
            if (active) {
                item.bar.classList.add('low-perf');
            } else {
                item.bar.classList.remove('low-perf');
            }
        });
        this.updateSnowState();
    }

    setGlobalSnowOverride(mode) {
        const valid = ['auto', 'on', 'off'];
        this.globalSnowOverride = valid.includes(mode) ? mode : 'auto';
        this.updateSnowState();
    }

    setDeviceSnowOverride(mode) {
        const valid = ['global', 'auto', 'on', 'off'];
        this.deviceSnowOverride = valid.includes(mode) ? mode : 'global';
        this.updateSnowState();
    }

    getEffectiveSnowMode() {
        return (this.deviceSnowOverride && this.deviceSnowOverride !== 'global')
            ? this.deviceSnowOverride
            : this.globalSnowOverride;
    }

    canRunSnow() {
        if (this.lowPerf || this._perfThrottled) return false;
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
        if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) return false;
        if (navigator.deviceMemory && navigator.deviceMemory <= 2) return false;
        return true;
    }

    updateSnowState() {
        const mode = this.getEffectiveSnowMode();
        let shouldSnow = false;
        if (mode === 'on') {
            shouldSnow = this.canRunSnow();
        } else if (mode === 'auto') {
            shouldSnow = this.isWeatherSnowing && this.canRunSnow();
        }
        if (shouldSnow) {
            this.startSnow();
        } else {
            this.stopSnow();
        }
    }

    resizeSnowCanvas() {
        if (!this.snowCanvas) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const w = Math.floor(window.innerWidth * dpr);
        const h = Math.floor(window.innerHeight * dpr);
        if (this._snowCanvasWidth !== w || this._snowCanvasHeight !== h) {
            this.snowCanvas.width = w;
            this.snowCanvas.height = h;
            this._snowCanvasWidth = w;
            this._snowCanvasHeight = h;
        }
        this._snowDpr = dpr;
    }

    startSnow() {
        if (!this.snowCanvas || this._snowRaf) return;
        const ctx = this.snowCanvas.getContext('2d');
        if (!ctx) return;

        this.snowCanvas.style.display = 'block';
        this.resizeSnowCanvas();

        const count = Math.min(48, Math.max(20, Math.floor(window.innerWidth / 36)));
        this._snowParticles = Array.from({ length: count }, () => ({
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
            r: 1.4 + Math.random() * 2.2,
            vy: 18 + Math.random() * 26,
            vx: (Math.random() - 0.5) * 14,
            alpha: 0.2 + Math.random() * 0.32,
            phase: Math.random() * Math.PI * 2
        }));

        this._snowLastTs = performance.now();
        this._snowSlowFrames = 0;

        const tick = (now) => {
            if (!this._snowRaf) return;
            const dtMs = now - this._snowLastTs;
            this._snowLastTs = now;

            if (document.hidden) {
                this._snowRaf = requestAnimationFrame(tick);
                return;
            }

            // Runtime FPS watchdog: if device consistently drops below ~22 FPS, stop snow
            if (dtMs > 45 && dtMs < 500) {
                this._snowSlowFrames++;
                if (this._snowSlowFrames >= 20) {
                    this._perfThrottled = true;
                    this.stopSnow();
                    return;
                }
            } else if (dtMs <= 45) {
                this._snowSlowFrames = Math.max(0, this._snowSlowFrames - 1);
            }

            const dt = Math.min(dtMs / 1000, 0.05);
            const dpr = this._snowDpr || 1;
            const w = window.innerWidth;
            const h = window.innerHeight;

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = '#ffffff';

            for (let i = 0; i < this._snowParticles.length; i++) {
                const p = this._snowParticles[i];
                p.phase += dt * 0.8;
                p.x += (p.vx + Math.sin(p.phase) * 8) * dt;
                p.y += p.vy * dt;

                if (p.y > h + 6) {
                    p.y = -6;
                    p.x = Math.random() * w;
                }
                if (p.x > w + 6) p.x = -6;
                if (p.x < -6) p.x = w + 6;

                ctx.globalAlpha = p.alpha;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fill();
            }

            this._snowRaf = requestAnimationFrame(tick);
        };

        this._snowRaf = requestAnimationFrame(tick);
    }

    stopSnow() {
        if (this._snowRaf) {
            cancelAnimationFrame(this._snowRaf);
            this._snowRaf = null;
        }
        if (this.snowCanvas) {
            const ctx = this.snowCanvas.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, this.snowCanvas.width, this.snowCanvas.height);
            this.snowCanvas.style.display = 'none';
        }
    }

    setGlobalAnnouncement(data) {
        if (data && typeof data === 'object') {
            this.globalAnnouncement = {
                enabled: !!data.enabled,
                text: typeof data.text === 'string' ? data.text : ""
            };
        } else {
            this.globalAnnouncement = { enabled: false, text: "" };
        }
        this.refreshAnnouncementState();
    }

    setDeviceAnnouncement(mode, text) {
        const valid = ['global', 'custom', 'off'];
        this.deviceAnnouncementMode = valid.includes(mode) ? mode : 'global';
        this.deviceAnnouncementText = typeof text === 'string' ? text : "";
        this.refreshAnnouncementState();
    }

    getEffectiveAnnouncement() {
        if (this.deviceAnnouncementMode === 'off') {
            return { enabled: false, text: "" };
        }
        if (this.deviceAnnouncementMode === 'custom') {
            return {
                enabled: this.deviceAnnouncementText.trim().length > 0,
                text: this.deviceAnnouncementText
            };
        }
        return this.globalAnnouncement;
    }

    refreshAnnouncementState() {
        const secondBarVisible = !!(this.lastState.items[1] && this.lastState.items[1].display === 'flex');
        const anyVisible = !this.lastState.endVisible;
        this.updateAnnouncementVisibility(secondBarVisible, anyVisible);
    }

    updateAnnouncementVisibility(secondBarVisible, anyVisible) {
        if (!this.announcementContainer || !this.announcementTextEl) return;
        const eff = this.getEffectiveAnnouncement();
        const shouldShow = !!(anyVisible && !secondBarVisible && eff.enabled && eff.text.trim().length > 0);
        if (shouldShow) {
            let needsFit = false;
            if (!this._announcementVisible) {
                this.announcementContainer.style.display = 'flex';
                this._announcementVisible = true;
                needsFit = true;
            }
            if (this.announcementTextEl.textContent !== eff.text) {
                this.announcementTextEl.textContent = eff.text;
                needsFit = true;
            }
            if (needsFit) {
                this.fitAnnouncementText(true);
            }
        } else if (this._announcementVisible) {
            this.announcementContainer.style.display = 'none';
            this._announcementVisible = false;
        }
    }

    fitAnnouncementText(force = false) {
        if (!this._announcementVisible || !this.announcementContainer || !this.announcementTextEl) return;
        const container = this.announcementContainer;
        const textEl = this.announcementTextEl;
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w <= 0 || h <= 0) return;

        const currentText = textEl.textContent || "";
        if (!force && currentText === this._lastFittedText && w === this._lastFittedWidth && h === this._lastFittedHeight) {
            return;
        }

        const style = window.getComputedStyle(container);
        const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
        const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
        const maxW = Math.floor(w - padX);
        const maxH = Math.floor(h - padY);
        if (maxW <= 0 || maxH <= 0) return;

        let low = 8;
        let high = Math.min(72, Math.max(12, Math.floor(maxH * 0.62)));
        if (high < low) high = low;
        let best = low;

        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            textEl.style.fontSize = `${mid}px`;
            if (textEl.scrollHeight <= maxH && textEl.scrollWidth <= maxW) {
                best = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        textEl.style.fontSize = `${best}px`;
        this._lastFittedText = currentText;
        this._lastFittedWidth = w;
        this._lastFittedHeight = h;
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
        this.totalTimeSettingVisible = !!visible;
        if (!this.totalTimeContainer) return;
        if (!this.totalTimeSettingVisible) {
            if (this.lastState.totalTimeVisible !== false) {
                this.totalTimeContainer.style.display = 'none';
                this.lastState.totalTimeVisible = false;
            }
        } else {
            this.updateTotalTimeRemaining(this.getExactNow());
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
        if (this.barStyle === chosen && this._barStyleApplied) return;
        this.barStyle = chosen;
        this._barStyleApplied = true;

        this.trackerItems.forEach(item => {
            validStyles.forEach(s => item.bar.classList.remove(`bar-style-${s}`));
            item.bar.classList.add(`bar-style-${chosen}`);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const tracker = new ScheduleTracker();
    window.mvhsTracker = tracker;
    tracker.init();
});
