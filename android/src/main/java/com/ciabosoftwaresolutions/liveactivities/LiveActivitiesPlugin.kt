package com.ciabosoftwaresolutions.liveactivities

import android.os.Build
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

@CapacitorPlugin(
    name = "LiveActivities",
    permissions = [
        Permission(
            alias = "notifications",
            strings = ["android.permission.POST_NOTIFICATIONS"]
        )
    ]
)
class LiveActivitiesPlugin : Plugin() {

    private lateinit var manager: LiveActivitiesManager

    override fun load() {
        manager = LiveActivitiesManager(context)
        manager.onDismissed = { activityId ->
            val event = JSObject()
            event.put("activityId", activityId)
            event.put("activityState", "dismissed")
            notifyListeners("activityStateChanged", event)
        }
        LiveActivityDismissReceiver.manager = manager
    }

    override fun handleOnDestroy() {
        if (LiveActivityDismissReceiver.manager === manager) {
            LiveActivityDismissReceiver.manager = null
        }
        super.handleOnDestroy()
    }

    // -------------------------------------------------------------------------
    // Permissions
    // -------------------------------------------------------------------------

    @PluginMethod
    override fun checkPermissions(call: PluginCall) {
        val result = JSObject()
        result.put("notifications", getNotificationPermissionState())
        call.resolve(result)
    }

    @PluginMethod
    override fun requestPermissions(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (getPermissionState("notifications") != com.getcapacitor.PermissionState.GRANTED) {
                requestPermissionForAlias("notifications", call, "permissionsCallback")
                return
            }
        }
        val result = JSObject()
        result.put("notifications", getNotificationPermissionState())
        call.resolve(result)
    }

    @PermissionCallback
    private fun permissionsCallback(call: PluginCall) {
        val result = JSObject()
        result.put("notifications", getNotificationPermissionState())
        call.resolve(result)
    }

    private fun getNotificationPermissionState(): String {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return "granted"
        return when (getPermissionState("notifications")) {
            com.getcapacitor.PermissionState.GRANTED -> "granted"
            com.getcapacitor.PermissionState.DENIED  -> "denied"
            else                                      -> "prompt"
        }
    }

    // -------------------------------------------------------------------------
    // Plugin methods
    // -------------------------------------------------------------------------

    @PluginMethod
    fun isSupported(call: PluginCall) {
        val result = JSObject()
        result.put("supported", true)
        call.resolve(result)
    }

    @PluginMethod
    fun areActivitiesEnabled(call: PluginCall) {
        val result = JSObject()
        result.put("enabled", manager.areActivitiesEnabled())
        call.resolve(result)
    }

    @PluginMethod
    fun openSettings(call: PluginCall) {
        try {
            manager.openSettings()
            call.resolve()
        } catch (e: Exception) {
            call.reject(e.message ?: "Unable to open settings")
        }
    }

    @PluginMethod
    fun start(call: PluginCall) {
        val attributes = call.getObject("attributes")
        val state = call.getObject("state")

        if (attributes == null || state == null) {
            call.reject("Missing required options: attributes and state")
            return
        }

        try {
            val posted = manager.start(attributes, state)
            val result = JSObject()
            result.put("activityId", posted.activityId)
            result.put("liveUpdate", posted.liveUpdate)
            call.resolve(result)
        } catch (e: Exception) {
            call.reject(e.message ?: "Failed to start Live Activity")
        }
    }

    @PluginMethod
    fun update(call: PluginCall) {
        val activityId = call.getString("activityId")
        val state = call.getObject("state")

        if (activityId == null || state == null) {
            call.reject("Missing required options: activityId and state")
            return
        }

        try {
            val result = JSObject()
            result.put("liveUpdate", manager.update(activityId, state))
            call.resolve(result)
        } catch (e: Exception) {
            call.reject(e.message ?: "Failed to update Live Activity")
        }
    }

    @PluginMethod
    fun end(call: PluginCall) {
        val activityId = call.getString("activityId")

        if (activityId == null) {
            call.reject("Missing required option: activityId")
            return
        }

        val finalState = call.getObject("finalState")
        val dismissalPolicy = call.getString("dismissalPolicy")

        try {
            manager.end(activityId, finalState, dismissalPolicy)
            call.resolve()
        } catch (e: Exception) {
            call.reject(e.message ?: "Failed to end Live Activity")
        }
    }

    @PluginMethod
    fun getPushToken(call: PluginCall) {
        manager.getFcmToken { token ->
            val result = JSObject()
            if (token != null) {
                result.put("token", token)
                result.put("type", "fcm")
            } else {
                result.put("token", JSObject.NULL)
                result.put("type", JSObject.NULL)
            }
            call.resolve(result)
        }
    }

    @PluginMethod
    fun getPushToStartToken(call: PluginCall) {
        // Push-to-start is an iOS 17.2+ concept with no Android equivalent.
        // To start a Live Update from the server on Android, send an FCM data
        // message and call start() from your FirebaseMessagingService handler.
        val result = JSObject()
        result.put("token", JSObject.NULL)
        result.put("type", JSObject.NULL)
        call.resolve(result)
    }

    @PluginMethod
    fun getActiveActivities(call: PluginCall) {
        val activities = manager.getActiveActivities()
        val arr = JSArray()
        for (info in activities) {
            val obj = JSObject()
            obj.put("activityId", info.activityId)
            obj.put("activityType", info.activityType)
            obj.put("state", info.state)
            arr.put(obj)
        }
        val result = JSObject()
        result.put("activities", arr)
        call.resolve(result)
    }
}
