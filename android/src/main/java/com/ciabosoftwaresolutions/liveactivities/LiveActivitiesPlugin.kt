package com.ciabosoftwaresolutions.liveactivities

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "LiveActivities")
class LiveActivitiesPlugin : Plugin() {

    private lateinit var manager: LiveActivitiesManager

    override fun load() {
        manager = LiveActivitiesManager(context)
    }

    @PluginMethod
    fun isSupported(call: PluginCall) {
        val result = JSObject()
        result.put("supported", true) // Android falls back to sticky notification on older versions
        call.resolve(result)
    }

    @PluginMethod
    fun areActivitiesEnabled(call: PluginCall) {
        val result = JSObject()
        result.put("enabled", true)
        call.resolve(result)
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
            val activityId = manager.start(attributes, state)
            val result = JSObject()
            result.put("activityId", activityId)
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
            manager.update(activityId, state)
            call.resolve()
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

        try {
            manager.end(activityId, finalState)
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
