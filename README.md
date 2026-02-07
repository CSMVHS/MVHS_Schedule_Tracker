## Official MVHS Schedule Tracker App
[Website Link](https://csmvhs.github.io/MVHS_Schedule_Tracker/)

For information on modifying the schedules, read guide.pdf.

## Remote Management Setup (Firebase)
To use the remote control features, you need to set up a free Firebase project:

1. Go to [Firebase Console](https://console.firebase.google.com/).
2. Create a new project (e.g., "MVHS Schedule").
3. Add a "Web App" to the project.
4. Copy the `firebaseConfig` object and paste it into the `FIREBASE` object in `js/bar.js` AND `admin/admin.js`.
5. In the Firebase Sidebar, go to **Build > Realtime Database** and create a database.
6. Set the **Rules** to:
   ```json
   {
     "rules": {
       ".read": true,
       ".write": true
     }
   }
   ```
   *(Note: For production, you should secure these rules with Firebase Auth, but this allows quick setup).*

## Admin Dashboard
The admin dashboard is located at `/admin`.
- **Default Password**: `change_me`
- To change the password, edit the `ADMIN_PASSWORD` variable at the top of `admin/admin.js`.

### Features
- **Monitor**: See which TVs are online, their names, and current periods.
- **Rename**: Give each TV a friendly name (e.g., "Cafeteria").
- **Theme**: Change the gold accent color remotely.
- **Time Offset**: Shift the clock forward or backward in minutes for specific TVs.
- **Override**: Send full-screen messages (Black screen, White text) or change period names.
- **Actions**: Remotely refresh the browser tab on any or all devices.
