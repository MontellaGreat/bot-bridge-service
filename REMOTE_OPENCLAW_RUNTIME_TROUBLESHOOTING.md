# REMOTE_OPENCLAW_RUNTIME_TROUBLESHOOTING

## 目标
排查远端 OpenClaw 在 worker 真实模式下无法稳定执行本机 agent 的问题。

当前症状：
- worker 已成功接单
- 但调用本地 OpenClaw agent 时超时/无响应
- 远端日志提示 queue / lane wait 问题

---

## 一、优先判断：是 bridge 问题还是本机执行问题

### 如果满足以下情况
- Bridge `/health` 正常
- 任务能 claim
- 状态能更新
- Mock 模式能 done

则应优先判断为：
> **本机 OpenClaw 执行链路问题，而不是 bridge 问题**

---

## 二、最小排查顺序

### 1. 检查 Gateway 状态
```bash
openclaw gateway status
```

### 2. 重启 Gateway
```bash
openclaw gateway restart
```

### 3. 测最小 agent 调用
```bash
openclaw agent --agent main --message "测试一下"
```

如果这一步本机都卡住，那么 worker 卡住是预期结果。

### 4. 检查是否存在队列堆积
关注：
- lane wait exceeded
- session queue 堵塞
- 挂起的 agent 任务过多

### 5. 检查本机资源
至少确认：
- CPU 是否打满
- 内存是否不足
- 磁盘是否异常

---

## 三、建议排查维度

### 1. CLI 级问题
- `openclaw` 命令本身是否正常
- `agent` 子命令是否与当前版本兼容
- 是否需要改用别的本地调用入口

### 2. Gateway 级问题
- 是否运行中
- 是否持续 auto-restart
- 是否内部任务堆积

### 3. Session / Agent 级问题
- 指定 agent 是否存在
- 指定 agent 是否可正常响应
- 是否存在长期卡死 session

### 4. 资源级问题
- 内存不够
- I/O 卡住
- 同机任务过多

---

## 四、临时策略

在真实模式未稳定前：
1. 用 mock 模式继续验证桥接链路
2. 把真实执行标注为“待 runtime 稳定后复测”
3. 不把此问题误归因到 bridge 协议

---

## 五、建议后续改进

### 1. Worker 增加自动降级
真实模式失败时，可按配置选择：
- 直接失败
- 自动降级 mock
- 仅记录诊断信息

### 2. Worker 增加更强诊断信息
包括：
- 命令参数
- stdout/stderr
- 超时秒数
- 本机 agent 名称

### 3. Bridge 增加 timeout 分类
把真实执行失败细分为：
- CLI timeout
- Gateway unavailable
- agent not found
- execution failed
