# ARCHITECTURE

## 目标
把原先的 bot-to-bot bridge 升级为：
- 跨服务器 OpenClaw 任务总线
- 面向 agent 的任务投递协议
- 带签收、状态机、结果回传的轻量桥接层

---

## 架构分层

### 1. Bridge Server
职责：
- 接收任务
- 存储任务
- 暴露查询 / 签收 / 状态更新 / 结果回写接口
- 作为跨服务器中立任务中枢

### 2. Remote Worker
职责：
- 轮询属于本节点/本 agent 的任务
- claim 任务
- 调本地 OpenClaw agent 执行
- 更新状态
- 回写结果

### 3. Main Agent / Orchestrator
职责：
- 在本机判断是否需要远程协作
- 通过 bridge 发任务到远端节点
- 接收结果后继续本地裁决与放行

---

## 基本流程

```text
Main Agent(A)
  -> POST /tasks
Bridge Server
  -> Remote Worker(B) poll
Remote Worker(B)
  -> POST /tasks/:id/claim
  -> 本地执行 OpenClaw agent
  -> POST /tasks/:id/status
  -> POST /tasks/:id/result
Main Agent(A)
  -> 查询结果 / 汇总 / 裁决
```

---

## 核心设计原则

1. Bridge 不负责实际执行任务
2. Worker 才负责接远端任务并调用本地 OpenClaw
3. 任务状态必须清楚，不允许“收到了但看不出来”
4. 结果回传必须结构化，而不是只回一句话
5. 主 Agent 仍然掌握最终放行权
