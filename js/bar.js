var cancelProgress = "norm";
let persistentBack = localStorage.getItem("persistentBack");
if (!persistentBack) {
    localStorage.setItem("persistentBack", "false");
}

class ProgressBar {
    constructor(bar, statusText, container, title, schedule) {
        this.bar = bar;
        this.container = container;
        this.timeLeftStatus = statusText;
        this.title = title;
        this.schedule = schedule;
    }

    getSchedule() {
        return this.schedule;
    }

    setSchedule(schedule) {
        this.schedule = schedule;
    }

    startMoving() {
        const fps = 1000 / 30;
        this.interval = setInterval(ProgressBar.updateBar, fps, this);
    }

    endOfInterval() {
        document.getElementById("end").style.display = "block";
        this.container.style.display = "none";
        this.title.style.display = "none";
        clearInterval(this.interval);
        this.schedule.nextPeriod();
        this.startMoving();
    }

    // Fill in the text with the time left
    static updateTimeLeft(bar, millisLeft) {
        if (bar.timeLeftStatus == null) {
            return;
        }
        bar.timeLeftStatus.innerHTML = "";

        // Extra 1000 make it not go into -1 seconds
        var secondsLeft = Math.floor((millisLeft + 1000) / 1000);
        var minutesLeft = Math.floor(secondsLeft / 60);
        var hoursLeft = Math.floor(minutesLeft / 60);

        // Only seconds left, no need to print the others
        if (secondsLeft < 60) {
            bar.timeLeftStatus.innerHTML = secondsLeft + " second";
            if (secondsLeft != 1) {
                bar.timeLeftStatus.innerHTML += "s";
            }

            return;
        }

        // Hour
        if (minutesLeft > 59) {
            bar.timeLeftStatus.innerHTML = hoursLeft + " hour";
            if (hoursLeft != 1) {
                bar.timeLeftStatus.innerHTML += "s";
            }
            minutesLeft = minutesLeft - hoursLeft * 60;
        }

        // Always place minutes regardless of hour, unless 0
        if (minutesLeft > 0) {
            bar.timeLeftStatus.innerHTML += " " + minutesLeft + " minute";
            if (minutesLeft != 1) {
                bar.timeLeftStatus.innerHTML += "s";
            }
        }
    }

    // Convert the dates into miliseconds, then get a percentage completion
    static updateBar(bar) {
        var start = bar.schedule.getCurrentStart().getTime();
        var end = bar.schedule.getCurrentEnd().getTime();
        var length = end - start;
        var elapsed = Date.now() - start;
        var endFullTime = bar.schedule.getFullEnd().getTime();

        //Ending Add
        if (Date.now() >= endFullTime) {
            document.getElementById("end").style.display = "block";
            console.log("end of interval");
            console.log(endFullTime);
            console.log(Date.now());
        }

        // Nothing to do right now: make blank
        if (Date.now() < start) {
            bar.container.style.display = "none";
            bar.title.style.display = "none";
            return;
        }
        bar.container.style.display = "block";
        bar.title.style.display = "block";
        document.getElementById("end").style.display = "none";

        bar.title.innerHTML = bar.schedule.getCurrentName();

        if (cancelProgress == "norm") {
            ProgressBar.updateTimeLeft(bar, end - Date.now());
        }

        bar.bar.style.width = (elapsed / length) * 100 + "%";

        if (elapsed / length >= 1) {
            bar.bar.style.width = "100%";
            bar.endOfInterval();
        }
    }
}

// csv: startTime;Name;endTime,<next entry> (24-hour time)
// ex: 7:34;Period 1;8:28
class Schedule {
    constructor(str) {
        this.periods = str.split(",");
        this.pIndex = 0;
        this.updateTimes();
    }

    updateTimes() {
        var parts = this.periods[this.pIndex].split(";");
        var start = parts[0].split(":");
        var end = parts[2].split(":");
        var endPart = this.periods[this.periods.length - 1].split(";");
        var endTimePart = endPart[2].split(":");

        this.name = parts[1];

        var now = new Date();
        this.startTime = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            start[0],
            start[1],
        );
        this.endTime = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            end[0],
            end[1],
        );
        this.endTimeFull = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            endTimePart[0],
            endTimePart[1],
        );
    }

    getCurrentStart() {
        return this.startTime;
    }

    getCurrentEnd() {
        return this.endTime;
    }

    getCurrentName() {
        return this.name;
    }

    getFullEnd() {
        return this.endTimeFull;
    }

    nextPeriod() {
        this.pIndex++;
        this.updateTimes();
    }
}

// Show the bar moving over a one minute period
function startBar(schedule) {
    const oneMinute = 1000 * 60;

    var progress = document.getElementsByClassName("progress_container");
    var titles = document.getElementsByClassName("period");
    var topBar = new ProgressBar(
        progress[0].firstElementChild,
        progress[0].lastElementChild,
        progress[0],
        titles[0],
        schedule[0],
    );
    topBar.startMoving();
    var bottomBar = new ProgressBar(
        progress[1].firstElementChild,
        progress[1].lastElementChild,
        progress[1],
        titles[1],
        schedule[1],
    );
    bottomBar.startMoving();
}

function changeDate() {
    let todayDate = new Date().toLocaleDateString("en-BG", {
        weekday: "long",
        year: "numeric",
        month: "short",
        day: "numeric",
    });

    document.getElementById("date").textContent = todayDate;
}

window.addEventListener("DOMContentLoaded", changeDate);
setInterval(changeDate, 60000);

function dateSchedule() {
    var now = new Date();
    var weekDay = now.getDay();
    var schedule = [null, null];

    switch (weekDay) {

    case 1: //Monday
        schedule[0] = new Schedule(
            "7:00;Good Morning!;7:30,7:30;Teacher Office Hours;7:45,7:45;Period 1;9:19,9:19;Passing Period;9:24,9:24;Period 2;10:58,10:58;A Lunch;11:32,11:32;Passing Period;11:37,11:37;Period 3;13:11,13:11;Passing Period;13:16,13:16;Period 4;14:50"
         );
        schedule[1] = new Schedule(
             "10:58;Passing Period;11:03,11:03;Period 3;12:37,12:37;B Lunch;13:11"
         );

        // DELAY
        // schedule[0] = new Schedule("9:00;Good Morning!;9:15,9:15;Period 1;10:25,10:25;Passing Period;10:30,10:30;Period 2;11:40,11:40;A Lunch;12:20,12:20;Passing Period;12:25,12:25;Period 3;13:35,13:35;Passing Period;13:40,13:40;Period 4;14:50");
        // schedule[1] = new Schedule("11:40;Passing Period;11:45,11:45;Period 3;12:55,12:55;B Lunch;13:35");

        break;


    case 2: //Tuesday
         schedule[0] = new Schedule(
            "7:00;Good Morning!;7:30,7:30;Teacher PLC;8:05,8:05;Period 5;9:39,9:39;Homeroom;9:49,9:49;S.A.S.;10:56,10:56;A Lunch;11:32,11:32;Passing Period;11:37,11:37;Period 6;13:11,13:11;Passing Period;13:16,13:16;Period 7;14:50"
         );
         schedule[1] = new Schedule(
           "10:56;Passing Period;11:01,11:01;Period 6;12:35,12:35;B Lunch;13:11"
        );


        // DELAY
        // schedule[0] = new Schedule("7:00;Good Morning!;9:00,9:00;Eagle Time;9:30,9:30;Passing Period;9:35,9:35;Period 5;11:05,11:05;A Lunch;11:40,11:40;Passing Period;11:45,11:45;Period 6;13:15,13:15;Passing Period;13:20,13:20;Period 7;14:50");
        // schedule[1] = new Schedule("11:05;Passing Period;11:10,11:10;Period 6;12:40,12:40;B Lunch;13:15");

        break;



    case 3: // Wednesday
         schedule[0] = new Schedule(
            "7:00;Good Morning!;7:30,7:30;Teacher Office Hours;7:45,7:45;Period 1;9:19,9:19;Passing Period;9:24,9:24;Period 2;10:58,10:58;A Lunch;11:32,11:32;Passing Period;11:37,11:37;Period 3;13:11,13:11;Passing Period;13:16,13:16;Period 4;14:50"
         );
         schedule[1] = new Schedule(
             "10:58;Passing Period;11:03,11:03;Period 3;12:37,12:37;B Lunch;13:11"
        );

        // DELAY
        // schedule[0] = new Schedule("9:00;Good Morning!;9:15,9:15;Period 1;10:25,10:25;Passing Period;10:30,10:30;Period 2;11:40,11:40;A Lunch;12:20,12:20;Passing Period;12:25,12:25;Period 3;13:35,13:35;Passing Period;13:40,13:40;Period 4;14:50");
        // schedule[1] = new Schedule("11:40;Passing Period;11:45,11:45;Period 3;12:55,12:55;B Lunch;13:35");

        break;


    case 4: //Thursday
         schedule[0] = new Schedule(
             "7:00;Good Morning!;7:30,7:30;Teacher PLC;8:05,8:05;Period 5;9:39,9:39;Homeroom;9:49,9:49;Eagle Time;10:56,10:56;A Lunch;11:32,11:32;Passing Period;11:37,11:37;Period 6;13:11,13:11;Passing Period;13:16,13:16;Period 7;14:50"
         );
        schedule[1] = new Schedule(
            "10:56;Passing Period;11:01,11:01;Period 6;12:35,12:35;B Lunch;13:11"
         );

        // DELAY
        // schedule[0] = new Schedule("7:00;Good Morning!;9:00,9:00;Eagle Time;9:30,9:30;Passing Period;9:35,9:35;Period 5;11:05,11:05;A Lunch;11:40,11:40;Passing Period;11:45,11:45;Period 6;13:15,13:15;Passing Period;13:20,13:20;Period 7;14:50");
        // schedule[1] = new Schedule("11:05;Passing Period;11:10,11:10;Period 6;12:40,12:40;B Lunch;13:15");

        break;


    case 5: //Friday

         schedule[0] = new Schedule(
            "7:00;Good Morning!;7:30,7:30;Teacher Office Hours;7:45,7:45;Period 1;9:19,9:19;Passing Period;9:24,9:24;Period 2;10:58,10:58;A Lunch;11:32,11:32;Passing Period;11:37,11:37;Period 3;13:11,13:11;Passing Period;13:16,13:16;Period 4;14:50"
         );
         schedule[1] = new Schedule(
             "10:58;Passing Period;11:03,11:03;Period 3;12:37,12:37;B Lunch;13:11"
        );

        break;
    }


    startBar(schedule);
}

function getSchedules() {
    var request = new XMLHttpRequest();
    var now = new Date();
    var weekDay = now.getDay();

    //Grab latest schedule
    const hostname = window.location.hostname;
    request.open("GET", "api/schedules.json");
    request.send();

    request.onload = function () {
        if (request.status === 404) {
            dateSchedule();
            return;
        }

        var obj = JSON.parse(request.responseText);
        var index = -1;

        //Special day
        var dateStr =
            now.getMonth() + 1 + "/" + now.getDate() + "/" + now.getFullYear();
        for (var i = 0; i < obj.schedules.length; i++) {
            if (obj.schedules[i].date == dateStr) {
                index = i;
                break;
            }
        }

        if (index == -1) {
            dateSchedule();
            return;
        }

        var schedule = [];
        schedule[0] = new Schedule(obj.schedules[index].times[0]);
        schedule[1] = new Schedule(obj.schedules[index].times[1]);
        startBar(schedule);
    };

    //Fallback schedules
    request.onerror = function () {
        dateSchedule();
    };
}

function reloadPage(hour) {
    const hours24 = 1000 * 60 * 60 * 24;
    var date = new Date(Date.now() + hours24);
    date.setHours(hour);
    time = date.getTime() - Date.now();

    setTimeout(function () {
        location.reload();
    }, time);
}

reloadPage(6);
reloadPage(7);

window.addEventListener("DOMContentLoaded", getSchedules);
setInterval(getSchedules, 1000 * 60 * 60 * 24);

const devLink =
    "https://script.google.com/macros/s/AKfycbwXkuEQVGKb4jCzP_fyWszaHTQ5cu3GQ1t_t8oOnZxthUvOA46gDeL7i5JqO2zKQ1dOFA/exec";
const alphabet = "abcdefghijkmnoprstuvwxyz";
const randomLetters = alphabet
    .split("")
    .sort(() => 0.5 - Math.random())
    .slice(0, 5)
    .join("");

let idSetStatus = localStorage.getItem("idSetStatus");
if (!idSetStatus) {
    localStorage.setItem("idSetStatus", "false");
}

let ignoreState = localStorage.getItem("ignoreState");
if (!ignoreState) {
    localStorage.setItem("ignoreState", "false");
}

let deviceId = localStorage.getItem("deviceId");
if (!deviceId) {
    deviceId = randomLetters;
    localStorage.setItem("deviceId", deviceId);
}

document.addEventListener("DOMContentLoaded", function() {
    let persistentBack = localStorage.getItem("persistentBack");
    if (persistentBack) {
        document.body.style.background = persistentBack;
    }
});

function testSystem(req) {
    if (req == deviceId) {
        document.body.style.background = "green";
    } else {
        document.body.style.background = "red";
    }
}

async function checkSheet() {
    if (ignoreState == "true") {
        return;
    }

    const response = await fetch(devLink); // Replace with your Google Apps Script URL
    const command = await response.text();

    if (command.startsWith("?redirect")) {
        const wantedId = command.substring(10);
        if (wantedId == deviceId) {
            window.location.replace("https://csmvhs.github.io/schedule");
        }
    }

    if (command.startsWith("ptest")) {
        const amount = command.substring(6);
        document.body.style.border = `${amount}px solid white`;
    } else if (command.startsWith("?ptest")) {
        const args = command.split(" ");
        const id = args[1];
        const setValue = args.slice(2).join(" ");
        if (id === deviceId) {
            document.body.style.border = `${setValue}px solid white`;
        }
    }

    if (command.startsWith("set")) {
        cancelProgress = "cancel";
        // Extract the number from the command, e.g., "set11" -> 11
        const minutes = command.substring(4);
        const elements = document.querySelectorAll(".progress_time");
        elements.forEach((el) => {
            el.textContent = `${minutes} minutes`;
        });
    } else if (command.startsWith("custom")) {
        cancelProgress = "cancel";
        const value = command.substring(7);
        const elements = document.querySelectorAll(".progress_time");
        const endEl = document.getElementById("end");
        elements.forEach((el) => {
            el.textContent = value;
        });
        endEl.textContent = value;
    } else if (command.startsWith(".back")) {
        // Missing closing parenthesis fixed here
        const value = command.substring(6);
        document.body.style.background = value;
    } else if (command === "refresh") {
        location.reload();
    } else if (command === "normal") {
        cancelProgress = "norm";
    } else if (command === ".reset") {
        const progressBar = document.querySelector(".progress_bar");
        progressBar.style.animationDuration = "";
        document.body.style.background = "";
    } else if (command.startsWith(".anim-length")) {
        const value = command.substring(13);
        const elements = document.querySelector(".progress_bar");
        elements.style.animationDuration = value;
    } else if (command === "id show") {
        document.querySelector(".id-wrap").style.display = "flex";
    } else if (command === "id hide") {
        document.querySelector(".id-wrap").style.display = "none";
    } else if (command == "id wipe delete-all") {
        localStorage.removeItem("deviceId");
        localStorage.setItem("idSetStatus", "false");
        location.reload();
    } else if (command.startsWith("id showonly")) {
        const value = command.substring(12);
        if (value === deviceId) {
            document.querySelector(".id-wrap").style.display = "flex";
        }
    } else if (command.startsWith("id hideonly")) {
        const value = command.substring(12);
        if (value === deviceId) {
            document.querySelector(".id-wrap").style.display = "none";
        }
    } else if (command.startsWith("id del")) {
        const value = command.substring(7);
        if (value === deviceId) {
            localStorage.removeItem("deviceId");
            localStorage.setItem("idSetStatus", "false");
            location.reload();
        }
    } else if (command.startsWith("?refresh")) {
        const value = command.substring(9);
        if (value === deviceId) {
            location.reload();
        }
    } else if (command.startsWith("?normal")) {
        const value = command.substring(8);
        if (value === deviceId) {
            cancelProgress = "norm";
        }
    } else if (command.startsWith("?rainbow")) {
        const value = command.substring(9);
        if (value === deviceId) {
            document.body.style.background =
                "linear-gradient(to bottom, red, yellow, #00FF00, blue, #FF00FF)";
        }
    } else if (command.startsWith("ignore")) {
        const value = command.substring(7);
        const pauseDuration = parseInt(value, 10) * 1000;
        ignoreState = true;
        localStorage.setItem("ignoreState", "true");
        setTimeout(() => {
            localStorage.setItem("ignoreState", "false");
        }, pauseDuration);
    } else if (command.startsWith("?back")) {
        const args = command.split(" ");
        const id = args[1];
        const backgroundValue = args.slice(2).join(" ");
        if (id === deviceId) {
            document.body.style.background = backgroundValue;
        }
    } else if (command.startsWith("?set")) {
        const args = command.split(" ");
        const id = args[1];
        const setValue = args.slice(2).join(" ");
        if (id === deviceId) {
            const elements = document.querySelectorAll(".progress_time");
            elements.forEach((el) => {
                el.textContent = `${setValue} minutes`;
            });
        }
    } else if (command.startsWith("?custom")) {
        const args = command.split(" ");
        const id = args[1];
        const setValue = args.slice(2).join(" ");
        if (id === deviceId) {
            cancelProgress = "cancel";
            const elements = document.querySelectorAll(".progress_time");
            const endEl = document.getElementById("end");
            elements.forEach((el) => {
                el.textContent = setValue;
            });
            endEl.textContent = setValue;
        }
    } else if (command.startsWith("id set")) {
        const args = command.split(" ");
        const oldId = args[2];
        const newId = args[3];
        if (deviceId === oldId) {
            localStorage.setItem("idSetStatus", "true")
            idSetStatus = "true";
            localStorage.setItem("deviceId", newId); // Update the deviceId in localStorage
            deviceId = newId; // Update the variable in the script
            location.reload(); // Reload the page to reflect the change
        }
    } else if (command === "refresh hard") {
        window.location.href = window.location.href.split('?')[0] + '?v=' + new Date().getTime();
    } else if (command === "wipe storage") {
        localStorage.clear();
    } else if (command === "id showunset") {
        idSetStatus = localStorage.getItem("idSetStatus");
        if (idSetStatus == "false") {
            document.querySelector(".id-wrap").style.display = "flex";
        }
    } else if (command.startsWith("?perback")) {
        const args = command.split(" ");
        const id = args[1];
        const setValue = args.slice(2).join(" ");
        if (id === deviceId) {
            localStorage.setItem("persistentBack", setValue);
            document.body.style.background = setValue;
        }
    } else if (command.startsWith(".psbg")) {
        const value = command.substring(6);
        cancelProgress = "norm";
        if (value == "snow") {
            document.body.style.background = "linear-gradient(70deg, #75d7f8, #d2f4ff)";
            document.documentElement.style.setProperty('--progress-bar-color-1', '#75d7f8');
            document.documentElement.style.setProperty('--progress-bar-color-2', '#d2f4ff');
        } else if (value == "default") {
            document.body.style.background = "linear-gradient(70deg, #01401E, #B19539)";
            document.documentElement.style.setProperty('--progress-bar-color-1', '#01401E');
            document.documentElement.style.setProperty('--progress-bar-color-2', '#B19539');
        }
    }

    document.getElementById("identification").textContent = deviceId;
}

setInterval(checkSheet, 2500); // Checks every ~3 seconds

document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("qrcode")) {
        document.getElementById("qrcode").addEventListener("click", () => {
            window.open("https://austinkden.github.io/ww25", "_blank");
        })
    }
})

// padding: top/bottom 16, left/right 28

function updateTotalTimeRemaining() {
    const now = new Date();
    const endOfDay = new Date();
    
    // Set end time to 14:50:00
    endOfDay.setHours(14, 50, 0, 0);

    const element = document.querySelector("p.total-time-remaining");
    if (!element) return;

    const diff = endOfDay - now;

    if (diff <= 0) {
        element.textContent = "0h 0m";
        return;
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    element.textContent = `${hours}h ${minutes}m`;
}

// Run immediately on load and then every second
window.addEventListener("DOMContentLoaded", updateTotalTimeRemaining);
setInterval(updateTotalTimeRemaining, 1000);
