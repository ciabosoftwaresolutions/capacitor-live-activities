package com.ciabosoftwaresolutions.liveactivities

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Receives broadcasts fired from a Live Update:
 *
 * - [ACTION_DISMISSED] — the delete intent, fired when the user swipes the Live
 *   Update away. Google's guidance is to stop reposting dismissed updates, so the
 *   activity is dropped and `activityStateChanged` fires with `dismissed`.
 * - [ACTION_BUTTON] — an action button that doesn't open the app. Forwarded to
 *   JS as `actionPerformed` via [LiveActivityActions].
 */
class LiveActivityReceiver : BroadcastReceiver() {

    companion object {
        const val ACTION_DISMISSED = "com.ciabosoftwaresolutions.liveactivities.DISMISSED"
        const val ACTION_BUTTON = "com.ciabosoftwaresolutions.liveactivities.BUTTON"

        @Volatile
        var manager: LiveActivitiesManager? = null
    }

    override fun onReceive(context: Context, intent: Intent) {
        val activityId = intent.getStringExtra(LiveActivitiesManager.EXTRA_ACTIVITY_ID) ?: return
        when (intent.action) {
            ACTION_BUTTON -> {
                val actionId = intent.getStringExtra(LiveActivitiesManager.EXTRA_ACTION_ID) ?: return
                LiveActivityActions.dispatch(context, activityId, actionId)
            }
            // If the app process is gone there is nothing in memory to clean up; the
            // registry is rebuilt from the notifications still showing on next load.
            ACTION_DISMISSED -> manager?.handleDismissed(activityId)
        }
    }
}
