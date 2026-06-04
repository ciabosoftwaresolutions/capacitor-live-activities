import type { PluginListenerHandle } from '@capacitor/core';

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
  /** Optional SF Symbol name (iOS) or Android drawable name for a status icon. */
  icon?: string;
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
   * iOS only — dismiss the activity immediately or leave it on screen
   * for a short period so the user sees the final state.
   * 'immediate' | 'default' | 'after-delay'  (default: 'default')
   */
  dismissalPolicy?: 'immediate' | 'default' | 'after-delay';
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

export interface PushTokenUpdatedEvent {
  activityId: string;
  token: string;
  type: 'apns' | 'fcm';
}

export interface ActivityInfo {
  activityId: string;
  activityType: string;
  /** 'active' | 'ended' | 'dismissed' — iOS only; Android always returns 'active' */
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
   * iOS only — returns true if the user has Live Activities enabled for this app
   * in Settings. Always true on Android.
   */
  areActivitiesEnabled(): Promise<{ enabled: boolean }>;

  /**
   * Start a new Live Activity / Live Update notification.
   * Resolves with an `activityId` you must store to call `update()` and `end()`.
   */
  start(options: StartOptions): Promise<{ activityId: string }>;

  /**
   * Push a state update to a running Live Activity.
   */
  update(options: UpdateOptions): Promise<void>;

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
   * Subscribe to Live Activity events.
   *
   * - **`activityStateChanged`** — iOS only. Fired when the system changes the
   *   state of a Live Activity (e.g. the user dismisses it from the Lock Screen).
   *   Payload: `{ activityId: string, activityState: 'active' | 'ended' | 'dismissed' }`
   *
   * - **`pushTokenUpdated`** — iOS only. Fired when the ActivityKit push token
   *   for an activity is first issued or rotated. Re-send the new token to your
   *   server immediately so it can continue delivering APNs updates.
   *   Payload: `{ activityId: string, token: string, type: 'apns' }`
   */
  addListener(
    eventName: 'activityStateChanged' | 'pushTokenUpdated',
    listenerFunc: (event: ActivityStateChangedEvent | PushTokenUpdatedEvent) => void,
  ): Promise<PluginListenerHandle>;

  removeAllListeners(): Promise<void>;
}
