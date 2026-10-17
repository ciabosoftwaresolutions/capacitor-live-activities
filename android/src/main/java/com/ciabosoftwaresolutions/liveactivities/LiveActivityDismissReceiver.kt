package com.ciabosoftwaresolutions.liveactivities

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Receives the delete intent fired when the user swipes a Live Update away.
 * Google's guidance is to stop reposting updates the user dismissed, so the
 * activity is dropped from the registry and `activityStateChanged` fires with
 * `dismissed`.
 */
class LiveActivityDismissReceiver : BroadcastReceiver() {

    companion object {
        @Volatile
        var manager: LiveActivitiesManager? = null
    }

    override fun onReceive(context: Context, intent: Intent) {
        val activityId = intent.getStringExtra(LiveActivitiesManager.EXTRA_ACTIVITY_ID) ?: return
        // If the app process is gone there is nothing in memory to clean up; the
        // registry is rebuilt from the notifications still showing on next load.
        manager?.handleDismissed(activityId)
    }
}
