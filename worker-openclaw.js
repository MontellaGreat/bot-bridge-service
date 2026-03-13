#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { setTimeout: sleep } = require('timers/promises');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const BRIDGE_URL = process.env.BRIDGE_URL || 'http://127.0.0.1:8787';
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || 'change-me';
const BRIDGE_WORKER_TOKEN = process.env.BRIDGE_WORKER_TOKEN || BRIDGE_TOKEN;
const BRIDGE_NODE_ID = process.env.BRIDGE_NODE_ID || 'openclaw-node';
const WORKER_ID = process.env.BRIDGE_WORKER_ID || `${BRIDGE_NODE_ID}-worker`;
const TARGET_AGENT = process.env.BRIDGE_TARGET_AGENT || 'main';
const POLL_INTERVAL_MS = Number(process.env.BRIDGE_POLL_INTERVAL_MS || 5000);
const HEARTBEAT_INTERVAL_MS = Number(process.env.BRIDGE_HEARTBEAT_INTERVAL_MS || 15000);
const RESULT_DIR = process.env.BRIDGE_RESULT_DIR || path.join(__dirname, 'data', 'worker-results');
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || 'openclaw';
const OPENCLAW_RUN_TIMEOUT_MS = Number(process.env.OPENCLAW_RUN_TIMEOUT_MS || 30000);
const WORKER_MODE = process.env.BRIDGE_WORKER_MODE || 'openclaw-cli';
const FALLBACK_TO_MOCK = String(process.env.BRIDGE_FALLBACK_TO_MOCK || 'false').toLowerCase() === 'true';
const WORKER_CAPABILITIES = String(process.env.BRIDGE_WORKER_CAPABILITIES || '').split(',').map(s => s.trim()).filter(Boolean);

let currentTaskId = null;
let currentWorkerStatus = 'idle';
let heartbeatTimer = null;
let heartbeatSupported = true;
let heartbeatWarningShown = false;

fs.mkdirSync(RESULT_DIR, { recursive: true });

async function api(pathname, options = {}) {
  const url = `${BRIDGE_URL}${pathname}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${BRIDGE_WORKER_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`HTTP ${res.status}: ${text}`);
    err.status = res.status;
    err.responseText = text;
    err.pathname = pathname;
    throw err;
  }
  return res.json();
}

function markHeartbeatUnsupported(err) {
  heartbeatSupported = false;
  if (!heartbeatWarningShown) {
    heartbeatWarningShown = true;
    console.warn(`[worker] heartbeat disabled: bridge does not support /workers/heartbeat (${err.message || err})`);
  }
}

async function sendHeartbeat(status = currentWorkerStatus, taskId = currentTaskId) {
  currentWorkerStatus = status;
  currentTaskId = taskId || null;
  if (!heartbeatSupported) return null;
  try {
    return await api('/workers/heartbeat', {
      method: 'POST',
      body: JSON.stringify({
        workerId: WORKER_ID,
        nodeId: BRIDGE_NODE_ID,
        targetAgent: TARGET_AGENT,
        capabilities: WORKER_CAPABILITIES,
        mode: WORKER_MODE,
        status: currentWorkerStatus,
        currentTaskId: currentTaskId,
        metadata: {
          pollIntervalMs: POLL_INTERVAL_MS,
          heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
          fallbackToMock: FALLBACK_TO_MOCK,
        },
      }),
    });
  } catch (err) {
    if (err && err.pathname === '/workers/heartbeat' && err.status === 404) {
      markHeartbeatUnsupported(err);
      return null;
    }
    throw err;
  }
}

function startHeartbeatLoop() {
  heartbeatTimer = setInterval(() => {
    sendHeartbeat().catch(err => {
      console.error('[worker] heartbeat error:', err.message || err);
    });
  }, HEARTBEAT_INTERVAL_MS);
}

function hasRequiredCapabilities(task) {
  const required = Array.isArray(task.requiredCapabilities) ? task.requiredCapabilities : [];
  if (required.length === 0) return true;
  return required.every(cap => WORKER_CAPABILITIES.includes(cap));
}

async function listQueuedTasks() {
  const qs = new URLSearchParams({
    target_node: BRIDGE_NODE_ID,
    target_agent: TARGET_AGENT,
    status: 'queued',
  });
  const data = await api(`/tasks?${qs.toString()}`, { method: 'GET' });
  const tasks = data.tasks || [];
  return tasks.filter(hasRequiredCapabilities);
}

async function claimTask(taskId) {
  return api(`/tasks/${taskId}/claim`, {
    method: 'POST',
    body: JSON.stringify({ claimedBy: WORKER_ID }),
  });
}

async function updateStatus(taskId, status, extras = {}) {
  return api(`/tasks/${taskId}/status`, {
    method: 'POST',
    body: JSON.stringify({ status, ...extras }),
  });
}

async function postResult(taskId, payload) {
  return api(`/tasks/${taskId}/result`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function retryTask(taskId) {
  return api(`/tasks/${taskId}/retry`, { method: 'POST', body: JSON.stringify({}) });
}

function writeArtifact(taskId, payload) {
  const artifactPath = path.join(RESULT_DIR, `${taskId}.json`);
  fs.writeFileSync(artifactPath, JSON.stringify(payload, null, 2));
  return artifactPath;
}

async function executeMock(task, fallbackReason = null) {
  const startedAt = new Date().toISOString();
  const output = {
    taskId: task.id,
    targetAgent: task.targetAgent || task.target,
    executionMode: 'mock',
    fallbackFrom: fallbackReason ? 'openclaw-cli' : null,
    fallbackReason,
    content: task.content,
    metadata: task.metadata || {},
    summary: fallbackReason
      ? `Mock fallback executed task for agent ${task.targetAgent || task.target}`
      : `Mock worker accepted task for agent ${task.targetAgent || task.target}`,
  };
  const artifactPath = writeArtifact(task.id, output);
  await sleep(1200);
  return {
    resultSummary: output.summary,
    result: JSON.stringify(output, null, 2),
    artifactPath,
    remoteAgent: task.targetAgent || task.target,
    remoteSessionKey: null,
    startedAt,
    finishedAt: new Date().toISOString(),
    executionMode: 'mock',
    fallbackReason,
  };
}

async function tryOpenClawArgs(args) {
  return execFileAsync(OPENCLAW_BIN, args, {
    cwd: process.cwd(),
    timeout: OPENCLAW_RUN_TIMEOUT_MS,
    maxBuffer: 1024 * 1024,
    env: process.env,
  });
}

async function executeViaOpenClawCli(task) {
  const startedAt = new Date().toISOString();
  const targetAgent = task.targetAgent || task.target || TARGET_AGENT;
  const prompt = task.content || task.title || 'No content provided';
  const candidates = [
    ['run', '--agent', targetAgent, prompt],
    ['agent', '--agent', targetAgent, '--message', prompt],
  ];

  let lastError = null;
  for (const args of candidates) {
    try {
      const res = await tryOpenClawArgs(args);
      const output = {
        taskId: task.id,
        targetAgent,
        executionMode: 'openclaw-cli',
        ok: true,
        stdout: res.stdout || '',
        stderr: res.stderr || '',
        args,
      };
      const artifactPath = writeArtifact(task.id, output);
      return {
        resultSummary: `OpenClaw CLI executed task for agent ${targetAgent}`,
        result: JSON.stringify(output, null, 2),
        artifactPath,
        remoteAgent: targetAgent,
        remoteSessionKey: null,
        startedAt,
        finishedAt: new Date().toISOString(),
        executionMode: 'openclaw-cli',
        fallbackReason: null,
      };
    } catch (err) {
      lastError = { args, err };
    }
  }

  const artifact = {
    taskId: task.id,
    targetAgent,
    executionMode: 'openclaw-cli',
    ok: false,
    triedArgs: candidates,
    lastError: lastError ? String(lastError.err.message || lastError.err) : 'unknown',
    stdout: lastError?.err?.stdout || '',
    stderr: lastError?.err?.stderr || '',
  };
  const artifactPath = writeArtifact(task.id, artifact);
  const message = `openclaw_cli_failed: ${artifact.lastError}; artifact=${artifactPath}`;
  if (FALLBACK_TO_MOCK) {
    return executeMock(task, message);
  }
  throw new Error(message);
}

async function executeLocally(task) {
  if (WORKER_MODE === 'mock') return executeMock(task);
  return executeViaOpenClawCli(task);
}

async function handleTask(task) {
  console.log(`[worker] claiming ${task.id}`);
  await claimTask(task.id);
  await sendHeartbeat('busy', task.id).catch(err => {
    console.error('[worker] heartbeat error after claim:', err.message || err);
  });
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
      executionMode: result.executionMode,
      fallbackReason: result.fallbackReason,
    });
    console.log(`[worker] done ${task.id}`);
  } catch (err) {
    console.error(`[worker] failed ${task.id}:`, err);
    const shouldRetry = typeof task.maxRetries === 'number' && (task.retryCount || 0) < task.maxRetries;
    if (shouldRetry) {
      await retryTask(task.id);
    } else {
      await updateStatus(task.id, 'dead_letter', { deadLetterReason: 'execution_failed' });
      await postResult(task.id, {
        status: 'failed',
        resultSummary: 'worker execution failed',
        result: null,
        error: String(err && err.message ? err.message : err),
        remoteAgent: task.targetAgent || task.target,
        finishedAt: new Date().toISOString(),
      });
    }
  } finally {
    await sendHeartbeat('idle', null).catch(err => {
      console.error('[worker] heartbeat error when returning idle:', err.message || err);
    });
  }
}

async function main() {
  console.log(`[worker] bridge=${BRIDGE_URL} node=${BRIDGE_NODE_ID} targetAgent=${TARGET_AGENT} mode=${WORKER_MODE} fallbackToMock=${FALLBACK_TO_MOCK}`);
  console.log(`[worker] capabilities=${WORKER_CAPABILITIES.join(',') || '(none declared)'}`);
  await sendHeartbeat('idle', null).catch(err => {
    console.error('[worker] initial heartbeat error:', err.message || err);
  });
  startHeartbeatLoop();
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
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  process.exit(1);
});
