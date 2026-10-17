# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/).

## [1.1.0] — 2026-10-17

### Added

- **Action buttons.** New `state.actions` (`{ id, title, opensApp? }`) and the
  `actionPerformed` event (`{ activityId, actionId }`).
  - Android: notification action buttons (up to 3). Taps that don't open the app
    are handled in the background.
  - iOS 17+: App Intent buttons (`LiveActivityActionIntent`,
    `LiveActivityOpenAppActionIntent`) in `LiveActivityManager.swift`; the
    example widget renders them on the Lock Screen and the expanded Dynamic
    Island. A background tap keeps the app running until your listener calls
    `update()` / `end()` (up to 10 s).
  - Taps made while no listener is registered — including when the app wasn't
    running — are delivered once you subscribe.
- New types: `LiveActivityAction`, `ActionPerformedEvent`.
- README: action-button screenshots for iOS and Android.
- Example app: an editable list of action buttons (prefilled with 3, Android's
  maximum); the demo ends the activity on `cancel`.

### Fixed

- iOS: `update()`, `end()` and `getPushToken()` now find activities started
  before an app relaunch, instead of failing with "No active Live Activity".
- README: corrected the path to the example widget template.
- Example widget: action button labels use `textColor` on a translucent
  `progressColor` capsule, instead of the system bordered style, which was
  hard to read on dark Lock Screen backgrounds.

### Changed

- Android: the internal broadcast receiver is now `LiveActivityReceiver`
  (was `LiveActivityDismissReceiver`). No action needed — it is declared in the
  plugin's manifest.

## [1.0.0] — 2026-10-16

The Android side is rewritten on Google's official
[Live Updates](https://developer.android.com/develop/ui/compose/notifications/live-update)
API. On Android 16+ activities are now promoted to real Live Updates: a
status-bar chip, a card pinned at the top of the shade and on the lock screen.

### ⚠️ Breaking changes

- **Android: `compileSdkVersion` 36 and `androidx.core` 1.17.0+ are required.**
  Both are the Capacitor 8 defaults; the plugin pulls in `androidx.core:core-ktx:1.17.0`.
- **Android: timer progress bars fill left to right by default.** When
  `timerCountsDown` is not set, Android now shows elapsed time (empty → full).
  Pass `timerCountsDown: true` to keep a draining bar. iOS still defaults to draining.
- **Android: `areActivitiesEnabled()` can now return `false`** — when
  notifications are disabled, or on Android 16+ when the user turned Live
  Updates off for the app. It previously always returned `true`.
- **Android: `end()` honours `dismissalPolicy: 'immediate'`** and removes the
  notification even when `finalState` is passed.
- **Android: the `FOREGROUND_SERVICE` permission is no longer declared.** The
  plugin never ran a foreground service. Declare it in your app if you rely on it.
- **Android: notifications are posted with the tag `live_activity`.**
  Notifications left over from 0.x are not tracked; end them before upgrading or
  let users dismiss them.

### Added

- `start()` / `update()` resolve with `liveUpdate` (Android) — `true` when the
  system accepted the notification as a Live Update. New `StartResult` and
  `UpdateResult` types.
- `openSettings()` — opens the app's Live Updates settings (Android 16+), the
  app's notification settings (older Android) or the app's page in Settings (iOS).
- `shortCriticalText` state field (Android 16+) — text in the status-bar chip.
- `accentColor` state field (Android) — notification accent and progress bar color.
- `icon` on Android resolves a drawable in the host app by name, used as the
  small icon and in the chip. Falls back to the app icon.
- Timers on Android: `timerEnd` shows a live countdown in the notification and
  chip, and the plugin advances the progress bar natively from
  `timerStart`/`timerEnd` — no `update()` calls needed.
- `activityStateChanged` fires with `dismissed` on Android when the user swipes a
  Live Update away.
- Tapping a Live Update opens the app.
- Running activities are recovered after the app process restarts, so
  `update()` / `end()` keep working.
- Example app: Android chip text, accent color and settings controls, a fill vs
  countdown timer option, `run:android` / `run:ios` scripts, and a log line
  showing whether each post became a Live Update.

### Fixed

- Android notifications were never promoted to Live Updates. The previous
  implementation set a non-existent `FLAG_LIVE_UPDATE` on a discarded copy of the
  notification; it now uses `NotificationCompat.ProgressStyle` with
  `setRequestPromotedOngoing(true)` and declares `POST_PROMOTED_NOTIFICATIONS`.

## [0.1.2] — 2026-06-06

### Added

- Full notification support on Android and iOS.
- Auto-countdown timers (`timerEnd`, `timerStart`, `timerCountsDown`).

### Fixed

- iOS and Android example app builds.
- npm publishing from CI.

## [0.1.1] — 2026-06-04

- Republish of 0.1.0.

## [0.1.0] — 2026-06-04

- Initial release: iOS Live Activities (Dynamic Island + Lock Screen) with
  APNs push updates, and Android ongoing notifications.

[1.1.0]: https://github.com/ciabosoftwaresolutions/capacitor-live-activities/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/ciabosoftwaresolutions/capacitor-live-activities/compare/v0.1.2...v1.0.0
[0.1.2]: https://github.com/ciabosoftwaresolutions/capacitor-live-activities/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/ciabosoftwaresolutions/capacitor-live-activities/compare/v0.1.0...v0.1.1
[0.1.0]: https://www.npmjs.com/package/@ciabosoftwaresolutions/capacitor-live-activities/v/0.1.0
