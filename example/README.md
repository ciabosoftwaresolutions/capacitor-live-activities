# Live Activities — Example App

A minimal Capacitor 6 app that exercises every method of the
`@ciabosoftwaresolutions/capacitor-live-activities` plugin.

---

## Quick start

```bash
cd example
npm install

# Build the plugin first (from the repo root)
cd .. && npm install && npm run build && cd example

# Build the web layer
npm run build
```

---

## Run on iOS

```bash
# Add the iOS platform (first time only)
npx cap add ios

# Sync web assets + plugin
npm run sync:ios

# Open Xcode
npm run open:ios
```

Then in Xcode:

1. Follow the **Widget Extension Setup** steps in the root `README.md`
   (add target, copy `LiveActivityWidget.swift`, set up App Group).
2. Select your device / simulator (Live Activities require a **physical
   device** on iOS 16.2+).
3. **Product → Run**.

---

## Run on Android

```bash
# Add the Android platform (first time only)
npx cap add android

# Sync
npm run sync:android

# Open Android Studio
npm run open:android
```

Then in Android Studio: **Run → Run 'app'**.

Live Updates chip is visible on a device running **Android 16 (API 36)+**.
On earlier versions a standard sticky notification is shown instead.

---

## What each section tests

| Section | What it calls |
|---|---|
| Platform support | `isSupported()`, `areActivitiesEnabled()` |
| Start | `start({ attributes, state })` |
| Update | `update({ activityId, state, alertTitle, alertBody })` |
| End | `end({ activityId, finalState, dismissalPolicy })` |
| Active activities | `getActiveActivities()` |
| Event log | `addListener('activityStateChanged', …)` |

The Activity ID is auto-filled after a successful Start so you can tap
Update and End without copy-pasting.
