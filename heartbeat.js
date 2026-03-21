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

// --------------------------------------------------------------------------
// Shared: idempotency guard for escalation (in-process memory)
// Prevents duplicate escalation tasks for the same failed task ID.
// --------------------------------------------------------------------------
const escalatedTaskIds = new Set();

// --------------------------------------------------------------------------
// Shared: heartbeat ping
// --------------------------------------------------------------------------
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

// --------------------------------------------------------------------------
// Builder: task execution helpers
// --------------------------------------------------------------------------
async function markInProgress(task) {
  console.log(`[builder] in_progress update ${task.id}`);
  const res = await fetch(`${API}/api/v1/api/tasks/${task.id}/update`, {
    method: 'POST', headers,
    body: JSON.stringify({ status: 'in_progress', result_summary: null, error_message: null })
  });
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
  const res = await fetch(`${API}/api/v1/api/tasks/${task.id}/update`, {
    method: 'POST', headers,
    body: JSON.stringify({ status: 'completed', result_summary: summary, error_message: null })
  });
  if (!res.ok) throw new Error(`Failed to mark task completed: ${res.status}`);
  return res.json();
}

async function markFailed(task, err) {
  console.log(`[builder] failed update ${task.id}`);
  const res = await fetch(`${API}/api/v1/api/tasks/${task.id}/update`, {
    method: 'POST', headers,
    body: JSON.stringify({ status: 'failed', result_summary: null, error_message: String(err) })
  });
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

// --------------------------------------------------------------------------
// Ops Director: failure detection + escalation loop
// --------------------------------------------------------------------------
async function fetchFailedTasks() {
  const res = await fetch(`${API}/api/v1/api/tasks?status=failed`, { headers });
  if (!res.ok) throw new Error(`Failed to fetch failed tasks: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.items ?? data.tasks ?? []);
}

async function createEscalationTask(original) {
  const body = {
    title: `ESCALATION: Fix failed task ${original.id}`,
    type: 'bugfix',
    priority: 'critical',
    owner: 'peter',
    context: `Original task failed.\n\nTitle: ${original.title}\nContext: ${original.context || '(none)'}\nError: ${original.error_message}`,
    acceptance_criteria: [
      'Root cause identified',
      'Fix implemented',
      'Original task re-run successfully'
    ],
    source: 'ops_director',
    trigger: 'failed_task'
  };
  const res = await fetch(`${API}/api/v1/api/tasks/create`, {
    method: 'POST', headers,
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Failed to create escalation task: ${res.status}`);
  return res.json();
}

async function markBlocked(taskId) {
  const res = await fetch(`${API}/api/v1/api/tasks/${taskId}/update`, {
    method: 'POST', headers,
    body: JSON.stringify({ status: 'blocked', result_summary: 'Auto-escalated to Peter' })
  });
  if (!res.ok) throw new Error(`Failed to mark task blocked: ${res.status}`);
  return res.json();
}

async function runEscalationLoop() {
  let failedTasks;
  try {
    failedTasks = await fetchFailedTasks();
  } catch (err) {
    console.error(`[ops-director] error fetching failed tasks: ${err.message || err}`);
    return;
  }

  // Filter: must have error_message, must not already be escalated
  const toEscalate = failedTasks.filter(
    (t) => t.error_message && !escalatedTaskIds.has(t.id)
  );

  if (!toEscalate.length) return;

  for (const task of toEscalate) {
    console.log(`[ops-director] detected failed task ${task.id} :: ${task.title}`);

    // Guard immediately to prevent race conditions on slow networks
    escalatedTaskIds.add(task.id);

    try {
      const escalationTask = await createEscalationTask(task);
      console.log(`[ops-director] escalation created for ${task.id} → ${escalationTask.id}`);

      await markBlocked(task.id);
      console.log(`[ops-director] marked original task as blocked ${task.id}`);
    } catch (err) {
      console.error(`[ops-director] escalation failed for ${task.id}: ${err.message || err}`);
      // Remove from guard so it retries next cycle
      escalatedTaskIds.delete(task.id);
    }
  }
}

// --------------------------------------------------------------------------
// Main cycle — routed by ENTITY_ID
// --------------------------------------------------------------------------
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

async function opsDirectorHeartbeatCycle() {
  try {
    // Send heartbeat (ops-director doesn't consume tasks from it)
    await sendHeartbeat();
  } catch (err) {
    console.error(`[heartbeat] ${ENTITY_ID} heartbeat error: ${err.message || err}`);
  }
  // Run escalation loop independently of heartbeat success
  await runEscalationLoop();
}

async function genericHeartbeatCycle() {
  try {
    await sendHeartbeat();
  } catch (err) {
    console.error(`[heartbeat] ${ENTITY_ID} error: ${err.message || err}`);
  }
}

// --------------------------------------------------------------------------
// Bootstrap
// --------------------------------------------------------------------------
function getCycle() {
  if (ENTITY_ID === 'builder') return builderHeartbeatCycle;
  if (ENTITY_ID === 'ops-director') return opsDirectorHeartbeatCycle;
  return genericHeartbeatCycle;
}

const cycle = getCycle();
cycle();
setInterval(cycle, INTERVAL);
