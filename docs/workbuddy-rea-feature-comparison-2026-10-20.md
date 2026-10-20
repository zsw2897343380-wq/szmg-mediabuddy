# WorkBuddy 核心功能拆解与 Octop 能力差异

日期：2026-10-20。对象：**本机 WorkBuddy 5.8.3** 与当前 Octop / MediaBuddy 工作区。方法：REA 安装产物静态分析、已有 Evidence 复核、指定资源读取，以及 Octop 源码对照。源码比较基线为下述 Git HEAD；同一聊天后续已按用户图片将首页改为媒体行业场景与提示词，G13 的动态配置分发差异仍然存在。

## 1. 结论与阅读方式

**Octop 已具备大部分通用 Agent 平台基础。最值得借鉴 WorkBuddy 的是“任务完成后的成果交付与继续编辑”，其次是技能供应链治理、场景运营和轻量专家模型。** 继续增加专家卡片数量，收益低于补齐文档编辑、文件变更回退、资料沉淀这些实际工作链路。

本报告整理出 **17 项缺口或增强方向**，见第 4 节。这里的“缺口”分三类：

- **缺少专门实现**：当前检索范围未见与 WorkBuddy 对应的产品机制。
- **部分具备**：Octop 有基础能力，缺少其中某段使用流程或治理机制。
- **模型不同**：双方都有功能，但身份、会话或执行服务的组织方式不同，需要产品决策，不能直接判为 Octop 做错。

“已有”只表示源码有实现；“WorkBuddy 有”通常表示安装包有相应分支或工具契约，**不表示本轮已在 WorkBuddy 中成功执行**。云端权限、付费额度、第三方账号授权和服务端内部实现没有通过静态分析得到证明。本报告是当前证据范围内的清单，不把未检查的云端能力当作已经穷尽。

### 最建议优先考虑的五项

| 顺位 | 能力                        | 对当前项目的价值                                                         | 建议                                                         |
| ---- | --------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------ |
| 1    | Office 编辑、保存与聊天联动 | 文稿、表格、汇报材料可以在一个工作流程中完成；目前 DOCX 编辑存在格式损失 | 优先技术验证，确认许可、部署与格式保真，再做产品集成         |
| 2    | 任务文件差异与选择性回退    | 用户能看清 AI 改了什么，并恢复错误修改                                   | 先做文件快照、差异预览、明确范围的恢复                       |
| 3    | 技能导入与分享的扫描结果    | 当前已经导入大量专家与技能，内容信任和分发治理更有实际意义               | 建立扫描报告、内容哈希和阻断策略；不要宣称扫描能保证绝对安全 |
| 4    | 动态场景配置及能力绑定      | 媒体业务的选题、采访、写稿、审核等入口可持续运营，无须每次改前端         | 先用本地管理配置替代硬编码，保留现有双语与草稿行为           |
| 5    | 可沉淀的资料空间            | 把会话结果、附件、引用资料组织为可持续使用的团队资产                     | 先做“保存到资料空间”，再评估结构化表、页面发布等扩展         |

这是产品优先级判断，不是 REA 对开发成本的测量。Office 和托管云服务的工程量明显高于增加一个 UI 入口。

## 2. 目标身份、方法与证据边界

### 2.1 本机目标

| 项目           | 本轮核实结果                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------- |
| 安装产物       | `F:\software\WorkBuddy\resources\app.asar`                                                   |
| 文件大小       | 96,544,269 字节                                                                              |
| SHA-256        | `3e50fcb5b060deba4f1ea9a8c293cf955bf12d7e52d971985de914350afd9077`                           |
| 包声明         | `@genie/workbuddy-desktop`，`productName: WorkBuddy`，`version: 5.8.3`，入口 `main/index.js` |
| Octop 对照基线 | Git HEAD `75b3dcf56e3149333af78687ac1be71d73684f1e`；开始分析时工作树干净                    |
| REA            | 已缓存的 CLI 6.7.0；当前会话未连接 REA MCP，因此采用技能明确支持的 CLI 路径                  |

本轮重新计算目标哈希，复核 7 份匹配的既有完整 Evidence，并补充分析 9 个指定 JSON/JavaScript 文件。补充分析成功解析 8 个 JavaScript 文件，`parse_failures=0`；没有重新对整个应用做无差别分析。

本轮仅读取安装产物与项目源码，没有向 WorkBuddy 发送任务、修改其配置、读取私人聊天、使用账号凭证或操作第三方服务。格式化 JavaScript 仅作为文本处理，没有执行 bundle 或 native companion。

### 2.2 Evidence 索引

下文使用 E1—E8 指向真实 REA Evidence；R1 指普通静态资源证据，**R1 不冒充 REA 语义分析结果**。

| 编号 | REA Evidence ID                                                       | 实际覆盖内容                                                                                    | 本地完整记录                                                                                                |
| ---- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| E1   | `ev_3ca6daa22c2c5eb28e2ff7df82cb0cb709c6ffbadff031ade6c00f5df4c2d88d` | package、app shell/home 等选定入口                                                              | `.tools/workbuddy-reference/layout-evidence.json`                                                           |
| E2   | `ev_33acc771f903277472d021350f88476609d6eff621b46d23effd10a31e30c60c` | automation、skills panel、conversation、task                                                    | `.tools/workbuddy-reference/modules-evidence.json`                                                          |
| E3   | `ev_c98184ef6fb86395e1e675f83c68fcff35567078a7ad8c8d2c7b027973f2ad7d` | connector capsule、main content                                                                 | `.tools/workbuddy-reference/capability-evidence.json`                                                       |
| E4   | `ev_0c405def4f9758eb21f381d349533796edc70e7fcf402e4fcc95305f4c742ab2` | contexts、skills market、skill detail                                                           | `.tools/workbuddy-reference/centers-evidence.json`                                                          |
| E5   | `ev_99bf02e05a5c320599517aa10d09d18a35dc23d3657c1a9d52875b99c35053e2` | 个人/云/企业助理与助理配置                                                                      | `.tools/workbuddy-reference/assistants-evidence.json`                                                       |
| E6   | `ev_9fd0a5a6e3a3d64e9273eb35612da35c1442cc578eff20b4ea16412a183fd3e0` | WorkBuddy provider、adapter、common                                                             | `.tools/workbuddy-reference/scene-config-provider-evidence.json`                                            |
| E7   | `ev_00fd0454d99b37643733c8830e50810c95e4515025eb1d3a13468432924ba203` | `main/server.js` 场景读取与合并                                                                 | `.tools/workbuddy-reference/scene-config-server-evidence.json`                                              |
| E8   | `ev_6c37d0d509cb1f487bec9dec93124c7fdae9118071584f9fd2404d255499b059` | package、乐享、Miora preview、HTML editor、技能扫描结果、浏览器入口、文档 preload 等 9 个指定源 | `.tools/workbuddy-gap-analysis/extensions-supported-evidence.json`                                          |
| R1   | 不适用，普通静态读取                                                  | 安装包内 Office/Library/Miora 技能说明、Office SDK Python 封装、main bootstrap 指定片段         | `.tools/workbuddy-gap-analysis/resource-ledger.json`；`.tools/workbuddy-feature-audit/static-excerpts.json` |

本轮 7 份原证据的实际 `inspect-analysis-view` 输出位于 `.tools/workbuddy-gap-analysis/*-rea-summary.json`，父证据和视图 ID 另存于 `evidence-ledger.json`。补充资源保留了包内路径、观察到的 SHA-256、解包标识和声明完整性字段。

**完整性与覆盖限制：** 原分析及本轮分析均记录了若干 unpacked native/依赖文件的声明哈希与实际文件不符，使用 `record-and-continue` 保留“观察到但不可信等价”的标记；不能从这些记录证明安装包整体可信，也不能据此认定遭篡改。没有执行这些组件。语义图存在节点/unknown 上限；E8 仍有 11,380 个 inventoried relevant files 未选作源分析。视图的 `complete-within-view` 只说明视图投影完整，不说明全应用语义完整。

**引用约定：** WB 行号指 `.tools/workbuddy-reference/` 下可读衍生文件；补充 JS 位于 `.tools/workbuddy-gap-analysis/*-readable.js`。它们不是原作者源码行号。安装包内 SKILL.md 证明的是已打包的工作流契约，不能单独证明远端服务当前可用。

## 3. WorkBuddy 核心功能地图与 Octop 现状

以下按用户工作链路归类，同一项不必然对应独立进程或独立服务。

### 3.1 发起任务、专家与助理

| 核心功能                             | WorkBuddy 的静态观察                                                                                              | Octop 当前状态与依据                                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 通用任务，不强制选专家               | `createNewSession` 允许无 expertId；E6，`plain-chat-provider-readable.js:16571`                                   | **已有**。`src/octop/api/routers/chat/routes.py:58` 解析当前用户通用对话运行时                                           |
| 办公/开发/设计入口及场景建议         | 场景选择、草稿预填、推荐行切换；E3/E4，`contexts-readable.js:162624`、`:354609`                                   | **已有界面与本地提示词**。`dashboard/src/pages/Chat/components/WelcomeScreen.tsx:14`；分发机制见 G13                     |
| Ask / Plan / Craft 执行模式          | `setMode`、计划审批与执行模式转换；E4/E6                                                                          | **已有**。`src/octop/api/routers/chat/models.py:60` 定义 Ask 只读、Plan 仅写计划、Craft 执行                             |
| 计划确认、调整、重试                 | `ExitPlanModePanel` 和 `approvePlan/adjustPlan/retryPlanAdjustment`；E4，`contexts-readable.js:347606`、`:349611` | **已有计划及审批流程**。`src/octop/infra/gateway/process/processor.py:1526`、`:1597`；逐按钮体验等价性未做动态验证       |
| 工具审批、拒绝、等待用户             | runtimeSecurity、toolRisk、requireApproval 等字段与卡片分支；E4                                                   | **已有**。`src/octop/api/routers/chat/routes.py:267`，`src/octop/infra/agents/security/hitl_session.py:186`              |
| 专家市场、搜索、分类、详情、快捷问题 | 市场/详情与专业配置挂载；E3/E4/E6                                                                                 | **已有**。`src/octop/api/routers/experts.py:493`、`:524`、`:648`；已导入资源见第 5 节                                    |
| 专家作为会话内可选插件               | 同一 session 更新 expert/runtimeIdentity，清除时禁用插件；E6，provider `:27818`、`:27936`                         | **模型不同**。Octop 安装专家为独立 Agent，非完全等价的会话挂载；见 G14                                                   |
| 输入框提及其他助理开展协作           | `<mentioned_experts>` 上下文引导 `send_message`；E4，contexts `:207650`、`:207683`                                | **已有专家协作基础，组织方式不同**。`src/octop/infra/agents/teams/service.py:26`；不把“@协作”和“切换会话专家”当一回事    |
| 独立助理页、职责、模型、资料配置     | profile、tasks、responsibilities、workspaces、memory；E5，`assistants-panel-readable.js:4552`                     | **已有本地适配**。`dashboard/src/pages/Assistants/AssistantForm.tsx:143`、`:192`、`:201`、`:232`                         |
| 一个助理多个任务与历史               | 以 agentId 查询 conversation，打开 instance/session；E5，`assistants-claw-readable.js:2549`                       | **已有**。`dashboard/src/pages/Assistants/index.tsx:640`；使用既有 Agent/thread                                          |
| 本地、云端、企业助理分组             | specialist/orchestrator、企业引用和策略字段；E5                                                                   | **部分/模型不同**。Octop 有本地助理和远程 Bridge，未见同等托管服务；见 G15/G16                                           |
| 定时任务及记录                       | automation 模块有任务配置/运行记录分支；E2                                                                        | **已有**。`src/octop/api/routers/cron.py:141`、`:178`、`:294`。助理“安排工作”有一处仅打开聊天传文本，不能全部解释为 cron |

### 3.2 处理文件、沉淀成果

| 核心功能                             | WorkBuddy 的静态观察                                                            | Octop 当前状态与依据                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 工作区、附件及文件操作               | 会话工作目录、附件 staging、预览路径；E4/E6                                     | **已有**。`src/octop/api/routers/workspace.py:121`、`:304`、`:330`、`:526`、`:550`                                                    |
| 文本、代码、Markdown 与媒体预览      | 多格式预览和编辑组件；E4/E8                                                     | **已有**。`dashboard/src/pages/Agent/Workspace/components/FileViewer.tsx:8`；`CodeEditor.tsx:20`                                      |
| Word、Excel、PPT、PDF 查看           | 对应预览和 Office editor host；E4/R1                                            | **已有现代格式预览**。`dashboard/src/components/DocumentPreviewCore.tsx:420`、`:435`、`:456`、`:496`；旧 doc/ppt 与大表格存在范围限制 |
| 本地 Office/WPS 可视编辑、新建、保存 | editor_sdk 的 doc/sheet/slide 契约，保存脏文档；E4/R1                           | **部分具备，主要缺口**。Octop 仅 DOCX Markdown 往返编辑；见 G01                                                                       |
| 远端 Office 与资料库文档人机双写     | cloud sandbox saver、selectionScope、library-office-edit；E4/R1                 | **连接器已有，内嵌编辑链路未见**；见 G02/G03                                                                                          |
| HTML 页面编辑、选区引用、回存        | HtmlEditor 的 editing/onSelectionQuote/export/writeFile；E8                     | **已有代码编辑与预览，缺少对应画布工作流**；见 G09                                                                                    |
| 文件 diff 与回退                     | diff hunks、checkpointRead、rollbackFiles、sessionRollback；E4/E6               | **未见同等文件级事务机制**。聊天分叉不等于文件恢复；见 G04                                                                            |
| 任务产物与文件预览                   | 附件、preview host、文件操作与任务上下文；E4/E6                                 | **已有产物归集**。`src/octop/infra/agents/middleware/thread_artifacts.py:114`，`dashboard/src/pages/Chat/index.tsx:359`               |
| 个人/团队资料空间、内容树            | Library 的 spaceId/nodeId、doc/database/page/link/drive 等类别；R1；乐享入口 E8 | **有工作区、知识库、连接器，但非同等统一内容空间**；见 G05                                                                            |
| 原生结构化表                         | schema、字段、记录增删改查的工具契约；R1                                        | **未见同等原生用户表产品**；连接器能调用外部表格，见 G06                                                                              |
| 报表页、表单、页面分享/发布          | Library 页面与发布路由、数据页契约；R1                                          | **已有 HTML 产物和插件 UI，不等同资料空间页面发布**；见 G07                                                                           |
| Miora 创意画布与多媒体资产           | viewer 定位、canvas assets 同步、.miora 下载；E4/E6/E8                          | **有媒体文件展示，但未见等价统一创意画布**；见 G08                                                                                    |

### 3.3 能力扩展、知识、账号与桌面入口

| 核心功能                         | WorkBuddy 的静态观察                                                      | Octop 当前状态与依据                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 技能市场、导入、启停、移除、详情 | market/detail/import/install 分支；E2/E4/E6                               | **已有**。`src/octop/api/routers/skills.py:1173`、`:1555`、`:1615`；用户技能偏好与挂载也已有                                                         |
| 技能导入扫描及风险展示           | securityCheck、scanResult、blocked、riskLevel；E4/E8                      | **未见同等内容扫描与分级流程**；见 G10                                                                                                               |
| 专家分享前扫描                   | exportZip→scan、超时/取消、风险分支及 MD5 绑定；E4                        | **已有发布权限，未见同等发布包扫描**；见 G11                                                                                                         |
| 企业技能更新与本地修改保护       | local/remote version、userModified；E4                                    | **已有版本字段和市场安装，未见同等组织更新机制**；见 G12                                                                                             |
| 插件、MCP 与连接器               | connector capsule、插件与 MCP 配置；E3/E4/E6                              | **已有**。`src/octop/api/routers/plugins.py:135`、`:207`；`connectors.py:574`、`:1002`、`:1408`                                                      |
| 腾讯文档、乐享等服务             | 列表、搜索、上传、授权、预览，乐享内容加入任务；E6/E8                     | **服务接入已存在**。`src/octop/infra/connectors/builder.py:148`、`:189`；差异是原生侧栏/编辑流程，不是“没接腾讯生态”                                 |
| 助理长期记忆                     | profile/settings/suggestion/import/updating/clear；E5/E6                  | **已有较完整自托管记忆**。`src/octop/api/routers/memory.py:309`、`:414`、`:637`、`:732`，另有迁移/诊断                                               |
| 知识库检索与资料加入任务         | 乐享内容及 Library semantic search 契约；E6/E8/R1                         | **已有本地 RAG/OCR/索引**。`src/octop/api/routers/knowledge_bases.py:316`、`:360`、`:839`；不能列为无知识库                                          |
| 模型选择与组织限制               | 助理配置模型、enterprise model policy；E4/E5                              | **已有多供应商与模型管理**。`src/octop/api/routers/providers.py:195`、`:220`、`:345`；细化组织策略见 G16                                             |
| 微信、企微、钉钉、飞书等渠道     | 助理配置页、二维码绑定、状态轮询；E5                                      | **已有多渠道**。`src/octop/infra/gateway/` 及助理页 ChannelsPanel；绑定便利度不等于新增通道能力                                                      |
| 普通/流式语音识别                | speechToText/speechToTextStream 适配；E6                                  | **已有**。`src/octop/infra/voice/realtime.py:111`，`src/octop/api/routers/voice.py:262`；须配置服务                                                  |
| 集成浏览器与浏览器数据管理       | internal browser open，持久 partition、Cookie/cache 清理、设备模拟；E8/R1 | **已有浏览器会话、人工接管与录制回放**。`src/octop/api/routers/browser/harness.py:298`，`record_replay.py:202`、`:312`；本轮未比较双方全部浏览器设置 |
| 原生桌面常驻入口                 | Electron 主入口与 globalShortcut 更新处理；E1/R1                          | **Octop 已有 Wails 壳、托盘、拖放**。`desktop/src/main.go:441`、`:524`；热键差异见 G17                                                               |
| 企业资源与成员策略               | enterprise connector visibility、skill upload、custom model policy；E4/E5 | **已有多用户/角色/SSO，特定策略需补对照**。`src/octop/api/routers/user_roles.py:220`、`users.py:382`；见 G16                                         |

## 4. 可以应用到当前项目的 17 项缺口与增强

P1 表示建议进入近期验证或迭代；P2 表示在基础闭环完成后评估。它们是本报告的建议，不是现有项目承诺。

### G01. 本地 Office 的可视编辑与保存闭环 — 部分具备，P1

**WorkBuddy 证据：** E4 的 `contexts-readable.js:319274` 在外部操作前检查本地文档 dirty 状态并保存；保存失败会阻止继续。R1 的 `workbuddy-local-office-edit/SKILL.md:5`、`:31` 说明通过本地 editor_sdk MCP 对 doc/sheet/slide 分类读写；`edsdk.py:79`、`:121`、`:144` 包含服务发现、tools/list、单工具 schema 查询。宏不执行，PDF/OFD 仅查看，et/ett/dps/dpt 不在该契约支持范围。

**Octop 差异：** `dashboard/src/utils/docKind.ts:30` 仅将 DOCX 列为可编辑。`src/octop/infra/utils/doc_edit.py:9` 明确 DOCX 经 Markdown 往返，复杂颜色、图片、页面布局会简化或丢失。现有 Excel/PPTX 预览不能算单元格/幻灯片对象编辑。

**应用建议：** 先验证可部署、许可合适的 Office 编辑引擎或 MCP 编辑服务；保留现有预览，新增明确的“打开编辑器”及保存状态。不应把 WorkBuddy 私有 editor_sdk 当作 Octop 可直接分发的依赖。

**验收：** Word 修改段落、Excel 修改单元格、PPT 修改文字后均能保存并重新打开；逐项验证图表、图片和版式。对不支持的格式明确降级；保存失败不能显示成功。

### G02. 云端文档与远端工作区的内嵌编辑 — 部分具备，P2

**WorkBuddy 证据：** E4，contexts `:317743` 的 `createCloudSandboxDocumentSaver` 查询 open_editors 并调用 `/localapi/save`；`:317905` 注册编辑预览。E6 provider `:24630`、`:24853` 区分文档预览与企业预览。R1 `library-office-edit/SKILL.md:9`、`:46` 给出资料库 doc-mcp/sheet-mcp/slide-mcp 人机双写契约。

**Octop 差异：** 腾讯文档、乐享 MCP 接入均已存在，见 `builder.py:148`、`:189`；工作区也支持远端存储。但未见与这些服务对应的内嵌 Office 编辑器、预览票据、打开/保存/关闭生命周期。

**应用建议与验收：** 定义领域层文档会话适配器，经现有 workspace/connector 授权使用；先验证一种服务的打开、修改、保存、权限失效，再扩展。账号无权限时不得返回他人预览链接。

### G03. 文档选区直接成为 AI 修改上下文 — 缺少专门链路，P1（依赖 G01/G02）

**WorkBuddy 证据：** E4 contexts `:317911` 的 selectionScopeId/aiEditEnabled；E8 `html-editor-DE2jdDzo-readable.js:80` 将 selectedText/quoteRef 转为引用事件，`:430` 绑定 onSelectionQuote。

**Octop 差异：** 有文件引用、编辑器和聊天输入，但在当前 Office 预览/编辑路径中未见对等的“选中段落、区域或对象→稳定引用→AI 定点修改→刷新选区”的工作流。

**应用建议与验收：** 引用应携带文档身份、选区与内容版本；从文稿选一段要求润色，只修改该段，其他内容保持；过期选区必须重新确认。不要仅把选中文字拼进提示词就视为可靠定点编辑。

### G04. 文件变更 diff 与会话回退联动 — 缺少专门实现，P1

**WorkBuddy 证据：** E4 contexts `:284165` 记录 diff/hunks/diffStatus；`:296704` 调 checkpointRead，返回 changes/unavailable/restoreInfo；`:341519` 编辑重发携带 rollbackFiles。E6 provider `:17706` 有 sessionRollback。源码明确考虑不可恢复或降级情况。

**Octop 差异：** `src/octop/infra/agents/threads/fork.py:181` 是聊天分叉；`thread_artifacts.py:114` 是产物路径归集。当前检索未见把一次任务的文件快照、差异、恢复决定绑定起来的机制。

**应用建议与验收：** 先支持通过 workspace API 修改的文件；记录变更前版本，显示新增/修改/删除和 diff，允许选择文件恢复。用户在 AI 执行后手工改过的文件应提示冲突；聊天恢复与文件恢复分别表达。不将 Git worktree 作为所有远端后端的默认实现。

### G05. 统一的个人/团队资料空间 — 部分具备，P1

**WorkBuddy 证据：** R1 `library/SKILL.md:17` 定义 personal/team space、node 树及 doc/database/page/link/drive/附件等内容类型；`:39` 定义语义检索契约。E8 的乐享侧栏存在个人库和 space detail 路由；这两组证据表明多种资料入口，不能据此推断它们一定使用同一后端。

**Octop 差异：** 已有 Agent 工作区、知识库及乐享连接器；知识库已有资料目录、Markdown/纯文本编辑与检索，但尚未形成会话成果、页面、业务表和引用链接统一管理的产品。

**应用建议与验收：** 先做“保存本次成果到个人/团队资料空间”，提供来源会话、文件版本、引用和共享范围。先沉淀稿件、会议纪要、选题资料，不必一开始实现完整网盘与在线办公套件。团队成员能复用资料，撤权后访问立即受限。

### G06. 原生结构化业务表 — 缺少专门实现，P2

**WorkBuddy 证据：** R1 `library/database/entry.md:3`、`:35` 起列出建表、schema、字段操作和记录操作契约，不只是把 CSV 当文本。

**Octop 差异：** 已有表格预览、腾讯文档智能表格及企微文档连接器；未见同等由普通用户创建字段、维护记录并供 AI 读取写入的原生资料表。后端业务 SQL 表不属于这项用户功能。

**应用建议与验收：** 可先落地选题池、采访安排、稿件审核状态三类表。AI 和人工操作相同字段/记录 ID；更新后重新查询核对，权限和操作审计可追溯。

### G07. 资料页、看板、表单与发布链接 — 部分具备，P2

**WorkBuddy 证据：** R1 `library/SKILL.md:87` 指向资料页发布；`library/database/entry.md:19` 区分简单表与 dashboard/form/workbench 页面工作流。

**Octop 差异：** 已有 HTML 文件预览、插件 UI 扩展；当前检索未见同等“资料节点→可查询业务表→页面→授权分享/发布/撤回”的内建产品闭环。能生成 HTML 不等于具备页面托管与发布治理。

**应用建议与验收：** 先做内部选题看板、值班汇报页；明确内网/公开范围，支持撤回。页面权限和底层表权限一致，不能通过前端页面绕过数据权限。是否需要公开托管另作产品决策。

### G08. 多媒体创意画布与品牌资产组织 — 缺少专门实现，P2

**WorkBuddy 证据：** E4 contexts `:168567` PreviewMiora，E6 provider `:26043`、`:26062` 定位 viewer 与 canvas assets；E8 有 Miora iframe/host 消息分支。R1 `miora-creative-core/SKILL.md:3`、`:17` 要求图片/视频产物进入同一画布。

**Octop 差异：** 现有媒体预览与技能可以输出图片、视频等文件，但当前检索未见等价的空间画布、生成批次/参考素材/资产关系管理。具体生成能力仍取决于配置的工具和模型。

**应用建议与验收：** 可先提供“创意项目板”，集中参考图、生成图、成片、提示词和版本；媒体业务适用海报系列、栏目视觉、短视频素材。一个项目内的产物可定位来源和版本；不默认复制 .miora 私有格式或腾讯生成后端。

### G09. HTML 成果的可视编辑与回存 — 部分具备，P2

**WorkBuddy 证据：** E8 `html-editor-DE2jdDzo-readable.js:381` 注册导出保存，`:402` 写回文件，`:424` 传 editing，`:430` 传选区引用。

**Octop 差异：** Monaco 编辑源码与 HTML 预览已有，未见等价的页面画布编辑、选区交给 AI 和导出回存流程。

**应用建议与验收：** 对 AI 生成的报道页、汇报页、海报 HTML，先支持文字/图片替换及保存，再考虑任意布局编辑。重新打开文件后修改仍在；预览内容执行权限受控，不把任意 HTML 当可信应用代码。

### G10. 技能导入前扫描与分级结果 — 缺少专门实现，P1

**WorkBuddy 证据：** E4 contexts `:215502` 传入 securityCheck/appKey，`:215515` 处理 security_check_blocked；E8 `skill-scan-result-dialog-DOfbkoHL-readable.js:20` 起展示 riskLevel 等扫描结果。

**Octop 差异：** 现有技能包导入、路径校验、只读挂载、工具审批等不能等同对包内容的恶意行为扫描。本次在 `infra/skills` 与相关 API 中未见等价扫描报告和风险分流。Octop 已有安全机制不因此被否定。

**应用建议与验收：** 报告绑定包内容哈希，覆盖脚本、可执行附件和外联等风险信号；提供可替换扫描适配器。高风险、扫描失败、低风险分别可测试；界面显示真实结果及来源，不生成虚假的“已安全认证”。

### G11. 专家/技能分享发布前的内容检查 — 部分具备，P1

**WorkBuddy 证据：** E4 contexts `:177660` 的 exportZip→scan；`:177683` 高风险阻断；`:177701`、`:177708`、`:177723` 处理超时、取消及警告，后续检查 MD5 与预检内容一致。

**Octop 差异：** `src/octop/api/routers/experts.py:551` 发布、`:588` 快照更新、`:632` 下架已有；未见同等“待发布内容与扫描结果绑定”的流程。管理员有发布权限，不代表发布包内容已检查。

**应用建议与验收：** 与 G10 复用扫描报告，但发布前重新核对快照哈希；扫描后内容改变必须使报告失效。管理员能查看结果，超时不得被静默记作通过。

### G12. 企业技能版本比较与本地修改保护 — 部分具备，P2

**WorkBuddy 证据：** E4 contexts `:181737` 的 buildEnterpriseUpdateState 构建 localVersionMap/remoteVersionMap；`:181747` 对 userModified 的技能跳过远端升级提示映射。仅据该分支不推断整个云端更新服务。

**Octop 差异：** 已有 SkillHub 版本字段、下载与安装，以及个人副本；当前未见同等组织分发版本比较和显式本地修改保护机制。不能写成 Octop 完全没有版本信息。

**应用建议与验收：** 保留来源、安装版本、内容哈希与本地改动标识；先做更新提示和人工更新。修改过的技能不能被无提示覆盖；共享模板更新也不能意外改写独立私有副本。

### G13. 动态场景配置、灰度与插件绑定 — 部分具备，P1

**WorkBuddy 证据：** E7 `getProductScenes/readBuiltinScenes/readOperationalScenes` 合并内置设计场景与远端场景；`normalizeSceneEntry` 支持 prompts/promptTitles/plugins/expert、版本约束及 interactionModes。源片段见 `.tools/workbuddy-reference/scene-config-merge-source.txt:1`、`scene-config-remote-source.txt:1`。

**Octop 差异：** `WelcomeScreen.tsx:14` 的分类和 locales 提示词目前是前端静态配置。已有场景切换、可编辑预填和推荐，缺少与 WorkBuddy 相近的配置分发/能力绑定机制，而非缺整个场景页。

**应用建议与验收：** 首版由现有管理权限控制场景配置，支持中英文、排序、提示词、资源绑定和停用；以后再评估版本约束/灰度。改一条配置即可影响新任务入口；点场景仍只预填、不自动发送；无授权连接器要显示真实状态。未证明 WorkBuddy 有普通用户可编辑场景的后台，不以此作为其既有功能。

### G14. 在同一任务会话挂载/切换/清除专家 — 模型不同，P2

**WorkBuddy 证据：** E6 provider `:27818` 的 setSelectedExpertForSessionInternal 更新同一 session 的插件与 runtimeIdentity；`:27936` 清除专家并禁用相关插件；普通会话仍保留。

**Octop 差异：** `src/octop/api/routers/experts.py:648` 安装为独立 Agent；`dashboard/src/api/modules/assistants.ts:17`、`:28` 的助理也复用 Agent CRUD。当前具备选专家、专家团和通用对话，但运行语义不同。

**应用建议与验收：** 可另建“会话专业配置”这一轻量概念，保留独立 Agent 用于长期身份、记忆和专属工作区。先决定专业配置包含哪些 prompt/skills/plugins，避免直接重构现有 Agent 表。同一 thread 选择 A、切换 B、清除，旧专家指令不残留，历史消息和文件不丢。

### G15. 托管云助理与统一执行来源 — 模型不同，P2

**WorkBuddy 证据：** E5 助理列表区分 specialist/orchestrator、云端与企业来源；`assistants-panel-readable.js:4552` 构建 cloud agent manifest，`:6751` 调 createCloudAgent。静态调用证明客户端接口，未恢复云调度实现。

**Octop 差异：** 已有本地 Agent 和 `src/octop/api/routers/bridge.py:64`、`:151`、`:276` 的跨实例能力；Bridge 需要可连接的自托管对端，不能直接等同“免自建运行环境的托管助理”。

**应用建议与验收：** 近期可先统一展示本机/远端来源、在线状态和权限，避免先造商业云平台。若确实需要托管，再单独设计租户隔离、存储、凭据、调度和费用；断网、对端拒绝、重连时任务状态应明确。

### G16. 组织级连接器、模型与资源分发策略 — 部分具备，P2

**WorkBuddy 证据：** E4 contexts `:44302` 的 enterprise connector visibility，`:217935` 技能上传策略，`:202464` 成员自定义模型策略；E5 `assistants-claw-readable.js:3461` 的企业聊天隐藏模型选择。enforceMode 字段存在，**未证明“管理员强制不可删助理”等执行语义**。

**Octop 差异：** 多用户、角色、批量资源策略、LDAP/OIDC，以及平台级连接器目录上下架与创建拦截已有；尚需核对按组织/成员分别配置可见性、技能上传来源、可选模型和组织版本下发等更细规则。不能写成 Octop 没有企业权限管理。

**应用建议与验收：** 从已有权限/资源策略扩展，先定义一张明确的管理员策略表，后端验证与前端显示一致。普通用户直接调接口也不能绕过管理员限制；拥有相应角色的用户不受误伤。

### G17. 原生全局快捷键唤起 — 未见同等实现，P2

**WorkBuddy 证据：** R1 的 `main/main-bootstrap.js` 字节偏移 239667 附近存在 handler 调 `globalShortcut.updateToggleWindow`，原字节片段和 SHA-256 保存在 static-excerpts.json。这里只确认全局快捷键配置/处理，不扩大为跨应用划词、屏幕理解或系统听写。

**Octop 差异：** 桌面壳、托盘、拖放、自启动、防休眠已有；在 `desktop/src` 检索全局热键、划词与剪贴板相关入口未见对应实现。

**应用建议与验收：** 先在现有 Wails 壳增加可配置唤起/隐藏热键，处理冲突、退出注销和多窗口焦点。工作区以外的文本收集能力应作为后续独立需求，不顺带加入。

## 5. 已经完成的 WorkBuddy 借鉴工作：不要再次列为缺失

以下是仓库中的**历史验收记录**，本轮没有重放这些 UI/模型/第三方服务测试。

| 已完成事项                         | 状态与范围                                                                                          | 记录                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 专家市场与能力中心样式/交互适配    | 搜索、分类、详情、召唤、个人视图等已落地到 Octop 实际 API                                           | `.tools/workbuddy-reference/capability-implementation-notes.md`      |
| 场景选择与草稿预填                 | 办公/开发/设计、分类、四条建议、取消选择、分模式草稿等已有                                          | `.tools/workbuddy-reference/home-scenes-findings.md`                 |
| 本地助理工作台                     | 新建/编辑、职责、模型、资料、任务历史、状态、固定等已有                                             | `.tools/workbuddy-reference/assistants-implementation-notes.md`      |
| Windows 个人技能挂载与内置技能共存 | 真实 harness catalog 与个人技能、内置技能可共同展示；原有隔离边界保留                               | `.tools/workbuddy-reference/task-assistant-findings.md`              |
| WorkBuddy 公共资源导入             | 9 个技能 ZIP：新增 7、复用 2；42 个插件专家转为公共专家模板，保留提示词、头像、快捷提问与来源元数据 | `docs/testing/workbuddy-resource-import-2026-10-20.md:7`             |
| 公共专家展示和下架权限             | 分类、搜索、详情、召唤与创建；下架不删除已安装私有副本                                              | 同上“展示与权限修复”                                                 |
| 团队成员可用性修复                 | 停止、失败、启停中、禁用等不可用专家不再作为可加入成员，后端也校验                                  | `docs/testing/workbuddy-experts-and-team-availability-2026-10-20.md` |

导入的 42 个专家和 9 个技能属于当前 `C:\Users\Administrator\.octop` 实例数据，**不会仅靠部署 Git 源码自动出现在其他实例**。导入不包含 WorkBuddy 云执行服务、连接器授权、模型额度或编辑器服务；原 maxTurns=50 仅保留为来源元数据。因此“导入了专家/技能”与“具备全部执行能力”必须分开验收。

## 6. Octop 应继续保留和利用的现有能力

这些能力已有代码，应优先复用；未对 WorkBuddy 作完整反向缺失证明，故不宣称它们都为 Octop 独有。

| 能力                       | 当前证据                                                                            | 对借鉴方案的意义                                                     |
| -------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 自托管、多用户、权限与 SSO | `src/octop/api/routers/users.py:246`、`auth_oidc.py:81`、`auth_ldap.py:150`         | 不应为了还原单人桌面体验破坏用户隔离                                 |
| 多种 workspace backend     | `src/octop/infra/backend/resolver.py`；workspace API                                | 编辑、diff、版本恢复应走 BackendWorkspace，避免只能操作本机路径      |
| 真实长期记忆与迁移/诊断    | `src/octop/api/routers/memory.py:637`、`memory_portable.py:198`、`:253`             | 不需要另造一个仅存 MEMORY.md 的弱化记忆层                            |
| 专家团与协作               | `src/octop/infra/agents/teams/service.py:26`                                        | 轻量专家配置不应取代已有多 Agent 协作                                |
| 浏览器录制、生成技能和回放 | `src/octop/api/routers/browser/record_replay.py:154`、`:202`、`:312`                | 可把媒体后台发布流程沉淀为可复用能力                                 |
| 远程桌面与 Android 控制    | `src/octop/api/routers/desktop/stream.py:235`；`src/octop/infra/mobile/tools.py:23` | 不要把它们错误列成“WorkBuddy 有、Octop 没有”；设备与部署前提仍需满足 |
| ACP 双向集成               | `docs/acp.md`；`src/octop/infra/agents/settings/acp.py`                             | 文件 diff/回退可先与真实编码任务结合验证                             |
| 自托管实例桥接             | `src/octop/api/routers/bridge.py:276`、`:393`                                       | 是云端协作的现有基础，应与托管服务明确区分                           |
| 用量与导出、升级、备份     | `src/octop/api/routers/usage.py:215`、`:238`；`update.py:324`                       | 新的文档/媒体能力可以复用成本展示、升级与恢复机制                    |

## 7. 适合当前媒体业务的落地顺序

### 第一批：完成现有任务的交付闭环

1. **Office 技术验证 + DOCX 格式损失说明。** 选真实的稿件、采访表、汇报 PPT 做验证，先确定编辑引擎与部署方式。
2. **任务文件差异与恢复。** 让用户确认 AI 修改范围，减少文稿误改风险。
3. **导入/发布扫描报告。** 在现有公共专家和技能规模上补内容信任链。
4. **场景配置后台。** 将已落地的场景前端改为可管理内容，绑定当前真实可用的技能/连接器。

### 第二批：把结果变为可持续资产

5. **“保存到资料空间”。** 先保存稿件、会议纪要、选题参考与来源。
6. **结构化选题/采访/审稿表。** 先服务三个明确流程，避免直接建设通用低代码平台。
7. **创意项目板和 HTML 编辑。** 适用于媒体设计资产与汇报材料。

### 第三批：确有需求再建设的平台能力

8. **同会话专家配置**：先验证用户是否需要频繁切换专业能力，而非每个专家独立长期身份。
9. **云端托管、组织策略和批量版本治理**：在多部门、跨实例运营需求明确后推进。
10. **原生热键**：可独立做小迭代，不与核心 Agent 数据模型改造捆绑。

建议的未来代码落点：文档服务置于 `infra/`，HTTP 路由保持薄；文件内容全部通过 `HarnessAgent.workspace`；前端通过 `dashboard/src/api/`；用户可见文本使用中英文 i18n；时间显示使用服务器时区。若增加资料节点/版本表，遵循现有迁移和公共字符串 ID 规则。本轮仅给出适配方向，没有修改这些模块。

## 8. 未证实内容与有界负面检索

### 8.1 不应作为确定结论的内容

- WorkBuddy 的每个专家是否独立进程、助理是否始终常驻、云调度/数据库内部结构：未证实。
- enforceMode 是否在所有入口强制、助理是否不可删除：只见字段和部分 UI 策略，未证实完整强制语义。
- 系统级划词、屏幕理解、跨应用听写、导入 Chrome 登录态：未证实；热键、语音识别、浏览器持久分区不能替代这些证据。
- 所有 Office/WPS 文件的保真程度、公式/图表覆盖、宏兼容：仅有契约与静态路径，本轮未实测。
- 云图像/视频服务、资料库分享和企业连接器对当前账号是否已开通：未测试授权与额度。
- 文件夹持续监听触发任务、实时多人协同编辑等：没有充分证据把它们列为 WorkBuddy 已有而 Octop 没有的功能。
- WorkBuddy 的普通用户场景编辑器、商业定价、市场资源总量及更新频率：本轮未核实，也未使用宣传页替代安装证据。

### 8.2 Octop 的“未见实现”具体是什么意思

本轮按功能检索 `dashboard/src`、`src/octop/api`、`src/octop/infra` 与 `desktop/src`，结合对应路由/组件阅读；负面检索排除了内置角色文案和构建产物，避免把提示词描述误当已实现功能。

| 搜索问题                 | 主要检索词/阅读位置                                                                                         | 能支持的结论                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Office 结构编辑          | docKind、DocumentPreviewCore、Workspace/DocumentPreview、doc_edit；sheet/cell edit、revision、track changes | 仅 DOCX Markdown 回存已确认；未见同等表格/PPT/保真 Office 编辑链路 |
| 产物版本与恢复           | artifact/version、worktree、git diff/status、rollbackFiles，以及 thread_artifacts/fork                      | 有聊天快照与产物索引；未见同等文件级变更与恢复产品机制             |
| 原生资料空间/结构表/画布 | Library 类型节点、乐享、Miora、editor_sdk 相关实现；路由与前端页面核对                                      | 有知识库、外部连接器和媒体预览；未见同等统一资料/创意画布产品      |
| 技能扫描与组织更新       | infra/skills、skills/experts API 中 scan/risk/security_check_blocked、local/remote version、userModified    | 存在安全校验和版本信息，未见同等扫描结果/分发更新流程              |
| 原生快捷入口             | desktop/src 中 global shortcut/hotkey/selected text/clipboard/quick panel                                   | 有托盘/窗口/拖放；未见全局热键与划词入口                           |
| 托管助理                 | assistants API、Agent CRUD、bridge routes 与远端 agent 数据流                                               | 有本地助理与自托管远端桥接；未见 WorkBuddy 对应的托管资源模型      |

这些结论针对当前工作区，不覆盖尚未安装的任意第三方插件、未来提交或私有部署扩展；外部 MCP 可能提供部分执行能力，但不能自动视为原生 UI 和完整工作流已经具备。

## 9. 本轮验证与交付边界

- **已执行**：本机 ASAR SHA-256 核验；包身份读取；7 份既有完整 Evidence 的 REA CLI summary 复核；9 个指定源的补充 REA 分析；指定资源读取/哈希/纯文本格式化；Octop 源码对照。
- 补充 REA 首次选入非支持源类型的 Markdown/Python 被参数校验拒绝，随后改为 9 个 JSON/JS 源；这些技能说明改以 R1 普通静态资源留证，没有将它们冒充成功的 JavaScript 解析。
- 补充分析曾因默认临时目录短路径权限失败；将本次子进程的临时目录指向工作区后成功，未修改 MCP 注册、全局配置或安装分析引擎。
- **未执行**：WorkBuddy 真实任务、云端调用、Office 编辑器功能验收、第三方授权、浏览器登录跨重启实测。这些项目在相应建议的验收标准中列出。
- 研究交付为分析文档和本地证据，没有修改 WorkBuddy、迁移数据库、提交或推送；同一聊天后续的 Octop 媒体首页改动独立验证，没有把它当作上述结构性缺口已经实现。
- 文档交付检查包括 52 处源码路径/行号、17 项条目、7 份原 Evidence 视图及 15 份资源哈希核对，均通过；Markdown 格式与 `git diff --check` 通过。后续媒体首页的检查日志保存在 `.tools/media-home-checks/`，不会将历史验收文档中的测试成绩冒充本轮结果。
- 同一聊天后续首页媒体化验证：前端 24 项交互测试、TypeScript 与生产构建通过；全量 ESLint 为 0 错误、70 条既有警告。首次完整测试受 Windows 默认 GBK 读取 UTF-8 SQL 文件影响而有 19 项失败；UTF-8 模式针对性复测 164 passed、1 skipped，再次完整 `make all` 通过：4922 passed、233 skipped。未修改数据库迁移源码来绕过测试；实际媒体首页截图为 `.tools/media-home-checks/home.png`。

主交付文件：`docs/workbuddy-rea-feature-comparison-2026-10-20.md`。`.tools/` 下的完整 Evidence/摘要/资源台账是本机复核材料，通常不进入 Git；若迁移本次研究环境，需要另行携带这些证据文件。
