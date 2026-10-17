package com.ciabosoftwaresolutions.liveactivities

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.getcapacitor.JSObject
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

data class ActivityInfo(
    val activityId: String,
    val activityType: String,
    val state: String,
    val notificationId: Int,
)

/**
 * Posts Live Activities as Android Live Updates (promoted ongoing notifications).
 *
 * On Android 16+ (API 36) a notification that is ongoing, has a content title,
 * uses a standard / BigText / Progress style and requests promotion is shown as
 * a Live Update: pinned at the top of the shade, on the lock screen and as a
 * status-bar chip. On older versions the same notification renders as a regular
 * sticky notification, so no separate fallback path is needed.
 *
 * https://developer.android.com/develop/ui/compose/notifications/live-update
 */
class LiveActivitiesManager(private val context: Context) {

    companion object {
        private const val CHANNEL_ID = "live_activities"
        private const val CHANNEL_NAME = "Live Activities"
        private const val NOTIFICATION_TAG = "live_activity"

        const val EXTRA_ACTIVITY_ID = "com.ciabosoftwaresolutions.liveactivities.ACTIVITY_ID"
        const val EXTRA_ACTIVITY_TYPE = "com.ciabosoftwaresolutions.liveactivities.ACTIVITY_TYPE"

        // Settings.ACTION_APP_NOTIFICATION_PROMOTION_SETTINGS (API 36). Kept as a
        // literal so the plugin still compiles against compileSdk 35.
        private const val ACTION_PROMOTION_SETTINGS = "android.settings.APP_NOTIFICATION_PROMOTION_SETTINGS"

        // Matches the ProgressStyle max; state.progress (0–1) is scaled onto it.
        private const val PROGRESS_MAX = 100

        // Bounds for how often a timer's progress bar is reposted. The step aims
        // for one 1% move per tick, so short timers tick every second and long
        // ones far less often.
        private const val MIN_TICK_MS = 1_000L
        private const val MAX_TICK_MS = 60_000L
    }

    private val activities = ConcurrentHashMap<String, ActivityInfo>()
    private val notificationManager =
        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    // Drives timer progress bars natively, since Android can't animate them.
    private val handler = Handler(Looper.getMainLooper())
    private val tickers = ConcurrentHashMap<String, Runnable>()
    private val lock = Any()

    /** Called when the user swipes a Live Update away. */
    var onDismissed: ((activityId: String) -> Unit)? = null

    init {
        ensureChannel()
        restoreActivities()
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /** Result of posting: the activity id and whether Android shows it as a Live Update. */
    data class PostResult(val activityId: String, val liveUpdate: Boolean)

    fun start(attributes: JSObject, state: JSObject): PostResult = synchronized(lock) {
        val activityId = UUID.randomUUID().toString()
        val activityType = attributes.optString("activityType", "activity")
        val info = ActivityInfo(
            activityId = activityId,
            activityType = activityType,
            state = "active",
            notificationId = activityId.hashCode(),
        )

        activities[activityId] = info
        val liveUpdate = post(info, state, ongoing = true)
        scheduleTicker(info, state)
        PostResult(activityId, liveUpdate)
    }

    fun update(activityId: String, state: JSObject): Boolean = synchronized(lock) {
        val info = activities[activityId]
            ?: throw IllegalArgumentException("No active Live Activity with id: $activityId")

        val liveUpdate = post(info, state, ongoing = true)
        scheduleTicker(info, state)
        liveUpdate
    }

    fun end(activityId: String, finalState: JSObject?, dismissalPolicy: String?): Unit = synchronized(lock) {
        val info = activities.remove(activityId)
            ?: throw IllegalArgumentException("No active Live Activity with id: $activityId")
        cancelTicker(activityId)

        if (finalState != null && dismissalPolicy != "immediate") {
            // Leave the final state as a regular, dismissible notification.
            // Not ongoing, so the system demotes it from a Live Update.
            post(info, finalState, ongoing = false)
        } else {
            notificationManager.cancel(NOTIFICATION_TAG, info.notificationId)
        }
    }

    fun getActiveActivities(): List<ActivityInfo> = activities.values.toList()

    /** Called by [LiveActivityDismissReceiver] when the user dismisses a Live Update. */
    fun handleDismissed(activityId: String) {
        val removed = synchronized(lock) {
            cancelTicker(activityId)
            activities.remove(activityId) != null
        }
        if (removed) onDismissed?.invoke(activityId)
    }

    /**
     * True when notifications are enabled and, on Android 16+, the user has not
     * turned off Live Updates for this app.
     */
    fun areActivitiesEnabled(): Boolean {
        val compat = NotificationManagerCompat.from(context)
        if (!compat.areNotificationsEnabled()) return false
        return Build.VERSION.SDK_INT < 36 || compat.canPostPromotedNotifications()
    }

    /** Opens the system screen where the user can allow Live Updates for this app. */
    fun openSettings() {
        val intent = if (Build.VERSION.SDK_INT >= 36) {
            Intent(ACTION_PROMOTION_SETTINGS)
        } else {
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
        }
        intent.putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }

    /**
     * Returns the FCM registration token if Firebase Messaging is present in
     * the host app, otherwise returns null.
     *
     * Firebase is NOT a hard dependency of this plugin. The token is obtained
     * via reflection so the plugin compiles and runs without firebase-messaging
     * on the classpath. When Firebase is absent this method returns null cleanly.
     *
     * To enable FCM token retrieval, add to your app's build.gradle:
     *   implementation 'com.google.firebase:firebase-messaging:24.x.x'
     *
     * Then call getPushToken() and send the token to your server to deliver
     * FCM data messages that drive Live Update notification changes.
     */
    fun getFcmToken(callback: (token: String?) -> Unit) {
        try {
            val firebaseMessagingClass = Class.forName("com.google.firebase.messaging.FirebaseMessaging")
            val getInstance = firebaseMessagingClass.getMethod("getInstance")
            val instance = getInstance.invoke(null)
            val getToken = firebaseMessagingClass.getMethod("getToken")
            // getToken() returns a Task<String> — resolve it via reflection
            val task = getToken.invoke(instance)
            val taskClass = Class.forName("com.google.android.gms.tasks.Task")
            val addOnSuccessListener = taskClass.getMethod(
                "addOnSuccessListener",
                Class.forName("com.google.android.gms.tasks.OnSuccessListener")
            )
            val addOnFailureListener = taskClass.getMethod(
                "addOnFailureListener",
                Class.forName("com.google.android.gms.tasks.OnFailureListener")
            )

            val successProxy = java.lang.reflect.Proxy.newProxyInstance(
                javaClass.classLoader,
                arrayOf(Class.forName("com.google.android.gms.tasks.OnSuccessListener"))
            ) { _, _, args ->
                callback(args[0] as? String)
                null
            }
            val failureProxy = java.lang.reflect.Proxy.newProxyInstance(
                javaClass.classLoader,
                arrayOf(Class.forName("com.google.android.gms.tasks.OnFailureListener"))
            ) { _, _, _ ->
                callback(null)
                null
            }

            addOnSuccessListener.invoke(task, successProxy)
            addOnFailureListener.invoke(task, failureProxy)
        } catch (_: ClassNotFoundException) {
            // Firebase not in project — expected when app-driven mode only
            callback(null)
        } catch (_: Exception) {
            callback(null)
        }
    }

    // -------------------------------------------------------------------------
    // Notification builder
    // -------------------------------------------------------------------------

    /** Posts the notification and returns whether Android will show it as a Live Update. */
    private fun post(info: ActivityInfo, state: JSObject, ongoing: Boolean): Boolean {
        val notification = buildNotification(info, state, ongoing)
        notificationManager.notify(NOTIFICATION_TAG, info.notificationId, notification)
        return Build.VERSION.SDK_INT >= 36 &&
            NotificationManagerCompat.from(context).canPostPromotedNotifications() &&
            NotificationCompat.hasPromotableCharacteristics(notification)
    }

    /**
     * For a timer without an explicit `progress`, reposts the notification on a
     * schedule so the bar advances on its own (the countdown text already ticks
     * natively). Runs in-process, so it stops if the app process is killed.
     */
    private fun scheduleTicker(info: ActivityInfo, state: JSObject) {
        cancelTicker(info.activityId)
        if (optDouble(state, "progress") != null) return
        val timerStart = optDouble(state, "timerStart") ?: return
        val timerEnd = optDouble(state, "timerEnd") ?: return
        val totalMs = ((timerEnd - timerStart) * 1000).toLong()
        if (totalMs <= 0) return

        val interval = (totalMs / PROGRESS_MAX).coerceIn(MIN_TICK_MS, MAX_TICK_MS)
        val ticker = object : Runnable {
            override fun run() {
                synchronized(lock) {
                    // Stale if the activity ended or a newer update replaced this ticker
                    if (tickers[info.activityId] !== this || activities[info.activityId] == null) return
                    post(info, state, ongoing = true)
                    if (System.currentTimeMillis() >= timerEnd * 1000) {
                        tickers.remove(info.activityId)
                    } else {
                        handler.postDelayed(this, interval)
                    }
                }
            }
        }
        tickers[info.activityId] = ticker
        handler.postDelayed(ticker, interval)
    }

    private fun cancelTicker(activityId: String) {
        tickers.remove(activityId)?.let { handler.removeCallbacks(it) }
    }

    private fun buildNotification(info: ActivityInfo, state: JSObject, ongoing: Boolean): Notification {
        val title = state.optString("title", "")
        val subtitle = state.optString("subtitle", "")
        val chipText = state.optString("shortCriticalText", "")
        val timerEnd = optDouble(state, "timerEnd")

        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(resolveSmallIcon(state.optString("icon", "")))
            .setContentTitle(title)
            .setOngoing(ongoing)
            // Live Update eligibility: ongoing + content title + promotion request.
            // Must NOT be colorized, a group summary, or use custom RemoteViews.
            .setRequestPromotedOngoing(ongoing)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .addExtras(android.os.Bundle().apply {
                putString(EXTRA_ACTIVITY_ID, info.activityId)
                putString(EXTRA_ACTIVITY_TYPE, info.activityType)
            })

        if (subtitle.isNotBlank()) builder.setContentText(subtitle)
        if (chipText.isNotBlank()) builder.setShortCriticalText(chipText)
        // setColor only — setColorized(true) would disqualify promotion.
        parseColor(state.optString("accentColor", ""))?.let { builder.setColor(it) }

        contentIntent()?.let { builder.setContentIntent(it) }
        if (ongoing) builder.setDeleteIntent(deleteIntent(info))

        if (timerEnd != null && ongoing && timerEnd * 1000 > System.currentTimeMillis()) {
            // The status-bar chip and the notification both count down to `when`
            // without further updates. Skipped once expired so it never goes negative.
            builder.setWhen((timerEnd * 1000).toLong())
                .setShowWhen(true)
                .setUsesChronometer(true)
                .setChronometerCountDown(true)
        }

        resolveProgress(state, timerEnd)?.let { progress ->
            builder.setStyle(buildProgressStyle(state, progress))
        }

        return builder.build()
    }

    private fun buildProgressStyle(state: JSObject, progress: Double): NotificationCompat.ProgressStyle {
        val style = NotificationCompat.ProgressStyle()
            .setStyledByProgress(true)
            .setProgress((progress * PROGRESS_MAX).toInt())

        val segment = NotificationCompat.ProgressStyle.Segment(PROGRESS_MAX)
        parseColor(state.optString("accentColor", ""))?.let { segment.setColor(it) }
        style.setProgressSegments(listOf(segment))

        return style
    }

    /**
     * Explicit `progress` wins. Otherwise, for a timer, derive the elapsed (or
     * remaining) fraction now; [scheduleTicker] keeps it moving.
     */
    private fun resolveProgress(state: JSObject, timerEnd: Double?): Double? {
        optDouble(state, "progress")?.let { return it.coerceIn(0.0, 1.0) }
        if (timerEnd == null) return null

        val timerStart = optDouble(state, "timerStart") ?: return null
        val total = timerEnd - timerStart
        if (total <= 0) return null
        val elapsed = (System.currentTimeMillis() / 1000.0 - timerStart).coerceIn(0.0, total)
        // Android progress bars conventionally fill left to right, so default to
        // elapsed time here (iOS defaults to draining).
        val countsDown = state.optBoolean("timerCountsDown", false)
        val fraction = elapsed / total
        return if (countsDown) 1.0 - fraction else fraction
    }

    private fun contentIntent(): PendingIntent? {
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
        launch.flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        return PendingIntent.getActivity(
            context, 0, launch,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun deleteIntent(info: ActivityInfo): PendingIntent {
        val intent = Intent(context, LiveActivityDismissReceiver::class.java)
            .putExtra(EXTRA_ACTIVITY_ID, info.activityId)
        return PendingIntent.getBroadcast(
            context, info.notificationId, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    /**
     * Rebuilds the in-memory registry from notifications that are still showing,
     * so update() / end() keep working after the app process was restarted.
     */
    private fun restoreActivities() {
        try {
            for (sbn in notificationManager.activeNotifications) {
                if (sbn.tag != NOTIFICATION_TAG) continue
                val extras = sbn.notification.extras
                val activityId = extras.getString(EXTRA_ACTIVITY_ID) ?: continue
                if (sbn.notification.flags and Notification.FLAG_ONGOING_EVENT == 0) continue
                activities[activityId] = ActivityInfo(
                    activityId = activityId,
                    activityType = extras.getString(EXTRA_ACTIVITY_TYPE) ?: "activity",
                    state = "active",
                    notificationId = sbn.id,
                )
            }
        } catch (_: Exception) {
            // Best effort only
        }
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Must not be IMPORTANCE_MIN, or the system refuses to promote.
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Persistent activity updates"
                setSound(null, null)
                enableVibration(false)
            }
            notificationManager.createNotificationChannel(channel)
        }
    }

    /**
     * `state.icon` may name a drawable in the host app (e.g. "ic_delivery").
     * The small icon is what the status-bar chip shows, so a monochrome
     * drawable works best. Falls back to the app icon.
     */
    private fun resolveSmallIcon(name: String): Int {
        if (name.isNotBlank()) {
            val id = context.resources.getIdentifier(name, "drawable", context.packageName)
            if (id != 0) return id
        }
        val res = context.packageManager
            .getApplicationInfo(context.packageName, 0)
            .icon
        return if (res != 0) res else android.R.drawable.ic_dialog_info
    }

    private fun parseColor(hex: String): Int? {
        if (hex.isBlank()) return null
        return try {
            Color.parseColor(if (hex.startsWith("#")) hex else "#$hex")
        } catch (_: IllegalArgumentException) {
            null
        }
    }

    private fun optDouble(obj: JSObject, key: String): Double? {
        if (!obj.has(key) || obj.isNull(key)) return null
        return try {
            obj.getDouble(key)
        } catch (_: Exception) {
            null
        }
    }
}
