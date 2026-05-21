# Birthday Wall — Android home-screen widget

Self-contained Android Studio project that turns the wall into a real
live home-screen widget. Shows the next birthday + countdown + a random
photo, refreshes every ~15 minutes, tap to open the wall in your
browser.

Hits the same `/functions/v1/widget-data` Edge Function as the iOS
Scriptable widget — same passcode gates access, same data shape.

## Build it (one-time, on a laptop)

1. Install [Android Studio](https://developer.android.com/studio)
   (free). It bundles its own Gradle and Java, so no separate setup.
2. **File → Open** → point at this `android/` folder. Wait for the
   first Gradle sync to finish (1–3 minutes the first time, the IDE
   downloads the Android SDK pieces it needs).
3. **Build → Build App Bundle(s) / APK(s) → Build APK(s)**.
4. When the "build complete" toast appears, click **locate** — the APK
   is at `android/app/build/outputs/apk/debug/app-debug.apk`.

## Install on an Android phone

You don't need a Play Store dev account ($25 / one-time) — sideloading
is free.

1. On the phone: **Settings → About phone → Build number** → tap 7
   times until "you are now a developer".
2. **Settings → System → Developer options** → enable **USB debugging**.
3. Plug the phone in. Accept the trust prompt on the phone.
4. In Android Studio with the project open, hit the green ▶ **Run**
   button while the phone is selected — installs and launches the app.

Or share the APK file (`app-debug.apk`) with your Android-using friends
via AirDrop / WhatsApp / Telegram. They tap it on their phone, accept
the "install from this source" prompt, done.

## Add the widget to the home screen

1. After install, long-press an empty spot on the home screen.
2. Tap **Widgets**.
3. Scroll to **Birthday Wall** → drag the medium widget onto your
   home screen.
4. The setup screen appears — enter the passcode. Save.
5. The widget starts filling in within a few seconds.

To change the passcode later: remove the widget and re-add it.

## What it does

- Calls `https://adgqourcxbjkupdrqpyt.supabase.co/functions/v1/widget-data`
  with the saved passcode every ~15 minutes (Android's `WorkManager`
  may delay this slightly to save battery; minimum interval the OS
  allows is 15 min).
- Shows next 3 birthdays with countdown.
- Shows a randomly picked photo from the wall.
- Tap the widget to open the wall in the browser.

## What it does NOT do

- No background sync of new uploads — just the snapshot returned by
  the Edge Function each refresh cycle.
- No editing/uploading from the widget. Tap to jump to the website
  for that.
