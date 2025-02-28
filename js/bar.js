class ProgressBar {
    constructor(bar, statusText, container, title, schedule){
        this.bar = bar;
        this.container = container;
        this.timeLeftStatus = statusText;
        this.title = title;
        this.schedule = schedule;
    }

    getSchedule(){
        return this.schedule;
    }

    setSchedule(schedule){
        this.schedule = schedule;
    }

    startMoving(){
        const fps = 1000 / 30;
        this.interval = setInterval(ProgressBar.updateBar, fps, this);
    }

    endOfInterval(){
	document.getElementById('end').style.display = "block";
        this.container.style.display = "none";
        this.title.style.display = "none";
        clearInterval(this.interval);
        this.schedule.nextPeriod();
        this.startMoving();
    }

    // Fill in the text with the time left
    static updateTimeLeft(bar, millisLeft){
        if(bar.timeLeftStatus == null){
            return;
        }
        bar.timeLeftStatus.innerHTML = "";

        // Extra 1000 make it not go into -1 seconds
        var secondsLeft = Math.floor((millisLeft + 1000) / 1000);
        var minutesLeft = Math.floor(secondsLeft / 60);
        var hoursLeft = Math.floor(minutesLeft/60);

        // Only seconds left, no need to print the others
        if(secondsLeft < 60){
            bar.timeLeftStatus.innerHTML = secondsLeft + " second";
            if(secondsLeft != 1){
                bar.timeLeftStatus.innerHTML += "s"
            }

            return;
        }

        // Hour
        if(minutesLeft > 59){
            bar.timeLeftStatus.innerHTML = hoursLeft + " hour";
            if(hoursLeft != 1){
                bar.timeLeftStatus.innerHTML += "s";
            }
            minutesLeft = minutesLeft - hoursLeft * 60;
        }

        // Always place minutes regardless of hour, unless 0
        if(minutesLeft > 0){
            bar.timeLeftStatus.innerHTML += " " + minutesLeft + " minute";
            if(minutesLeft != 1){
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
	if(Date.now() >= endFullTime){
	    document.getElementById('end').style.display = "block";
	    console.log("end of interval");
	    console.log(endFullTime);
	    console.log(Date.now());
	}	

        // Nothing to do right now: make blank
        if(Date.now() < start){
            bar.container.style.display = "none";
            bar.title.style.display = "none";
            return;
        }
        bar.container.style.display = "block";
        bar.title.style.display = "block";
	document.getElementById('end').style.display = "none";

        bar.title.innerHTML = bar.schedule.getCurrentName();

        ProgressBar.updateTimeLeft(bar, end - Date.now());
        bar.bar.style.width = (elapsed/length * 100) + "%"; 

        if(elapsed/length >= 1){
            bar.bar.style.width = "100%"; 
            bar.endOfInterval();
        }
    }
}

// csv: startTime;Name;endTime,<next entry> (24-hour time)
// ex: 7:34;Period 1;8:28
class Schedule {
    constructor(str){
        this.periods = str.split(",");
        this.pIndex = 0;
        this.updateTimes();
    }

    updateTimes(){
        var parts = this.periods[this.pIndex].split(";");
        var start = parts[0].split(":");
        var end = parts[2].split(":");
	var endPart = this.periods[this.periods.length - 1].split(";"); 
	var endTimePart = endPart[2].split(":");

        this.name = parts[1];

        var now = new Date();
        this.startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), start[0], start[1]);
        this.endTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), end[0], end[1]);
        this.endTimeFull = new Date(now.getFullYear(), now.getMonth(), now.getDate(), endTimePart[0], endTimePart[1]);
    }

    getCurrentStart(){
        return this.startTime;
    }

    getCurrentEnd(){
        return this.endTime;
    }

    getCurrentName(){
        return this.name;
    }

    getFullEnd(){
	return this.endTimeFull;
    }

    nextPeriod(){
        this.pIndex++;
        this.updateTimes();
    }
}

// Show the bar moving over a one minute period
function startBar(schedule){
    const oneMinute = 1000 * 60;

    var progress = document.getElementsByClassName("progress_container");
    var titles = document.getElementsByClassName("period");
    var topBar = new ProgressBar(progress[0].firstElementChild, progress[0].lastElementChild, progress[0], titles[0], schedule[0]);
    topBar.startMoving();

    var bottomBar = new ProgressBar(progress[1].firstElementChild, progress[1].lastElementChild, progress[1], titles[1], schedule[1]);
    bottomBar.startMoving();
}

function changeDate(){
    let todayDate = new Date().toLocaleDateString('en-BG', {weekday:"long",  year:"numeric", month:"short", day:"numeric"});

    document.getElementById('date').textContent = todayDate;
}

window.addEventListener('DOMContentLoaded', changeDate);
setInterval(changeDate, 60000);

function dateSchedule(){
    var now = new Date();
    var weekDay = now.getDay();
    var schedule = [null, null];

    switch(weekDay){
	case 1://Monday
	case 2://Tuesday
	case 5://Friday
		/*
  		console.log("Normal");
		schedule[0] = new Schedule("7:34;Period 1;8:28,8:28;Passing Period;8:32,8:32;Period 2;9:26,9:26;Passing Period;9:30,9:30;Period 3;10:24,10:24;Passing Period;10:28,10:28;Period 4;11:22,11:22;A Lunch;11:56,11:56;Passing Period;12:00,12:00;Period 5;12:54,12:54;Passing Period;12:58,12:58;Period 6;13:52,13:52;Passing Period;13:56,13:56;Period 7;14:50");
		schedule[1] = new Schedule("11:22;Passing Period;11:26,11:26;Period 5;12:20,12:20;B Lunch;12:54");
		break;
  		*/
		console.log("Odd Block");
		schedule[0] = new Schedule("7:53;Period 1;9:25,9:25;Passing Period;9:30,9:30;Period 3;11:02,11:02;A Lunch;11:36,11:36;Passing Period;11:41,11:41;Period 5;13:13,13:13;Passing Period;13:18,13:18;Period 7;14:50");
		schedule[1] = new Schedule("11:02;Passing Period;11:07,11:07;Period 5;12:39,12:39;B Lunch;13:13");
		break;
	case 3://Wednesday
		console.log("Odd Block");
		schedule[0] = new Schedule("7:53;Period 1;9:25,9:25;Passing Period;9:30,9:30;Period 3;11:02,11:02;A Lunch;11:36,11:36;Passing Period;11:41,11:41;Period 5;13:13,13:13;Passing Period;13:18,13:18;Period 7;14:50");
		schedule[1] = new Schedule("11:02;Passing Period;11:07,11:07;Period 5;12:39,12:39;B Lunch;13:13");
		break;
	case 4://Thursday
		console.log("Even Block");
		schedule[0] = new Schedule("7:34;SOAR;8:55,8:55;Passing Period;9:00,9:00;Advisement;9:25,9:25;Passing Period;9:30,9:30;Period 2;11:02,11:02;A Lunch;11:36,11:36;Passing Period;11:41,11:41;Period 4;13:13,13:13;Passing Period;13:18,13:18;Period 6;14:50")
		schedule[1] = new Schedule("11:02;Passing Period;11:07,11:07;Period 4;12:39,12:39;B Lunch;13:13");
		break;
    }

    startBar(schedule);
}

function getSchedules(){
    var request = new XMLHttpRequest();
    var now = new Date();
    var weekDay = now.getDay();
    
    //Grab latest schedule
    const hostname = window.location.hostname;
    request.open("GET", "api/schedules.json");
    request.send();

    request.onload = function () {
        if(request.status === 404){
            dateSchedule();
            return;
        }

        var obj = JSON.parse(request.responseText);
        var index = -1;

        //Special day
        var dateStr = now.getMonth()+1 + "/" + now.getDate() + "/" + now.getFullYear();
        for(var i = 0; i < obj.schedules.length; i++){
            if(obj.schedules[i].date == dateStr){
                index = i;
                break;
            }
        }

        if(index == -1){
            dateSchedule();
            return;
        }

        var schedule = [];
        schedule[0] = new Schedule(obj.schedules[index].times[0]);
        schedule[1] = new Schedule(obj.schedules[index].times[1]);
        startBar(schedule);
    }

    //Fallback schedules
    request.onerror = function () {
        dateSchedule();
    }
}

function reloadPage(hour){
    const hours24 = 1000 * 60 * 60 * 24;
    var date = new Date(Date.now() + hours24); 
    date.setHours(hour);
    time = date.getTime() - Date.now();

    setTimeout(function() {
        location.reload();
    }, time);
}

window.addEventListener('DOMContentLoaded', getSchedules);
setInterval(getSchedules, 1000*60*60*24);
reloadPage(7);
