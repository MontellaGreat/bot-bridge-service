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
const DATA_DIR = process.env.BRIDGE_DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = process.env.BRIDGE_DB_FILE || path.join(DATA_DIR, 'bridge.sqlite');

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
`);

const existingColumns = db.prepare(`PRAGMA table_info(tasks)`).all().map(r => r.name);
function ensureColumn(name, sql) {
  if (!existingColumns.includes(name)) db.exec(sql);
}
ensureColumn('source_node', `ALTER TABLE tasks ADD COLUMN source_node TEXT`);
ensureColumn('source_agent', `ALTER TABLE tasks ADD COLUMN source_agent TEXT`);
ensureColumn('target_node', `ALTER TABLE tasks ADD COLUMN target_node TEXT`);
ensureColumn('target_agent', `ALTER TABLE tasks ADD COLUMN target_agent TEXT`);
ensureColumn('title', `ALTER TABLE tasks ADD COLUMN title TEXT`);
ensureColumn('priority', `ALTER TABLE tasks ADD COLUMN priority TEXT`);
ensureColumn('complexity', `ALTER TABLE tasks ADD COLUMN complexity TEXT`);
ensureColumn('required_capabilities_json', `ALTER TABLE tasks ADD COLUMN required_capabilities_json TEXT`);
ensureColumn('retry_count', `ALTER TABLE tasks ADD COLUMN retry_count INTEGER DEFAULT 0`);
ensureColumn('max_retries', `ALTER TABLE tasks ADD COLUMN max_retries INTEGER DEFAULT 0`);
ensureColumn('dead_letter_reason', `ALTER TABLE tasks ADD COLUMN dead_letter_reason TEXT`);
ensureColumn('claimed_by', `ALTER TABLE tasks ADD COLUMN claimed_by TEXT`);
ensureColumn('claimed_at', `ALTER TABLE tasks ADD COLUMN claimed_at TEXT`);
ensureColumn('accepted_at', `ALTER TABLE tasks ADD COLUMN accepted_at TEXT`);
ensureColumn('started_at', `ALTER TABLE tasks ADD COLUMN started_at TEXT`);
ensureColumn('finished_at', `ALTER TABLE tasks ADD COLUMN finished_at TEXT`);
ensureColumn('result_summary', `ALTER TABLE tasks ADD COLUMN result_summary TEXT`);

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
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : {},
    requiredCapabilities: row.required_capabilities_json ? JSON.parse(row.required_capabilities_json) : [],
    status: row.status,
    retryCount: row.retry_count || 0,
    maxRetries: row.max_retries || 0,
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

const insertStmt = db.prepare(`
INSERT INTO tasks (
  id, source, target, source_node, source_agent, target_node, target_agent,
  type, title, content, priority, complexity, conversation_id, metadata_json, required_capabilities_json,
  status, retry_count, max_retries, dead_letter_reason, claimed_by, claimed_at, accepted_at, started_at, finished_at,
  result_summary, result, error, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const getStmt = db.prepare(`SELECT * FROM tasks WHERE id = ?`);
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
SET retry_count = ?, status = ?, dead_letter_reason = ?, updated_at = ?
WHERE id = ?
`);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (req.method === 'GET' && pathname === '/health') {
    return json(res, 200, { ok: true, service: 'openclaw-agent-bridge', db: DB_FILE, time: now() });
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
        task.status, task.retryCount, task.maxRetries, task.deadLetterReason, task.claimedBy, task.claimedAt,
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
        retryStmt.run(nextRetry, 'dead_letter', 'max_retries_exceeded', updatedAt, retryMatch[1]);
      } else {
        retryStmt.run(nextRetry, 'queued', null, updatedAt, retryMatch[1]);
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
