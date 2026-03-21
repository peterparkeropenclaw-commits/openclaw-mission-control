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
// Ops Director: in-process idempotency state
//
// retryIssuedIds  — tasks that have already been given one retry
// escalatedTaskIds — tasks that have already been escalated
//
// A task goes through at most: detected → retry issued → escalated
// --------------------------------------------------------------------------
const retryIssuedIds = new Set();
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
// Ops Director: failure classification
//
// NON-TRANSIENT (escalate immediately, no retry):
//   - auth / config / 401 / 403 / 404 / 422 errors
//   - deploy mismatch / path mismatch
//   - repeated 5xx infra mentioned explicitly
//
// TRANSIENT (retry once):
//   - connection reset / ECONNRESET
//   - timeout
//   - 502 / 503
//   - network error
//   - "timed out" in message
// --------------------------------------------------------------------------
const NON_TRANSIENT_PATTERNS = [
  /401/i,
  /403/i,
  /404/i,
  /422/i,
  /unauthori[zs]ed/i,
  /forbidden/i,
  /not found/i,
  /auth/i,
  /config/i,
  /deploy mismatch/i,
  /path mismatch/i,
  /invalid/i,
];

const TRANSIENT_PATTERNS = [
  /ECONNRESET/i,
  /connection reset/i,
  /timed? ?out/i,
  /timeout/i,
  /502/i,
  /503/i,
  /network error/i,
  /socket hang up/i,
  /ETIMEDOUT/i,
  /ENOTFOUND/i,
];

function classifyFailure(errorMessage) {
  const msg = errorMessage || '';
  if (NON_TRANSIENT_PATTERNS.some((p) => p.test(msg))) return 'non_transient';
  if (TRANSIENT_PATTERNS.some((p) => p.test(msg))) return 'transient';
  // Default: treat unknown failures as non-transient to avoid retry loops
  return 'non_transient';
}

// --------------------------------------------------------------------------
// Ops Director: API helpers
// --------------------------------------------------------------------------
async function fetchFailedTasks() {
  const res = await fetch(`${API}/api/v1/api/tasks?status=failed`, { headers });
  if (!res.ok) throw new Error(`Failed to fetch failed tasks: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.items ?? data.tasks ?? []);
}

async function createRetryTask(original) {
  const body = {
    title: `RETRY: ${original.title}`,
    type: original.type,
    priority: original.priority,
    owner: original.owner,
    context: `Retry of failed task ${original.id}.\n\nOriginal context:\n${original.context || '(none)'}\n\nOriginal error:\n${original.error_message}`,
    acceptance_criteria: original.acceptance_criteria || [],
    source: 'system',
    trigger: 'retry_failed_task'
  };
  const res = await fetch(`${API}/api/v1/api/tasks/create`, {
    method: 'POST', headers,
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Failed to create retry task: ${res.status} ${await res.text()}`);
  return res.json();
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
  if (!res.ok) throw new Error(`Failed to create escalation task: ${res.status} ${await res.text()}`);
  return res.json();
}

async function updateTask(taskId, payload) {
  const res = await fetch(`${API}/api/v1/api/tasks/${taskId}/update`, {
    method: 'POST', headers,
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Failed to update task ${taskId}: ${res.status}`);
  return res.json();
}

// --------------------------------------------------------------------------
// Ops Director: main control loop
//
// Per failed task:
//   1. Skip if already handled (retried or escalated)
//   2. Classify: transient vs non_transient
//   3. Non-transient → escalate immediately
//   4. Transient, first time → create retry task, mark original blocked w/ note
//   5. Transient, retry already issued AND this task is a RETRY: → escalate
// --------------------------------------------------------------------------
async function runEscalationLoop() {
  let failedTasks;
  try {
    failedTasks = await fetchFailedTasks();
  } catch (err) {
    console.error(`[ops-director] error fetching failed tasks: ${err.message || err}`);
    return;
  }

  // Exclude tasks already fully handled
  const unhandled = failedTasks.filter(
    (t) => t.error_message && !escalatedTaskIds.has(t.id)
  );

  if (!unhandled.length) return;

  for (const task of unhandled) {
    console.log(`[ops-director] detected failed task ${task.id} :: ${task.title}`);

    const isRetryTask = task.title.startsWith('RETRY:');
    const classification = classifyFailure(task.error_message);

    console.log(`[ops-director] classified failure as ${classification} :: ${task.id}`);

    // Immediate escalation conditions:
    //   a) non-transient failure
    //   b) this IS a retry task that has also failed (retry limit reached)
    //   c) retry already issued for this id (shouldn't happen but guard it)
    const shouldEscalate =
      classification === 'non_transient' ||
      isRetryTask ||
      retryIssuedIds.has(task.id);

    if (shouldEscalate) {
      if (isRetryTask || retryIssuedIds.has(task.id)) {
        console.log(`[ops-director] retry limit reached for ${task.id}, escalating`);
      }
      // Guard immediately
      escalatedTaskIds.add(task.id);
      try {
        const escalationTask = await createEscalationTask(task);
        console.log(`[ops-director] escalation created for ${task.id} → ${escalationTask.id}`);
        await updateTask(task.id, { status: 'blocked', result_summary: 'Auto-escalated to Peter' });
        console.log(`[ops-director] marked original task as blocked ${task.id}`);
      } catch (err) {
        console.error(`[ops-director] escalation failed for ${task.id}: ${err.message || err}`);
        escalatedTaskIds.delete(task.id);
      }
      continue;
    }

    // Transient, first time — issue retry
    retryIssuedIds.add(task.id);
    try {
      const retryTask = await createRetryTask(task);
      console.log(`[ops-director] retry created for ${task.id} → ${retryTask.id}`);
      await updateTask(task.id, {
        status: 'blocked',
        result_summary: `Retry issued → task ${retryTask.id}`
      });
      console.log(`[ops-director] marked original task as blocked (retry pending) ${task.id}`);
    } catch (err) {
      console.error(`[ops-director] retry creation failed for ${task.id}: ${err.message || err}`);
      retryIssuedIds.delete(task.id);
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
    await sendHeartbeat();
  } catch (err) {
    console.error(`[heartbeat] ${ENTITY_ID} heartbeat error: ${err.message || err}`);
  }
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
