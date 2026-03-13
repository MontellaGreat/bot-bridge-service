#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { setTimeout: sleep } = require('timers/promises');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const BRIDGE_URL = process.env.BRIDGE_URL || 'http://127.0.0.1:8787';
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || 'change-me';
const BRIDGE_NODE_ID = process.env.BRIDGE_NODE_ID || 'openclaw-node';
const WORKER_ID = process.env.BRIDGE_WORKER_ID || `${BRIDGE_NODE_ID}-worker`;
const TARGET_AGENT = process.env.BRIDGE_TARGET_AGENT || 'main';
const POLL_INTERVAL_MS = Number(process.env.BRIDGE_POLL_INTERVAL_MS || 5000);
const RESULT_DIR = process.env.BRIDGE_RESULT_DIR || path.join(__dirname, 'data', 'worker-results');
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || 'openclaw';
const OPENCLAW_RUN_TIMEOUT_MS = Number(process.env.OPENCLAW_RUN_TIMEOUT_MS || 30000);
const WORKER_MODE = process.env.BRIDGE_WORKER_MODE || 'openclaw-cli'; // openclaw-cli | mock

fs.mkdirSync(RESULT_DIR, { recursive: true });

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

function writeArtifact(taskId, payload) {
  const artifactPath = path.join(RESULT_DIR, `${taskId}.json`);
  fs.writeFileSync(artifactPath, JSON.stringify(payload, null, 2));
  return artifactPath;
}

async function executeMock(task) {
  const startedAt = new Date().toISOString();
  const output = {
    taskId: task.id,
    targetAgent: task.targetAgent || task.target,
    executionMode: 'mock',
    content: task.content,
    metadata: task.metadata || {},
    summary: `Mock worker accepted task for agent ${task.targetAgent || task.target}`,
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
  };
}

async function executeViaOpenClawCli(task) {
  const startedAt = new Date().toISOString();
  const targetAgent = task.targetAgent || task.target || TARGET_AGENT;
  const prompt = task.content || task.title || 'No content provided';
  const args = ['run', '--agent', targetAgent, prompt];

  let stdout = '';
  let stderr = '';
  try {
    const res = await execFileAsync(OPENCLAW_BIN, args, {
      cwd: process.cwd(),
      timeout: OPENCLAW_RUN_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
      env: process.env,
    });
    stdout = res.stdout || '';
    stderr = res.stderr || '';
  } catch (err) {
    stdout = err.stdout || '';
    stderr = err.stderr || '';
    const artifact = {
      taskId: task.id,
      targetAgent,
      executionMode: 'openclaw-cli',
      ok: false,
      error: err.message,
      stdout,
      stderr,
      args,
    };
    const artifactPath = writeArtifact(task.id, artifact);
    throw new Error(`openclaw_cli_failed: ${err.message}; artifact=${artifactPath}`);
  }

  const output = {
    taskId: task.id,
    targetAgent,
    executionMode: 'openclaw-cli',
    ok: true,
    stdout,
    stderr,
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
  };
}

async function executeLocally(task) {
  if (WORKER_MODE === 'mock') return executeMock(task);
  return executeViaOpenClawCli(task);
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
  console.log(`[worker] bridge=${BRIDGE_URL} node=${BRIDGE_NODE_ID} targetAgent=${TARGET_AGENT} mode=${WORKER_MODE}`);
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
