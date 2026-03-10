# bot-bridge-service

轻量级 Bot / Agent 桥接服务，用于：
- 一个机器人投递任务
- 另一个机器人轮询拉取任务
- 处理后回写结果

支持两种存储：
- `server.js`：JSON 文件版
- `server-sqlite.js`：SQLite 版（推荐）

## 功能
- `POST /tasks` 创建任务
- `GET /tasks?target=...&status=pending` 拉取待处理任务
- `GET /tasks/:id` 查询单个任务
- `POST /tasks/:id/result` 回写处理结果
- `GET /health` 健康检查
- Bearer Token 鉴权
- systemd 托管示例
- 日志轮转 / 健康监控脚本

## 目录
```bash
.
├── .env.example
├── .gitignore
├── README.md
├── package.json
├── server.js
├── server-sqlite.js
├── start-bot-bridge.sh
├── check-bot-bridge.sh
├── check-health.sh
├── monitor-bot-bridge.sh
├── rotate-bridge-log.sh
└── systemd/
    └── bot-bridge.service.example
```

## 环境变量
复制：
```bash
cp .env.example .env
```

编辑：
```bash
BRIDGE_PORT=8787
BRIDGE_TOKEN=your-secret-token
```

## 启动
### SQLite 版（推荐）
```bash
source .env
node server-sqlite.js
```

### JSON 版
```bash
source .env
node server.js
```

### npm
```bash
npm start
```

## API 示例
### 创建任务
```bash
curl -X POST http://127.0.0.1:${BRIDGE_PORT}/tasks \
  -H "Authorization: Bearer ${BRIDGE_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{
    "source":"openclaw-feishu",
    "target":"other-bot",
    "type":"message",
    "content":"请处理这条消息",
    "conversationId":"conv-001",
    "metadata":{"priority":"normal"}
  }'
```

### 拉取待处理任务
```bash
curl "http://127.0.0.1:${BRIDGE_PORT}/tasks?target=other-bot&status=pending" \
  -H "Authorization: Bearer ${BRIDGE_TOKEN}"
```

### 回写结果
```bash
curl -X POST http://127.0.0.1:${BRIDGE_PORT}/tasks/task_xxx/result \
  -H "Authorization: Bearer ${BRIDGE_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{
    "status":"done",
    "result":"处理完成"
  }'
```

## Worker 接入方式
这是 **pull 模式**，不是 push。

对端 worker 必须主动轮询：
1. 拉取 `pending` 任务
2. 处理 `content`
3. 回写 `result`

伪代码：
```python
while True:
    tasks = fetch_pending_tasks(target="other-bot")
    if not tasks:
        sleep(5)
        continue
    for task in tasks:
        try:
            result = process(task["content"])
            post_result(task["id"], {"status": "done", "result": result})
        except Exception as e:
            post_result(task["id"], {"status": "error", "result": "处理失败", "error": str(e)})
```

## systemd
示例文件：
- `systemd/bot-bridge.service.example`

典型操作：
```bash
sudo cp systemd/bot-bridge.service.example /etc/systemd/system/bot-bridge.service
sudo systemctl daemon-reload
sudo systemctl enable bot-bridge
sudo systemctl start bot-bridge
```

## 运维脚本
- `rotate-bridge-log.sh`：日志轮转
- `monitor-bot-bridge.sh`：健康检查 + 异常自动重启
- `check-health.sh`：接口健康检查
- `check-bot-bridge.sh`：基础服务检查

## 已验证过的场景
- OpenClaw / Bot 之间异步投递任务
- 招投标链接剥离测试任务
- 拉取任务 → 回写结果闭环

## 注意
- `.env` 不要提交
- `data/` 不要提交
- 如果对端 worker 只会“签收”不会“处理”，桥接本身是通的，但业务不会完成
- 不同 OpenClaw CLI 版本参数可能不兼容，不要把 worker 写死到某个特定命令组合
