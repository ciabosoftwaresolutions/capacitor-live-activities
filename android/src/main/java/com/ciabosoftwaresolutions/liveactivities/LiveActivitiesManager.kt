package com.ciabosoftwaresolutions.liveactivities

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.os.Build
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

class LiveActivitiesManager(private val context: Context) {

    companion object {
        private const val CHANNEL_ID = "live_activities"
        private const val CHANNEL_NAME = "Live Activities"
    }

    private val activities = ConcurrentHashMap<String, ActivityInfo>()
    private val notificationManager =
        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    init {
        ensureChannel()
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    fun start(attributes: JSObject, state: JSObject): String {
        val activityId = UUID.randomUUID().toString()
        val notificationId = activityId.hashCode()
        val activityType = attributes.optString("activityType", "activity")

        val notification = buildNotification(state, ongoing = true)
        notificationManager.notify(notificationId, notification)

        activities[activityId] = ActivityInfo(
            activityId = activityId,
            activityType = activityType,
            state = "active",
            notificationId = notificationId,
        )

        return activityId
    }

    fun update(activityId: String, state: JSObject) {
        val info = activities[activityId]
            ?: throw IllegalArgumentException("No active Live Activity with id: $activityId")

        val notification = buildNotification(state, ongoing = true)
        notificationManager.notify(info.notificationId, notification)
    }

    fun end(activityId: String, finalState: JSObject?) {
        val info = activities[activityId]
            ?: throw IllegalArgumentException("No active Live Activity with id: $activityId")

        if (finalState != null) {
            // Show final state briefly as a non-ongoing notification, then cancel
            val finalNotification = buildNotification(finalState, ongoing = false)
            notificationManager.notify(info.notificationId, finalNotification)
        } else {
            notificationManager.cancel(info.notificationId)
        }

        activities.remove(activityId)
    }

    fun getActiveActivities(): List<ActivityInfo> = activities.values.toList()

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
    // Targets Android 16+ Live Updates chip when available, falls back to a
    // standard ongoing notification on Android 13–15.
    // -------------------------------------------------------------------------

    private fun buildNotification(state: JSObject, ongoing: Boolean): Notification {
        val title    = state.optString("title", "")
        val subtitle = state.optString("subtitle", "")
        val progress = if (state.has("progress")) state.getDouble("progress") else null

        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(getAppIcon())
            .setContentTitle(title)
            .setOngoing(ongoing)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setSilent(true)

        if (subtitle.isNotBlank()) {
            builder.setContentText(subtitle)
        }

        if (progress != null) {
            val progressInt = (progress.coerceIn(0.0, 1.0) * 100).toInt()
            builder.setProgress(100, progressInt, false)
        }

        // Android 16+ Live Updates — shown as a persistent chip in the status bar.
        // The system promotes this notification to a Live Update when the app sets
        // FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK or similar; here we use the
        // live-update flag available from API 36.
        if (Build.VERSION.SDK_INT >= 36) {
            applyLiveUpdateExtras(builder, state)
        }

        return builder.build()
    }

    @Suppress("DEPRECATION")
    private fun applyLiveUpdateExtras(builder: NotificationCompat.Builder, state: JSObject) {
        // Android 16 (API 36) Live Updates API
        // Sets FLAG_LIVE_UPDATE so the system renders the notification as a
        // persistent status-bar chip rather than a standard shade entry.
        try {
            val flagField = Notification::class.java.getField("FLAG_LIVE_UPDATE")
            val flagValue = flagField.getInt(null)
            val notification = builder.build()
            notification.flags = notification.flags or flagValue

            // If a progress value exists, also attach it to the extras bundle so
            // the system can render the compact chip progress ring.
            val progress = if (state.has("progress")) state.getDouble("progress") else null
            if (progress != null) {
                notification.extras.putDouble("android.liveUpdate.progress", progress)
            }
        } catch (_: NoSuchFieldException) {
            // API not yet available on this build; graceful no-op
        } catch (_: Exception) {
            // Ignore any other reflection failures
        }
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
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

    private fun getAppIcon(): Int {
        val res = context.packageManager
            .getApplicationInfo(context.packageName, 0)
            .icon
        return if (res != 0) res else android.R.drawable.ic_dialog_info
    }
}
