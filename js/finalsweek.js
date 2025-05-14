case 1: //Monday
	schedule[0] = new Schedule(
		"7:00;Good Morning!;7:45,7:45;Period 1;9:15,9:15;Moving Up Assembly;9:50,9:50;Passing Period;9:55,9:55;Period 2;11:25,11:25;Passing Period;11:30,11:30;Homeroom;14:50",
	);
schedule[1] = new Schedule(
	"12:30;Lunch;13:00",
);
break;


case 2: //Tuesday
	schedule[0] = new Schedule(
		"7:00;Good Morning!;7:30,7:30;Teacher PLC;8:05,8:05;Period 5;9:39,9:39;Homeroom;9:49,9:49;S.A.S.;10:56,10:56;A Lunch;11:32,11:32;Passing Period;11:37,11:37;Period 6;13:11,13:11;Passing Period;13:16,13:16;Period 7;14:50",
	);
schedule[1] = new Schedule(
	"10:56;Passing Period;11:01,11:01;Period 6;12:35,12:35;B Lunch;13:11",
);
break;

// case 2://Tuesday (delayed)
//	schedule[0] = new Schedule("7:00;Good Morning!;9:00,9:00;Eagle Time;9:30,9:30;Passing Period;9:35,9:35;Period 5;11:05,11:05;A Lunch;11:40,11:40;Passing Period;11:45,11:45;Period 6;13:15,13:15;Passing Period;13:20,13:20;Period 7;14:50");
//  	schedule[1] = new Schedule("11:05;Passing Period;11:10,11:10;Period 6;12:40,12:40;B Lunch;13:15");
//   break;

case 3: //Wednesday
	schedule[0] = new Schedule(
		"7:00;Good Morning!;7:30,7:30;Teacher Office Hours;7:45,7:45;Period 1;9:19,9:19;Passing Period;9:24,9:24;Period 2;10:58,10:58;A Lunch;11:32,11:32;Passing Period;11:37,11:37;Period 3;13:11,13:11;Passing Period;13:16,13:16;Period 4;14:50",
	);
schedule[1] = new Schedule(
	"10:58;Passing Period;11:03,11:03;Period 3;12:37,12:37;B Lunch;13:11",
);
break;

//         case 3://Wednesday (delayed)
//     	schedule[0] = new Schedule("9:00;Good Morning!;9:15,9:15;Period 1;10:25,10:25;Passing Period;10:30,10:30;Period 2;11:40,11:40;A Lunch;12:20,12:20;Passing Period;12:25,12:25;Period 3;13:35,13:35;Passing Period;13:40,13:40;Period 4;14:50");
//       	schedule[1] = new Schedule("11:40;Passing Period;11:45,11:45;Period 3;12:55,12:55;B Lunch;13:35");
//      	break;

case 4: //Thursday
	schedule[0] = new Schedule(
		"7:00;Good Morning!;7:30,7:30;Teacher PLC;8:05,8:05;Period 5;9:39,9:39;Homeroom;9:49,9:49;Eagle Time;10:56,10:56;A Lunch;11:32,11:32;Passing Period;11:37,11:37;Period 6;13:11,13:11;Passing Period;13:16,13:16;Period 7;14:50",
	);
schedule[1] = new Schedule(
	"10:56;Passing Period;11:01,11:01;Period 6;12:35,12:35;B Lunch;13:11",
);
// (DELAY) schedule[0] = new Schedule("7:00;Good Morning!;9:00,9:00;Eagle Time;9:30,9:30;Passing Period;9:35,9:35;Period 5;11:05,11:05;A Lunch;11:40,11:40;Passing Period;11:45,11:45;Period 6;13:15,13:15;Passing Period;13:20,13:20;Period 7;14:50");
// (DELAY) schedule[1] = new Schedule("11:05;Passing Period;11:10,11:10;Period 6;12:40,12:40;B Lunch;13:15");
break;

case 5: //Friday

	schedule[0] = new Schedule(
		"7:00;Happy Friday!;7:30,7:30;Teacher Office Hours;7:45,7:45;Period 1;8:36,8:36;Passing Period;8:41,8:41;Period 2;9:32,9:32;Passing Period;9:37,9:37;Period 3;10:28,10:28;Passing Period;10:33,10:33;Period 4;11:24,11:24;A Lunch;12:02,12:02;Passing Period;12:07,12:07;Period 5;12:58,12:58;Passing Period;13:03,13:03;Period 6;13:54, 13:54;Passing Period;13:59,13:59;Period 7;14:50",

	);
schedule[1] = new Schedule(
	"11:24;Passing Period;11:29,11:29;Period 5;12:20,12:20;B Lunch;12:58",
);


break;