# CONTROL_CENTER_INTEGRATION_NOTE.md

# OpenClaw Control Center 对接说明

## 说明目的

本文件用于明确说明：
- `openclaw-control-center` 部分的源码来源
- 本次对接中实际做了哪些修改
- 这些修改为什么没有直接推回原上游仓库
- 在本仓库中如何留存这些改动的可追溯记录

---

## 一、源码来源

`openclaw-control-center` 的源码来源于：

- `https://github.com/TianyiDataScience/openclaw-control-center`

本次工作中，控制台相关能力不是从零新写一个独立控制台，
而是在该上游项目的基础上进行**适应性修改（adaptation only）**，
让它能够接入 `bot-bridge-service` 提供的远端 bridge 状态接口，
从而把**远端 OpenClaw** 也显示到控制台中。

一句话：

> 上游提供控制台主体；本次仅做远端 OpenClaw / bridge 观测接入适配。

---

## 二、本次适应性修改的目标

本次修改的目标非常明确，不是重写控制台，不是改控制台业务定位，
而是让它能够：

1. 通过 bridge `/control/*` 接口读取远端 OpenClaw 的执行状态
2. 在控制台中显示远端 worker / agent 的状态
3. 在控制台中显示远端任务执行证据
4. 在设置页显示 bridge 接线状态与风险摘要
5. 让远端 OpenClaw 也能出现在控制台上，而不再只显示本机信号

---

## 三、适应性修改范围

这次在 `openclaw-control-center` 本地工作副本中做的修改，主要包括：

### 1. bridge adapter
新增：
- `src/runtime/bridge-control.ts`

作用：
- 拉取 bridge `/control/*`
- 提供缓存与错误包装
- 作为 control-center 的远端 bridge 数据适配层

### 2. 新增配置项
修改：
- `src/config.ts`
- `.env.example`

新增环境变量：
- `BRIDGE_CONTROL_BASE_URL`
- `BRIDGE_CONTROL_TOKEN`

作用：
- 让 control-center 可配置地接入远端 bridge

### 3. 新增 control-center 自身代理接口
修改：
- `src/ui/server.ts`

新增：
- `/api/bridge/overview`
- `/api/bridge/staff`
- `/api/bridge/tasks/board`
- `/api/bridge/tasks/recent`
- `/api/bridge/errors/recent`
- `/api/bridge/settings/wiring`
- `/api/bridge/settings/risk-summary`
- `/api/bridge/nodes`
- `/api/bridge/nodes/:nodeId`

作用：
- control-center 前端不直接碰 bridge 原始地址
- 先走 control-center 自己的代理层
- 后续前端接线更稳定

### 4. UI 启动顺序修复
修改：
- `src/index.ts`

作用：
- UI_MODE 下先启动 UI server，再跑 monitor
- 避免 monitor 卡住导致控制台页面起不来

### 5. 页面层桥接卡片接入
修改：
- `src/ui/server.ts`

当前已经接入的页面包括：
- Overview：远端 Bridge 总览
- Team / Staff：远端员工信号
- Tasks：远端任务证据
- Settings：远端 Bridge 接线状态 / 风险摘要

### 6. 远端员工显示方式对齐
修改：
- `src/ui/server.ts`

作用：
- 将远端 bridge staff 数据映射为 `StaffOverviewCard`
- 复用控制台原生员工卡片渲染链
- 让远端员工尽量按本地员工总览的视觉和字段显示：
  - 头像
  - 名字
  - 当前状态
  - 正在处理什么 / 下一项
  - 最近产出

### 7. 启动与托管辅助文件
新增：
- `run-control-center.sh`
- `start-control-center.sh`
- `systemd/openclaw-control-center.service`

作用：
- 为本地部署和 systemd 托管做准备

---

## 四、为什么没有直接推到上游仓库

这次修改没有直接推到：
- `TianyiDataScience/openclaw-control-center`

原因不是代码问题，而是：
- 当前使用的 GitHub 身份没有该仓库的写权限
- push 返回 403

因此本次采取的策略是：

> 不篡改上游仓库归属，不伪装来源；
> 在本仓库中保留适应性修改说明和 patch 记录，保证来源清晰、边界清晰、追溯清晰。

---

## 五、在本仓库中的归档方式

为了让这些控制台适配工作可追溯，本仓库中保留了两类材料：

### 1. 说明文档
本文件：
- `CONTROL_CENTER_INTEGRATION_NOTE.md`

用途：
- 说明源码来源
- 说明改动性质
- 说明改动目标
- 说明权属边界

### 2. patch 归档
目录：
- `docs/control-center-patches/`

当前归档 patch 包括：
- `e4c0bb0.patch`
- `8cb3b0a.patch`
- `fa4a052.patch`
- `76e1030.patch`

这些 patch 对应的是 `openclaw-control-center` 本地工作副本中完成的适应性修改，
用于后续：
- 自己 fork 后重新应用
- 重新整理成 PR
- 做内部留档

---

## 六、这部分修改的边界声明

请明确：

### 这不是
- 重写 `openclaw-control-center`
- 声称自己拥有该控制台原始源码
- 声称该控制台由本仓库独立开发

### 这是
- 基于上游控制台源码进行的**适应性修改**
- 目的是让**远端 OpenClaw** 也能出现在控制台中并显示状态
- 修改重点在 bridge 接入、远端员工状态、任务证据、接线状态与风险摘要

---

## 七、最终一句话说明（可外部使用）

可以直接使用下面这句：

> `openclaw-control-center` 部分源码来源于 `TianyiDataScience/openclaw-control-center`，本项目仅在其基础上进行了适应性修改，使远端 OpenClaw 也能接入控制台并显示状态、任务与接线信息。

如果要再更完整一点，可以用这句：

> 控制台主体来源于上游 `TianyiDataScience/openclaw-control-center`。本次工作没有重写控制台，而是围绕 `bot-bridge-service` 做了 bridge adapter、代理接口、页面桥接卡片与远端员工展示的适应性修改，使远端 OpenClaw 也能出现在控制台中并显示运行状态。
