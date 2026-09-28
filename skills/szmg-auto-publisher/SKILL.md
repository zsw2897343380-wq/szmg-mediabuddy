---
name: szmg-auto-publisher
description: 本 Skill 专为 SZMG 项目设计，对接私有化 GitLab（https://git.sztv.com.cn）CI/CD 流水线，提供从项目创建到上线发布的完整能力，支持三种发布模式：① 模式一（Type=manual）容器内构建，智能生成 Dockerfile/ReadMe；② 模式二（Type=html）本地先构建，产物放 build/ 目录，不生成 Dockerfile；③ 模式三（Java 项目）自动检测 Java 项目，仅复制 .gitlab-ci.yml，校验 Gradle/Maven 配置，提示设置 Java_version。另支持：1. 在 GitLab 新建项目 / 查询项目组与项目列表；2. 推送代码到 GitLab；3. 打 Tag 发布（支持测试/正式环境、单/多服务）；4. 轮询检查 Pipeline 状态；5. 内置 Skill 自动更新检查（check_update.py）。内置 git 安装检测、.gitlab-ci.yml 存在性校验（固定文件，不可变更）与 Runner 自动分配/启用检查（testing-runner/prod-runner 未分配到项目时自动搜索并分配，已分配但未启用时自动启用），确保发布流程可靠、可审计、可回滚。
---

# SZMG 项目自动化发布上线skill

## 概述

本 Skill 对接私有化 GitLab（https://git.sztv.com.cn），提供完整的项目发布流水线，涵盖五项核心能力：

1. **在 GitLab 上新建项目 / 查询项目组与项目列表** — 用 API 在 GitLab 上创建新仓库（项目名仅支持英文）；列出用户有权限的项目组或指定项目组下的所有项目，便于确认 GitLab 项目路径
2. **生成配置文件（按项目类型自动判断）** — 自动检测项目类型，三模式分别处理：① `Type=manual`（模式一）生成 Dockerfile + ReadMe + `.gitlab-ci.yml`；② `Type=html`（模式二）仅生成 ReadMe + `.gitlab-ci.yml`，不生成 Dockerfile；③ Java 项目（模式三）仅复制 `.gitlab-ci.yml`，不生成 ReadMe 和 Dockerfile（详见「三种发布模式」章节）
3. **上传代码到 GitLab** — 初始化仓库并推送代码到私有 GitLab
4. **打 Tag 发布** — 按规范打测试/正式环境 Tag 并推送
5. **检查 Pipeline 状态** — 轮询检查 CI/CD 流水线，直到成功或失败
6. **自动检查 Skill 更新** — 每次使用时通过 HTTP HEAD 检测 SkillHub 远端版本变化，有新版本时主动提醒

## 🔄 自动更新检查

本 Skill 内置版本更新检测，**仅在 Skill 被调用时触发**，不会在后台自动运行。脚本位于 `scripts/check_update.py`。

### 工作原理

```
用户调用 Skill（如新建项目/发布等）
  └─ 自动运行 check_update.py（24h 内最多执行一次）
       ├─ HEAD 请求 SkillHub 页面
       ├─ 提取 ETag / Last-Modified / Content-Length 作为远端指纹
       ├─ 与本地 .clawhub/.version-cache 对比
       ├─ 指纹一致 → [OK] 已是最新版本，静默通过
       ├─ 指纹变化 → ⚠️ 打印更新提醒 + 下载地址，不阻塞后续流程
       └─ 网络不通 → 24h 内查过则跳过，否则提示手动检查
```

### 手动检查

```bash
python scripts/check_update.py
```

### 退出码

| 退出码 | 含义 |
|--------|------|
| 0 | 已是最新版本 |
| 1 | 有新版本可用（指纹变化或无法判断） |
| 2 | 网络错误，无法连接 SkillHub |

### 更新方式

SkillHub 有新版本时，访问以下地址下载最新 zip 包并重新安装：

```
https://skillhub.scms.sztv.com.cn/space/global/szmg-auto-publisher
```

安装命令（在 WorkBuddy 中直接请求即可）：
> "安装 https://skillhub.scms.sztv.com.cn/space/global/szmg-auto-publisher 到 skills 中"

### 版本缓存

- 缓存文件: `.clawhub/.version-cache`
- 记录: 最后检查时间、远端指纹、HTTP 响应头摘要
- **频率控制**: 24 小时内最多执行一次检查，避免每次调用都发起网络请求
- 有新版本时仅提醒、不阻塞主流程的操作

## 三种发布模式

本 Skill 支持三种发布模式，自动检测或通过 ReadMe 中的 `Type` 字段区分：

### 模式一：容器内构建（Type = manual）

适用于 nodejs/nextjs/react/vue 等需要容器内构建的项目。

**流程：**
1. 运行 `generate_dockerfile.py` 生成 Dockerfile + ReadMe + `.gitlab-ci.yml`
2. Dockerfile 内包含完整构建步骤（如 `npm ci && npm run build`）
3. 运行 `gitlab_push.py` 推送代码到 GitLab
4. 运行 `tag_release.py` 打 Tag 发布

**ReadMe 配置（单服务）：**
```
Project = myservice
Type = manual
```

### 模式二：本地先构建（Type = html）⭐

适用于本地已构建好、只需静态文件托管的场景。构建产物需放在项目根目录的 `build/` 文件夹中。

**流程：**
1. **本地先构建**：在项目目录执行构建命令（如 `npm run build`），确保构建产物在 `build/` 目录
2. 运行 `generate_dockerfile.py` 生成 ReadMe + `.gitlab-ci.yml`（**不会生成 Dockerfile**）
3. 运行 `gitlab_push.py` 推送代码（含 `build/` 目录）到 GitLab
4. 运行 `tag_release.py` 打 Tag 发布

**ReadMe 配置（单服务）：**
```
Project = myservice
Type = html
```

**多服务（混合模式）：**
```
Project = frontend|backend
Type = html|manual
```
- `html` 的服务：不生成 Dockerfile，本地构建产物在 `build/` 目录
- `manual` 的服务：正常生成 Dockerfile，容器内完成构建

**要点：**
- `Type = html` 时，`generate_dockerfile.py` **不会生成 Dockerfile**
- 构建产物必须位于项目根目录的 `build/` 文件夹
- `.gitlab-ci.yml` 仍会正常生成（固定文件）
- ReadMe 配置好后即可直接打 Tag 发布，无需 Dockerfile

### 模式三：Java 项目（自动检测）☕

脚本自动检测 Java 项目（存在 `pom.xml` 判定为 Maven；存在 `build.gradle`/`build.gradle.kts`/`gradlew` 判定为 Gradle），**无需指定 `--services` 参数**。

**流程：**
1. 自动检测项目类型（Maven / Gradle）
2. 仅复制 `.gitlab-ci.yml` 到项目根目录（不生成 ReadMe 和 Dockerfile）
3. 校验编译包名配置（未配置则报错并提示）
4. 提示用户在 GitLab 项目设置 `Java_version` 环境变量
5. 配置完整后即可打 Tag 发布

**Gradle 项目配置要求：**

在 `gradle.properties` 中定义（未定义则报错）：
```
mainModule=编译包名（不含 .jar，一般与 GitLab 项目名一致）
```

**Maven 项目配置要求：**

在 `pom.xml` 中定义（未定义则报错）：
```xml
<artifactId>编译包名（不含 .jar，一般与 GitLab 项目名一致）</artifactId>
```

**JDK 版本控制：**

在 GitLab 项目 → **Settings → CI/CD → Variables** 中设置：
| 变量名 | 可选值 | 说明 |
|--------|--------|------|
| `Java_version` | `1.8` / `11`（默认） / `17` / `21` | 控制 Pipeline 使用的 JDK 版本；未设置时默认使用 Java 11 |

**详细 Java 开发规范** 参考：https://git.sztv.com.cn/misc/Guideline.git

**要点：**
- Java 项目**不需要** ReadMe 文件
- Java 项目**不需要** Dockerfile（由 CI/CD Pipeline 内完成构建和打包）
- `generate_dockerfile.py` 自动检测 Java 项目，无需手动指定模式
- 配置不完整时脚本会**报错退出**并给出修改提示，不会生成不完整配置

## GitLab 配置

- **GitLab 地址**：https://git.sztv.com.cn
- **用户名/Token**：每次操作时由用户提供，或从环境变量 `GITLAB_USER` / `GITLAB_TOKEN` 读取

## 脚本位置

所有可执行脚本位于 `scripts/` 目录下，使用 Python 运行：

| 脚本 | 功能 |
|------|------|
| `scripts/create_project.py` | 在 GitLab 上新建项目（项目名仅支持英文） |
| `scripts/generate_dockerfile.py` | 自动检测项目类型；Java 项目自动进入模式三（仅复制 .gitlab-ci.yml，校验配置）；非 Java 项目根据 Type 生成对应文件（详见「三种发布模式」章节） |
| `scripts/gitlab_push.py` | 初始化 git 仓库并推送到 GitLab |
| `scripts/set_custom_tag.py` | 独立设置 CUSTOM_TAG 变量（通过 GitLab API） |
| `scripts/tag_release.py` | 打 Tag 并推送到 GitLab（含 .gitlab-ci.yml 存在性检查和 Runner 检查） |
| `scripts/check_pipeline.py` | 轮询检查 Pipeline 状态 |
| `scripts/list_projects.py` | 获取 GitLab 项目组列表或项目组下的项目列表 |
| `scripts/check_update.py` | 检查 Skill 更新：HEAD 请求 SkillHub 对比远端指纹，有新版本时提醒 |

详细参数说明参见 `references/workflow.md`。

## 工作流程

### 识别用户意图

根据用户请求，判断需要执行哪些步骤：

- **"在 GitLab 上新建项目 / 创建仓库"** → 运行 `create_project.py`
- **"帮我生成 Dockerfile / ReadMe / CI 配置"** → 运行 `generate_dockerfile.py`（会同时生成 Dockerfile + ReadMe + `.gitlab-ci.yml`，均放在项目根目录）
- **"上传代码到 GitLab / 推送代码"** → 运行 `gitlab_push.py`
- **"设置 CUSTOM_TAG / 设置自定义变量"** → 运行 `set_custom_tag.py`（独立设置 CUSTOM_TAG 变量值）
- **"打 tag / 发布版本 / 发布测试 / 发布正式"** → 运行 `tag_release.py`
  - 打 Tag 前会自动检查 `.gitlab-ci.yml` 是否存在、指定 Runner 是否在线
  - 正式环境（prod）发布时，脚本会自动通过 GitLab API 设置 `CUSTOM_TAG` 变量（不存在则创建，已存在则更新值），值为完整 tag 名称（如 `prod-1.0.0`），无需手动操作
  - 测试环境或正式环境初次发布完成后，会自动提示联系云网安全系统工程师（配置域名、域名解析、代码安全审计）
- **"检查 pipeline / 检查发布状态"** → 运行 `check_pipeline.py`
- **"获取项目组 / 列出项目 / 查看项目列表 / 有哪些项目 / 项目路径是什么"** → 运行 `list_projects.py`
  - 不指定 `--group` 时列出所有项目组
  - 指定 `--group 组路径` 时列出该组下的所有项目
  - 输出表格包含项目路径（`path_with_namespace`），可直接用于 `--gitlab-project` 参数
- **全流程请求** → 按顺序依次执行以上步骤

### 执行前必须确认的信息

| 信息 | 何时需要 | 默认值 |
|------|----------|--------|
| **项目本地路径** | 所有步骤 | 当前工作目录 |
| **GitLab 用户名** | 推送/Tag/Pipeline | 必须提供 |
| **GitLab Token** | 推送/Tag/Pipeline | 必须提供 |
| **GitLab 项目路径** | 推送/Tag/Pipeline | 询问用户（如 group（项目组）/repo-name(项目名)） |
| **服务名列表** | 生成 Dockerfile/ReadMe | 询问用户，多服务用 \| 分隔 |
| **发布环境** | 打 Tag | testing（默认）或 prod |
| **版本号** | 打 Tag | 询问用户，如 0.0.0.0.1 |

### 执行步骤

**Step 1 — 检查 git 是否已安装**

在执行任何涉及代码推送、打 Tag 的操作前，确认 git 可用：
```
git --version
```
- ✅ 有输出（如 `git version 2.x.x`）→ 继续
- ❌ 提示"找不到命令"或报错 → **引导用户安装 git**：

  | 系统 | 安装方式 |
  |------|---------|
  | Windows | https://git-scm.com/download/win 下载安装，安装后重启终端 |
  | macOS | `brew install git` 或 `xcode-select --install` |
  | Ubuntu/Debian | `sudo apt-get install -y git` |
  | CentOS/RHEL | `sudo yum install -y git` |

  **脚本会自动检测**：运行 `gitlab_push.py` 或 `tag_release.py` 时，若 git 未安装，脚本会打印错误提示和安装指引，并自动退出（exit code 1）。

**Step 2 — 检查 .gitlab-ci.yml 是否存在**

打 Tag 前必须确认项目根目录下存在 `.gitlab-ci.yml` 文件，否则 Tag 推送后无法触发 CI/CD 流水线：
```
检查项目根目录/.gitlab-ci.yml 是否存在
```
- ✅ 文件存在 → 继续
- ⚠️ 文件不存在 → **自动从 skill 目录复制固定文件**
  - 复制成功 → 继续
  - 复制失败 → **报错退出**，提示用户手动确认

  **重要说明**：`.gitlab-ci.yml` 为固定文件，内容不可变更。该文件由项目规范统一制定，包含预定义的 stages 和 runner 配置。

  **脚本会自动处理**：运行 `tag_release.py` 时，若 `.gitlab-ci.yml` 不存在，脚本会自动从 skill 目录（`references/gitlab-ci.yml`）复制固定文件到项目根目录。仅当复制失败时，才会报错退出并提示用户手动处理。

**Step 3 — 检查 Runner 是否分配**

打 Tag 前**强制**通过 GitLab API 检查项目是否已分配 Runner，未分配则禁止推送 Tag：
```
python tag_release.py ... --runner-names testing-runner prod-runner
```

**指定 `--runner-names` 时的检查逻辑：**
- ✅ Runner 已分配到项目且在线 → 继续
- ⚙️ Runner 已分配到项目但未启用（名前缀匹配 `testing-runner` 或 `prod-runner`）→ **自动通过 API 启用**，启用成功后继续
- 🔄 Runner 未分配到项目（但系统中存在该 tag 的 Runner）→ **自动搜索并分配**，分配成功后继续
- ❌ Runner 未找到（系统中不存在该 tag 的 Runner）、自动分配失败或无有效 ID → **报错退出**，提示用户联系 GitLab 管理人员处理
- ❌ 获取 Runner 列表失败（HTTP 错误/网络异常）→ **报错退出**（不再静默跳过）

**未指定 `--runner-names` 时的检查逻辑：**
- ✅ 项目已分配至少一个 Runner → 继续
- ❌ 项目未分配任何 Runner → **报错退出**，提示使用 `--runner-names` 指定名称以自动搜索分配，或联系云网安全系统工程师

**脚本会自动检测**：运行 `tag_release.py` 时，始终通过 GitLab API 查询项目 Runner 列表：
1. 若指定了 `--runner-names`，对每个 Runner 名称做模糊匹配（精确 → 前缀 → 包含 → 标签）
   - 未分配到项目 → 自动通过 `GET /runners?tag_list=xxx` 搜索，找到后通过 `POST /projects/:id/runners` 分配
   - 已分配但未启用 → 自动调用 `PUT /projects/:id/runners/:runner_id` 启用
2. 若未指定 `--runner-names`，仅检查项目是否至少分配了一个 Runner；未分配则报错退出
3. 自动分配/启用失败、或项目无 Runner 时，停止发布并提示处理方式

**Step 4 — 确认 Python 运行环境**

优先使用托管 Python：
```
C:\Users\liangcf\.workbuddy\binaries\python\versions\3.13.12\python.exe
```

**Step 5 — 收集必要参数**

读取 `references/workflow.md` 了解各脚本参数，构造完整命令行。

**Step 6 — 运行脚本**

依次执行所需步骤的脚本，检查输出。成功标志：输出包含 `[OK]` 或 `[SUCCESS]`。

**Step 7 — 处理错误**

常见错误处理：
- **认证失败** → 提示用户检查用户名/Token
- **仓库不存在** → 提示用户先在 GitLab 创建项目仓库
- **Tag 已存在** → 询问用户是否使用新版本号
- **Pipeline 超时** → 告知用户当前状态，建议手动检查

## Tag 命名规范

| 场景 | 格式 | 示例 |
|------|------|------|
| 单服务 - 测试环境 | `testing-{版本号}` | `testing-0.0.0.0.1` |
| 单服务 - 正式环境 | `prod-{版本号}` | `prod-1.0.0` |
| 多服务 - 测试环境 | `testing-{服务名}-{版本号}` | `testing-myservice-0.0.0.1` |
| 多服务 - 正式环境 | `prod-{服务名}-{版本号}` | `prod-myservice-1.0.0` |

## ReadMe 配置格式

通过 ReadMe 中的 `Type` 字段选择发布模式（详见「三种发布模式」章节）：

- `manual`（模式一）：Dockerfile 内完成构建，适用于 nodejs/nextjs/react/vue 等需要容器内构建的项目
- `html`（模式二）：本地先构建，构建产物放项目根目录 `build/` 文件夹，**不生成 Dockerfile**，适用于纯静态文件托管场景
- **Java 项目（模式三）**：无需 ReadMe 文件，脚本自动检测，详见「三种发布模式 → 模式三」

单服务（模式一）：
```
Project = myservice
Type = manual
```
单服务（模式二）：
```
Project = myservice
Type = html
```

多服务（混合模式）：
```
Project = frontend|backend
Type = html|manual
```

- 模式一（manual）：项目根目录 `Dockerfile`（单服务）或 `Dockerfile-{服务名}`（多服务）
- 模式二（html）：不生成 Dockerfile，构建产物直接在 `build/` 目录
- 多服务子文件夹场景：`Dockerfile-{服务名}` 内容为 `dockerfilepath={子文件夹名}`，实际 Dockerfile 在子文件夹中（仅模式一）
- `.gitlab-ci.yml` 三种模式都会生成（固定文件）

## 私有镜像配置（腾讯云 TCR）

脚本生成 Dockerfile 时优先使用以下私有镜像（无需手动指定，已内置）：

| 用途 | 私有镜像 |
|------|----------|
| Nginx（`react`/`vue` 运行阶段）| `szgbdst.tencentcloudcr.com/idc/nginx:1.31.1.1` |
| Java 运行（`java-maven`/`java-gradle` 运行阶段）| `szgbdst.tencentcloudcr.com/idc/jdk-jar:v3.0.0.0.2` |
| Golang 构建阶段 | `szgbdst.tencentcloudcr.com/idc/golang:1.25.3-alpine3.22` |
| Node.js（默认）| `szgbdst.tencentcloudcr.com/idc/node:18.20.8-slim` |

**Node.js 可选版本**（生成后手动替换）：
- `szgbdst.tencentcloudcr.com/idc/node:20.20.2-slim`
- `szgbdst.tencentcloudcr.com/idc/node:22.22.2-slim`
- `szgbdst.tencentcloudcr.com/idc/node:24.15.0-slim`

⚠️ Java 构建阶段、Golang 运行阶段、以及其他语言（Python/DotNet/Rust/PHP/Ruby）仍使用公网默认镜像。

## ⚠️ 重要：脚本执行规范

**所有 Python 脚本必须从 skill 目录直接运行，禁止复制到项目目录！**

- ✅ 正确：`python C:\Users\liangcf\.workbuddy\skills\szmg-auto-publisher\scripts\tag_release.py --project-path /path/to/project ...`
- ❌ 错误：将脚本复制到项目目录后再运行
- ❌ 错误：在项目目录下生成临时 Python 脚本

**脚本统一路径前缀：**
```
SKILL_DIR=C:\Users\liangcf\.workbuddy\skills\szmg-auto-publisher\scripts
PYTHON=C:\Users\liangcf\.workbuddy\binaries\python\versions\3.13.12\python.exe
```

**执行示例：**
```
$PYTHON $SKILL_DIR/tag_release.py --project-path <项目路径> ...
```

**如果需要临时文件**（如中间结果、日志等），放到系统临时目录（`%TEMP%` 或 `tmpfile.mkdtemp()`），绝不可放入项目目录。

## 交互原则

- **若项目路径不明确**，询问用户
- **若 GitLab 凭据未提供**，询问用户（Token 不存储）
- **Pipeline 检查**：每 30 秒轮询一次，最长等待 30 分钟，超时则提示用户手动查看
- **模式一（Type=manual）**：生成的 Dockerfile 要展示关键内容，方便用户确认后再推送
- **模式二（Type=html）**：无需生成/展示 Dockerfile，确认 ReadMe 中 `Type = html` 且 `build/` 目录存在即可
- **模式三（Java 项目）**：无需 ReadMe/Dockerfile；检测到 Java 项目时，校验 `gradle.properties` 或 `pom.xml` 配置是否完整，并提示用户设置 `Java_version` 环境变量
- **打 Tag 前确认**服务名（非 Java 项目）和版本号
- **脚本不要复制到项目目录**，始终从 skill 目录运行，避免污染项目
