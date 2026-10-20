# WorkBuddy 专家、助理与专家团成员可用性

## REA 核实

核查目标为本机 WorkBuddy 5.8.3，`F:/software/WorkBuddy/resources/app.asar`。
2026-10-20 重新计算的 SHA-256 与此前完整 REA 证据一致：
`3e50fcb5b060deba4f1ea9a8c293cf955bf12d7e52d971985de914350afd9077`。
本轮通过 REA CLI 6.7.0 `inspect-analysis-view` 复核已有证据，不修改 MCP 注册。

| 对象 | 安装包静态证据所支持的含义 |
| --- | --- |
| 普通任务 | 创建 daemon session 时专家可为空；普通聊天不依赖选择专家。 |
| 专家 | 市场专家作为插件和专业配置挂载到任务会话。选择、切换、清除专家会修改同一会话的专家插件和 runtimeIdentity。不能据此断言每张专家卡片都是独立常驻进程；企业专家还有云端引用。 |
| 助理 | 有独立 agentId、职责、模型、工作区、记忆配置和任务历史，可选用专家插件。个人助理查询角色为 specialist，云助理为 orchestrator；一位助理可以对应多个任务会话。 |

主要观察点（行号为本地格式化衍生文件）：

- `.tools/workbuddy-reference/plain-chat-provider-readable.js:16571`：创建会话允许无 expertId。
- 同文件 `27818`、`27936`：在同一个 session 上切换、清除专家配置。
- `.tools/workbuddy-reference/assistants-panel-readable.js:4468`：专家转换为 manifest plugins；`4552`：组装助理身份、职责、工作区与记忆配置。
- `.tools/workbuddy-reference/assistants-claw-readable.js:3482`：过滤 enabled=false 的个人助理；`2549`：按 agentId 恢复多任务会话历史。

证据标识：

- 原助理 Evidence：`ev_99bf02e05a5c320599517aa10d09d18a35dc23d3657c1a9d52875b99c35053e2`。
- 本轮 summary view：`ev_76fa52affb19c7b3e43a3fb27792890f2784cae481cad7dcf1e34ecd6b3a0813`。
- 本轮模块 view：`ev_ed1af13c0f7a83513d66cb37bd942f5a1355e50bf9b8bfad5a59fe86124fa98e`。
- 普通会话 provider Evidence：`ev_9fd0a5a6e3a3d64e9273eb35612da35c1442cc578eff20b4ea16412a183fd3e0`。

这是安装包静态分支核查，语义图覆盖为 partial。没有据此认定其独立 OS 进程、常驻策略、云端调度服务或数据库结构。本项目创建的专家目前确实是独立 Octop Agent；本次修复不迁移这一持久化模型。

## 已关闭专家仍可加入团队的修复

复现：四位私有专家全部停止后，创建专家团仍列出这四位成员。
原因：成员选择器仅检查本机与所有权，遗漏 state；后端名单校验也没有排除停止状态。
编辑团队时，还会把接口返回的旧成员合并回候选列表。

本次修改：

- 创建和编辑的候选列表只允许 running 的本机专家，并排除通用对话基础运行实体。
- 编辑时保留成员 state，避免旧名单把停止成员重新带回。
- 后端拒绝停止、失败、启动中、停止中、禁用或已下架的他人共享成员；直接提交 ID 也不能绕过。
- 已有团队返回当前可用成员，但不因停止或下架改写原始 manifest；恢复可用后可重新出现。
- 公共模板下架不删除独立创建的私有副本。私有副本自身停止后才从候选中消失。

回归证据保存于 `.tools/layout-checks/team-availability-*`，包括修复前失败测试、修复后测试及浏览器截图。

浏览器实测：旧版本成员选择器列出四位专家。新版本只保留实际运行中的 QA 测试专家，其他三位已停止专家消失；通过“我的专家”关闭 QA 测试专家后，重新创建团队显示“没有可加入的专家”。未创建团队，未重新上架公共资源，未修改其他私有专家的停止状态。

专家模块测试 `npx vitest run src/pages/Experts --maxWorkers=2`：19 个文件、95 项通过。
后端定向测试（团队名单、共享调用、欢迎词、公共资源与语言包）：114 项通过。
生产构建（含 TypeScript 检查）通过；浏览器验收页无 error 级日志。
完整 `make all` 通过：4920 passed、233 skipped；Ruff 与 605 个源文件的严格类型检查通过。
