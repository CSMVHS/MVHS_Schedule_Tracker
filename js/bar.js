/**
 * MVHS Schedule Tracker
 * Optimized & Refactored for Hallway TV Display
 */

const CONFIG = {
    WEATHER_API_KEY: "YOUR_OPENWEATHERMAP_API_KEY",
    CITY: "Highlands Ranch, CO",
    LAT: 39.5481,
    LON: -104.9739,
    SCHOOL_END_TIME: "14:50"
};

class ScheduleTracker {
    constructor() {
        this.schedules = [];
        this.weatherInterval = null;
        this.lastDay = new Date().getDay();
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
        const element = document.querySelector(".total-time-remaining");
        const container = document.querySelector(".total-time-left");

        if (element && container) {
            if (diff <= 0) {
                container.style.display = 'none';
            } else {
                container.style.display = 'block';
                const totalMinutes = Math.ceil(diff / 60000);
                const h = Math.floor(totalMinutes / 60);
                const m = totalMinutes % 60;
                element.textContent = `${h}h ${m}m`;
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
        try {
            const res = await fetch('api/schedules.json');
            const data = await res.json();
            const now = new Date();
            const dateStr = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
            const special = data.schedules.find(s => s.date === dateStr);

            if (special) {
                this.schedules = special.times.map(t => this.parseScheduleString(t));
            } else {
                this.schedules = this.getDefaultSchedules(now.getDay());
            }
        } catch (e) {
            console.warn("Failed to load schedules from API, using defaults", e);
            this.schedules = this.getDefaultSchedules(new Date().getDay());
        }
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
        const fridayS1 = "7:00;Happy Friday!;7:30,7:30;Teacher Office Hours;7:45,7:45;Period 1;8:36,8:36;Passing Period;8:41,8:41;Period 2;9:32,9:32;Passing Period;9:37,9:37;Period 3;10:28,10:28;Passing Period;10:33,10:33;Period 4;11:24,11:24;A Lunch;12:02,12:02;Passing Period;12:07,12:07;Period 5;12:58,12:58;Passing Period;13:03,13:03;Period 6;13:54,13:54;Passing Period;13:59,13:59;Period 7;14:50";
        const fridayS2 = "11:24;Passing Period;11:29,11:29;Period 5;12:20,12:20;B Lunch;12:58";

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
            case 0: case 5: case 6: // Sunday / Friday / Saturday
                s1 = fridayS1;
                s2 = fridayS2;
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

    startUpdateLoop() {
        const loop = () => {
            this.updateUI();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    updateUI() {
        const now = new Date();

        // 1. Synchronized Header Updates (Clock & Date)
        // Reload schedules if the day changes
        if (now.getDay() !== this.lastDay) {
            this.lastDay = now.getDay();
            this.loadSchedules();
        }

        // Date: MMM DD
        const dateDisplay = document.getElementById("date-display");
        if (dateDisplay) {
            dateDisplay.textContent = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }

        // Time: HH:MM:SS (12h)
        const clockDisplay = document.getElementById("clock-display");
        if (clockDisplay) {
            let h = now.getHours();
            const m = String(now.getMinutes()).padStart(2, '0');
            const s = String(now.getSeconds()).padStart(2, '0');
            h = h % 12 || 12;
            // Ensure no spaces around colons
            clockDisplay.textContent = `${String(h).padStart(2, '0')}:${m}:${s}`;
        }

        // 2. Synchronized Total Time Remaining
        this.updateTotalTimeRemaining(now);

        // 3. Synchronized Period Updates
        let anyVisible = false;

        this.schedules.forEach((periods, idx) => {
            const container = document.querySelectorAll('.tracker-item')[idx];
            if (!container) return;

            const titleEl = container.querySelector('.period');
            const barEl = container.querySelector('.progress_bar');
            const timeEl = container.querySelector('.progress_time');

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
                    const start = this.parseTime(currentPeriod.start, now);
                    const end = this.parseTime(currentPeriod.end, now);
                    const total = end - start;
                    const elapsed = now - start;
                    const percent = Math.min(100, (elapsed / total) * 100);
                    barEl.style.width = `${percent}%`;

                    const remaining = Math.max(0, Math.ceil((end - now) / 1000));
                    const rm = Math.floor(remaining / 60);
                    const rs = remaining % 60;
                    timeEl.textContent = rm > 0 ? `${rm}m ${rs}s` : `${rs}s`;
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
                        timeEl.textContent = rh > 0 ? `${rh}h ${rm}m` : `${rm}m`;
                    }
                }
            }
        });

        const endEl = document.getElementById('end');
        if (!anyVisible) {
            endEl.style.display = 'block';
            document.querySelector('.schedule-wrapper').style.display = 'none';
        } else {
            endEl.style.display = 'none';
            document.querySelector('.schedule-wrapper').style.display = 'flex';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const tracker = new ScheduleTracker();
    tracker.init();
});
