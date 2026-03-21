# Builder heartbeat task consumption (Phase 4)

This PR tracks the live Builder runtime change deployed on the Mac Mini at:

- `~/.openclaw/heartbeat.js`
- PM2 process: `heartbeat-builder`

## Runtime behavior added

- Builder uses the existing heartbeat interval only (no second scheduler)
- Reads queued tasks from heartbeat response
- Processes at most 1 task per cycle
- Marks task `in_progress` before handling
- Uses placeholder handler in v1
- Marks task `completed` on success or `failed` on error

## Required env

- `MISSION_CONTROL_API=https://openclaw-mission-control-production-f6a2.up.railway.app`
- `LOCAL_AUTH_TOKEN=<existing token>`

## Observed logs after deploy

- heartbeat process restarted successfully via PM2
- heartbeat responses returning HTTP 200
- runtime ready to consume `tasks` array from heartbeat response

## Exact deployed script

```js
const API = process.env.MISSION_CONTROL_API || 'https://openclaw-mission-control-production-f6a2.up.railway.app';
const HEARTBEAT_URL = `${API}/api/status/heartbeat`;
const TOKEN = process.env.LOCAL_AUTH_TOKEN || '';
const ENTITY_ID = process.env.HEARTBEAT_ENTITY_ID;
const ROLE = process.env.HEARTBEAT_ROLE;
const INTERVAL = parseInt(process.env.HEARTBEAT_INTERVAL_SEC || '180', 10) * 1000;

const headers = {
  'Authorization': `Bearer ${TOKEN}`,
  'Content-Type': 'application/json'
};

async function sendHeartbeat() {
  const res = await fetch(HEARTBEAT_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      entity_type: 'agent',
      entity_id: ENTITY_ID,
      role: ROLE,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      health: { env_ok: true, auth_ok: true, restart_count_24h: 0 },
      activity: { last_task_outcome: null, last_task_finished_at: null },
      errors: { last_error_message: null },
      soul: { config_version: 'v2.0' }
    })
  });
  if (!res.ok) throw new Error(`Heartbeat failed: ${res.status}`);
  console.log(`[heartbeat] ${ENTITY_ID} → ${res.status}`);
  return res.json();
}

async function markInProgress(task) {
  console.log(`[builder] in_progress update ${task.id}`);
  const res = await fetch(`${API}/api/tasks/${task.id}/update`, { method: 'POST', headers, body: JSON.stringify({ status: 'in_progress', result_summary: null, error_message: null }) });
  if (!res.ok) throw new Error(`Failed to mark task in_progress: ${res.status}`);
  return res.json();
}

async function handleTask(task) {
  console.log(`[builder] executing task ${task.id} :: ${task.title} :: ${task.type}`);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return { success: true, summary: 'Builder processed task successfully.' };
}

async function markCompleted(task, summary) {
  console.log(`[builder] completed update ${task.id}`);
  const res = await fetch(`${API}/api/tasks/${task.id}/update`, { method: 'POST', headers, body: JSON.stringify({ status: 'completed', result_summary: summary, error_message: null }) });
  if (!res.ok) throw new Error(`Failed to mark task completed: ${res.status}`);
  return res.json();
}

async function markFailed(task, err) {
  console.log(`[builder] failed update ${task.id}`);
  const res = await fetch(`${API}/api/tasks/${task.id}/update`, { method: 'POST', headers, body: JSON.stringify({ status: 'failed', result_summary: null, error_message: String(err) }) });
  if (!res.ok) throw new Error(`Failed to mark task failed: ${res.status}`);
  return res.json();
}

async function processTask(task) {
  try {
    await markInProgress(task);
  } catch (err) {
    console.error(`[builder] markInProgress failed for ${task.id}: ${err}`);
    return;
  }
  try {
    const result = await Promise.race([
      handleTask(task),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Task execution timed out')), 30000))
    ]);
    await markCompleted(task, result.summary);
  } catch (err) {
    try {
      await markFailed(task, err);
    } catch (failErr) {
      console.error(`[builder] markFailed failed for ${task.id}: ${failErr}`);
    }
  }
}

async function builderHeartbeatCycle() {
  try {
    const res = await sendHeartbeat();
    const tasks = res.tasks || [];
    if (!tasks.length) return;
    const task = tasks[0];
    console.log(`[builder] task received ${task.id}`);
    await processTask(task);
  } catch (err) {
    console.error(`[heartbeat] ${ENTITY_ID} error: ${err.message || err}`);
  }
}

builderHeartbeatCycle();
setInterval(builderHeartbeatCycle, INTERVAL);
```
