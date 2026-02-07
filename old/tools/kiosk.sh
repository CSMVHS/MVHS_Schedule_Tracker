#!/bin/sh

unclutter -idle 0 &
/usr/bin/chromium-browser --noerrdialogs --disable-infobars --kiosk csmvhs.github.io/MVHS_Schedule_Tracker
