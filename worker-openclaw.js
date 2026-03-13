#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { setTimeout: sleep } = require('timers/promises');

const BRIDGE_URL = process.env.BRIDGE_URL || 'http://127.0.0.1:8787';
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || 'change-me';
const BRIDGE_NODE_ID = process.env.BRIDGE_NODE_ID || 'openclaw-node';
const WORKER_ID = process.env.BRIDGE_WORKER_ID || `${BRIDGE_NODE_ID}-worker`;
const TARGET_AGENT = process.env.BRIDGE_TARGET_AGENT || 'main';
const POLL_INTERVAL_MS = Number(process.env.BRIDGE_POLL_INTERVAL_MS || 5000);
const MOCK_RESULT_DIR = process.env.BRIDGE_RESULT_DIR || path.join(__dirname, 'data', 'worker-results');

fs.mkdirSync(MOCK_RESULT_DIR, { recursive: true });

async function api(pathname, options = {}) {
  const url = `${BRIDGE_URL}${pathname}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${BRIDGE_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function listQueuedTasks() {
  const qs = new URLSearchParams({
    target_node: BRIDGE_NODE_ID,
    target_agent: TARGET_AGENT,
    status: 'queued',
  });
  const data = await api(`/tasks?${qs.toString()}`, { method: 'GET' });
  return data.tasks || [];
}

async function claimTask(taskId) {
  return api(`/tasks/${taskId}/claim`, {
    method: 'POST',
    body: JSON.stringify({ claimedBy: WORKER_ID }),
  });
}

async function updateStatus(taskId, status) {
  return api(`/tasks/${taskId}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
}

async function postResult(taskId, payload) {
  return api(`/tasks/${taskId}/result`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function executeLocally(task) {
  // 第二轮先打通 bridge 闭环：使用最小 mock worker。
  // 后续第三轮再把这里替换为真实 OpenClaw agent 调用。
  const startedAt = new Date().toISOString();
  const artifactPath = path.join(MOCK_RESULT_DIR, `${task.id}.json`);
  const output = {
    taskId: task.id,
    targetAgent: task.targetAgent || task.target,
    sourceNode: task.sourceNode || task.source,
    receivedAt: startedAt,
    executionMode: 'mock-openclaw-worker',
    content: task.content,
    metadata: task.metadata || {},
    summary: `Mock worker accepted task for agent ${task.targetAgent || task.target}`,
  };
  fs.writeFileSync(artifactPath, JSON.stringify(output, null, 2));
  await sleep(1200);
  return {
    resultSummary: output.summary,
    result: JSON.stringify(output, null, 2),
    artifactPath,
    remoteAgent: task.targetAgent || task.target,
    remoteSessionKey: null,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

async function handleTask(task) {
  console.log(`[worker] claiming ${task.id}`);
  await claimTask(task.id);
  await updateStatus(task.id, 'accepted');
  await updateStatus(task.id, 'running');
  try {
    const result = await executeLocally(task);
    await postResult(task.id, {
      status: 'done',
      resultSummary: result.resultSummary,
      result: result.result,
      error: null,
      remoteAgent: result.remoteAgent,
      remoteSessionKey: result.remoteSessionKey,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      artifactPath: result.artifactPath,
    });
    console.log(`[worker] done ${task.id}`);
  } catch (err) {
    await postResult(task.id, {
      status: 'failed',
      resultSummary: 'worker execution failed',
      result: null,
      error: String(err && err.message ? err.message : err),
      remoteAgent: task.targetAgent || task.target,
      finishedAt: new Date().toISOString(),
    });
    console.error(`[worker] failed ${task.id}:`, err);
  }
}

async function main() {
  console.log(`[worker] bridge=${BRIDGE_URL} node=${BRIDGE_NODE_ID} targetAgent=${TARGET_AGENT}`);
  while (true) {
    try {
      const tasks = await listQueuedTasks();
      if (tasks.length > 0) {
        for (const task of tasks) {
          await handleTask(task);
        }
      }
    } catch (err) {
      console.error('[worker] loop error:', err.message || err);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
