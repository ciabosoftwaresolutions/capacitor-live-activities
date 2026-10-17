package com.ciabosoftwaresolutions.liveactivities

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Routes action-button taps to the plugin.
 *
 * A tap can arrive while the plugin isn't loaded — e.g. the app process was
 * started just to deliver the broadcast, with no activity or WebView. Those taps
 * are persisted and handed to the plugin when it next loads, so none are lost.
 */
object LiveActivityActions {

    private const val PREFS = "capacitor_live_activities"
    private const val KEY_PENDING = "pending_actions"

    /** Set by the plugin while it is loaded. */
    @Volatile
    var listener: ((activityId: String, actionId: String) -> Unit)? = null

    fun dispatch(context: Context, activityId: String, actionId: String) {
        val current = listener
        if (current != null) {
            current(activityId, actionId)
        } else {
            enqueue(context, activityId, actionId)
        }
    }

    /** Returns and clears the taps that arrived while the plugin wasn't loaded. */
    @Synchronized
    fun drain(context: Context): List<Pair<String, String>> {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val raw = prefs.getString(KEY_PENDING, null) ?: return emptyList()
        prefs.edit().remove(KEY_PENDING).apply()
        return try {
            val arr = JSONArray(raw)
            (0 until arr.length()).mapNotNull { i ->
                val obj = arr.optJSONObject(i) ?: return@mapNotNull null
                obj.optString("activityId") to obj.optString("actionId")
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    @Synchronized
    private fun enqueue(context: Context, activityId: String, actionId: String) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val arr = try {
            JSONArray(prefs.getString(KEY_PENDING, "[]"))
        } catch (_: Exception) {
            JSONArray()
        }
        arr.put(JSONObject().put("activityId", activityId).put("actionId", actionId))
        prefs.edit().putString(KEY_PENDING, arr.toString()).apply()
    }
}
