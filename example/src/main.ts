import { Capacitor } from '@capacitor/core';
import { LiveActivities } from '@ciabosoftwaresolutions/capacitor-live-activities';

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function $(id: string) {
  return document.getElementById(id)!;
}
function val(id: string) {
  return ($(id) as HTMLInputElement).value.trim();
}
function showResult(id: string, text: string, ok = true) {
  const el = $(id);
  el.textContent = text;
  el.className = `result ${ok ? 'ok' : 'err'}`;
}
/** Android only — shows whether the system accepted the notification as a Live Update. */
function liveUpdateLabel(liveUpdate?: boolean) {
  if (liveUpdate === undefined) return '';
  return liveUpdate ? '  · ✅ Live Update' : '  · ⚠️ plain notification (not promoted)';
}
function log(msg: string, type: 'info' | 'ok' | 'err' | 'event' = 'info') {
  const logEl = $('log');
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logEl.prepend(line);
}

/**
 * Reads the shared Appearance controls and returns the style fields to spread
 * into a Live Activity `state`. Each platform ignores the other's fields.
 */
function getAppearance() {
  const useKeyline = ($('in-use-keyline') as HTMLInputElement).checked;
  const direction  = ($('in-timer-direction') as HTMLSelectElement).value;
  const useAccent  = ($('in-use-accent') as HTMLInputElement).checked;
  return {
    backgroundColor:   ($('in-bg-color')       as HTMLInputElement).value,
    progressColor:     ($('in-progress-color') as HTMLInputElement).value,
    textColor:         ($('in-text-color')     as HTMLInputElement).value,
    iconColor:         ($('in-icon-color')     as HTMLInputElement).value,
    keylineTint:       useKeyline ? ($('in-keyline-color') as HTMLInputElement).value : undefined,
    progressBarHeight: parseInt(($('in-bar-height') as HTMLInputElement).value),
    timerCountsDown:   direction !== 'up',
    // Android
    accentColor:       useAccent ? ($('in-accent-color') as HTMLInputElement).value : undefined,
  };
}

// -------------------------------------------------------------------------
// Action buttons list — sent as `state.actions`
// -------------------------------------------------------------------------

const ANDROID_MAX_ACTIONS = 3;

function addActionRow(action: { id: string; title: string; opensApp?: boolean } = { id: '', title: '' }) {
  const li = document.createElement('li');
  li.className = 'action-row';
  li.innerHTML = `
    <input class="action-id" type="text" placeholder="id" />
    <input class="action-title" type="text" placeholder="Title" />
    <label class="opens-app"><input class="action-opens-app" type="checkbox" /> opens app</label>
    <button class="small danger" title="Remove">✕</button>
  `;
  (li.querySelector('.action-id') as HTMLInputElement).value = action.id;
  (li.querySelector('.action-title') as HTMLInputElement).value = action.title;
  (li.querySelector('.action-opens-app') as HTMLInputElement).checked = !!action.opensApp;
  li.querySelector('button')!.addEventListener('click', () => {
    li.remove();
    updateActionLimitHint();
  });
  $('action-list').appendChild(li);
  updateActionLimitHint();
}

function updateActionLimitHint() {
  const count = $('action-list').children.length;
  $('action-limit').classList.toggle('hidden', count <= ANDROID_MAX_ACTIONS);
}

/** Reads the Action buttons list into `state.actions`. */
function getActions() {
  if (!($('in-use-actions') as HTMLInputElement).checked) return {};
  const actions = Array.from($('action-list').children).map((li) => ({
    id:       (li.querySelector('.action-id')    as HTMLInputElement).value.trim(),
    title:    (li.querySelector('.action-title') as HTMLInputElement).value.trim(),
    opensApp: (li.querySelector('.action-opens-app') as HTMLInputElement).checked || undefined,
  })).filter((a) => a.id && a.title);
  return { actions };
}

$('btn-add-action').addEventListener('click', () => addActionRow());

// Defaults — Android's maximum of 3
addActionRow({ id: 'cancel',  title: 'Cancel' });
addActionRow({ id: 'contact', title: 'Contact', opensApp: true });
addActionRow({ id: 'track',   title: 'Track' });

// -------------------------------------------------------------------------
// Boot
// -------------------------------------------------------------------------

const platform = Capacitor.getPlatform();
$('platform-badge').textContent = platform;
$('platform-badge').className = `badge ${platform}`;

// -------------------------------------------------------------------------
// Listeners
// -------------------------------------------------------------------------

// Action buttons — your app decides what a tap means. Taps made while the app
// wasn't running are delivered here as soon as this listener is registered.
LiveActivities.addListener('actionPerformed', async ({ activityId, actionId }) => {
  log(`actionPerformed → id=${activityId}  action=${actionId}`, 'event');
  if (actionId === 'cancel') {
    if (activityId === timerActivityId) clearTimerInterval();
    try {
      await LiveActivities.end({
        activityId,
        finalState: { title: 'Order cancelled', subtitle: 'Cancelled from the Live Activity', ...getAppearance() },
      });
      log(`Ended activity id=${activityId} after Cancel`, 'ok');
    } catch (e: any) {
      log(`end after Cancel failed: ${e.message}`, 'err');
    }
    refreshList();
  }
});

LiveActivities.addListener('activityStateChanged', (event) => {
  log(`activityStateChanged → id=${event.activityId}  state=${event.activityState}`, 'event');
  refreshList();
});

// -------------------------------------------------------------------------
// Check support
// -------------------------------------------------------------------------

$('btn-check').addEventListener('click', async () => {
  try {
    const { supported } = await LiveActivities.isSupported();
    const { enabled }   = await LiveActivities.areActivitiesEnabled();
    $('is-supported').textContent     = supported ? '✅ yes' : '❌ no';
    $('is-supported').className       = `value ${supported ? 'ok' : 'err'}`;
    $('activities-enabled').textContent = enabled ? '✅ yes' : '❌ no';
    $('activities-enabled').className   = `value ${enabled ? 'ok' : 'err'}`;
    log(`isSupported=${supported}  areActivitiesEnabled=${enabled}`, 'ok');
  } catch (e: any) {
    log(`check support error: ${e.message}`, 'err');
  }
});

$('btn-open-settings').addEventListener('click', async () => {
  try {
    await LiveActivities.openSettings();
    log('Opened settings', 'ok');
  } catch (e: any) {
    log(`openSettings error: ${e.message}`, 'err');
  }
});

// Settings may have changed while the user was away
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') $('btn-check').click();
});

// -------------------------------------------------------------------------
// Start
// -------------------------------------------------------------------------

let lastActivityId = '';

$('btn-start').addEventListener('click', async () => {
  try {
    const { activityId, liveUpdate } = await LiveActivities.start({
      attributes: {
        activityType: val('in-type'),
      },
      state: {
        title:    val('in-title'),
        subtitle: val('in-subtitle') || undefined,
        progress: parseFloat(val('in-progress')) || undefined,
        icon:     val('in-icon') || undefined,
        shortCriticalText: val('in-chip') || undefined,
        ...getAppearance(),
        ...getActions(),
      },
    });

    lastActivityId = activityId;
    // Auto-fill update, end and token fields
    ($ ('in-update-id') as HTMLInputElement).value = activityId;
    ($('in-end-id')    as HTMLInputElement).value = activityId;
    ($('in-token-id')  as HTMLInputElement).value = activityId;

    showResult('start-result', `✅ Started — id: ${activityId}${liveUpdateLabel(liveUpdate)}`);
    log(`Started activity id=${activityId}${liveUpdateLabel(liveUpdate)}`, 'ok');
    refreshList();
  } catch (e: any) {
    showResult('start-result', `❌ ${e.message}`, false);
    log(`start error: ${e.message}`, 'err');
  }
});

// -------------------------------------------------------------------------
// Update
// -------------------------------------------------------------------------

$('btn-update').addEventListener('click', async () => {
  const activityId = val('in-update-id') || lastActivityId;
  if (!activityId) {
    showResult('update-result', '❌ No activity ID', false);
    return;
  }
  try {
    const { liveUpdate } = await LiveActivities.update({
      activityId,
      state: {
        title:    val('in-update-title'),
        subtitle: val('in-update-subtitle') || undefined,
        progress: parseFloat(val('in-update-progress')) || undefined,
        icon:     val('in-update-icon') || undefined,
        shortCriticalText: val('in-update-chip') || undefined,
        // Re-send appearance — each update REPLACES the full content state,
        // so icon/colors reset to defaults if you omit them.
        ...getAppearance(),
        ...getActions(),
      },
      alertTitle: val('in-alert-title') || undefined,
      alertBody:  val('in-alert-body')  || undefined,
    });
    showResult('update-result', `✅ Updated${liveUpdateLabel(liveUpdate)}`);
    log(`Updated activity id=${activityId}${liveUpdateLabel(liveUpdate)}`, 'ok');
  } catch (e: any) {
    showResult('update-result', `❌ ${e.message}`, false);
    log(`update error: ${e.message}`, 'err');
  }
});

// -------------------------------------------------------------------------
// End
// -------------------------------------------------------------------------

$('btn-end').addEventListener('click', async () => {
  clearTimerInterval();
  const activityId = val('in-end-id') || lastActivityId;
  if (!activityId) {
    showResult('end-result', '❌ No activity ID', false);
    return;
  }
  try {
    await LiveActivities.end({
      activityId,
      finalState: {
        title:    val('in-end-title'),
        subtitle: val('in-end-subtitle') || undefined,
        progress: 1.0,
        icon:     'checkmark.circle.fill',
        ...getAppearance(),
      },
      dismissalPolicy: (document.getElementById('in-dismissal') as HTMLSelectElement).value as any,
    });
    showResult('end-result', `✅ Ended`);
    log(`Ended activity id=${activityId}`, 'ok');
    refreshList();
  } catch (e: any) {
    showResult('end-result', `❌ ${e.message}`, false);
    log(`end error: ${e.message}`, 'err');
  }
});

// -------------------------------------------------------------------------
// Timer demo
// -------------------------------------------------------------------------

let timerTimeout: ReturnType<typeof setTimeout> | null = null;
let timerActivityId = '';

function clearTimerInterval() {
  if (timerTimeout !== null) {
    clearTimeout(timerTimeout);
    timerTimeout = null;
  }
}

$('btn-start-timer').addEventListener('click', async () => {
  // Replace any running timer demo so it doesn't linger without its auto-end
  clearTimerInterval();
  if (timerActivityId) {
    LiveActivities.end({ activityId: timerActivityId, dismissalPolicy: 'immediate' }).catch(() => {});
    timerActivityId = '';
  }

  const durationSeconds = parseInt(($('in-timer-duration') as HTMLSelectElement).value);
  const durationMs      = durationSeconds * 1000;
  const nowSeconds      = Date.now() / 1000;
  const timerStart      = nowSeconds;
  const timerEnd        = nowSeconds + durationSeconds;

  const title    = val('in-timer-title');
  const subtitle = val('in-timer-subtitle') || undefined;
  const icon     = ($('in-timer-icon') as HTMLSelectElement).value || undefined;

  try {
    const { activityId, liveUpdate } = await LiveActivities.start({
      attributes: { activityType: 'timer-demo' },
      state: {
        title,
        // Both platforms render a native countdown from timerEnd
        subtitle,
        icon,
        timerStart,
        timerEnd,
        // Android derives the bar from timerStart/timerEnd when progress is unset
        progress:  platform === 'android' ? undefined : 0,
        ...getAppearance(),
        ...getActions(),
      },
    });

    timerActivityId = activityId;
    lastActivityId  = activityId;
    ($('in-update-id') as HTMLInputElement).value = activityId;
    ($('in-end-id')    as HTMLInputElement).value = activityId;
    ($('in-token-id')  as HTMLInputElement).value = activityId;

    const mins = Math.floor(durationSeconds / 60);
    const secs = durationSeconds % 60;
    showResult('timer-result', `✅ Timer started — ${mins}:${secs.toString().padStart(2,'0')}`);
    log(`Timer started — ${durationSeconds}s, id=${activityId}${liveUpdateLabel(liveUpdate)}`, 'ok');
    refreshList();

    // Both platforms animate the countdown and progress bar natively.
    // On Android, end the demo once the timer runs out so it doesn't linger.
    if (platform === 'android') {
      timerTimeout = setTimeout(async () => {
        timerTimeout = null;
        try {
          await LiveActivities.end({
            activityId,
            finalState: { title, subtitle: 'Done!', progress: 1, icon, ...getAppearance() },
          });
          log(`Timer ended — id=${activityId}`, 'ok');
          refreshList();
        } catch (_) {}
      }, durationMs);
    }
  } catch (e: any) {
    showResult('timer-result', `❌ ${e.message}`, false);
    log(`timer start error: ${e.message}`, 'err');
  }
});

// -------------------------------------------------------------------------
// Push token
// -------------------------------------------------------------------------

$('btn-get-token').addEventListener('click', async () => {
  const activityId = val('in-token-id') || lastActivityId;
  if (!activityId) {
    showResult('token-result', '❌ No activity ID — start an activity first', false);
    return;
  }
  try {
    const { token, type } = await LiveActivities.getPushToken({ activityId });
    const tokenBox = $('token-value');

    if (token) {
      showResult('token-result', `✅ ${type?.toUpperCase()} token received`);
      tokenBox.textContent = token;
      tokenBox.className = 'token-box';
      log(`Push token (${type}): ${token.slice(0, 16)}…`, 'ok');
    } else {
      showResult('token-result',
        platform === 'android'
          ? '⚠️  null — Firebase not configured (app-driven updates still work)'
          : '⚠️  null — token not issued yet, wait for pushTokenUpdated event',
        false);
      tokenBox.className = 'token-box hidden';
      log('getPushToken returned null', 'info');
    }
  } catch (e: any) {
    showResult('token-result', `❌ ${e.message}`, false);
    log(`getPushToken error: ${e.message}`, 'err');
  }
});

// Listen for iOS token rotation
LiveActivities.addListener('pushTokenUpdated', (event) => {
  log(`pushTokenUpdated → id=${event.activityId}  token=${event.token.slice(0, 16)}…  type=${event.type}`, 'event');
  // Auto-fill the token field with the fresh value
  ($('in-token-id') as HTMLInputElement).value = event.activityId;
  $('token-value').textContent = event.token;
  $('token-value').className = 'token-box';
});

// -------------------------------------------------------------------------
// List
// -------------------------------------------------------------------------

$('btn-list').addEventListener('click', refreshList);

async function refreshList() {
  try {
    const { activities } = await LiveActivities.getActiveActivities();
    const ul = $('activity-list');
    ul.innerHTML = '';
    if (activities.length === 0) {
      ul.innerHTML = '<li class="empty">No active activities</li>';
      return;
    }
    for (const a of activities) {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="act-id">${a.activityId.slice(0, 8)}…</span>
        <span class="act-type">${a.activityType}</span>
        <span class="act-state state-${a.state}">${a.state}</span>
      `;
      ul.appendChild(li);
    }
  } catch (e: any) {
    log(`list error: ${e.message}`, 'err');
  }
}

// -------------------------------------------------------------------------
// Clear log
// -------------------------------------------------------------------------

$('btn-clear-log').addEventListener('click', () => {
  $('log').innerHTML = '';
});

// Live-update the progress bar height label
$('in-bar-height').addEventListener('input', (e) => {
  $('bar-height-val').textContent = (e.target as HTMLInputElement).value;
});

// -------------------------------------------------------------------------
// Auto-check on load
// -------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  $('btn-check').click();
  refreshList();
});
