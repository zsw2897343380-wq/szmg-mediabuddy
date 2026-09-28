# GitLab Deployer — Workflow & 参数手册

## 概述

本文档说明 `szmg-auto-publisher` Skill 的七个脚本的详细参数和使用场景。

GitLab 服务地址：`https://git.sztv.com.cn`

---

## 脚本一：create_project.py — 在 GitLab 上新建项目

### 功能

通过 GitLab API 在远程新建仓库，支持指定英文项目名、命名空间（Group）、可见性。

**项目名限制：** 仅支持英文字母、数字、`-`、`_`，且必须以字母或数字开头。

### 参数

| 参数 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `--gitlab-url` | 否 | https://git.sztv.com.cn | GitLab 服务地址 |
| `--username` | 是 | — | GitLab 用户名 |
| `--token` | 是 | — | GitLab Token（Personal Access Token） |
| `--gitlab-project` | 是 | — | 项目名称（英文，见上方限制） |
| `--namespace` | 否 | 空（个人空间） | 命名空间/组名，如 `mygroup` |
| `--visibility` | 否 | `private` | 可见性：`private` / `internal` / `public` |
| `--description` | 否 | 空 | 项目描述 |
| `--initialize-with-readme` | 否 | — | 初始化时生成 README.md |

### 示例

**在个人空间下新建私有项目：**
```bash
python create_project.py \
  --username john \
  --token "glpat-xxxxxxxxxxxx" \
  --gitlab-project my-app
```

**在指定 Group 下新建内部可见项目：**
```bash
python create_project.py \
  --username john \
  --token "glpat-xxxxxxxxxxxx" \
  --gitlab-project backend-api \
  --namespace mygroup \
  --visibility internal \
  --description "后端 API 服务" \
  --initialize-with-readme
```

### 注意事项

- 创建成功后，输出中会显示 `gitlab-project` 路径（如 `mygroup/backend-api`），供后续 `gitlab_push.py` 使用
- 推荐使用 **Personal Access Token**（权限需含 `api`），比密码更稳定
- 若项目名已存在，会报错并提示换名

---

## 脚本二：generate_dockerfile.py — 生成 Dockerfile + ReadMe

### 功能

根据项目代码智能检测类型（Node.js/Java/Python/Go 等），生成标准化 Dockerfile 和服务配置 ReadMe。

**重要说明**：`.gitlab-ci.yml` 为固定文件，内容不可变更。该文件由项目规范统一制定，包含预定义的 stages 和 runner 配置。请确保项目根目录下存在正确的 `.gitlab-ci.yml` 文件（可参考 skill 目录下的 `references/gitlab-ci.yml`）。

### 参数

| 参数 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `--project-path` | 否 | 当前目录 | 本地项目根目录 |
| `--services` | 是 | — | 服务名，多服务用 `\|` 分隔，如 `api\|worker` |
| `--sub-dirs` | 否 | 空 | 各服务对应子目录，多服务用 `\|` 分隔；无子目录则对应位置留空，如 `\|worker` |
| `--ports` | 否 | 自动 | 各服务端口，多服务用 `\|` 分隔；默认：前端（nextjs/react/vue）= `80`，后端 = `8080` |
| `--types` | 否 | `manual` | 发布类型，多服务用 `\|` 分隔 |
| `--project-types` | 否 | 自动检测 | 强制指定项目类型，如 `nodejs\|java-maven` |
| `--dry-run` | 否 | — | 仅打印内容，不写入文件 |

### 默认端口规则

`--ports` 未指定时，脚本按服务类型自动选择默认端口：

| 项目类型 | 分类 | 默认端口 |
|----------|------|----------|
| `nextjs`、`react`、`vue`、`nodejs` | 前端（nginx 静态托管）| `80` |
| 其他类型 | 后端 | `8080` |

- 用户显式指定 `--ports` 时，按指定值使用，不受类型影响
- 多服务时，`--ports 80|9090` 分别为两个服务指定端口，未指定的服务按类型取默认值

### 支持的项目类型

| 类型标识 | 触发条件 |
|----------|----------|
| `nodejs` | package.json（无框架特征） |
| `nextjs` | package.json 含 next 依赖 |
| `react` | package.json 含 react-dom |
| `vue` | package.json 含 vue |
| `html` | 手动指定 `--project-types html`，项目根目录已有 `build/` 文件夹（本地已构建好） |
| `java-maven` | pom.xml 存在 |
| `java-gradle` | build.gradle 存在 |
| `python` | requirements.txt / pyproject.toml / setup.py |
| `golang` | go.mod 存在 |
| `dotnet` | .csproj / .sln 文件 |
| `rust` | Cargo.toml 存在 |
| `php` | composer.json 存在 |
| `ruby` | Gemfile 存在 |
| `generic` | 无法识别时的通用模板 |

### 前端项目两种部署模式

对于 `nodejs`、`nextjs`、`react`、`vue` 等前端项目，支持两种部署模式，通过 `--project-types` 和 ReadMe 中的 `Type` 区分：

**模式一：Dockerfile 内构建（Type = manual）**
- 指定 `--project-types nodejs|react|vue|nextjs`（或自动检测）
- Dockerfile 内含 `npm ci && npm run build`，构建产物输出到容器内 `build/` 目录
- ReadMe 中 Type = manual
- 适用于：构建环境一致性强、不依赖本地环境的场景

**模式二：本地构建后部署（Type = html）**
- 指定 `--project-types html`
- 需先在本地执行 `npm run build`，确保项目根目录存在 `build/` 文件夹
- Dockerfile 直接使用 `nginx` 镜像，将 `build/` 复制到 `/usr/share/nginx/html`
- ReadMe 中 Type = html
- 适用于：构建速度快、希望 Dockerfile 尽可能简单的场景

| 模式 | `--project-types` | ReadMe Type | Dockerfile 特点 |
|------|-------------------|-------------|-----------------|
| Dockerfile 内构建 | `nodejs`/`react`/`vue`/`nextjs` | `manual` | 多阶段构建，含 npm ci && npm run build |
| 本地构建后部署 | `html` | `html` | 单阶段，仅 COPY build/ /usr/share/nginx/html/ |

### 私有镜像配置（腾讯云 TCR）

脚本生成 Dockerfile 时，以下类型优先使用内置的腾讯云 TCR 私有镜像，无需手动指定：

| 类型 | 构建阶段 | 运行阶段 | 使用的私有镜像 |
|------|----------|----------|---------------|
| `nodejs`、`nextjs`、`react`、`vue` | Node.js 构建 | nginx 静态托管 | 构建：`szgbdst.tencentcloudcr.com/idc/node:18.20.8-slim`（默认）<br>运行：`szgbdst.tencentcloudcr.com/idc/nginx:1.31.0.1` |
| `java-maven`、`java-gradle` |（公网镜像）| JRE 运行 | 运行：`szgbdst.tencentcloudcr.com/idc/jdk-jar:v3.0.0.0.2` |
| `golang` | Golang 构建 |（alpine 公网镜像）| 构建：`szgbdst.tencentcloudcr.com/idc/golang:1.25.3-alpine3.22` |

**Node.js 可选版本**（生成后手动替换）：
- `szgbdst.tencentcloudcr.com/idc/node:20.20.2-slim`
- `szgbdst.tencentcloudcr.com/idc/node:22.22.2-slim`
- `szgbdst.tencentcloudcr.com/idc/node:24.15.0-slim`

### 示例

**单服务，自动检测类型：**
```bash
python generate_dockerfile.py \
  --project-path /path/to/myapp \
  --services myservice \
  --ports 8080
```
生成：`Dockerfile`、`ReadMe`（均在项目根目录）

**注意**：`.gitlab-ci.yml` 为固定文件，不可变更，请确保项目根目录下已存在该文件。

**多服务，无子目录：**
```bash
python generate_dockerfile.py \
  --project-path /path/to/monorepo \
  --services api|worker \
  --ports 8080|9090
```
生成：`Dockerfile-api`、`Dockerfile-worker`、`ReadMe`

**注意**：`.gitlab-ci.yml` 为固定文件，不可变更，请确保项目根目录下已存在该文件。

**多服务，有子目录（子目录中有各自代码）：**
```bash
python generate_dockerfile.py \
  --project-path /path/to/monorepo \
  --services api|worker \
  --sub-dirs api|worker \
  --ports 8080|9090
```
生成：
- `Dockerfile-api`（内容：`dockerfilepath=api`）
- `api/Dockerfile`（实际构建文件）
- `Dockerfile-worker`（内容：`dockerfilepath=worker`）
- `worker/Dockerfile`（实际构建文件）
- `ReadMe`

**注意**：`.gitlab-ci.yml` 为固定文件，不可变更，请确保项目根目录下已存在该文件。

---

## 脚本三：gitlab_push.py — 推送代码到 GitLab

### 功能

初始化本地 Git 仓库（若未初始化），配置远程仓库，提交所有变更，推送到 GitLab。

### 参数

| 参数 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `--project-path` | 否 | 当前目录 | 本地项目根目录 |
| `--gitlab-url` | 否 | https://git.sztv.com.cn | GitLab 服务地址 |
| `--gitlab-project` | 是 | — | GitLab 项目路径，如 `mygroup/myrepo` |
| `--username` | 是 | — | GitLab 用户名 |
| `--token` | 是 | — | GitLab Token（Personal Access Token） |
| `--branch` | 否 | `main` | 推送目标分支 |
| `--commit-message` | 否 | `Update: <时间戳>` | Git 提交信息 |
| `--create-remote` | 否 | — | 若仓库不存在则自动通过 API 创建 |

### 示例

```bash
python gitlab_push.py \
  --project-path /path/to/myapp \
  --gitlab-project mygroup/myapp \
  --username john \
  --token "glpat-xxxxxxxxxxxx" \
  --branch main \
  --commit-message "feat: add Dockerfile and ReadMe" \
  --create-remote
```

### 注意事项

- 密码推荐使用 GitLab **Personal Access Token**（Settings → Access Tokens），权限需含 `api` + `write_repository`
- `--create-remote` 需要账号拥有在目标 Namespace 下创建项目的权限
- 若仓库已有远程 origin，会自动更新 URL

---

## 脚本三（新增）：set_custom_tag.py — 独立设置 CUSTOM_TAG

### 功能

通过 GitLab API 独立设置项目环境变量 `CUSTOM_TAG` 的值，不依赖打 Tag 操作。
适用于需要**提前设置**或**单独修改** `CUSTOM_TAG` 的场景。

### 用法

```bash
python set_custom_tag.py \
  --gitlab-url https://git.sztv.com.cn \
  --gitlab-project group/repo \
  --username your_username \
  --token your_token \
  --tag-value prod-1.0.0
```

### 参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| `--gitlab-url` | 否 | GitLab 地址，默认 `https://git.sztv.com.cn` |
| `--gitlab-project` | ✅ | 项目路径，如 `group/repo` |
| `--username` | ✅ | GitLab 用户名 |
| `--token` | ✅ | GitLab Token（Personal Access Token） |
| `--tag-value` | ✅ | CUSTOM_TAG 的值（完整 tag 名） |
| `--protected` | 否 | 设为 Protected 变量 |
| `--masked` | 否 | 设为 Masked 变量 |

### 执行逻辑

```
1. GET /variables/CUSTOM_TAG
   ├─ 200（已存在）
   │   ├─ 值相同 → 跳过，返回成功
   │   └─ 值不同 → PUT /variables/CUSTOM_TAG，更新值
   └─ 404（不存在）→ POST /variables，创建变量
```

---

## 脚本四：tag_release.py — 打 Tag 发布

### 功能

按命名规范创建 Git Tag 并推送到 GitLab，自动触发 CI/CD Pipeline。

### Runner 分配检查（强制）

打 Tag 前，`tag_release.py` 会**强制**通过 GitLab API 检查项目 Runner 分配状态，未分配则拒绝推送 Tag。

**指定 `--runner-names` 时：**
脚本检查 Runner 是否已分配且在线。对于名前缀匹配 `testing-runner` 的 Runner（如 `testing-runner(ip-10-85-25-7)`），若发现该 Runner 存在但未分配（`active: false`），脚本会自动调用 `PUT /projects/:id/runners/:runner_id`（`{"active": true}`）分配它，无需用户手动操作。

**Runner 名称支持模糊匹配**（精确 → 前缀 → 包含），用户传入短名 `--runner-names testing-runner` 即可匹配 API 返回的 `testing-runner(ip-10-85-25-7)`。

- **Runner 在线且已分配** → 检查通过，继续
- **Runner 未分配到项目（但系统中存在）** → 自动搜索并分配，成功后继续
- **Runner 已分配但未启用（名前缀匹配 testing-runner/prod-runner）** → 自动启用，成功后继续
- **Runner 自动分配失败** → **停止发布**，提示联系 GitLab 管理人员手动分配
- **Runner 无有效 ID** → **停止发布**，提示联系 GitLab 管理人员处理
- **Runner 未在系统中找到** → **停止发布**，提示联系 GitLab 管理人员确认

**未指定 `--runner-names` 时：**
仅检查项目是否至少分配了一个 Runner。

- **项目已分配至少一个 Runner** → 检查通过，继续
- **项目未分配任何 Runner** → **停止发布**，提示使用 `--runner-names` 或联系云网安全系统工程师

### .gitlab-ci.yml 自动修复

打 Tag 前，`tag_release.py` 会检查项目根目录下是否存在 `.gitlab-ci.yml` 文件：

- **文件存在** → 检查通过，继续
- **文件不存在** → 自动从 skill 目录（`references/gitlab-ci.yml`）复制固定文件到项目根目录
  - 复制成功 → 继续
  - 复制失败 → 报错退出，提示用户手动处理

**重要说明**：`.gitlab-ci.yml` 为固定文件，内容不可变更。该文件由项目规范统一制定，包含预定义的 stages 和 runner 配置。脚本会自动处理缺失情况，仅当复制失败时才会报错退出。

### 正式环境自动设置 CUSTOM_TAG

打 `prod` tag 时，`tag_release.py` 会自动通过 GitLab API 确保 `CUSTOM_TAG` 变量存在且值正确：

- **变量不存在**（HTTP 404）→ 自动创建，值设为**完整 tag 名称**（如 `prod-1.0.0`）
- **变量已存在** → 自动更新为当前完整 tag 名称
- **值已是最新** → 跳过，无需重复设置

无需用户手动在 GitLab Web 界面操作，脚本全自动完成。

### ⚠️ 初次发布温馨提示

测试环境或正式环境初次发布完成后，脚本会自动提示联系云网安全系统工程师完成以下工作：

1. **配置发布域名**
2. **进行域名解析操作**
3. **进行代码安全审计和漏洞扫描**

提示会在以下时机出现：
- `tag_release.py` 测试环境或正式环境发布成功后
- `check_pipeline.py` 检测到 Pipeline 成功后（tag 以 `testing-` 或 `prod-` 开头时）

### 参数

| 参数 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `--project-path` | 否 | 当前目录 | 本地项目根目录 |
| `--gitlab-url` | 否 | https://git.sztv.com.cn | GitLab 服务地址 |
| `--gitlab-project` | 是 | — | GitLab 项目路径 |
| `--username` | 是 | — | GitLab 用户名 |
| `--token` | 是 | — | GitLab Token（Personal Access Token） |
| `--env` | 是 | — | 发布环境：`testing` 或 `prod` |
| `--version` | 是 | — | 版本号，如 `0.0.0.0.1` 或 `1.0.0` |
| `--service` | 否 | 空 | 服务名（多服务项目必填） |
| `--message` | 否 | `Release <tag>` | Tag 注释信息 |
| `--branch` | 否 | `main` | 基于哪个分支打 Tag |
| `--use-api` | 否 | — | 使用 GitLab API 创建 Tag（无需本地仓库） |
| `--runner-names` | 否（建议指定） | 空 | Runner 名称列表，打 Tag 前检查项目是否分配了 Runner（如：`testing-runner prod-runner`）。未指定时仅检查项目是否至少分配了一个 Runner |

### Tag 命名规则

| 场景 | 格式 | 示例 |
|------|------|------|
| 单服务 - 测试环境 | `testing-{版本号}` | `testing-0.0.0.0.1` |
| 单服务 - 正式环境 | `prod-{版本号}` | `prod-1.0.0` |
| 多服务 - 测试环境 | `testing-{服务名}-{版本号}` | `testing-api-0.0.0.1` |
| 多服务 - 正式环境 | `prod-{服务名}-{版本号}` | `prod-api-1.0.0` |

### 示例

**单服务发布测试环境：**
```bash
python tag_release.py \
  --project-path /path/to/myapp \
  --gitlab-project mygroup/myapp \
  --username john \
  --token "glpat-xxxxxxxxxxxx" \
  --env testing \
  --version 0.0.0.0.1 \
  --runner-names testing-runner
```

**多服务，发布 api 服务到正式环境：**
```bash
python tag_release.py \
  --project-path /path/to/monorepo \
  --gitlab-project mygroup/monorepo \
  --username john \
  --token "glpat-xxxxxxxxxxxx" \
  --env prod \
  --version 1.2.0 \
  --service api \
  --runner-names prod-runner
```

**通过 API 打 Tag（无需本地 git 仓库）：**
```bash
python tag_release.py \
  --gitlab-project mygroup/myapp \
  --username john \
  --token "glpat-xxxxxxxxxxxx" \
  --env testing \
  --version 0.0.0.0.2 \
  --use-api
```

---

## 脚本五：check_pipeline.py — 检查 Pipeline 状态

### 功能

轮询查询 GitLab Pipeline 状态，持续等待直到成功、失败或超时。发布过程可能较长，脚本会每隔设定间隔自动检查一次。

### 参数

| 参数 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `--gitlab-url` | 否 | https://git.sztv.com.cn | GitLab 服务地址 |
| `--gitlab-project` | 是 | — | GitLab 项目路径 |
| `--username` | 是 | — | GitLab 用户名 |
| `--token` | 是 | — | GitLab Token（Personal Access Token） |
| `--tag` | * | — | 要检查的 Tag 名称 |
| `--pipeline-id` | * | — | 直接指定 Pipeline ID（与 --tag 二选一）|
| `--interval` | 否 | `30` | 轮询间隔秒数 |
| `--timeout` | 否 | `1800` | 最长等待秒数（30分钟） |

### 退出码

| 退出码 | 含义 |
|--------|------|
| `0` | Pipeline 成功 / skipped / manual |
| `1` | Pipeline 失败 / 取消 / 找不到 |
| `2` | 等待超时 |

### 示例

```bash
python check_pipeline.py \
  --gitlab-project mygroup/myapp \
  --username john \
  --token "glpat-xxxxxxxxxxxx" \
  --tag testing-0.0.0.0.1 \
  --interval 30 \
  --timeout 1800
```

---

## 脚本六：list_projects.py — 获取项目组与项目列表

### 功能

通过 GitLab API 获取用户有权限的项目组列表，或指定项目组下的项目列表，方便确认 `--gitlab-project` 参数值。

### 参数

| 参数 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `--gitlab-url` | 否 | https://git.sztv.com.cn | GitLab 服务地址 |
| `--username` | 是 | — | GitLab 用户名 |
| `--token` | 是 | — | GitLab Token（Personal Access Token） |
| `--group` | 否 | — | 项目组路径或 ID，指定后列出该项目组下的项目 |
| `--all-projects` | 否 | — | 列出用户有权限的所有项目（忽略 --group） |
| `--json` | 否 | — | 以 JSON 格式输出结果 |

### 示例

**列出所有项目组：**
```bash
python list_projects.py \
  --username john \
  --token "glpat-xxxxxxxxxxxx"
```

**列出指定项目组下的所有项目：**
```bash
python list_projects.py \
  --username john \
  --token "glpat-xxxxxxxxxxxx" \
  --group mygroup
```

**列出用户有权限的所有项目：**
```bash
python list_projects.py \
  --username john \
  --token "glpat-xxxxxxxxxxxx" \
  --all-projects
```

**JSON 格式输出（方便程序解析）：**
```bash
python list_projects.py \
  --username john \
  --token "glpat-xxxxxxxxxxxx" \
  --group mygroup \
  --json
```

### 输出说明

- **项目组列表**：显示 ID、路径、名称、描述
- **项目列表**：显示 ID、项目路径（`path_with_namespace`）、名称、默认分支、可见性
- 项目路径（如 `mygroup/myrepo`）可直接用于其他脚本的 `--gitlab-project` 参数

---

## ⚠️ 重要：脚本执行规范

**所有 Python 脚本必须从 skill 目录直接运行，禁止复制到项目目录！**

- ✅ 正确：`$PYTHON $SKILL_DIR/tag_release.py --project-path $PROJECT ...`
- ❌ 错误：将脚本复制到项目目录后再运行
- ❌ 错误：在项目目录下生成临时 Python 脚本

**如果需要临时文件**（如中间结果、日志等），放到系统临时目录（`%TEMP%`），绝不可放入项目目录。

---

## 完整发布流程示例

```bash
PYTHON=C:\Users\liangcf\.workbuddy\binaries\python\versions\3.13.12\python.exe
SKILL=C:\Users\liangcf\.workbuddy\skills\szmg-auto-publisher\scripts
PROJECT=/path/to/myapp
USER=john
TOKEN=glpat-xxxxxxxxxxxx

# Step 0: 查看项目组与项目（可选，确认项目路径）
$PYTHON $SKILL/list_projects.py \
  --username $USER \
  --token $TOKEN
# 或查看指定项目组下的项目
$PYTHON $SKILL/list_projects.py \
  --username $USER \
  --token $TOKEN \
  --group mygroup

# Step 1: 在 GitLab 上新建项目（项目名仅支持英文）
$PYTHON $SKILL/create_project.py \
  --username $USER \
  --token $TOKEN \
  --gitlab-project myapp \
  --namespace mygroup \
  --visibility private

# 记下输出中的 gitlab-project 路径，例如 mygroup/myapp
# 后续步骤使用该路径

# Step 2: 生成 Dockerfile 和 ReadMe
$PYTHON $SKILL/generate_dockerfile.py \
  --project-path $PROJECT --services myservice --ports 8080

# Step 3: 推送代码到 GitLab
$PYTHON $SKILL/gitlab_push.py \
  --project-path $PROJECT \
  --gitlab-project $GITLAB_PROJECT \
  --username $USER --token $TOKEN \
  --commit-message "feat: add Dockerfile and ReadMe" \
  --create-remote

# Step 4: 打 Tag 发布测试环境
$PYTHON $SKILL/tag_release.py \
  --project-path $PROJECT \
  --gitlab-project $GITLAB_PROJECT \
  --username $USER --token $TOKEN \
  --env testing --version 0.0.0.0.1

# Step 5: 检查 Pipeline 状态
$PYTHON $SKILL/check_pipeline.py \
  --gitlab-project $GITLAB_PROJECT \
  --username $USER --token $TOKEN \
  --tag testing-0.0.0.0.1
```

---

## 七、check_update.py — Skill 自动更新检查

### 命令格式

```bash
python check_update.py
```

### 参数

无命令行参数，所有配置硬编码在脚本中。

### 工作原理

1. HEAD 请求 `https://skillhub.scms.sztv.com.cn/space/global/szmg-auto-publisher`
2. 从响应头提取 ETag / Last-Modified / Content-Length 构建远端指纹
3. 与本地 `.clawhub/.version-cache` 对比
4. 指纹一致 → 退出码 0（已是最新）
5. 指纹变化 → 退出码 1（有新版本），打印下载地址
6. 网络不通 → 退出码 2（且 24h 内检查过则跳过）

### 退出码

| 退出码 | 含义 | 建议操作 |
|--------|------|----------|
| 0 | 已是最新版本 | 无需操作 |
| 1 | 有新版本可用 | 访问 SkillHub 下载最新 zip 重新安装 |
| 2 | 网络错误 | 手动访问 SkillHub 页面确认 |

### 缓存文件

- 路径: `.clawhub/.version-cache`
- 内容: `last_check`（最后检查时间戳）、`last_fingerprint`（远端指纹）、`last_headers_summary`（关键 HTTP 头摘要）
- 频率控制: 24 小时内检查过且网络不通时静默跳过

### 更新地址

```
https://skillhub.scms.sztv.com.cn/space/global/szmg-auto-publisher
```

---

## 常见问题

**Q: 推送报 403 / 认证失败？**
A: 检查用户名和 Token 是否正确；推荐使用 Personal Access Token（GitLab → Settings → Access Tokens，scope 选 `api` + `write_repository`）。

**Q: Pipeline 一直是 pending？**
A: GitLab Runner 可能未配置或繁忙。请联系管理员确认 Runner 状态。

**Q: Tag 已存在报错？**
A: 每次发布需使用新版本号，不可重复。使用 `git tag -d <tag>` 删除本地 Tag，`git push origin :refs/tags/<tag>` 删除远端 Tag 后重建。

**Q: 无法找到 Pipeline？**
A: 确认 GitLab 项目的 `.gitlab-ci.yml` 已配置 Tag 触发规则（`only: [tags]` 或 `rules: [{if: $CI_COMMIT_TAG}]`）。

**Q: check_pipeline.py 显示 manual 状态？**
A: CI/CD Pipeline 中有步骤设置为手动触发，需在 GitLab Web 上点击 "Play" 按钮手动启动。

**Q: Skill 提示有新版本怎么办？**
A: 运行 `python scripts/check_update.py` 确认版本状态，然后在 WorkBuddy 中请求安装最新版本：`安装 https://skillhub.scms.sztv.com.cn/space/global/szmg-auto-publisher 到 skills 中`。
