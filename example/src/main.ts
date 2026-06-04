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
function log(msg: string, type: 'info' | 'ok' | 'err' | 'event' = 'info') {
  const logEl = $('log');
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logEl.prepend(line);
}

// -------------------------------------------------------------------------
// Boot
// -------------------------------------------------------------------------

const platform = Capacitor.getPlatform();
$('platform-badge').textContent = platform;
$('platform-badge').className = `badge ${platform}`;

// -------------------------------------------------------------------------
// Listeners
// -------------------------------------------------------------------------

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

// -------------------------------------------------------------------------
// Start
// -------------------------------------------------------------------------

let lastActivityId = '';

$('btn-start').addEventListener('click', async () => {
  try {
    const { activityId } = await LiveActivities.start({
      attributes: {
        activityType: val('in-type'),
      },
      state: {
        title:    val('in-title'),
        subtitle: val('in-subtitle') || undefined,
        progress: parseFloat(val('in-progress')) || undefined,
        icon:     val('in-icon') || undefined,
      },
    });

    lastActivityId = activityId;
    // Auto-fill update, end and token fields
    ($ ('in-update-id') as HTMLInputElement).value = activityId;
    ($('in-end-id')    as HTMLInputElement).value = activityId;
    ($('in-token-id')  as HTMLInputElement).value = activityId;

    showResult('start-result', `✅ Started — id: ${activityId}`);
    log(`Started activity id=${activityId}`, 'ok');
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
    await LiveActivities.update({
      activityId,
      state: {
        title:    val('in-update-title'),
        subtitle: val('in-update-subtitle') || undefined,
        progress: parseFloat(val('in-update-progress')) || undefined,
      },
      alertTitle: val('in-alert-title') || undefined,
      alertBody:  val('in-alert-body')  || undefined,
    });
    showResult('update-result', `✅ Updated`);
    log(`Updated activity id=${activityId}`, 'ok');
  } catch (e: any) {
    showResult('update-result', `❌ ${e.message}`, false);
    log(`update error: ${e.message}`, 'err');
  }
});

// -------------------------------------------------------------------------
// End
// -------------------------------------------------------------------------

$('btn-end').addEventListener('click', async () => {
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

// -------------------------------------------------------------------------
// Auto-check on load
// -------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  $('btn-check').click();
  refreshList();
});
