import type { PluginListenerHandle } from '@capacitor/core';

/**
 * A button shown on the Live Activity / Live Update. Tapping it fires the
 * `actionPerformed` event with this `id` — your code then decides what to do
 * (e.g. call your API, then `update()` or `end()`).
 */
export interface LiveActivityAction {
  /** Identifier you receive back in `actionPerformed`. */
  id: string;
  /** Button label. Keep it short. */
  title: string;
  /**
   * Bring the app to the foreground when tapped. Defaults to `false`: the tap
   * is handled without opening the app.
   */
  opensApp?: boolean;
}

/**
 * Static data for a Live Activity — set once at creation, never changes.
 * Keep this small; use `state` for anything that updates.
 */
export interface LiveActivityAttributes {
  /** Unique identifier you assign (e.g. "order-123"). Used to correlate updates. */
  activityType: string;
  /** Any static key/value data your Widget Extension needs to render context. */
  [key: string]: unknown;
}

/**
 * Dynamic data for a Live Activity — can be pushed via `update()` at any time.
 */
export interface LiveActivityState {
  /** Primary headline shown on the Lock Screen / Dynamic Island. */
  title: string;
  /** Secondary line of text. */
  subtitle?: string;
  /** Optional progress value between 0.0 and 1.0. */
  progress?: number;
  /**
   * Optional SF Symbol name (iOS) or Android drawable resource name for a status icon.
   * On Android this becomes the notification small icon, which is also what the
   * Live Update status-bar chip shows — use a monochrome drawable. Falls back to
   * the app icon when the name doesn't resolve.
   */
  icon?: string;
  /**
   * Android 16+ only — short text shown in the Live Update status-bar chip
   * (e.g. `"Arriving"`, `"5 min"`). Keep it under 7 characters to guarantee it is
   * fully visible; the chip is at most 96dp wide.
   */
  shortCriticalText?: string;
  /**
   * Android only — hex color string (e.g. `"#6750a4"`) used as the notification
   * accent color and the Live Update progress bar color. Kept separate from the
   * iOS colors, which usually target a dark Lock Screen background.
   */
  accentColor?: string;
  /**
   * Buttons shown on the activity. Each tap fires `actionPerformed`.
   *
   * - **Android**: notification action buttons, up to 3 (extra ones are ignored).
   * - **iOS 17+**: rendered by your Widget Extension (the template in this repo
   *   shows them on the Lock Screen and the expanded Dynamic Island). Ignored on
   *   iOS 16.x. Needs `LiveActivityManager.swift` in both the app and the widget
   *   target — see README → Action buttons.
   *
   * Taps made while no JS listener is registered (e.g. the app wasn't running)
   * are kept and delivered once you subscribe.
   */
  actions?: LiveActivityAction[];
  /**
   * iOS only — hex color string for the activity background tint.
   * Applied to the Lock Screen banner and expanded Dynamic Island background.
   * Accepts 6-digit hex with or without `#` prefix, e.g. `"#1a1a2e"` or `"1a1a2e"`.
   * Defaults to a dark semi-transparent fill when omitted.
   */
  backgroundColor?: string;
  /**
   * iOS only — hex color string for the progress bar, progress ring and timer bar.
   * Defaults to white when omitted.
   */
  progressColor?: string;
  /**
   * iOS only — hex color string for title and subtitle text.
   * Defaults to white when omitted.
   */
  textColor?: string;
  /**
   * iOS only — hex color string for the SF Symbol icon.
   * Defaults to white when omitted.
   */
  iconColor?: string;
  /**
   * iOS only — hex color string for the keyline (the thin colored outline that
   * wraps the **expanded** Dynamic Island). A common way to give the island a
   * branded, "full-length" colored glow. Defaults to no keyline when omitted.
   */
  keylineTint?: string;
  /**
   * iOS only — thickness in points of the linear progress bar shown on the
   * Lock Screen and in the expanded Dynamic Island bottom region.
   * Range 2–20. Defaults to the system thickness (~4) when omitted.
   */
  progressBarHeight?: number;
  /**
   * iOS only — corner radius in points applied to the linear progress bar when
   * `progressBarHeight` is set. Defaults to half the bar height (pill shape).
   */
  progressBarRadius?: number;
  /**
   * Unix timestamp (seconds since epoch) when the timer ends.
   * iOS: the widget renders a live countdown and an auto-animating progress bar.
   * Android: the notification and Live Update chip show a live countdown, and
   * the plugin advances the progress bar natively (when `timerStart` is set and
   * `progress` is not) until the app process is killed.
   * Either way no `update()` calls are needed.
   *
   * Example — start a 2m 30s countdown:
   * ```typescript
   * timerEnd: Date.now() / 1000 + 150
   * ```
   */
  timerEnd?: number;
  /**
   * Unix timestamp when the timer started.
   * Used alongside `timerEnd` to compute the progress ring fill.
   * iOS defaults to `Date.now()` at the moment `start()` is called if omitted;
   * Android shows no progress bar for a timer unless this (or `progress`) is set.
   */
  timerStart?: number;
  /**
   * Direction of the timer progress bar/ring.
   * - `true` — bar starts **full** and drains right-to-left as time runs out.
   *   Default on iOS.
   * - `false` — bar starts **empty** and fills left-to-right as time elapses.
   *   Default on Android, matching platform convention.
   * The countdown **text** always shows remaining time regardless of this setting.
   */
  timerCountsDown?: boolean;
  /** Arbitrary extra data your Widget Extension can read. */
  [key: string]: unknown;
}

export interface StartOptions {
  attributes: LiveActivityAttributes;
  state: LiveActivityState;
  /**
   * iOS only — how long (seconds) the activity stays visible after `end()`.
   * Defaults to 0 (dismissed immediately). Max 4 hours.
   */
  staleAfterSeconds?: number;
}

export interface UpdateOptions {
  activityId: string;
  state: LiveActivityState;
  /**
   * iOS only — alert the user with a banner when this update arrives.
   * Ignored if the app is in the foreground.
   */
  alertTitle?: string;
  alertBody?: string;
}

export interface EndOptions {
  activityId: string;
  /**
   * Final state to display before the activity is dismissed.
   * If omitted the last known state is used.
   */
  finalState?: LiveActivityState;
  /**
   * Dismiss the activity immediately or leave it on screen so the user sees
   * the final state. 'immediate' | 'default' | 'after-delay'  (default: 'default')
   *
   * Android: `'immediate'` removes the notification; otherwise, when
   * `finalState` is given, it stays as a regular dismissible notification.
   */
  dismissalPolicy?: 'immediate' | 'default' | 'after-delay';
}

export interface StartResult {
  activityId: string;
  /**
   * Android only — true when Android 16+ accepted the notification as a Live
   * Update (status-bar chip, pinned in the shade). False on older Android, when
   * the user turned Live Updates off for the app, or when the notification is
   * not eligible. Undefined on iOS.
   */
  liveUpdate?: boolean;
}

export interface UpdateResult {
  /** Android only — see {@link StartResult.liveUpdate}. Undefined on iOS. */
  liveUpdate?: boolean;
}

export interface PushTokenResult {
  /**
   * The push token for this specific Live Activity (iOS) or the FCM
   * registration token for the device (Android).
   *
   * iOS  — This is an ActivityKit push token unique to this activity
   *         instance. Send it to your server and use it to deliver
   *         APNs `liveActivity` payloads directly (no Firebase needed).
   *         Changes over the activity's lifetime; listen to
   *         `pushTokenUpdated` to receive the latest value.
   *
   * Android — This is the standard FCM registration token for the device.
   *            Returns `null` when Firebase is not configured in the project.
   *            Send it to your server and deliver updates via an FCM
   *            data message (see README → Push-driven updates).
   */
  token: string | null;
  /** 'apns' on iOS, 'fcm' on Android, null when unavailable. */
  type: 'apns' | 'fcm' | null;
}

export interface ActionPerformedEvent {
  /** The activity whose button was tapped. */
  activityId: string;
  /** The `id` of the tapped {@link LiveActivityAction}. */
  actionId: string;
}

export interface PushTokenUpdatedEvent {
  activityId: string;
  token: string;
  type: 'apns' | 'fcm';
}

export interface PushToStartTokenUpdatedEvent {
  /** The push-to-start token — send to your server to launch activities remotely. */
  token: string;
  type: 'apns';
}

export interface ActivityInfo {
  activityId: string;
  activityType: string;
  /** 'active' | 'ended' | 'dismissed' — iOS only; Android only lists active ones, so always 'active' */
  state: 'active' | 'ended' | 'dismissed';
}

export interface ActivityStateChangedEvent {
  activityId: string;
  /** New state of the activity */
  activityState: 'active' | 'ended' | 'dismissed';
}

export interface LiveActivitiesPlugin {
  /**
   * Returns true when the current platform and OS version support Live Activities
   * (iOS 16.2+ with the feature enabled by the user) or Live Updates (Android 16+).
   * On older Android versions this still returns true because the plugin falls back
   * to a sticky notification.
   */
  isSupported(): Promise<{ supported: boolean }>;

  /**
   * Returns true if the user allows Live Activities for this app.
   *
   * - **iOS**: the Live Activities toggle in Settings.
   * - **Android**: notifications are enabled and, on Android 16+, Live Updates
   *   are allowed for the app (`canPostPromotedNotifications`). When false on
   *   Android 16+, `start()` still posts a regular sticky notification.
   */
  areActivitiesEnabled(): Promise<{ enabled: boolean }>;

  /**
   * Opens the system settings screen where the user can turn Live Activities /
   * Live Updates back on.
   *
   * - **iOS**: the app's page in Settings.
   * - **Android 16+**: the app's Live Updates (notification promotion) settings.
   * - **Android 15 and below**: the app's notification settings.
   */
  openSettings(): Promise<void>;

  /**
   * Start a new Live Activity / Live Update notification.
   * Resolves with an `activityId` you must store to call `update()` and `end()`.
   */
  start(options: StartOptions): Promise<StartResult>;

  /**
   * Push a state update to a running Live Activity.
   */
  update(options: UpdateOptions): Promise<UpdateResult>;

  /**
   * End a Live Activity and optionally show a final state.
   */
  end(options: EndOptions): Promise<void>;

  /**
   * Returns all currently active activity IDs started by this app.
   */
  getActiveActivities(): Promise<{ activities: ActivityInfo[] }>;

  /**
   * Get the push token for a running Live Activity (iOS) or the FCM device
   * token (Android).
   *
   * - **iOS**: pass the `activityId` returned by `start()`. The token is
   *   specific to that activity and should be sent to your server immediately.
   *   It may rotate — listen to `pushTokenUpdated` for changes.
   * - **Android**: `activityId` is ignored. Returns the FCM registration token
   *   if Firebase is configured in the project, otherwise `null`.
   *
   * The app-driven update path (`update()`) works without any push token.
   * You only need this for *server-side* push-driven updates.
   */
  getPushToken(options: { activityId: string }): Promise<PushTokenResult>;

  /**
   * iOS 17.2+ only — get the **push-to-start** token. Unlike `getPushToken`,
   * this token is **not tied to a specific activity** — it lets your server
   * START a brand-new Live Activity remotely, even if the app has never called
   * `start()`. Ideal for order tracking, appointment reminders, etc.
   *
   * Send this token to your server. The system may issue it slightly after
   * launch, so prefer listening to `pushToStartTokenUpdated` and treat this
   * getter as a "current value" check.
   *
   * Returns `{ token: null }` on iOS < 17.2 and on Android.
   */
  getPushToStartToken(): Promise<PushTokenResult>;

  /**
   * Subscribe to Live Activity events.
   *
   * - **`actionPerformed`** — Fired when the user taps one of the `actions`
   *   buttons. Payload: `{ activityId: string, actionId: string }`. Taps that
   *   happened while nothing was listening are delivered when you subscribe.
   *
   * - **`activityStateChanged`** — Fired when the system changes the state of a
   *   Live Activity (e.g. the user dismisses it from the Lock Screen). On Android
   *   this fires with `dismissed` when the user swipes the Live Update away; stop
   *   pushing updates for that activity.
   *   Payload: `{ activityId: string, activityState: 'active' | 'ended' | 'dismissed' }`
   *
   * - **`pushTokenUpdated`** — iOS only. Fired when the per-activity ActivityKit
   *   push token is first issued or rotated. Re-send it to your server so it can
   *   continue delivering APNs **updates** to that activity.
   *   Payload: `{ activityId: string, token: string, type: 'apns' }`
   *
   * - **`pushToStartTokenUpdated`** — iOS 17.2+ only. Fired when the type-level
   *   push-to-start token is issued or rotated. Re-send it to your server so it
   *   can **start** new activities remotely.
   *   Payload: `{ token: string, type: 'apns' }`
   */
  addListener(
    eventName: 'actionPerformed',
    listenerFunc: (event: ActionPerformedEvent) => void,
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'activityStateChanged' | 'pushTokenUpdated' | 'pushToStartTokenUpdated',
    listenerFunc: (
      event: ActivityStateChangedEvent | PushTokenUpdatedEvent | PushToStartTokenUpdatedEvent,
    ) => void,
  ): Promise<PluginListenerHandle>;

  removeAllListeners(): Promise<void>;
}
