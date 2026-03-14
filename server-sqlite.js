#!/usr/bin/env node
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { URL } = require('url');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.BRIDGE_PORT || 8787);
const TOKEN = process.env.BRIDGE_TOKEN || 'change-me';
const WORKER_TOKEN = process.env.BRIDGE_WORKER_TOKEN || '';
const CONTROL_TOKEN = process.env.BRIDGE_CONTROL_TOKEN || TOKEN;
const DATA_DIR = process.env.BRIDGE_DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = process.env.BRIDGE_DB_FILE || path.join(DATA_DIR, 'bridge.sqlite');
const DEFAULT_TASK_TIMEOUT_SEC = Number(process.env.BRIDGE_DEFAULT_TASK_TIMEOUT_SEC || 600);
const NODE_ID = process.env.BRIDGE_NODE_ID || 'openclaw-node';
const NODE_LABEL = process.env.BRIDGE_NODE_LABEL || NODE_ID;

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_FILE);

db.exec(`
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  source TEXT,
  target TEXT,
  source_node TEXT,
  source_agent TEXT,
  target_node TEXT,
  target_agent TEXT,
  type TEXT NOT NULL,
  title TEXT,
  content TEXT,
  priority TEXT,
  complexity TEXT,
  conversation_id TEXT,
  metadata_json TEXT,
  required_capabilities_json TEXT,
  status TEXT NOT NULL,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 0,
  timeout_sec INTEGER DEFAULT 600,
  timed_out_at TEXT,
  dead_letter_reason TEXT,
  claimed_by TEXT,
  claimed_at TEXT,
  accepted_at TEXT,
  started_at TEXT,
  finished_at TEXT,
  result_summary TEXT,
  result TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_target_status ON tasks(target, status);
CREATE INDEX IF NOT EXISTS idx_tasks_target_node_agent_status ON tasks(target_node, target_agent, status);
CREATE INDEX IF NOT EXISTS idx_tasks_source_node_agent ON tasks(source_node, source_agent);
CREATE TABLE IF NOT EXISTS workers (
  worker_id TEXT PRIMARY KEY,
  node_id TEXT,
  target_agent TEXT,
  capabilities_json TEXT,
  mode TEXT,
  status TEXT,
  current_task_id TEXT,
  metadata_json TEXT,
  last_heartbeat_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workers_node_agent ON workers(node_id, target_agent);
`);

const existingTaskColumns = db.prepare(`PRAGMA table_info(tasks)`).all().map(r => r.name);
function ensureTaskColumn(name, sql) {
  if (!existingTaskColumns.includes(name)) db.exec(sql);
}
ensureTaskColumn('source_node', `ALTER TABLE tasks ADD COLUMN source_node TEXT`);
ensureTaskColumn('source_agent', `ALTER TABLE tasks ADD COLUMN source_agent TEXT`);
ensureTaskColumn('target_node', `ALTER TABLE tasks ADD COLUMN target_node TEXT`);
ensureTaskColumn('target_agent', `ALTER TABLE tasks ADD COLUMN target_agent TEXT`);
ensureTaskColumn('title', `ALTER TABLE tasks ADD COLUMN title TEXT`);
ensureTaskColumn('priority', `ALTER TABLE tasks ADD COLUMN priority TEXT`);
ensureTaskColumn('complexity', `ALTER TABLE tasks ADD COLUMN complexity TEXT`);
ensureTaskColumn('required_capabilities_json', `ALTER TABLE tasks ADD COLUMN required_capabilities_json TEXT`);
ensureTaskColumn('retry_count', `ALTER TABLE tasks ADD COLUMN retry_count INTEGER DEFAULT 0`);
ensureTaskColumn('max_retries', `ALTER TABLE tasks ADD COLUMN max_retries INTEGER DEFAULT 0`);
ensureTaskColumn('timeout_sec', `ALTER TABLE tasks ADD COLUMN timeout_sec INTEGER DEFAULT 600`);
ensureTaskColumn('timed_out_at', `ALTER TABLE tasks ADD COLUMN timed_out_at TEXT`);
ensureTaskColumn('dead_letter_reason', `ALTER TABLE tasks ADD COLUMN dead_letter_reason TEXT`);
ensureTaskColumn('claimed_by', `ALTER TABLE tasks ADD COLUMN claimed_by TEXT`);
ensureTaskColumn('claimed_at', `ALTER TABLE tasks ADD COLUMN claimed_at TEXT`);
ensureTaskColumn('accepted_at', `ALTER TABLE tasks ADD COLUMN accepted_at TEXT`);
ensureTaskColumn('started_at', `ALTER TABLE tasks ADD COLUMN started_at TEXT`);
ensureTaskColumn('finished_at', `ALTER TABLE tasks ADD COLUMN finished_at TEXT`);
ensureTaskColumn('result_summary', `ALTER TABLE tasks ADD COLUMN result_summary TEXT`);

const existingWorkerColumns = db.prepare(`PRAGMA table_info(workers)`).all().map(r => r.name);
function ensureWorkerColumn(name, sql) {
  if (!existingWorkerColumns.includes(name)) db.exec(sql);
}
ensureWorkerColumn('node_id', `ALTER TABLE workers ADD COLUMN node_id TEXT`);
ensureWorkerColumn('target_agent', `ALTER TABLE workers ADD COLUMN target_agent TEXT`);
ensureWorkerColumn('capabilities_json', `ALTER TABLE workers ADD COLUMN capabilities_json TEXT`);
ensureWorkerColumn('mode', `ALTER TABLE workers ADD COLUMN mode TEXT`);
ensureWorkerColumn('status', `ALTER TABLE workers ADD COLUMN status TEXT`);
ensureWorkerColumn('current_task_id', `ALTER TABLE workers ADD COLUMN current_task_id TEXT`);
ensureWorkerColumn('metadata_json', `ALTER TABLE workers ADD COLUMN metadata_json TEXT`);
ensureWorkerColumn('last_heartbeat_at', `ALTER TABLE workers ADD COLUMN last_heartbeat_at TEXT`);
ensureWorkerColumn('created_at', `ALTER TABLE workers ADD COLUMN created_at TEXT`);
ensureWorkerColumn('updated_at', `ALTER TABLE workers ADD COLUMN updated_at TEXT`);

function now() {
  return new Date().toISOString();
}

function json(res, status, body) {
  const data = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
}

function notFound(res) { json(res, 404, { error: 'not_found' }); }
function unauthorized(res) { json(res, 401, { error: 'unauthorized' }); }
function badRequest(res, message) { json(res, 400, { error: 'bad_request', message }); }

function getAuthToken(req) {
  const header = req.headers['authorization'] || '';
  const prefix = 'Bearer ';
  return header.startsWith(prefix) ? header.slice(prefix.length).trim() : '';
}

function requireBridgeAuth(req, res) {
  const token = getAuthToken(req);
  if (!TOKEN || token !== TOKEN) {
    unauthorized(res);
    return false;
  }
  return true;
}

function requireControlAuth(req, res) {
  const token = getAuthToken(req);
  if (!CONTROL_TOKEN || token !== CONTROL_TOKEN) {
    unauthorized(res);
    return false;
  }
  return true;
}

function requireWorkerAuth(req, res) {
  if (!WORKER_TOKEN) return requireBridgeAuth(req, res);
  const token = getAuthToken(req);
  if (token !== WORKER_TOKEN) {
    unauthorized(res);
    return false;
  }
  return true;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1024 * 1024) {
        reject(new Error('body_too_large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('invalid_json')); }
    });
    req.on('error', reject);
  });
}

function newId() {
  return 'task_' + crypto.randomBytes(8).toString('hex');
}

function parseJsonOrDefault(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function rowToTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    source: row.source,
    target: row.target,
    sourceNode: row.source_node,
    sourceAgent: row.source_agent,
    targetNode: row.target_node,
    targetAgent: row.target_agent,
    type: row.type,
    title: row.title,
    content: row.content,
    priority: row.priority,
    complexity: row.complexity,
    conversationId: row.conversation_id,
    metadata: parseJsonOrDefault(row.metadata_json, {}),
    requiredCapabilities: parseJsonOrDefault(row.required_capabilities_json, []),
    status: row.status,
    retryCount: row.retry_count || 0,
    maxRetries: row.max_retries || 0,
    timeoutSec: row.timeout_sec || DEFAULT_TASK_TIMEOUT_SEC,
    timedOutAt: row.timed_out_at,
    deadLetterReason: row.dead_letter_reason,
    claimedBy: row.claimed_by,
    claimedAt: row.claimed_at,
    acceptedAt: row.accepted_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    resultSummary: row.result_summary,
    result: row.result,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToWorker(row) {
  if (!row) return null;
  return {
    workerId: row.worker_id,
    nodeId: row.node_id,
    targetAgent: row.target_agent,
    capabilities: parseJsonOrDefault(row.capabilities_json, []),
    mode: row.mode,
    status: row.status,
    currentTaskId: row.current_task_id,
    metadata: parseJsonOrDefault(row.metadata_json, {}),
    lastHeartbeatAt: row.last_heartbeat_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const insertStmt = db.prepare(`
INSERT INTO tasks (
  id, source, target, source_node, source_agent, target_node, target_agent,
  type, title, content, priority, complexity, conversation_id, metadata_json, required_capabilities_json,
  status, retry_count, max_retries, timeout_sec, timed_out_at, dead_letter_reason, claimed_by, claimed_at, accepted_at, started_at, finished_at,
  result_summary, result, error, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const getStmt = db.prepare(`SELECT * FROM tasks WHERE id = ?`);
const getWorkerStmt = db.prepare(`SELECT * FROM workers WHERE worker_id = ?`);
const updateResultStmt = db.prepare(`
UPDATE tasks
SET status = ?, result_summary = ?, result = ?, error = ?, finished_at = ?, updated_at = ?
WHERE id = ?
`);
const claimStmt = db.prepare(`
UPDATE tasks
SET status = ?, claimed_by = ?, claimed_at = ?, updated_at = ?
WHERE id = ?
`);
const updateStatusStmt = db.prepare(`
UPDATE tasks
SET status = ?, accepted_at = COALESCE(?, accepted_at), started_at = COALESCE(?, started_at), dead_letter_reason = COALESCE(?, dead_letter_reason), updated_at = ?
WHERE id = ?
`);
const retryStmt = db.prepare(`
UPDATE tasks
SET retry_count = ?, status = ?, timed_out_at = ?, dead_letter_reason = ?, claimed_by = NULL, claimed_at = NULL, accepted_at = NULL, started_at = NULL, updated_at = ?
WHERE id = ?
`);
const workerUpsertStmt = db.prepare(`
INSERT INTO workers (
  worker_id, node_id, target_agent, capabilities_json, mode, status, current_task_id, metadata_json, last_heartbeat_at, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(worker_id) DO UPDATE SET
  node_id = excluded.node_id,
  target_agent = excluded.target_agent,
  capabilities_json = excluded.capabilities_json,
  mode = excluded.mode,
  status = excluded.status,
  current_task_id = excluded.current_task_id,
  metadata_json = excluded.metadata_json,
  last_heartbeat_at = excluded.last_heartbeat_at,
  updated_at = excluded.updated_at
`);

function getTaskActiveAnchor(task) {
  return task.startedAt || task.acceptedAt || task.claimedAt || task.createdAt;
}

function reapTimedOutTasks() {
  const activeRows = db.prepare(`SELECT * FROM tasks WHERE status IN ('claimed', 'accepted', 'running')`).all();
  const processed = [];
  const currentTs = Date.now();

  for (const row of activeRows) {
    const task = rowToTask(row);
    const anchor = getTaskActiveAnchor(task);
    const timeoutSec = Number(task.timeoutSec || DEFAULT_TASK_TIMEOUT_SEC || 0);
    if (!anchor || !timeoutSec || timeoutSec <= 0) continue;
    const ageMs = currentTs - Date.parse(anchor);
    if (Number.isNaN(ageMs) || ageMs < timeoutSec * 1000) continue;

    const nextRetry = (task.retryCount || 0) + 1;
    const updatedAt = now();
    const timedOutAt = updatedAt;

    if (nextRetry > (task.maxRetries || 0)) {
      retryStmt.run(nextRetry, 'dead_letter', timedOutAt, 'task_timeout', updatedAt, task.id);
      db.prepare(`UPDATE tasks SET finished_at = ?, result_summary = ?, error = ? WHERE id = ?`).run(
        updatedAt,
        'task timed out and moved to dead letter',
        `task_timeout after ${timeoutSec}s`,
        task.id
      );
      processed.push({ taskId: task.id, action: 'dead_letter', timeoutSec, retryCount: nextRetry });
    } else {
      retryStmt.run(nextRetry, 'queued', timedOutAt, 'task_timeout_requeued', updatedAt, task.id);
      processed.push({ taskId: task.id, action: 'requeued', timeoutSec, retryCount: nextRetry });
    }
  }

  return processed;
}


function parseTs(value) {
  const ms = Date.parse(value || '');
  return Number.isNaN(ms) ? null : ms;
}

function resolveWorkerHealth(lastHeartbeatAt) {
  const ts = parseTs(lastHeartbeatAt);
  if (!ts) return { online: false, health: 'offline' };
  const ageSec = (Date.now() - ts) / 1000;
  if (ageSec <= 45) return { online: true, health: 'online' };
  if (ageSec <= 120) return { online: false, health: 'stale' };
  return { online: false, health: 'offline' };
}

function getLatestTaskForWorker(worker) {
  return db.prepare(`
    SELECT * FROM tasks
    WHERE claimed_by = ? OR (target_node = ? AND target_agent = ?)
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(worker.workerId, worker.nodeId || null, worker.targetAgent || null);
}

function rowToControlAgent(row) {
  const worker = rowToWorker(row);
  if (!worker) return null;
  const latestTaskRow = getLatestTaskForWorker(worker);
  const latestTask = rowToTask(latestTaskRow);
  const healthInfo = resolveWorkerHealth(worker.lastHeartbeatAt);
  return {
    workerId: worker.workerId,
    nodeId: worker.nodeId,
    targetAgent: worker.targetAgent,
    displayName: `${worker.nodeId || 'unknown-node'} / ${worker.targetAgent || 'unknown-agent'}`,
    mode: worker.mode,
    status: worker.status,
    online: healthInfo.online,
    health: healthInfo.health,
    currentTaskId: worker.currentTaskId,
    capabilities: worker.capabilities,
    metadata: worker.metadata,
    lastHeartbeatAt: worker.lastHeartbeatAt,
    lastTaskId: latestTask?.id || null,
    lastTaskStatus: latestTask?.status || null,
    lastResultSummary: latestTask?.resultSummary || null,
    lastError: latestTask?.error || null,
    updatedAt: worker.updatedAt,
  };
}

function getControlSummary() {
  const workerRows = db.prepare(`SELECT * FROM workers ORDER BY updated_at DESC`).all();
  const tasksByStatusRows = db.prepare(`SELECT status, COUNT(*) AS c FROM tasks GROUP BY status`).all();
  const countsByStatus = Object.fromEntries(tasksByStatusRows.map(r => [r.status, r.c]));
  const workers = workerRows.map(rowToControlAgent).filter(Boolean);
  const onlineWorkers = workers.filter(w => w.health === 'online').length;
  const staleWorkers = workers.filter(w => w.health === 'stale').length;
  const offlineWorkers = workers.filter(w => w.health === 'offline').length;
  return {
    ok: true,
    bridge: {
      service: 'openclaw-agent-bridge',
      nodeId: NODE_ID,
      label: NODE_LABEL,
      version: '2.0.0-alpha.1',
      db: DB_FILE,
    },
    counts: {
      nodes: new Set(workerRows.map(r => r.node_id).filter(Boolean)).size,
      workers: workerRows.length,
      onlineWorkers,
      staleWorkers,
      offlineWorkers,
      queuedTasks: countsByStatus.queued || 0,
      claimedTasks: countsByStatus.claimed || 0,
      acceptedTasks: countsByStatus.accepted || 0,
      runningTasks: countsByStatus.running || 0,
      activeTasks: (countsByStatus.queued || 0) + (countsByStatus.claimed || 0) + (countsByStatus.accepted || 0) + (countsByStatus.running || 0),
      deadLetterTasks: countsByStatus.dead_letter || 0,
    },
    lastUpdatedAt: now(),
  };
}

function getControlAgents() {
  const rows = db.prepare(`SELECT * FROM workers ORDER BY updated_at DESC`).all();
  const agents = rows.map(rowToControlAgent).filter(Boolean);
  return { count: agents.length, agents };
}

function getControlActiveTasks(limit = 100) {
  const rows = db.prepare(`
    SELECT * FROM tasks
    WHERE status IN ('queued', 'claimed', 'accepted', 'running')
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(limit);
  const tasks = rows.map(rowToTask).map(task => ({
    ...task,
    executionMode: parseJsonOrDefault(task.result, {})?.executionMode || null,
    artifactPath: parseJsonOrDefault(task.result, {})?.artifactPath || null,
    remoteSessionKey: parseJsonOrDefault(task.result, {})?.remoteSessionKey || null,
    fallbackReason: parseJsonOrDefault(task.result, {})?.fallbackReason || null,
  }));
  return { count: tasks.length, tasks };
}

function countMatchingQueuedTasks(worker) {
  if (!worker?.nodeId || !worker?.targetAgent) return 0;
  return db.prepare(`SELECT COUNT(*) AS c FROM tasks WHERE status = 'queued' AND target_node = ? AND target_agent = ?`).get(worker.nodeId, worker.targetAgent).c;
}

function toStaffEntry(row) {
  const agent = rowToControlAgent(row);
  if (!agent) return null;
  let nextStateHint = 'waiting';
  if (agent.health === 'offline') nextStateHint = 'offline';
  else if (agent.health === 'stale') nextStateHint = 'stale';
  else if (agent.status === 'busy' || agent.currentTaskId || agent.lastTaskStatus === 'running') nextStateHint = 'working';
  else if (countMatchingQueuedTasks(agent) > 0) nextStateHint = 'next-up';
  return { ...agent, nextStateHint };
}

function getControlStaff() {
  const rows = db.prepare(`SELECT * FROM workers ORDER BY updated_at DESC`).all();
  const staff = rows.map(toStaffEntry).filter(Boolean);
  return { count: staff.length, staff };
}

function getRecentErrors(limit = 20) {
  const rows = db.prepare(`
    SELECT * FROM tasks
    WHERE error IS NOT NULL OR status IN ('failed', 'dead_letter')
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(limit);
  return rows.map(rowToTask).map(task => ({
    taskId: task.id,
    targetNode: task.targetNode,
    targetAgent: task.targetAgent,
    status: task.status,
    error: task.error,
    deadLetterReason: task.deadLetterReason,
    claimedBy: task.claimedBy,
    updatedAt: task.updatedAt,
  }));
}

function getControlOverview() {
  const summary = getControlSummary();
  const staff = getControlStaff().staff;
  const busyWorkers = staff.filter(s => s.nextStateHint === 'working').length;
  const idleWorkers = staff.filter(s => s.nextStateHint === 'waiting' || s.nextStateHint === 'next-up').length;
  const recentFailures = getRecentErrors(5).length;
  const risks = [];
  if (CONTROL_TOKEN === TOKEN) risks.push({ level: 'warn', code: 'control_uses_bridge_token', message: 'Control API currently reuses BRIDGE_TOKEN.' });
  if ((summary.counts.deadLetterTasks || 0) > 0) risks.push({ level: 'warn', code: 'dead_letter_present', message: `${summary.counts.deadLetterTasks} dead-letter task(s) present.` });
  if (staff.some(s => s.health === 'offline')) risks.push({ level: 'warn', code: 'offline_workers', message: 'Some workers are offline.' });
  const attention = [];
  if ((summary.counts.runningTasks || 0) > 0) attention.push({ type: 'task', message: `${summary.counts.runningTasks} task(s) currently running.` });
  if ((summary.counts.queuedTasks || 0) > 0) attention.push({ type: 'queue', message: `${summary.counts.queuedTasks} task(s) waiting in queue.` });
  return {
    ok: true,
    status: risks.some(r => r.level === 'warn') ? 'attention' : 'healthy',
    summary: {
      onlineWorkers: summary.counts.onlineWorkers,
      busyWorkers,
      idleWorkers,
      queuedTasks: summary.counts.queuedTasks,
      runningTasks: summary.counts.runningTasks,
      deadLetterTasks: summary.counts.deadLetterTasks,
      recentFailures,
    },
    risks,
    attention,
    staff: staff.slice(0, 10).map(({ workerId, nodeId, targetAgent, status, currentTaskId, nextStateHint }) => ({ workerId, nodeId, targetAgent, status, currentTaskId, nextStateHint })),
    updatedAt: now(),
  };
}

function getControlWiring() {
  const summary = getControlSummary();
  const agents = getControlAgents().agents;
  const realCliSeen = agents.some(a => a.mode === 'openclaw-cli');
  return {
    ok: true,
    wiring: {
      bridgeHealth: 'connected',
      controlToken: CONTROL_TOKEN ? 'configured' : 'missing',
      workerHeartbeat: summary.counts.workers > 0 ? 'connected' : 'missing',
      workerRoster: summary.counts.workers > 0 ? 'connected' : 'missing',
      realCliExecution: realCliSeen ? 'connected' : 'partial',
      deadLetterWatcher: 'connected',
      usageData: 'not_provided_by_bridge',
      memoryDocs: 'not_provided_by_bridge',
    },
    notes: [
      'This bridge provides execution and worker observability only.',
      'Usage / subscription / memory / docs remain upstream control-center data sources.',
    ],
  };
}

function getControlRiskSummary() {
  const summary = getControlSummary();
  const agents = getControlAgents().agents;
  const errors = getRecentErrors(20);
  const risks = [];

  if (CONTROL_TOKEN === TOKEN) {
    risks.push({
      level: 'warn',
      code: 'control_uses_bridge_token',
      title: '控制面与主桥接共用 token',
      message: '当前 /control/* 沿用 BRIDGE_TOKEN，建议单独配置 BRIDGE_CONTROL_TOKEN。',
      impact: '控制面鉴权隔离不足。',
      suggestion: '新增并启用 BRIDGE_CONTROL_TOKEN。',
    });
  }

  const offlineAgents = agents.filter(a => a.health === 'offline');
  if (offlineAgents.length > 0) {
    risks.push({
      level: 'warn',
      code: 'offline_workers',
      title: '存在离线 worker',
      message: `${offlineAgents.length} 个 worker 超过心跳窗口未更新。`,
      impact: '控制中心会看到员工离线，任务可能无人接单。',
      suggestion: '检查 worker 进程、bridge 地址和 systemd 状态。',
    });
  }

  const staleAgents = agents.filter(a => a.health === 'stale');
  if (staleAgents.length > 0) {
    risks.push({
      level: 'warn',
      code: 'stale_workers',
      title: '存在心跳变陈旧的 worker',
      message: `${staleAgents.length} 个 worker 处于 stale 状态。`,
      impact: '控制中心会显示状态不稳定，可能即将离线。',
      suggestion: '检查网络抖动或 worker 负载。',
    });
  }

  if ((summary.counts.deadLetterTasks || 0) > 0) {
    risks.push({
      level: 'warn',
      code: 'dead_letter_present',
      title: '存在 dead-letter 任务',
      message: `当前共有 ${summary.counts.deadLetterTasks} 条 dead-letter 任务。`,
      impact: '说明部分任务已经失败并退出主流程。',
      suggestion: '查看 /control/errors/recent 与 /control/tasks/board 排查原因。',
    });
  }

  if (errors.length > 0) {
    risks.push({
      level: 'warn',
      code: 'recent_errors_present',
      title: '近期存在错误任务',
      message: `最近错误/异常任务 ${errors.length} 条。`,
      impact: '总览与任务页会出现异常提示。',
      suggestion: '优先查看最近 dead-letter / failed 任务。',
    });
  }

  const allMock = agents.length > 0 && agents.every(a => a.mode === 'mock');
  if (allMock) {
    risks.push({
      level: 'info',
      code: 'only_mock_workers',
      title: '当前仅检测到 mock worker',
      message: '所有 worker 当前都在 mock 模式下运行。',
      impact: '控制中心可看到链路，但真实 CLI 执行证据不足。',
      suggestion: '若需要真实执行观测，请启用 openclaw-cli 模式 worker。',
    });
  }

  return {
    ok: true,
    status: risks.some(r => r.level === 'warn') ? 'attention' : 'healthy',
    count: risks.length,
    risks,
    updatedAt: now(),
  };
}

function getNodeWorkers(nodeId) {
  return db.prepare(`SELECT * FROM workers WHERE node_id = ? ORDER BY updated_at DESC`).all(nodeId);
}

function getNodeRecentTasks(nodeId, limit = 10) {
  return db.prepare(`
    SELECT * FROM tasks
    WHERE source_node = ? OR target_node = ?
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(nodeId, nodeId, limit).map(rowToTask);
}

function summarizeNode(nodeId) {
  const workerRows = getNodeWorkers(nodeId);
  const workers = workerRows.map(rowToControlAgent).filter(Boolean);
  const healths = workers.map(w => w.health);
  const online = healths.includes('online');
  const health = online ? 'online' : (healths.includes('stale') ? 'stale' : 'offline');
  const activeTaskCount = db.prepare(`SELECT COUNT(*) AS c FROM tasks WHERE status IN ('queued', 'claimed', 'accepted', 'running') AND target_node = ?`).get(nodeId).c;
  const lastHeartbeatAt = workers.map(w => w.lastHeartbeatAt).filter(Boolean).sort().reverse()[0] || null;
  const recentTasks = getNodeRecentTasks(nodeId, 1);
  const lastTaskAt = recentTasks[0]?.updatedAt || null;
  return {
    nodeId,
    label: nodeId === NODE_ID ? NODE_LABEL : nodeId,
    online: health === 'online',
    health,
    workerCount: workers.length,
    activeTaskCount,
    agents: [...new Set(workers.map(w => w.targetAgent).filter(Boolean))],
    modes: [...new Set(workers.map(w => w.mode).filter(Boolean))],
    lastHeartbeatAt,
    lastTaskAt,
  };
}

function getControlNodes() {
  const nodeIds = [...new Set(db.prepare(`SELECT node_id FROM workers WHERE node_id IS NOT NULL`).all().map(r => r.node_id))];
  const nodes = nodeIds.map(summarizeNode);
  return { count: nodes.length, nodes };
}

function getControlNodeDetail(nodeId) {
  const workers = getNodeWorkers(nodeId).map(rowToControlAgent).filter(Boolean);
  const recentTasks = getNodeRecentTasks(nodeId, 10);
  const recentErrors = getRecentErrors(50).filter(e => e.targetNode === nodeId).slice(0, 10);
  const summary = summarizeNode(nodeId);
  return {
    ...summary,
    workers,
    recentTasks,
    recentErrors,
  };
}

function getControlTasksRecent(limit = 20) {
  const rows = db.prepare(`
    SELECT * FROM tasks
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(limit);
  const tasks = rows.map(rowToTask).map(task => ({
    ...task,
    executionMode: parseJsonOrDefault(task.result, {})?.executionMode || null,
    artifactPath: parseJsonOrDefault(task.result, {})?.artifactPath || null,
    remoteSessionKey: parseJsonOrDefault(task.result, {})?.remoteSessionKey || null,
    fallbackReason: parseJsonOrDefault(task.result, {})?.fallbackReason || null,
  }));
  return { count: tasks.length, tasks };
}

function getControlErrorsRecent(limit = 20) {
  const errors = getRecentErrors(limit);
  return { count: errors.length, errors };
}

function getControlTasksBoard(limit = 20) {
  const active = getControlActiveTasks(limit).tasks;
  const recent = getControlTasksRecent(limit).tasks.filter(t => ['done', 'failed', 'dead_letter'].includes(t.status));
  const deadLetters = recent.filter(t => t.status === 'dead_letter');
  const stalled = db.prepare(`
    SELECT * FROM tasks
    WHERE status IN ('claimed', 'accepted', 'running')
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(limit).map(rowToTask).filter(task => {
    const anchor = getTaskActiveAnchor(task);
    if (!anchor) return false;
    const ms = Date.now() - Date.parse(anchor);
    const timeoutMs = Number(task.timeoutSec || DEFAULT_TASK_TIMEOUT_SEC || 0) * 1000;
    return timeoutMs > 0 && ms > timeoutMs;
  }).map(task => ({
    ...task,
    stalledMs: Date.now() - Date.parse(getTaskActiveAnchor(task)),
  }));
  return {
    active,
    stalled,
    recent,
    deadLetters,
    updatedAt: now(),
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (req.method === 'GET' && pathname === '/health') {
    const workerCount = db.prepare(`SELECT COUNT(*) AS c FROM workers`).get().c;
    const activeTaskCount = db.prepare(`SELECT COUNT(*) AS c FROM tasks WHERE status IN ('queued', 'claimed', 'accepted', 'running')`).get().c;
    return json(res, 200, { ok: true, service: 'openclaw-agent-bridge', db: DB_FILE, workers: workerCount, activeTasks: activeTaskCount, time: now() });
  }

  if (req.method === 'POST' && pathname === '/workers/heartbeat') {
    if (!requireWorkerAuth(req, res)) return;
    try {
      const body = await readBody(req);
      const heartbeatAt = now();
      const workerId = body.workerId || body.worker_id;
      if (!workerId) return badRequest(res, 'workerId is required');
      workerUpsertStmt.run(
        workerId,
        body.nodeId || body.node_id || null,
        body.targetAgent || body.target_agent || null,
        JSON.stringify(body.capabilities || body.workerCapabilities || []),
        body.mode || null,
        body.status || 'idle',
        body.currentTaskId || body.current_task_id || null,
        JSON.stringify(body.metadata || {}),
        heartbeatAt,
        heartbeatAt,
        heartbeatAt,
      );
      return json(res, 200, rowToWorker(getWorkerStmt.get(workerId)));
    } catch (e) {
      return badRequest(res, e.message);
    }
  }

  if (req.method === 'GET' && pathname === '/workers') {
    if (!requireBridgeAuth(req, res)) return;
    const params = [];
    const where = [];
    for (const key of ['node_id', 'target_agent', 'status']) {
      if (url.searchParams.get(key)) {
        where.push(`${key} = ?`);
        params.push(url.searchParams.get(key));
      }
    }
    const sql = `SELECT * FROM workers ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY updated_at DESC`;
    const rows = db.prepare(sql).all(...params);
    return json(res, 200, { count: rows.length, workers: rows.map(rowToWorker) });
  }

  const workerIdMatch = pathname.match(/^\/workers\/([^/]+)$/);
  if (req.method === 'GET' && workerIdMatch) {
    if (!requireBridgeAuth(req, res)) return;
    const row = getWorkerStmt.get(workerIdMatch[1]);
    if (!row) return notFound(res);
    return json(res, 200, rowToWorker(row));
  }

  if (req.method === 'POST' && pathname === '/maintenance/reap-timeouts') {
    if (!requireBridgeAuth(req, res)) return;
    const processed = reapTimedOutTasks();
    return json(res, 200, { ok: true, processedCount: processed.length, processed });
  }

  if (req.method === 'GET' && pathname === '/control/summary') {
    if (!requireControlAuth(req, res)) return;
    return json(res, 200, getControlSummary());
  }

  if (req.method === 'GET' && pathname === '/control/agents') {
    if (!requireControlAuth(req, res)) return;
    return json(res, 200, getControlAgents());
  }

  if (req.method === 'GET' && pathname === '/control/tasks/active') {
    if (!requireControlAuth(req, res)) return;
    const limit = Number(url.searchParams.get('limit') || 100);
    return json(res, 200, getControlActiveTasks(limit));
  }

  if (req.method === 'GET' && pathname === '/control/overview') {
    if (!requireControlAuth(req, res)) return;
    return json(res, 200, getControlOverview());
  }

  if (req.method === 'GET' && pathname === '/control/staff') {
    if (!requireControlAuth(req, res)) return;
    return json(res, 200, getControlStaff());
  }

  if (req.method === 'GET' && pathname === '/control/settings/wiring') {
    if (!requireControlAuth(req, res)) return;
    return json(res, 200, getControlWiring());
  }

  if (req.method === 'GET' && pathname === '/control/settings/risk-summary') {
    if (!requireControlAuth(req, res)) return;
    return json(res, 200, getControlRiskSummary());
  }

  if (req.method === 'GET' && pathname === '/control/tasks/board') {
    if (!requireControlAuth(req, res)) return;
    const limit = Number(url.searchParams.get('limit') || 20);
    return json(res, 200, getControlTasksBoard(limit));
  }

  if (req.method === 'GET' && pathname === '/control/tasks/recent') {
    if (!requireControlAuth(req, res)) return;
    const limit = Number(url.searchParams.get('limit') || 20);
    return json(res, 200, getControlTasksRecent(limit));
  }

  if (req.method === 'GET' && pathname === '/control/errors/recent') {
    if (!requireControlAuth(req, res)) return;
    const limit = Number(url.searchParams.get('limit') || 20);
    return json(res, 200, getControlErrorsRecent(limit));
  }

  if (req.method === 'GET' && pathname === '/control/nodes') {
    if (!requireControlAuth(req, res)) return;
    return json(res, 200, getControlNodes());
  }

  const controlNodeMatch = pathname.match(/^\/control\/nodes\/([^/]+)$/);
  if (req.method === 'GET' && controlNodeMatch) {
    if (!requireControlAuth(req, res)) return;
    return json(res, 200, getControlNodeDetail(controlNodeMatch[1]));
  }

  const isWorkerRoute = /\/claim$|\/status$|\/result$|\/retry$/.test(pathname);
  if (!(isWorkerRoute ? requireWorkerAuth(req, res) : requireBridgeAuth(req, res))) return;

  if (req.method === 'POST' && pathname === '/tasks') {
    try {
      const body = await readBody(req);
      const target = body.target || body.targetAgent || body.target_agent;
      const targetNode = body.targetNode || body.target_node || null;
      const targetAgent = body.targetAgent || body.target_agent || body.target || null;
      if (!target && !(targetNode && targetAgent)) {
        return badRequest(res, 'target or targetNode+targetAgent are required');
      }
      const task = {
        id: newId(),
        source: body.source || 'unknown',
        target: body.target || targetAgent || 'unknown',
        sourceNode: body.sourceNode || body.source_node || null,
        sourceAgent: body.sourceAgent || body.source_agent || body.source || null,
        targetNode,
        targetAgent,
        type: body.type || 'delegated_work',
        title: body.title || null,
        content: body.content || '',
        priority: body.priority || 'normal',
        complexity: body.complexity || null,
        conversationId: body.conversationId || body.conversation_id || null,
        metadata: body.metadata || {},
        requiredCapabilities: body.requiredCapabilities || body.required_capabilities || [],
        status: body.status || 'queued',
        retryCount: 0,
        maxRetries: Number(body.maxRetries ?? body.max_retries ?? 0),
        timeoutSec: Number(body.timeoutSec ?? body.timeout_sec ?? DEFAULT_TASK_TIMEOUT_SEC),
        timedOutAt: null,
        deadLetterReason: null,
        claimedBy: null,
        claimedAt: null,
        acceptedAt: null,
        startedAt: null,
        finishedAt: null,
        resultSummary: null,
        result: null,
        error: null,
        createdAt: now(),
        updatedAt: now(),
      };
      insertStmt.run(
        task.id, task.source, task.target, task.sourceNode, task.sourceAgent, task.targetNode, task.targetAgent,
        task.type, task.title, task.content, task.priority, task.complexity, task.conversationId,
        JSON.stringify(task.metadata || {}), JSON.stringify(task.requiredCapabilities || []),
        task.status, task.retryCount, task.maxRetries, task.timeoutSec, task.timedOutAt, task.deadLetterReason, task.claimedBy, task.claimedAt,
        task.acceptedAt, task.startedAt, task.finishedAt, task.resultSummary, task.result, task.error,
        task.createdAt, task.updatedAt
      );
      return json(res, 201, task);
    } catch (e) {
      return badRequest(res, e.message);
    }
  }

  if (req.method === 'GET' && pathname === '/tasks') {
    const params = [];
    const where = [];
    const filters = ['target', 'source', 'status', 'type'];
    for (const key of filters) {
      if (url.searchParams.get(key)) {
        where.push(`${key} = ?`);
        params.push(url.searchParams.get(key));
      }
    }
    for (const key of ['target_node', 'target_agent', 'source_node', 'source_agent']) {
      if (url.searchParams.get(key)) {
        where.push(`${key} = ?`);
        params.push(url.searchParams.get(key));
      }
    }
    const sql = `SELECT * FROM tasks ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`;
    const rows = db.prepare(sql).all(...params);
    return json(res, 200, { count: rows.length, tasks: rows.map(rowToTask) });
  }

  const taskIdMatch = pathname.match(/^\/tasks\/([^/]+)$/);
  if (req.method === 'GET' && taskIdMatch) {
    const row = getStmt.get(taskIdMatch[1]);
    if (!row) return notFound(res);
    return json(res, 200, rowToTask(row));
  }

  const claimMatch = pathname.match(/^\/tasks\/([^/]+)\/claim$/);
  if (req.method === 'POST' && claimMatch) {
    try {
      const body = await readBody(req);
      const existing = getStmt.get(claimMatch[1]);
      if (!existing) return notFound(res);
      const claimedBy = body.claimedBy || body.claimed_by || body.worker || 'unknown-worker';
      const claimedAt = now();
      claimStmt.run('claimed', claimedBy, claimedAt, claimedAt, claimMatch[1]);
      return json(res, 200, rowToTask(getStmt.get(claimMatch[1])));
    } catch (e) {
      return badRequest(res, e.message);
    }
  }

  const statusMatch = pathname.match(/^\/tasks\/([^/]+)\/status$/);
  if (req.method === 'POST' && statusMatch) {
    try {
      const body = await readBody(req);
      const existing = getStmt.get(statusMatch[1]);
      if (!existing) return notFound(res);
      const newStatus = body.status;
      if (!newStatus) return badRequest(res, 'status is required');
      const acceptedAt = newStatus === 'accepted' ? now() : null;
      const startedAt = newStatus === 'running' ? now() : null;
      const updatedAt = now();
      updateStatusStmt.run(newStatus, acceptedAt, startedAt, body.deadLetterReason || body.dead_letter_reason || null, updatedAt, statusMatch[1]);
      return json(res, 200, rowToTask(getStmt.get(statusMatch[1])));
    } catch (e) {
      return badRequest(res, e.message);
    }
  }

  const resultMatch = pathname.match(/^\/tasks\/([^/]+)\/result$/);
  if (req.method === 'POST' && resultMatch) {
    try {
      const body = await readBody(req);
      const existing = getStmt.get(resultMatch[1]);
      if (!existing) return notFound(res);
      const finishedAt = now();
      updateResultStmt.run(
        body.status || 'done',
        body.resultSummary ?? body.result_summary ?? null,
        body.result ?? null,
        body.error ?? null,
        finishedAt,
        finishedAt,
        resultMatch[1]
      );
      return json(res, 200, rowToTask(getStmt.get(resultMatch[1])));
    } catch (e) {
      return badRequest(res, e.message);
    }
  }

  const retryMatch = pathname.match(/^\/tasks\/([^/]+)\/retry$/);
  if (req.method === 'POST' && retryMatch) {
    try {
      const existing = getStmt.get(retryMatch[1]);
      if (!existing) return notFound(res);
      const nextRetry = (existing.retry_count || 0) + 1;
      const maxRetries = existing.max_retries || 0;
      const updatedAt = now();
      if (nextRetry > maxRetries) {
        retryStmt.run(nextRetry, 'dead_letter', null, 'max_retries_exceeded', updatedAt, retryMatch[1]);
        db.prepare(`UPDATE tasks SET finished_at = ?, result_summary = ?, error = ? WHERE id = ?`).run(
          updatedAt,
          'max retries exceeded',
          'max_retries_exceeded',
          retryMatch[1]
        );
      } else {
        retryStmt.run(nextRetry, 'queued', null, null, updatedAt, retryMatch[1]);
      }
      return json(res, 200, rowToTask(getStmt.get(retryMatch[1])));
    } catch (e) {
      return badRequest(res, e.message);
    }
  }

  notFound(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`openclaw-agent-bridge listening on :${PORT}`);
  console.log(`db file: ${DB_FILE}`);
});
