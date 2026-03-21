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
// retryIssuedIds   — tasks already given one retry
// escalatedTaskIds — tasks already escalated to Peter
// reviewHandoffIds — completed Builder tasks already handed to Reviewer
// --------------------------------------------------------------------------
const retryIssuedIds = new Set();
const escalatedTaskIds = new Set();
const reviewHandoffIds = new Set();

// --------------------------------------------------------------------------
// Shared: heartbeat ping + task delivery
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

async function updateTask(taskId, payload) {
  const res = await fetch(`${API}/api/v1/api/tasks/${taskId}/update`, {
    method: 'POST', headers,
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Failed to update task ${taskId}: ${res.status}`);
  return res.json();
}

// --------------------------------------------------------------------------
// Builder: task execution
// --------------------------------------------------------------------------
async function handleTask(task) {
  console.log(`[builder] executing task ${task.id} :: ${task.title} :: ${task.type}`);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return { success: true, summary: 'Builder processed task successfully.' };
}

async function processBuilderTask(task) {
  try {
    console.log(`[builder] in_progress update ${task.id}`);
    await updateTask(task.id, { status: 'in_progress', result_summary: null, error_message: null });
  } catch (err) {
    console.error(`[builder] markInProgress failed for ${task.id}: ${err}`);
    return;
  }
  try {
    const result = await Promise.race([
      handleTask(task),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Task execution timed out')), 30000))
    ]);
    console.log(`[builder] completed update ${task.id}`);
    await updateTask(task.id, { status: 'completed', result_summary: result.summary, error_message: null });
  } catch (err) {
    try {
      console.log(`[builder] failed update ${task.id}`);
      await updateTask(task.id, { status: 'failed', result_summary: null, error_message: String(err) });
    } catch (failErr) {
      console.error(`[builder] markFailed failed for ${task.id}: ${failErr}`);
    }
  }
}

// --------------------------------------------------------------------------
// Reviewer: task execution (placeholder)
// --------------------------------------------------------------------------
async function handleReviewTask(task) {
  console.log(`[reviewer] executing review task ${task.id} :: ${task.title}`);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return { success: true, summary: 'Reviewer processed review task successfully.' };
}

async function processReviewerTask(task) {
  try {
    console.log(`[reviewer] in_progress update ${task.id}`);
    await updateTask(task.id, { status: 'in_progress', result_summary: null, error_message: null });
  } catch (err) {
    console.error(`[reviewer] markInProgress failed for ${task.id}: ${err}`);
    return;
  }
  try {
    const result = await Promise.race([
      handleReviewTask(task),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Review timed out')), 30000))
    ]);
    console.log(`[reviewer] completed update ${task.id}`);
    await updateTask(task.id, { status: 'completed', result_summary: result.summary, error_message: null });
  } catch (err) {
    try {
      console.log(`[reviewer] failed update ${task.id}`);
      await updateTask(task.id, { status: 'failed', result_summary: null, error_message: String(err) });
    } catch (failErr) {
      console.error(`[reviewer] markFailed failed for ${task.id}: ${failErr}`);
    }
  }
}

// --------------------------------------------------------------------------
// Ops Director: failure classification
// --------------------------------------------------------------------------
const NON_TRANSIENT_PATTERNS = [
  /401/i, /403/i, /404/i, /422/i,
  /unauthori[zs]ed/i, /forbidden/i, /not found/i,
  /auth/i, /config/i, /deploy mismatch/i, /path mismatch/i, /invalid/i,
];

const TRANSIENT_PATTERNS = [
  /ECONNRESET/i, /connection reset/i, /timed? ?out/i, /timeout/i,
  /502/i, /503/i, /network error/i, /socket hang up/i, /ETIMEDOUT/i, /ENOTFOUND/i,
];

function classifyFailure(errorMessage) {
  const msg = errorMessage || '';
  if (NON_TRANSIENT_PATTERNS.some((p) => p.test(msg))) return 'non_transient';
  if (TRANSIENT_PATTERNS.some((p) => p.test(msg))) return 'transient';
  return 'non_transient';
}

// --------------------------------------------------------------------------
// Ops Director: failure detection → retry/escalate loop
// --------------------------------------------------------------------------
async function fetchTasksByStatus(status) {
  const res = await fetch(`${API}/api/v1/api/tasks?status=${status}`, { headers });
  if (!res.ok) throw new Error(`Failed to fetch tasks (status=${status}): ${res.status}`);
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
    acceptance_criteria: ['Root cause identified', 'Fix implemented', 'Original task re-run successfully'],
    source: 'ops_director',
    trigger: 'failed_task'
  };
  const res = await fetch(`${API}/api/v1/api/tasks/create`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Failed to create escalation task: ${res.status} ${await res.text()}`);
  return res.json();
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
  const res = await fetch(`${API}/api/v1/api/tasks/create`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Failed to create retry task: ${res.status} ${await res.text()}`);
  return res.json();
}

async function runFailureLoop() {
  let failedTasks;
  try {
    failedTasks = await fetchTasksByStatus('failed');
  } catch (err) {
    console.error(`[ops-director] error fetching failed tasks: ${err.message || err}`);
    return;
  }

  const unhandled = failedTasks.filter((t) => t.error_message && !escalatedTaskIds.has(t.id));
  if (!unhandled.length) return;

  for (const task of unhandled) {
    console.log(`[ops-director] detected failed task ${task.id} :: ${task.title}`);
    const isRetryTask = task.title.startsWith('RETRY:');
    const classification = classifyFailure(task.error_message);
    console.log(`[ops-director] classified failure as ${classification} :: ${task.id}`);

    const shouldEscalate = classification === 'non_transient' || isRetryTask || retryIssuedIds.has(task.id);

    if (shouldEscalate) {
      if (isRetryTask || retryIssuedIds.has(task.id)) {
        console.log(`[ops-director] retry limit reached for ${task.id}, escalating`);
      }
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

    retryIssuedIds.add(task.id);
    try {
      const retryTask = await createRetryTask(task);
      console.log(`[ops-director] retry created for ${task.id} → ${retryTask.id}`);
      await updateTask(task.id, { status: 'blocked', result_summary: `Retry issued → task ${retryTask.id}` });
      console.log(`[ops-director] marked original task as blocked (retry pending) ${task.id}`);
    } catch (err) {
      console.error(`[ops-director] retry creation failed for ${task.id}: ${err.message || err}`);
      retryIssuedIds.delete(task.id);
    }
  }
}

// --------------------------------------------------------------------------
// Ops Director: review handoff loop
//
// Detects completed Builder tasks → creates Reviewer task → moves original
// to status="review". One review task per completed Builder task.
// --------------------------------------------------------------------------
async function createReviewTask(original) {
  const body = {
    title: `REVIEW: ${original.title}`,
    type: 'review',
    priority: original.priority,
    owner: 'reviewer',
    context: `Review completed Builder task.\n\nOriginal task ID: ${original.id}\nTitle: ${original.title}\nContext: ${original.context || '(none)'}\nResult summary: ${original.result_summary || '(none)'}`,
    acceptance_criteria: [
      'Implementation reviewed',
      'Any defects or concerns identified',
      'Clear review outcome recorded'
    ],
    source: 'system',
    trigger: 'builder_completed_review_handoff'
  };
  const res = await fetch(`${API}/api/v1/api/tasks/create`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Failed to create review task: ${res.status} ${await res.text()}`);
  return res.json();
}

async function runReviewHandoffLoop() {
  let completedTasks;
  try {
    completedTasks = await fetchTasksByStatus('completed');
  } catch (err) {
    console.error(`[ops-director] error fetching completed tasks: ${err.message || err}`);
    return;
  }

  // Only Builder tasks not yet handed off
  const toReview = completedTasks.filter(
    (t) => t.owner === 'builder' && !reviewHandoffIds.has(t.id)
  );
  if (!toReview.length) return;

  for (const task of toReview) {
    console.log(`[ops-director] detected completed builder task ${task.id} :: ${task.title}`);

    // Guard immediately
    reviewHandoffIds.add(task.id);

    try {
      const reviewTask = await createReviewTask(task);
      console.log(`[ops-director] review task created for ${task.id} → ${reviewTask.id}`);
      await updateTask(task.id, {
        status: 'review',
        result_summary: `${task.result_summary || ''} | Auto-routed to Reviewer → task ${reviewTask.id}`.trim().replace(/^\| /, '')
      });
      console.log(`[ops-director] marked original task as review ${task.id}`);
    } catch (err) {
      console.error(`[ops-director] review handoff failed for ${task.id}: ${err.message || err}`);
      reviewHandoffIds.delete(task.id);
    }
  }
}

// --------------------------------------------------------------------------
// Main heartbeat cycles — routed by ENTITY_ID
// --------------------------------------------------------------------------
async function builderHeartbeatCycle() {
  try {
    const res = await sendHeartbeat();
    const tasks = res.tasks || [];
    if (!tasks.length) return;
    const task = tasks[0];
    console.log(`[builder] task received ${task.id}`);
    await processBuilderTask(task);
  } catch (err) {
    console.error(`[heartbeat] ${ENTITY_ID} error: ${err.message || err}`);
  }
}

async function reviewerHeartbeatCycle() {
  try {
    const res = await sendHeartbeat();
    const tasks = res.tasks || [];
    if (!tasks.length) return;
    const task = tasks[0];
    console.log(`[reviewer] task received ${task.id}`);
    await processReviewerTask(task);
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
  // Run both control loops — order matters: handoff before failure so review tasks
  // don't accidentally get picked up by the failure loop on same cycle
  await runReviewHandoffLoop();
  await runFailureLoop();
}

async function genericHeartbeatCycle() {
  try {
    await sendHeartbeat();
  } catch (err) {
    console.error(`[heartbeat] ${ENTITY_ID} error: ${err.message || err}`);
  }
}

function getCycle() {
  if (ENTITY_ID === 'builder') return builderHeartbeatCycle;
  if (ENTITY_ID === 'reviewer') return reviewerHeartbeatCycle;
  if (ENTITY_ID === 'ops-director') return opsDirectorHeartbeatCycle;
  return genericHeartbeatCycle;
}

const cycle = getCycle();
cycle();
setInterval(cycle, INTERVAL);
