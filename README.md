# @ciabosoftwaresolutions/capacitor-live-activities

Capacitor plugin for **iOS Live Activities** (Dynamic Island + Lock Screen) and **Android Live Updates** (persistent status-bar chip, Android 16+, with a sticky notification fallback on Android 13–15).

[![npm version](https://img.shields.io/npm/v/@ciabosoftwaresolutions/capacitor-live-activities)](https://www.npmjs.com/package/@ciabosoftwaresolutions/capacitor-live-activities)
[![npm downloads](https://img.shields.io/npm/dm/@ciabosoftwaresolutions/capacitor-live-activities)](https://www.npmjs.com/package/@ciabosoftwaresolutions/capacitor-live-activities)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

If this plugin saves you time, consider buying us a coffee ☕

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Support-yellow?logo=buy-me-a-coffee&logoColor=white)](https://buymeacoffee.com/ciabosoftwaresolutions)

---

## Platform support

| Feature | iOS | Android |
|---|---|---|
| Compiles from | ✅ iOS 13+ | ✅ API 23+ |
| Live Activity / Live Update | ✅ iOS 16.2+ (runtime) | ✅ Android 16+ (API 36) |
| Graceful fallback on older OS | ✅ `isSupported()` → false | ✅ Sticky notification |
| Dynamic Island | ✅ iPhone 14 Pro+ | — |
| Lock Screen banner | ✅ | — |
| Status-bar chip | — | ✅ |
| App-driven updates | ✅ | ✅ |
| Push-driven updates (server → device) | ✅ APNs — no Firebase needed | ✅ FCM — optional, see below |

---

## How updates work — app-driven vs push-driven

There are two ways to keep a Live Activity in sync. **You can use either or both.**

### App-driven (default — no Firebase, no APNs setup)

Your app calls `LiveActivities.update()` directly, for example from a WebSocket handler or a background fetch. Works on all supported OS versions with zero extra setup.

```
Your app  ──update()──▶  Native layer  ──▶  Live Activity UI
```

### Push-driven (server sends updates while app is closed)

Your server pushes a payload directly to the device. The OS updates the Live Activity UI even if your app is not running.

```
Your server  ──POST──▶  APNs / FCM  ──▶  Live Activity UI
```

| | iOS | Android |
|---|---|---|
| Protocol | APNs `liveActivity` push type | FCM data message |
| Firebase needed? | ❌ No — direct APNs | ✅ Yes (optional peer dep) |
| Token source | `getPushToken({ activityId })` | `getPushToken({ activityId })` |

---

## Requirements

| Tool | Minimum version |
|---|---|
| Capacitor | 8.0 |
| iOS deployment target | 13.0 (Live Activities activate at runtime on 16.2+) |
| Android `minSdkVersion` | 23 |
| Android `compileSdkVersion` | 35+ |
| Java | 21 |
| Node | 18+ |

## Installation

```bash
npm install @ciabosoftwaresolutions/capacitor-live-activities
npx cap sync
```

---

## iOS setup

> **Device requirement** — Live Activities and the Dynamic Island render on physical devices only. The Lock Screen banner is visible in the iOS 16.2+ Simulator but the Dynamic Island is not. Always test the full experience on a real device.

---

### Compatibility — iOS 13+ compiles, iOS 16.2+ activates

The plugin and Widget Extension template both use `#if canImport(ActivityKit)` and `@available(iOS 16.2, *)` guards throughout, so **they compile against any deployment target from iOS 13 upwards**. No code changes are needed in your project.

At runtime the behaviour is:

| iOS version | `isSupported()` | `start()` / `update()` / `end()` |
|---|---|---|
| iOS 16.2+ | `true` | Works normally |
| iOS 13 – 16.1 | `false` | Rejects with a clear error message |

Always check `isSupported()` before calling `start()` and branch accordingly in your app logic.

```typescript
const { supported } = await LiveActivities.isSupported();
if (supported) {
  const { activityId } = await LiveActivities.start({ ... });
} else {
  // Fall back to a regular notification, badge, or nothing
}
```

---

### Step 1 — Minimum deployment target (optional adjustment)

The plugin works with whatever deployment target your project already has. If you **want** to raise it to iOS 16.2 to remove the availability checks from your own Swift/Capacitor code, set it in Xcode → select target → **General** → **Minimum Deployments** → `iOS 16.2`. This is entirely optional.

---

### Step 2 — Enable capabilities on the main app target

In Xcode → select your **main app target** → **Signing & Capabilities**:

1. Click **+ Capability** → add **Live Activities** (this also adds WidgetKit automatically).
2. Click **+ Capability** → add **Push Notifications** *(required even for app-driven updates — the OS needs this entitlement to issue APNs activity tokens)*.
3. Click **+ Capability** → add **Background Modes** → check **Remote notifications** *(allows the app to receive push-driven updates while in the background)*.

---

### Step 3 — Update Info.plist

Add these keys to your main app's `Info.plist`:

```xml
<!-- Required: opt the app in to Live Activities -->
<key>NSSupportsLiveActivities</key>
<true/>

<!-- Optional but recommended: allow updates more than once per hour.
     Without this key iOS throttles updates aggressively. -->
<key>NSSupportsLiveActivitiesFrequentUpdates</key>
<true/>
```

---

### Step 4 — Add a Widget Extension target

The Live Activity UI (Lock Screen banner + Dynamic Island) runs inside a separate Widget Extension mini-app that Apple's system spawns independently.

1. **File → New → Target → Widget Extension** — name it e.g. `LiveActivityWidget`.
2. When prompted, **uncheck** *"Include Configuration App Intent"* and **check** *"Include Live Activity"*.
3. Xcode creates the extension with a new bundle ID — by convention use `<your-main-bundle-id>.LiveActivityWidget` (e.g. `com.yourcompany.yourapp.LiveActivityWidget`). Verify this under the extension target → **General → Bundle Identifier**.
4. Set the extension's **Minimum Deployments** to `iOS 16.2` (same as Step 1).
5. Replace the generated Swift file with the ready-made template from this repo:
   ```
   example/ios/LiveActivityWidget/LiveActivityWidget.swift
   ```
6. Add `LiveActivityManager.swift` (from `ios/Plugin/` in this repo) to **both** the main app target **and** the Widget Extension target. This is what lets the extension read the same `LiveActivityAttributes` type that the plugin writes.
   - Select `LiveActivityManager.swift` in the Xcode file navigator.
   - Open the **File Inspector** (right panel).
   - Under **Target Membership** check both your main app target and `LiveActivityWidget`.

---

### Step 5 — Add a shared App Group

An App Group lets the main app and the widget extension share data across the process boundary.

1. Select your **main app target** → **Signing & Capabilities** → **+ Capability** → **App Groups**.
2. Click **+** and add a group: `group.com.yourcompany.yourapp`
3. Select the **LiveActivityWidget target** → repeat the same steps with the **exact same** group identifier.

> Xcode generates a `.entitlements` file for each target automatically when you add a capability. If you already have an entitlements file, the capability is merged into it.

---

### Step 6 — Register the plugin (Capacitor 6)

The plugin auto-registers via `@CapacitorPlugin` — no manual Swift code needed. Just run:

```bash
npx cap sync
```

---

### Step 7 — APNs key (push-driven updates only)

Skip this step if you are only using app-driven updates.

To send server-side Live Activity updates via APNs you need an **APNs Auth Key** (`.p8` file) — this is a single key that works for all your apps, unlike the older certificate-based approach.

1. Go to [Apple Developer → Certificates, Identifiers & Profiles → Keys](https://developer.apple.com/account/resources/authkeys/list).
2. Click **+** → name it (e.g. `APNs Auth Key`) → check **Apple Push Notifications service (APNs)** → **Continue → Register → Download**.
3. Save the `.p8` file securely — you can only download it once.
4. Note your:
   - **Key ID** (shown on the key detail page, 10-character string)
   - **Team ID** (top-right of the developer portal, also 10 characters)
   - **Bundle ID** of your app

Your server uses these three values plus the `.p8` file to sign JWT tokens for APNs requests. See the [Push-driven updates — iOS](#ios--apns-no-firebase-required) section below for the payload format.

---

## Android setup

### 1. Request notification permission at runtime (Android 13+)

```typescript
import { Capacitor } from '@capacitor/core';

if (Capacitor.getPlatform() === 'android') {
  // Use your preferred permission library or the Capacitor Permissions API
  await Notification.requestPermission();
}
```

### 2. compileSdkVersion

To use the Android 16 Live Updates chip (`FLAG_LIVE_UPDATE`), set `compileSdkVersion = 36` in your app's `android/variables.gradle`. The plugin falls back to a standard sticky notification automatically on older versions.

---

## Usage

```typescript
import { LiveActivities } from '@ciabosoftwaresolutions/capacitor-live-activities';

// Check support
const { supported } = await LiveActivities.isSupported();
const { enabled }   = await LiveActivities.areActivitiesEnabled();

// Start
const { activityId } = await LiveActivities.start({
  attributes: {
    activityType: 'order-tracking',   // identifies the activity kind
    orderId: '12345',                 // static: never changes during the activity
  },
  state: {
    title: 'Order on its way',        // required
    subtitle: '3 stops away',
    progress: 0.6,                    // 0.0 – 1.0
    icon: 'shippingbox.fill',         // SF Symbol (iOS) / drawable name (Android)
  },
  staleAfterSeconds: 3600,            // iOS only
});

// Update (app-driven)
// ⚠️ update() REPLACES the entire state — re-send every field you want to keep
// (icon, colors, etc.), not just the ones that changed. See the callout below.
await LiveActivities.update({
  activityId,
  state: {
    title: 'Order arriving now',
    subtitle: 'Next stop',
    progress: 0.95,
    icon: 'shippingbox.fill',   // re-send, or it disappears
  },
  alertTitle: 'Your order is almost here!',   // iOS: shows a banner
  alertBody: '1 stop away',
});

// End
await LiveActivities.end({
  activityId,
  finalState: {
    title: 'Delivered!',
    subtitle: 'Enjoy your order',
    progress: 1.0,
    icon: 'checkmark.circle.fill',
  },
  dismissalPolicy: 'after-delay',   // iOS only; leaves it visible briefly
});

// Get active activities
const { activities } = await LiveActivities.getActiveActivities();

// Listen for system-driven state changes (iOS only)
await LiveActivities.addListener('activityStateChanged', (event) => {
  console.log(event.activityId, event.activityState); // 'active' | 'ended' | 'dismissed'
});
```

> ### ⚠️ `update()` and `end()` replace the **entire** state
>
> Live Activities are stateless between updates — each `update()` (and `end()`'s
> `finalState`) **fully replaces** the previous content state. Any field you omit
> reverts to its default: a missing `icon` disappears, missing `progressColor`
> falls back to white, a missing `subtitle` vanishes.
>
> **Always re-send every field you want to keep**, not just the ones that changed:
>
> ```typescript
> // Keep one source of truth for the visual style, then spread it on every call
> const style = {
>   icon: 'shippingbox.fill',
>   backgroundColor: '#1a1a2e',
>   progressColor: '#4ade80',
>   textColor: '#ffffff',
> };
>
> await LiveActivities.start({ attributes, state: { title: 'Order placed', progress: 0, ...style } });
> await LiveActivities.update({ activityId, state: { title: 'On the way', progress: 0.6, ...style } });
> await LiveActivities.end({ activityId, finalState: { title: 'Delivered', progress: 1, ...style } });
> ```

---

## Push-driven updates

### iOS — APNs (no Firebase required)

Call `getPushToken()` right after `start()` and send the token to your server. The token is specific to each activity instance and may rotate — always use the latest one from the `pushTokenUpdated` event.

```typescript
// Get token immediately after start
const { token, type } = await LiveActivities.getPushToken({ activityId });
// type === 'apns'
await yourServer.registerActivityToken({ activityId, token });

// Re-register whenever the token rotates (iOS may reissue it)
await LiveActivities.addListener('pushTokenUpdated', async (event) => {
  await yourServer.registerActivityToken({
    activityId: event.activityId,
    token: event.token,  // always use the freshest token
  });
});
```

**Server payload** — send a `POST` to `https://api.push.apple.com/3/device/<token>` with:

```json
{
  "aps": {
    "timestamp": 1700000000,
    "event": "update",
    "content-state": {
      "title": "Order arriving now",
      "subtitle": "1 stop away",
      "progress": 0.95
    },
    "alert": {
      "title": "Order update",
      "body": "Your order is almost here!"
    }
  }
}
```

The `content-state` keys map directly to `LiveActivityState` fields. Use `"event": "end"` to end the activity from the server.

> **APNs push type must be** `liveactivity` and the `:path` header must be `/3/device/<activityPushToken>` (not the regular device token).

#### ⚠️ Caveat — don't use `timerEnd` / `timerStart` over push

Those two fields map to Swift `Date`. When ActivityKit decodes a pushed `content-state`, it uses `Codable`'s default date strategy — **seconds since 2001-01-01**, *not* Unix epoch. So a Unix timestamp sent from your server lands ~31 years off.

For **push-driven** timers, send a numeric `progress` (0–1) and a text subtitle (e.g. `"Arriving by 8:45 PM"`) instead, and recompute on the server with each push. App-driven timers (set on-device via `start()`/`update()`) are unaffected — use `timerEnd` freely there.

---

### iOS — push-to-start (launch activities from the server, iOS 17.2+)

`getPushToken()` requires the activity to already be running on-device. To **start** a Live Activity entirely from your server — perfect for order tracking or appointment reminders where the app may be closed — use the **push-to-start token** instead.

```typescript
import { LiveActivities } from '@ciabosoftwaresolutions/capacitor-live-activities';

// The token is type-level (not per-activity). Register it once at launch and
// whenever it rotates. Send it to your server keyed by user/device.
await LiveActivities.addListener('pushToStartTokenUpdated', async (event) => {
  await yourServer.registerPushToStartToken({ token: event.token });
});

// Optional: read the current value (may be null until the system issues it)
const { token } = await LiveActivities.getPushToStartToken();
```

**Server payload to start an activity** — `POST https://api.push.apple.com/3/device/<push-to-start-token>`:

```
apns-topic       <your.bundle.id>.push-type.liveactivity
apns-push-type   liveactivity
```
```json
{
  "aps": {
    "timestamp": 1700000000,
    "event": "start",
    "attributes-type": "LiveActivityAttributes",
    "attributes": { "activityType": "order-tracking" },
    "content-state": {
      "title": "Order received",
      "subtitle": "Preparing your food",
      "progress": 0.1,
      "icon": "fork.knife"
    },
    "alert": { "title": "Order received", "body": "We're preparing your food" }
  }
}
```

After the activity starts, the device fires `pushTokenUpdated` with that activity's **per-activity** token — store it to send subsequent `update` / `end` pushes.

> Push-to-start is **iOS 17.2+** only. On older iOS and Android, `getPushToStartToken()` returns `{ token: null }` — fall back to starting the activity in-app.

---

### Sending from a Java backend

Both the per-activity and push-to-start flows are plain APNs HTTP/2 requests. The cleanest Java option is [**Pushy**](https://github.com/jchambers/pushy) (`com.eatthepath:pushy`), which has first-class Live Activity support.

```java
// One-time client, signed with your APNs Auth Key (.p8)
ApnsClient client = new ApnsClientBuilder()
    .setApnsServer(ApnsClientBuilder.PRODUCTION_APNS_HOST)
    .setSigningKey(ApnsSigningKey.loadFromPkcs8File(
        new File("AuthKey_ABC123.p8"), "YOUR_TEAM_ID", "YOUR_KEY_ID"))
    .build();

// Build the content-state — keys MUST match LiveActivityState fields
String payload = new SimpleApnsPayloadBuilder()
    .setContentState(Map.of(
        "title", "Order arriving now",
        "subtitle", "1 stop away",
        "progress", 0.95,
        "progressColor", "#4ade80"))
    .setEvent("update")                      // "start" | "update" | "end"
    .setTimestamp(Instant.now().getEpochSecond())
    .build();

// topic = <bundleId>.push-type.liveactivity, push type = LIVE_ACTIVITY
var push = new SimpleApnsPushNotification(
    token,                                   // per-activity OR push-to-start token
    "com.yourcompany.yourapp.push-type.liveactivity",
    payload,
    null,
    DeliveryPriority.IMMEDIATE,
    PushType.LIVE_ACTIVITY);

client.sendNotification(push).get();
```

For a **`start`** push, also include the `attributes-type` and `attributes` in the content-state builder (Pushy exposes `setEvent("start")` plus raw map fields) and send to the **push-to-start** token.

**Token bookkeeping your backend needs:**

| Token | From | Used for |
|---|---|---|
| Push-to-start | `pushToStartTokenUpdated` | `event: "start"` — launch new activities |
| Per-activity | `pushTokenUpdated` (after start) | `event: "update"` / `"end"` for that activity |

---

### Android — FCM (optional)

Firebase is **not** a hard dependency. The plugin uses reflection to detect Firebase at runtime — if it isn't in the project `getPushToken()` returns `null` cleanly and everything else still works.

#### Add Firebase to your project (opt-in)

1. Follow the [Firebase Android setup guide](https://firebase.google.com/docs/android/setup) to add `google-services.json` to `android/app/`.

2. In `android/build.gradle` (project level):
   ```gradle
   classpath 'com.google.gms:google-services:4.4.2'
   ```

3. In `android/app/build.gradle`:
   ```gradle
   apply plugin: 'com.google.gms.google-services'
   implementation 'com.google.firebase:firebase-messaging:24.1.0'
   ```

4. Run `npx cap sync`.

#### Get the FCM token

```typescript
// activityId is ignored on Android — FCM tokens are per-device, not per-activity
const { token, type } = await LiveActivities.getPushToken({ activityId });
// type === 'fcm' when Firebase is present, null otherwise
if (token) {
  await yourServer.registerFcmToken({ token });
}
```

#### Server payload

Send a FCM **data message** (not a notification message) so the OS delivers it even when the app is in the background:

```json
{
  "message": {
    "token": "<fcm-device-token>",
    "data": {
      "liveActivityId": "your-activity-id",
      "title": "Order arriving now",
      "subtitle": "1 stop away",
      "progress": "0.95"
    }
  }
}
```

Your app should handle the incoming FCM data message (via a Firebase `onMessageReceived` service) and call `LiveActivities.update()` with the new state.

> On Android the OS does not update the notification directly from the push payload — FCM wakes your app, your app calls `update()`. This is by design and means your update logic stays in one place (TypeScript).

---

## Customising the iOS Widget UI

The default widget renders **icon · title · subtitle · progress bar** using a dark frosted background. To customise it:

1. Open `LiveActivityWidget.swift` in your Widget Extension target.
2. Edit `LockScreenView` (Lock Screen / banner) and the `DynamicIsland` regions.
3. Add extra fields to `LiveActivityAttributes.ContentState` — they flow through automatically in the `extras` dictionary.

### Built-in colors & sizing — no Swift needed

You can restyle the default widget entirely from JavaScript by passing these `state` fields. All are optional and iOS-only (Android ignores them gracefully):

```typescript
await LiveActivities.start({
  attributes: { activityType: 'order' },
  state: {
    title: 'Pizza on the way',
    subtitle: 'Arriving in',
    icon: 'fork.knife',
    timerEnd: Date.now() / 1000 + 150,

    // 🎨 Colors — hex string, with or without leading "#"
    backgroundColor: '#1a1a2e',   // Lock Screen + expanded island background
    progressColor:   '#4ade80',   // progress bar / ring / timer bar
    textColor:       '#ffffff',   // title, subtitle, countdown text
    iconColor:       '#4ade80',   // SF Symbol tint
    keylineTint:     '#4ade80',   // colored glow around the expanded island

    // 📏 Progress bar sizing
    progressBarHeight: 8,         // points, 2–20 (default ~4)
    progressBarRadius: 4,         // points (default: pill / half the height)
  },
});
```

| Field | Affects | Default |
|---|---|---|
| `backgroundColor` | Lock Screen banner + expanded Dynamic Island background | dark translucent |
| `progressColor` | Progress bar, ring, and timer bar fill | white |
| `textColor` | Title, subtitle, countdown text | white |
| `iconColor` | SF Symbol icon tint | white |
| `keylineTint` | The colored outline that wraps the **expanded** Dynamic Island | none |
| `progressBarHeight` | Linear progress bar thickness (points, 2–20) | system (~4) |
| `progressBarRadius` | Linear progress bar corner radius | pill (half the height) |

### About the Dynamic Island "width"

The **physical size of the Dynamic Island is controlled by iOS** — there is no API to force a "full-length" or wider compact island. Apple manages the compact and minimal presentations automatically based on what other activities are running. What you *can* control to make it feel branded and prominent:

- **`keylineTint`** — adds a colored glow border around the **expanded** island (shown on long-press). This is the closest thing to a full-length colored island Apple exposes.
- **`backgroundColor`** — fills the expanded island and Lock Screen banner with your brand color.
- **The expanded layout** — the leading / trailing / center / bottom regions in `LiveActivityWidget.swift` are fully yours to lay out. Add images, multiple rows, buttons (iOS 17+), etc.

The **compact** presentation (the small pill around the camera) is deliberately constrained by iOS to a tiny leading + trailing slot — design for a single glanceable icon + value there.

---

## API

<docgen-index>

* [`isSupported()`](#issupported)
* [`areActivitiesEnabled()`](#areactivitiesenabled)
* [`start(...)`](#start)
* [`update(...)`](#update)
* [`end(...)`](#end)
* [`getActiveActivities()`](#getactiveactivities)
* [`getPushToken(...)`](#getpushtoken)
* [`getPushToStartToken()`](#getpushtostarttoken)
* [`addListener('activityStateChanged' | 'pushTokenUpdated' | 'pushToStartTokenUpdated', ...)`](#addlisteneractivitystatechanged--pushtokenupdated--pushtostarttokenupdated-)
* [`removeAllListeners()`](#removealllisteners)
* [Interfaces](#interfaces)

</docgen-index>

<docgen-api>
<!--Update the source file JSDoc comments and rerun docgen to update the docs below-->

### isSupported()

```typescript
isSupported() => any
```

Returns true when the current platform and OS version support Live Activities
(iOS 16.2+ with the feature enabled by the user) or Live Updates (Android 16+).
On older Android versions this still returns true because the plugin falls back
to a sticky notification.

**Returns:** <code>any</code>

--------------------


### areActivitiesEnabled()

```typescript
areActivitiesEnabled() => any
```

iOS only — returns true if the user has Live Activities enabled for this app
in Settings. Always true on Android.

**Returns:** <code>any</code>

--------------------


### start(...)

```typescript
start(options: StartOptions) => any
```

Start a new Live Activity / Live Update notification.
Resolves with an `activityId` you must store to call `update()` and `end()`.

| Param         | Type                                                  |
| ------------- | ----------------------------------------------------- |
| **`options`** | <code><a href="#startoptions">StartOptions</a></code> |

**Returns:** <code>any</code>

--------------------


### update(...)

```typescript
update(options: UpdateOptions) => any
```

Push a state update to a running Live Activity.

| Param         | Type                                                    |
| ------------- | ------------------------------------------------------- |
| **`options`** | <code><a href="#updateoptions">UpdateOptions</a></code> |

**Returns:** <code>any</code>

--------------------


### end(...)

```typescript
end(options: EndOptions) => any
```

End a Live Activity and optionally show a final state.

| Param         | Type                                              |
| ------------- | ------------------------------------------------- |
| **`options`** | <code><a href="#endoptions">EndOptions</a></code> |

**Returns:** <code>any</code>

--------------------


### getActiveActivities()

```typescript
getActiveActivities() => any
```

Returns all currently active activity IDs started by this app.

**Returns:** <code>any</code>

--------------------


### getPushToken(...)

```typescript
getPushToken(options: { activityId: string; }) => any
```

Get the push token for a running Live Activity (iOS) or the FCM device
token (Android).

- **iOS**: pass the `activityId` returned by `start()`. The token is
  specific to that activity and should be sent to your server immediately.
  It may rotate — listen to `pushTokenUpdated` for changes.
- **Android**: `activityId` is ignored. Returns the FCM registration token
  if Firebase is configured in the project, otherwise `null`.

The app-driven update path (`update()`) works without any push token.
You only need this for *server-side* push-driven updates.

| Param         | Type                                 |
| ------------- | ------------------------------------ |
| **`options`** | <code>{ activityId: string; }</code> |

**Returns:** <code>any</code>

--------------------


### getPushToStartToken()

```typescript
getPushToStartToken() => any
```

iOS 17.2+ only — get the **push-to-start** token. Unlike `getPushToken`,
this token is **not tied to a specific activity** — it lets your server
START a brand-new Live Activity remotely, even if the app has never called
`start()`. Ideal for order tracking, appointment reminders, etc.

Send this token to your server. The system may issue it slightly after
launch, so prefer listening to `pushToStartTokenUpdated` and treat this
getter as a "current value" check.

Returns `{ token: null }` on iOS &lt; 17.2 and on Android.

**Returns:** <code>any</code>

--------------------


### addListener('activityStateChanged' | 'pushTokenUpdated' | 'pushToStartTokenUpdated', ...)

```typescript
addListener(eventName: 'activityStateChanged' | 'pushTokenUpdated' | 'pushToStartTokenUpdated', listenerFunc: (event: ActivityStateChangedEvent | PushTokenUpdatedEvent | PushToStartTokenUpdatedEvent) => void) => any
```

Subscribe to Live Activity events.

- **`activityStateChanged`** — iOS only. Fired when the system changes the
  state of a Live Activity (e.g. the user dismisses it from the Lock Screen).
  Payload: `{ activityId: string, activityState: 'active' | 'ended' | 'dismissed' }`

- **`pushTokenUpdated`** — iOS only. Fired when the per-activity ActivityKit
  push token is first issued or rotated. Re-send it to your server so it can
  continue delivering APNs **updates** to that activity.
  Payload: `{ activityId: string, token: string, type: 'apns' }`

- **`pushToStartTokenUpdated`** — iOS 17.2+ only. Fired when the type-level
  push-to-start token is issued or rotated. Re-send it to your server so it
  can **start** new activities remotely.
  Payload: `{ token: string, type: 'apns' }`

| Param              | Type                                                                                                                                                                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`eventName`**    | <code>'activityStateChanged' \| 'pushTokenUpdated' \| 'pushToStartTokenUpdated'</code>                                                                                                                                                        |
| **`listenerFunc`** | <code>(event: <a href="#activitystatechangedevent">ActivityStateChangedEvent</a> \| <a href="#pushtokenupdatedevent">PushTokenUpdatedEvent</a> \| <a href="#pushtostarttokenupdatedevent">PushToStartTokenUpdatedEvent</a>) =&gt; void</code> |

**Returns:** <code>any</code>

--------------------


### removeAllListeners()

```typescript
removeAllListeners() => any
```

**Returns:** <code>any</code>

--------------------


### Interfaces


#### StartOptions

| Prop                    | Type                                                                      | Description                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **`attributes`**        | <code><a href="#liveactivityattributes">LiveActivityAttributes</a></code> |                                                                                                                             |
| **`state`**             | <code><a href="#liveactivitystate">LiveActivityState</a></code>           |                                                                                                                             |
| **`staleAfterSeconds`** | <code>number</code>                                                       | iOS only — how long (seconds) the activity stays visible after `end()`. Defaults to 0 (dismissed immediately). Max 4 hours. |


#### LiveActivityAttributes

Static data for a Live Activity — set once at creation, never changes.
Keep this small; use `state` for anything that updates.

| Prop               | Type                | Description                                                                 |
| ------------------ | ------------------- | --------------------------------------------------------------------------- |
| **`activityType`** | <code>string</code> | Unique identifier you assign (e.g. "order-123"). Used to correlate updates. |


#### LiveActivityState

Dynamic data for a Live Activity — can be pushed via `update()` at any time.

| Prop                    | Type                 | Description                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`title`**             | <code>string</code>  | Primary headline shown on the Lock Screen / Dynamic Island.                                                                                                                                                                                                                                                                                            |
| **`subtitle`**          | <code>string</code>  | Secondary line of text.                                                                                                                                                                                                                                                                                                                                |
| **`progress`**          | <code>number</code>  | Optional progress value between 0.0 and 1.0.                                                                                                                                                                                                                                                                                                           |
| **`icon`**              | <code>string</code>  | Optional SF Symbol name (iOS) or Android drawable name for a status icon.                                                                                                                                                                                                                                                                              |
| **`backgroundColor`**   | <code>string</code>  | iOS only — hex color string for the activity background tint. Applied to the Lock Screen banner and expanded Dynamic Island background. Accepts 6-digit hex with or without `#` prefix, e.g. `"#1a1a2e"` or `"1a1a2e"`. Defaults to a dark semi-transparent fill when omitted.                                                                         |
| **`progressColor`**     | <code>string</code>  | iOS only — hex color string for the progress bar, progress ring and timer bar. Defaults to white when omitted.                                                                                                                                                                                                                                         |
| **`textColor`**         | <code>string</code>  | iOS only — hex color string for title and subtitle text. Defaults to white when omitted.                                                                                                                                                                                                                                                               |
| **`iconColor`**         | <code>string</code>  | iOS only — hex color string for the SF Symbol icon. Defaults to white when omitted.                                                                                                                                                                                                                                                                    |
| **`keylineTint`**       | <code>string</code>  | iOS only — hex color string for the keyline (the thin colored outline that wraps the **expanded** Dynamic Island). A common way to give the island a branded, "full-length" colored glow. Defaults to no keyline when omitted.                                                                                                                         |
| **`progressBarHeight`** | <code>number</code>  | iOS only — thickness in points of the linear progress bar shown on the Lock Screen and in the expanded Dynamic Island bottom region. Range 2–20. Defaults to the system thickness (~4) when omitted.                                                                                                                                                   |
| **`progressBarRadius`** | <code>number</code>  | iOS only — corner radius in points applied to the linear progress bar when `progressBarHeight` is set. Defaults to half the bar height (pill shape).                                                                                                                                                                                                   |
| **`timerEnd`**          | <code>number</code>  | iOS only — Unix timestamp (seconds since epoch) when the timer ends. When set, the widget renders a live countdown and an auto-animating progress bar. The system updates the display every second automatically — no `update()` calls needed from JavaScript. Example — start a 2m 30s countdown: ```typescript timerEnd: Date.now() / 1000 + 150 ``` |
| **`timerStart`**        | <code>number</code>  | iOS only — Unix timestamp when the timer started. Used alongside `timerEnd` to compute the progress ring fill. Defaults to `Date.now()` at the moment `start()` is called if omitted.                                                                                                                                                                  |
| **`timerCountsDown`**   | <code>boolean</code> | iOS only — direction of the timer progress bar/ring. - `true` (default) — bar starts **full** and drains right-to-left as time runs out. - `false` — bar starts **empty** and fills left-to-right as time elapses. The countdown **text** always shows remaining time regardless of this setting.                                                      |


#### UpdateOptions

| Prop             | Type                                                            | Description                                                                                                |
| ---------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **`activityId`** | <code>string</code>                                             |                                                                                                            |
| **`state`**      | <code><a href="#liveactivitystate">LiveActivityState</a></code> |                                                                                                            |
| **`alertTitle`** | <code>string</code>                                             | iOS only — alert the user with a banner when this update arrives. Ignored if the app is in the foreground. |
| **`alertBody`**  | <code>string</code>                                             |                                                                                                            |


#### EndOptions

| Prop                  | Type                                                            | Description                                                                                                                                                                           |
| --------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`activityId`**      | <code>string</code>                                             |                                                                                                                                                                                       |
| **`finalState`**      | <code><a href="#liveactivitystate">LiveActivityState</a></code> | Final state to display before the activity is dismissed. If omitted the last known state is used.                                                                                     |
| **`dismissalPolicy`** | <code>'immediate' \| 'default' \| 'after-delay'</code>          | iOS only — dismiss the activity immediately or leave it on screen for a short period so the user sees the final state. 'immediate' \| 'default' \| 'after-delay' (default: 'default') |


#### ActivityInfo

| Prop               | Type                                            | Description                                                                    |
| ------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------ |
| **`activityId`**   | <code>string</code>                             |                                                                                |
| **`activityType`** | <code>string</code>                             |                                                                                |
| **`state`**        | <code>'active' \| 'ended' \| 'dismissed'</code> | 'active' \| 'ended' \| 'dismissed' — iOS only; Android always returns 'active' |


#### PushTokenResult

| Prop        | Type                                 | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`token`** | <code>string \| null</code>          | The push token for this specific Live Activity (iOS) or the FCM registration token for the device (Android). iOS — This is an ActivityKit push token unique to this activity instance. Send it to your server and use it to deliver APNs `liveActivity` payloads directly (no Firebase needed). Changes over the activity's lifetime; listen to `pushTokenUpdated` to receive the latest value. Android — This is the standard FCM registration token for the device. Returns `null` when Firebase is not configured in the project. Send it to your server and deliver updates via an FCM data message (see README → Push-driven updates). |
| **`type`**  | <code>'apns' \| 'fcm' \| null</code> | 'apns' on iOS, 'fcm' on Android, null when unavailable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |


#### ActivityStateChangedEvent

| Prop                | Type                                            | Description               |
| ------------------- | ----------------------------------------------- | ------------------------- |
| **`activityId`**    | <code>string</code>                             |                           |
| **`activityState`** | <code>'active' \| 'ended' \| 'dismissed'</code> | New state of the activity |


#### PushTokenUpdatedEvent

| Prop             | Type                         |
| ---------------- | ---------------------------- |
| **`activityId`** | <code>string</code>          |
| **`token`**      | <code>string</code>          |
| **`type`**       | <code>'apns' \| 'fcm'</code> |


#### PushToStartTokenUpdatedEvent

| Prop        | Type                | Description                                                                  |
| ----------- | ------------------- | ---------------------------------------------------------------------------- |
| **`token`** | <code>string</code> | The push-to-start token — send to your server to launch activities remotely. |
| **`type`**  | <code>'apns'</code> |                                                                              |


#### PluginListenerHandle

| Prop         | Type                      |
| ------------ | ------------------------- |
| **`remove`** | <code>() =&gt; any</code> |

</docgen-api>

---

## FAQ — iOS Xcode setup troubleshooting

### "Missing package product 'CapApp-SPM'"

This happens when Xcode loses its reference to the local `CapApp-SPM` package — most commonly after deleting and recreating the `ios/` folder.

**Fix:**
1. In Xcode: **File → Add Package Dependencies → Add Local...**
2. Navigate to `ios/App/CapApp-SPM` and click **Add Package**
3. When prompted for a target, select **none** — `CapApp-SPM` is managed by Capacitor internally
4. Xcode will resolve the package and the error disappears

---

### "Unable to find module dependency: 'Capacitor'" in AppDelegate

After fixing the `CapApp-SPM` reference above, the `Capacitor` module still needs to be linked to the app target.

**Fix:**
- Select your **main app target** → **General** → **Frameworks, Libraries, and Embedded Content** → **+** → search for **CapApp-SPM** → **Add**

---

### `npx cap sync` keeps re-adding the plugin to `CapApp-SPM/Package.swift`

When you include the plugin's Swift files directly in the Xcode project (recommended for local development), `npx cap sync` will re-add the plugin to `CapApp-SPM/Package.swift` on every run, causing duplicate symbol errors on the next build.

Run this after every `npx cap sync` to clean it out:

```bash
cd example && node -e "
const fs = require('fs');
const f = 'ios/App/CapApp-SPM/Package.swift';
let c = fs.readFileSync(f, 'utf8');
c = c.replace(/,\s*\.package\(name:.*?capacitor-live-activities.*?\)/s, '');
c = c.replace(/,\s*\.product\(name: \"CiabosoftwaresolutionsCapacitorLiveActivities\".*?\)/s, '');
fs.writeFileSync(f, c);
console.log('Cleaned');
"
```

Or add it as an npm script in your project's `package.json` so you can run `npm run sync:ios` instead:

```json
"scripts": {
  "sync:ios": "npx cap sync ios && node -e \"const fs=require('fs'),f='ios/App/CapApp-SPM/Package.swift';let c=fs.readFileSync(f,'utf8');c=c.replace(/,\\s*\\.package\\(name:.*?capacitor-live-activities.*?\\)/s,'');c=c.replace(/,\\s*\\.product\\(name:\\s*\\\"CiabosoftwaresolutionsCapacitorLiveActivities\\\".*?\\)/s,'');fs.writeFileSync(f,c);console.log('CapApp-SPM cleaned');\""
}
```

---

### Plugin not found / "not implemented on ios"

The plugin's Swift files need to be compiled into the app directly. Include them from `node_modules/@ciabosoftwaresolutions/capacitor-live-activities/ios/Plugin/`:

1. Drag `LiveActivitiesPlugin.swift` and `LiveActivityManager.swift` into Xcode
2. ✅ **Copy items if needed**
3. **Target Membership:**
   - `LiveActivityManager.swift` → ✅ main app + ✅ `LiveActivityWidget`
   - `LiveActivitiesPlugin.swift` → ✅ main app only

---

### "Invalid redeclaration of 'LiveActivityWidgetBundle'"

Xcode generates two files when adding a Widget Extension — delete the generated `LiveActivityWidgetBundle.swift`:

Right-click → **Delete → Move to Trash**

---

### "Plugin with id 'org.jetbrains.kotlin.android' not found" (Android)

Add the Kotlin classpath to the plugin's `android/build.gradle`:

```groovy
buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.25'
    }
}
```

---

### Notifications not appearing on Android

Call `requestPermissions()` before `start()` on Android 13+:

```typescript
const { notifications } = await LiveActivities.requestPermissions();
if (notifications === 'granted') {
  await LiveActivities.start({ ... });
}
```

---

## Contributing

PRs welcome! Please open an issue first for non-trivial changes.

```bash
# Install dependencies and build the plugin
npm install
npm run build

# Run the example app
cd example && npm install && npm run build
```

---

## Support

If this plugin helped you ship faster, consider buying us a coffee — it helps keep the project maintained and free for everyone. ☕

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Support-yellow?logo=buy-me-a-coffee&logoColor=white)](https://buymeacoffee.com/ciabosoftwaresolutions)

---

## License

MIT © [Ciabo Software Solutions](https://github.com/ciabosoftwaresolutions)
