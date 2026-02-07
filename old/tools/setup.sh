#!/bin/sh

mkdir -p $HOME/.config/autostart

# Download files
/usr/bin/wget https://csmvhs.github.io/MVHS_Schedule_Tracker/tools/kiosk.sh -O $HOME/kiosk.sh
/usr/bin/wget https://csmvhs.github.io/MVHS_Schedule_Tracker/tools/kiosk.desktop -O $HOME/.config/autostart/kiosk.desktop
sudo apt install unclutter
/usr/bin/chmod a+x $HOME/kiosk.sh

# Enable egl for chromium
/usr/bin/echo 'export CHROMIUM_FLAGS="$CHROMIUM_FLAGS --use-gl=egl"' | /usr/bin/sudo /usr/bin/tee /etc/chromium.d/egl

echo Please reboot or run kiosk.sh to start kiosk.
