#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tag_release.py
按规范打 Tag 并推送到 GitLab，支持测试/正式环境，单服务/多服务。

用法:
  python tag_release.py --project-path /path/to/project
                         --gitlab-url https://git.sztv.com.cn
                         --gitlab-project group/repo-name
                         --username your_username
                         --token your_token
                         --env testing|prod
                         --version 0.0.0.0.1
                         [--service service_name]
                         [--message "发布说明"]
                         [--branch main]
                         [--runner-names testing-runner prod-runner]

参数:
  --project-path    本地项目根目录（默认：当前目录）
  --gitlab-url      GitLab 地址（默认：https://git.sztv.com.cn）
  --gitlab-project  GitLab 项目路径，如 group/repo
  --username        GitLab 用户名
  --token           GitLab Token（Personal Access Token）
  --env             发布环境：testing 或 prod（必填）
  --version         版本号（必填），如 0.0.0.0.1 或 1.0.0
  --service         服务名（多服务时必填），如 myservice
  --message         Tag 注释信息（可选）
  --branch          基于哪个分支打 Tag（默认：main）

Tag 命名规则:
  单服务测试: testing-{版本}         如 testing-0.0.0.0.1
  单服务正式: prod-{版本}            如 prod-1.0.0
  多服务测试: testing-{服务名}-{版本} 如 testing-api-0.0.0.1
  多服务正式: prod-{服务名}-{版本}   如 prod-api-1.0.0
"""

import argparse
import subprocess
import sys
import time
import urllib.request
import urllib.parse
import urllib.error
import json
from pathlib import Path


GITLAB_URL = "https://git.sztv.com.cn"


def check_gitlab_ci_yml(project_path: Path):
    """
    检查项目根目录下是否存在 .gitlab-ci.yml 文件。
    若不存在，尝试从 skill 目录复制固定文件；复制失败则报错退出。

    注意：.gitlab-ci.yml 为固定文件，内容不可变更。
    该文件由项目规范统一制定，包含预定义的 stages 和 runner 配置。
    """
    ci_file = project_path / ".gitlab-ci.yml"
    if ci_file.exists():
        print(f"[OK] .gitlab-ci.yml 已存在: {ci_file}")
        return

    # 文件不存在，尝试从 skill 目录复制固定文件
    print(f"[WARN] 未找到 .gitlab-ci.yml，正在尝试自动复制固定文件...")
    skill_ref = Path(__file__).parent.parent / "references" / "gitlab-ci.yml"
    if not skill_ref.exists():
        print(f"\n[ERROR] 无法自动修复：skill 目录中未找到参考文件！", file=sys.stderr)
        print(f"  期望路径: {skill_ref}", file=sys.stderr)
        print(f"", file=sys.stderr)
        print(f"  注意：.gitlab-ci.yml 为固定文件，内容不可变更。", file=sys.stderr)
        print(f"  Tag 推送后会触发 GitLab CI/CD 流水线，缺少 .gitlab-ci.yml 将导致 Pipeline 无法执行。", file=sys.stderr)
        print(f"", file=sys.stderr)
        print(f"  请手动将正确的 .gitlab-ci.yml 文件放置到项目根目录：", file=sys.stderr)
        print(f"  {ci_file}", file=sys.stderr)
        print(f"", file=sys.stderr)
        sys.exit(1)

    try:
        import shutil
        shutil.copy2(str(skill_ref), str(ci_file))
        print(f"[OK] 已自动复制 .gitlab-ci.yml 到项目根目录: {ci_file}")
        return
    except Exception as e:
        print(f"\n[ERROR] 自动复制 .gitlab-ci.yml 失败：{e}", file=sys.stderr)
        print(f"  源文件: {skill_ref}", file=sys.stderr)
        print(f"  目标路径: {ci_file}", file=sys.stderr)
        print(f"", file=sys.stderr)
        print(f"  注意：.gitlab-ci.yml 为固定文件，内容不可变更。", file=sys.stderr)
        print(f"  Tag 推送后会触发 GitLab CI/CD 流水线，缺少 .gitlab-ci.yml 将导致 Pipeline 无法执行。", file=sys.stderr)
        print(f"", file=sys.stderr)
        print(f"  请手动将正确的 .gitlab-ci.yml 文件放置到项目根目录：", file=sys.stderr)
        print(f"  {ci_file}", file=sys.stderr)
        print(f"", file=sys.stderr)
        sys.exit(1)


def enable_runner(gitlab_url: str, gitlab_project: str, username: str, token: str, runner_id: int) -> bool:
    """
    通过 GitLab API 启用已分配到项目的 Runner。
    PUT /projects/:id/runners/:runner_id  {"active": true}
    """
    encoded_path = urllib.parse.quote(gitlab_project, safe="")
    url = f"{gitlab_url}/api/v4/projects/{encoded_path}/runners/{runner_id}"
    headers = get_auth_headers(gitlab_url, username, token)

    req = urllib.request.Request(url, method="PUT")
    for key, val in headers.items():
        req.add_header(key, val)
    req.data = json.dumps({"active": True}).encode("utf-8")

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status in (200, 201):
                result = json.loads(resp.read().decode("utf-8"))
                active = result.get("active", False)
                if active:
                    print(f"[OK] Runner (id={runner_id}) 已自动启用")
                    return True
                else:
                    print(f"[WARN] Runner (id={runner_id}) 启用请求已发送，但 active 状态仍为 False", file=sys.stderr)
                    return False
            return False
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"[WARN] 启用 Runner (id={runner_id}) 失败 (HTTP {e.code}): {body}", file=sys.stderr)
        return False
    except Exception as ex:
        print(f"[WARN] 启用 Runner (id={runner_id}) 时发生异常: {ex}", file=sys.stderr)
        return False


def assign_runner_to_project(gitlab_url: str, gitlab_project: str, username: str, token: str, runner_id: int) -> bool:
    """
    通过 GitLab API 将 Runner 分配到项目。
    POST /projects/:id/runners  {"runner_id": xxx}
    """
    encoded_path = urllib.parse.quote(gitlab_project, safe="")
    url = f"{gitlab_url}/api/v4/projects/{encoded_path}/runners"
    headers = get_auth_headers(gitlab_url, username, token)

    req = urllib.request.Request(url, method="POST")
    for key, val in headers.items():
        req.add_header(key, val)
    req.data = json.dumps({"runner_id": runner_id}).encode("utf-8")

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status in (200, 201, 204):
                print(f"[OK] Runner (id={runner_id}) 已自动分配到项目")
                return True
            else:
                body = resp.read().decode("utf-8", errors="replace")
                print(f"[WARN] 分配 Runner (id={runner_id}) 失败 (HTTP {resp.status}): {body}", file=sys.stderr)
                return False
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"[WARN] 分配 Runner (id={runner_id}) 失败 (HTTP {e.code}): {body}", file=sys.stderr)
        return False
    except Exception as ex:
        print(f"[WARN] 分配 Runner (id={runner_id}) 时发生异常: {ex}", file=sys.stderr)
        return False


def search_runners_by_tag(gitlab_url: str, token: str, tag: str) -> list:
    """
    通过 GitLab API 搜索包含指定 tag 的 Runner。
    GET /runners?tag_list=xxx
    返回 Runner 列表（包含 id, description, tag_list 等）
    """
    url = f"{gitlab_url}/api/v4/runners?tag_list={urllib.parse.quote(tag)}&per_page=50"
    headers = get_auth_headers(gitlab_url, "", token)

    req = urllib.request.Request(url, method="GET")
    for key, val in headers.items():
        req.add_header(key, val)

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            runners = json.loads(resp.read().decode("utf-8"))
            if isinstance(runners, list):
                return runners
            return []
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"[WARN] 搜索 Runner (tag={tag}) 失败 (HTTP {e.code}): {body}", file=sys.stderr)
        return []
    except Exception as ex:
        print(f"[WARN] 搜索 Runner (tag={tag}) 时发生异常: {ex}", file=sys.stderr)
        return []


def check_runners(gitlab_url: str, gitlab_project: str, username: str, token: str, runner_names: list):
    """
    检查项目中指定的 Runner 是否在线可用。
    通过 GitLab API 获取项目 Runner 列表（含分页），校验 runner_names 中的每个 Runner
    描述（description）是否出现在列表中且状态为 online。
    对于 testing-runner / prod-runner 系列 Runner，若未分配则自动分配；
    以下情况均会 sys.exit(1) 停止发布：
      - 获取 Runner 列表失败（HTTP 错误或网络异常）
      - 项目未分配任何 Runner
      - Runner 未找到
      - 自动分配失败
      - Runner active=False（非自动分配前缀）
      - Runner online=False
    """
    # 需要自动分配的 Runner 名称前缀（不区分大小写匹配）
    AUTO_ASSIGN_RUNNER_PREFIXES = {"testing-runner", "prod-runner"}

    encoded_path = urllib.parse.quote(gitlab_project, safe="")
    base_url = f"{gitlab_url}/api/v4/projects/{encoded_path}/runners"
    headers = get_auth_headers(gitlab_url, username, token)
    all_runners = []
    page = 1

    while True:
        url = f"{base_url}?page={page}&per_page=50"
        req = urllib.request.Request(url, method="GET")
        for key, val in headers.items():
            req.add_header(key, val)

        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                runners = json.loads(resp.read().decode("utf-8"))
                if not isinstance(runners, list) or not runners:
                    break
                all_runners.extend(runners)
                # 用 X-Next-Page 判断是否还有更多页
                next_page = resp.headers.get("X-Next-Page")
                if not next_page or next_page == "":
                    break
                page = int(next_page)
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            print(f"\n[ERROR] 无法获取 Runner 列表 (HTTP {e.code}): {body}", file=sys.stderr)
            print(f"  请手动确认 Settings → CI/CD → Runners 中 Runner 已分配，或联系 GitLab 管理员处理", file=sys.stderr)
            sys.exit(1)
        except Exception as ex:
            print(f"\n[ERROR] 检查 Runner 时发生异常: {ex}", file=sys.stderr)
            print(f"  请确认网络连通性及 GitLab Token 权限后重试。", file=sys.stderr)
            sys.exit(1)

    # 为每个 Runner 补充 tag_list（项目 Runners API 不返回该字段）
    if all_runners:
        print(f"[INFO] 正在获取 {len(all_runners)} 个 Runner 的 tag_list...")
        enriched = []
        for r in all_runners:
            runner_id = r.get("id")
            if not runner_id:
                r["tag_list"] = []
                enriched.append(r)
                continue
            detail_url = f"{gitlab_url}/api/v4/runners/{runner_id}"
            detail_req = urllib.request.Request(detail_url, method="GET")
            for k2, v2 in headers.items():
                detail_req.add_header(k2, v2)
            try:
                with urllib.request.urlopen(detail_req, timeout=15) as dr:
                    detail = json.loads(dr.read().decode("utf-8"))
                    r["tag_list"] = detail.get("tag_list", [])
            except Exception:
                r["tag_list"] = []
            enriched.append(r)
        all_runners = enriched
        print(f"[OK] tag_list 获取完成")

    # 构建 description -> runner 的映射（不区分大小写）
    # 注意：all_runners 可能为空（项目未分配任何 Runner），此时 runner_map 为空，
    # 后续 _find_runner() 会返回 None，触发自动搜索并分配逻辑
    runner_map = {r.get("description", "").lower(): r for r in all_runners}

    def _find_runner(name_key: str):
        """模糊匹配 Runner：精确 → 前缀 → 包含 → 标签，返回 (matched_desc, runner) 或 (None, None)"""
        nk = name_key.lower()
        # 1) 精确匹配（description）
        if nk in runner_map:
            return nk, runner_map[nk]
        # 2) 前缀匹配（description）
        for desc in runner_map:
            if desc.startswith(nk):
                return desc, runner_map[desc]
        # 3) 包含匹配（description）
        for desc in runner_map:
            if nk in desc:
                return desc, runner_map[desc]
        # 4) 标签匹配（tag_list 中精确匹配，适应 description 为 IP 的场景）
        for r in all_runners:
            tag_list = [t.lower() for t in r.get("tag_list", [])]
            if nk in tag_list:
                return r.get("description", "").lower(), r
        return None, None

    all_ok = True
    for name in runner_names:
        key = name.lower()
        _, r = _find_runner(key)

        if r is None:
            # Runner 未分配到项目，自动搜索并分配
            print(f"[INFO] Runner '{name}' 未分配到项目，正在自动搜索并分配...")
            found_runners = search_runners_by_tag(gitlab_url, token, name)
            if not found_runners:
                print(f"\n[ERROR] Runner '{name}' 未找到（系统中不存在该 tag 的 Runner）！", file=sys.stderr)
                all_ok = False
                continue

            # 优先选择在线的 Runner，其次选择 active 的 Runner
            found_runners.sort(key=lambda x: (
                not x.get("online", False),   # online=True 排前面
                not x.get("active", False),   # active=True 排前面
            ))
            if len(found_runners) > 1:
                print(f"[INFO] 找到 {len(found_runners)} 个匹配 Runner，优先选择在线的")

            # 尝试分配找到的 Runner（优先在线的）
            assigned = False
            for fr in found_runners:
                fr_id = fr.get("id")
                if not fr_id:
                    continue
                fr_status = fr.get("status", "unknown")
                fr_online = fr.get("online", False)
                print(f"[INFO] 尝试分配 Runner id={fr_id} ({fr.get('description','')}, status={fr_status}, online={fr_online})")
                if assign_runner_to_project(gitlab_url, gitlab_project, username, token, fr_id):
                    runner_id = fr_id
                    r = fr
                    r["tag_list"] = fr.get("tag_list", [])
                    assigned = True
                    break

            if not assigned:
                print(f"\n[ERROR] Runner '{name}' 自动分配失败！", file=sys.stderr)
                all_ok = False
                continue

            # 分配后等待并重新获取 Runner 的最新状态
            print(f"[INFO] Runner '{name}' 已分配，正在重新获取状态...")
            time.sleep(3)
            recheck_url = f"{gitlab_url}/api/v4/runners/{runner_id}"
            recheck_req = urllib.request.Request(recheck_url, method="GET")
            for k, v in headers.items():
                recheck_req.add_header(k, v)
            try:
                with urllib.request.urlopen(recheck_req, timeout=15) as resp2:
                    r2 = json.loads(resp2.read().decode("utf-8"))
                    description = r2.get("description", r.get("description", ""))
                    online = r2.get("online", False)
                    active = r2.get("active", False)
                    status = r2.get("status", "unknown")
                    r["tag_list"] = r2.get("tag_list", r.get("tag_list", []))
                    print(f"[INFO] 重新检查完成：online={online}, active={active}, status={status}")
            except Exception:
                print(f"[WARN] 重新检查 Runner 状态失败，将使用搜索时的状态", file=sys.stderr)
                description = r.get("description", "")
                online = r.get("online", False)
                status = r.get("status", "unknown")
                active = r.get("active", False)
        else:
            description = r.get("description", "")
            online = r.get("online", False)
            status = r.get("status", "unknown")
            active = r.get("active", False)
            runner_id = r.get("id")

        # 自动启用逻辑：Runner 名或标签前缀匹配自动启用列表时自动启用
        should_auto_enable = any(
            description.lower().startswith(p.lower()) or
            any(tag.lower().startswith(p.lower()) for tag in r.get("tag_list", []))
            for p in AUTO_ASSIGN_RUNNER_PREFIXES
        )

        if not active and should_auto_enable:
            print(f"[INFO] Runner '{description}' 未启用，正在自动启用...")
            if runner_id:
                enabled = enable_runner(gitlab_url, gitlab_project, username, token, runner_id)
                if enabled:
                    # 启用后重新获取该 Runner 的最新状态
                    print(f"[INFO] Runner '{description}' 已启用，正在重新检查状态...")
                    time.sleep(3)
                    recheck_url = f"{gitlab_url}/api/v4/runners/{runner_id}"
                    recheck_req = urllib.request.Request(recheck_url, method="GET")
                    for k, v in headers.items():
                        recheck_req.add_header(k, v)
                    try:
                        with urllib.request.urlopen(recheck_req, timeout=15) as resp2:
                            r2 = json.loads(resp2.read().decode("utf-8"))
                            online = r2.get("online", False)
                            active = r2.get("active", False)
                            status = r2.get("status", "unknown")
                            print(f"[INFO] 重新检查完成：online={online}, active={active}, status={status}")
                    except Exception:
                        print(f"[WARN] 重新检查 Runner 状态失败，将使用启用前的状态", file=sys.stderr)
                else:
                    # 自动启用失败 → 停止发布
                    print(f"\n[ERROR] Runner '{description}' 自动启用失败！", file=sys.stderr)
                    print(f"  请联系 GitLab 管理人员手动启用该 Runner 后重试。", file=sys.stderr)
                    all_ok = False
                    continue
            else:
                # 无有效 ID → 停止发布
                print(f"\n[ERROR] Runner '{description}' 无有效 ID，无法自动启用。", file=sys.stderr)
                print(f"  请联系 GitLab 管理人员处理。", file=sys.stderr)
                all_ok = False
                continue

        if online and active:
            print(f"[OK] Runner '{description}' 在线（status: {status}，active: {active}）")
        elif not active:
            print(f"\n[ERROR] Runner '{description}' 未启用（active: {active}）！", file=sys.stderr)
            print(f"  请联系 GitLab 管理人员启用该 Runner 后重试。", file=sys.stderr)
            all_ok = False
        else:
            print(f"\n[ERROR] Runner '{description}' 不在线（status: {status}）！", file=sys.stderr)
            print(f"  请联系 GitLab 管理人员确认 Runner 进程状态后重试。", file=sys.stderr)
            all_ok = False

    if not all_ok:
        print(f"\n[ERROR] Runner 检查未通过，请联系 GitLab 管理人员处理后再试。", file=sys.stderr)
        sys.exit(1)


def ensure_project_has_runners(gitlab_url: str, gitlab_project: str, username: str, token: str):
    """
    检查项目是否至少分配了一个 Runner。
    若项目未分配任何 Runner，则 Tag 推送后 CI/CD Pipeline 无法执行，
    此时应阻止发布并提示用户分配 Runner。

    以下情况均会 sys.exit(1) 停止发布：
      - 获取 Runner 列表失败（HTTP 错误或网络异常）
      - 项目未分配任何 Runner
    """
    encoded_path = urllib.parse.quote(gitlab_project, safe="")
    url = f"{gitlab_url}/api/v4/projects/{encoded_path}/runners?per_page=1"
    headers = get_auth_headers(gitlab_url, username, token)

    req = urllib.request.Request(url, method="GET")
    for key, val in headers.items():
        req.add_header(key, val)

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            runners = json.loads(resp.read().decode("utf-8"))
            if isinstance(runners, list) and len(runners) > 0:
                total_pages = resp.headers.get("X-Total-Pages", "?")
                total_count = resp.headers.get("X-Total", "?")
                print(f"[OK] 项目已分配 Runner（共 {total_count} 个）")
                return
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"\n[ERROR] 无法获取 Runner 列表 (HTTP {e.code}): {body}", file=sys.stderr)
        print(f"  请确认 GitLab Token 权限及项目路径后重试。", file=sys.stderr)
        sys.exit(1)
    except Exception as ex:
        print(f"\n[ERROR] 检查 Runner 分配状态时发生异常: {ex}", file=sys.stderr)
        print(f"  请确认网络连通性后重试。", file=sys.stderr)
        sys.exit(1)

    # 项目未分配任何 Runner
    print(f"\n[ERROR] 项目未分配任何 Runner，禁止推送 Tag！", file=sys.stderr)
    print(f"", file=sys.stderr)
    print(f"  GitLab CI/CD Pipeline 依赖 Runner 执行流水线，未分配 Runner 将导致发布失败。", file=sys.stderr)
    print(f"", file=sys.stderr)
    print(f"  请执行以下任一操作：", file=sys.stderr)
    print(f"  1. 重新执行时通过 --runner-names 指定 Runner 名称，脚本将自动搜索并分配：", file=sys.stderr)
    print(f"     示例：--runner-names testing-runner  （测试环境）", file=sys.stderr)
    print(f"     示例：--runner-names prod-runner      （正式环境）", file=sys.stderr)
    print(f"  2. 联系云网安全系统工程师为项目手动分配 Runner 后重试", file=sys.stderr)
    print(f"", file=sys.stderr)
    sys.exit(1)


def check_git_installed():
    """检查 git 命令是否可用，未安装则打印引导信息并退出"""
    try:
        result = subprocess.run(
            ["git", "--version"],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            print(f"[OK] git 已安装: {result.stdout.strip()}")
            return
    except FileNotFoundError:
        pass
    except Exception:
        pass

    print("\n[ERROR] 未检测到 git 命令，请先安装 Git 后再继续。", file=sys.stderr)
    print("=" * 60, file=sys.stderr)
    print("Git 安装指引：", file=sys.stderr)
    print("", file=sys.stderr)
    print("  【Windows】", file=sys.stderr)
    print("  官网下载（推荐）：https://git-scm.com/download/win", file=sys.stderr)
    print("  安装完成后重启终端，再重新运行本命令。", file=sys.stderr)
    print("", file=sys.stderr)
    print("  【macOS】", file=sys.stderr)
    print("  方式一（Homebrew）：brew install git", file=sys.stderr)
    print("  方式二（Xcode CLI）：xcode-select --install", file=sys.stderr)
    print("", file=sys.stderr)
    print("  【Linux (Debian/Ubuntu)】", file=sys.stderr)
    print("  sudo apt-get update && sudo apt-get install -y git", file=sys.stderr)
    print("", file=sys.stderr)
    print("  【Linux (CentOS/RHEL)】", file=sys.stderr)
    print("  sudo yum install -y git", file=sys.stderr)
    print("=" * 60, file=sys.stderr)
    sys.exit(1)


def run_git(args: list, cwd: Path, check=True, capture=False):
    cmd = ["git"] + args
    print(f"[GIT] {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=str(cwd), capture_output=capture, text=True)
    if check and result.returncode != 0:
        err = result.stderr if capture else ""
        print(f"[ERROR] git 命令失败 (exit {result.returncode}): {err}", file=sys.stderr)
        sys.exit(result.returncode)
    return result


def build_remote_url(gitlab_url: str, gitlab_project: str, username: str, token: str) -> str:
    parsed = urllib.parse.urlparse(gitlab_url)
    encoded_user = urllib.parse.quote(username, safe="")
    encoded_pass = urllib.parse.quote(token, safe="")
    return f"{parsed.scheme}://{encoded_user}:{encoded_pass}@{parsed.netloc}/{gitlab_project.lstrip('/')}.git"


def get_auth_headers(gitlab_url: str, username: str, token: str) -> dict:
    """获取认证 Header（PRIVATE-TOKEN 或 Basic Auth）"""
    headers = {"Content-Type": "application/json"}
    # 如果 token 看起来已经是 Token，直接用作 PRIVATE-TOKEN
    if token.startswith("glpat-") or len(token) >= 20:
        headers["PRIVATE-TOKEN"] = token
    else:
        import base64
        creds = base64.b64encode(f"{username}:{token}".encode()).decode()
        headers["Authorization"] = f"Basic {creds}"
    return headers


def ensure_custom_tag_variable(gitlab_url: str, gitlab_project: str,
                              username: str, token: str, tag_name: str) -> bool:
    """
    自动确保 CUSTOM_TAG 变量存在且值正确。
    - 不存在（HTTP 404）：自动通过 API 创建，值设为完整 tag 名称（如 prod-1.0.0）
    - 已存在（HTTP 200）：自动通过 API 更新为当前完整 tag 名称
    无需用户手动操作 GitLab Web 界面。
    """
    encoded_path = urllib.parse.quote(gitlab_project, safe="")
    base_url = f"{gitlab_url}/api/v4/projects/{encoded_path}/variables"
    headers = get_auth_headers(gitlab_url, username, token)

    # ── 第1步：尝试 GET，检查变量是否已存在 ──
    check_req = urllib.request.Request(f"{base_url}/CUSTOM_TAG", method="GET")
    for key, val in headers.items():
        check_req.add_header(key, val)

    try:
        with urllib.request.urlopen(check_req, timeout=15) as resp:
            # ── 已存在：使用 PUT 更新值 ──
            existing = json.loads(resp.read().decode("utf-8"))
            existing_value = existing.get("value", "")
            print(f"[INFO] CUSTOM_TAG 已存在，当前值: {existing_value}")

            if existing_value == tag_name:
                print(f"[OK] CUSTOM_TAG 值已是最新: {tag_name}")
                return True

            update_req = urllib.request.Request(f"{base_url}/CUSTOM_TAG", method="PUT")
            for key, val in headers.items():
                update_req.add_header(key, val)
            update_req.data = json.dumps({"value": tag_name}).encode("utf-8")

            with urllib.request.urlopen(update_req, timeout=15) as up_resp:
                if up_resp.status in (200, 201):
                    print(f"[OK] CUSTOM_TAG 已自动更新: {existing_value} -> {tag_name}")
                    return True
                else:
                    body = up_resp.read().decode("utf-8", errors="replace")
                    print(f"[ERROR] 更新 CUSTOM_TAG 失败 (HTTP {up_resp.status}): {body}")
                    return False

    except urllib.error.HTTPError as e:
        if e.code == 404:
            # ── 不存在：使用 POST 创建 ──
            print(f"[INFO] CUSTOM_TAG 不存在，正在自动创建（值: {tag_name}）...")
            create_req = urllib.request.Request(base_url, method="POST")
            for key, val in headers.items():
                create_req.add_header(key, val)
            create_req.data = json.dumps({
                "key": "CUSTOM_TAG",
                "value": tag_name,
                "variable_type": "env_var",
                "protected": False,
                "masked": False,
            }).encode("utf-8")

            try:
                with urllib.request.urlopen(create_req, timeout=15) as cr:
                    if cr.status in (200, 201):
                        print(f"[OK] CUSTOM_TAG 已自动创建，值: {tag_name}")
                        return True
                    else:
                        body = cr.read().decode("utf-8", errors="replace")
                        print(f"[ERROR] 创建 CUSTOM_TAG 失败 (HTTP {cr.status}): {body}")
                        return False
            except urllib.error.HTTPError as ce:
                body = ce.read().decode("utf-8", errors="replace")
                print(f"[ERROR] 创建 CUSTOM_TAG 失败 (HTTP {ce.code}): {body}")
                return False

        else:
            # 其他 HTTP 错误
            body = e.read().decode("utf-8", errors="replace")
            print(f"[ERROR] 检查 CUSTOM_TAG 失败 (HTTP {e.code}): {body}")
            return False

    except Exception as ex:
        print(f"[ERROR] 操作 CUSTOM_TAG 时发生异常: {ex}")
        return False


def build_tag_name(env: str, version: str, service: str = "") -> str:
    """根据规则构造 Tag 名称"""
    env = env.lower().strip()
    if env not in ("testing", "prod"):
        raise ValueError(f"env 必须是 testing 或 prod，收到: {env}")

    version = version.strip().lstrip("v")

    if service:
        return f"{env}-{service}-{version}"
    else:
        return f"{env}-{version}"


def tag_exists_local(tag_name: str, project_path: Path) -> bool:
    result = run_git(["tag", "-l", tag_name], cwd=project_path, capture=True)
    return tag_name in result.stdout.split()


def create_tag_via_api(gitlab_url: str, gitlab_project: str, tag_name: str,
                       ref: str, message: str, username: str, token: str) -> bool:
    """通过 GitLab API 创建 Tag"""
    encoded_path = urllib.parse.quote(gitlab_project, safe="")
    url = f"{gitlab_url}/api/v4/projects/{encoded_path}/repository/tags"

    req = urllib.request.Request(url, method="POST")
    for key, val in get_auth_headers(gitlab_url, username, token).items():
        req.add_header(key, val)

    data = {
        "tag_name": tag_name,
        "ref": ref,
        "message": message or f"Release {tag_name}",
    }
    req.data = json.dumps(data).encode("utf-8")

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            if resp.status in (200, 201):
                return True
            return False
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"[WARN] API 创建 Tag 失败 (HTTP {e.code}): {body}")
        return False


def main():
    parser = argparse.ArgumentParser(description="打 Tag 并推送到 GitLab")
    parser.add_argument("--project-path", default=".", help="本地项目根目录")
    parser.add_argument("--gitlab-url", default=GITLAB_URL, help="GitLab 地址")
    parser.add_argument("--gitlab-project", required=True, help="GitLab 项目路径，如 group/repo")
    parser.add_argument("--username", required=True, help="GitLab 用户名")
    parser.add_argument("--token", required=True, help="GitLab Token（Personal Access Token）")
    parser.add_argument("--env", required=True, choices=["testing", "prod"], help="发布环境")
    parser.add_argument("--version", required=True, help="版本号，如 0.0.0.0.1 或 1.0.0")
    parser.add_argument("--service", default="", help="服务名（多服务时指定）")
    parser.add_argument("--message", default="", help="Tag 注释信息")
    parser.add_argument("--branch", default="main", help="基于哪个分支打 Tag")
    parser.add_argument("--use-api", action="store_true", help="优先使用 GitLab API 打 Tag（适用于无本地仓库场景）")
    parser.add_argument("--runner-names", nargs="*", default=[], help="Runner 名称列表，用于打 Tag 前检查（如：testing-runner prod-runner）")
    args = parser.parse_args()

    check_git_installed()

    project_path = Path(args.project_path).resolve()

    # ── 前置检查：.gitlab-ci.yml 是否存在 ──
    check_gitlab_ci_yml(project_path)

    # ── 前置检查：项目 Runner 分配状态 ──
    # 始终检查项目是否分配了 Runner，未分配则不允许推送 Tag
    if args.runner_names:
        check_runners(
            args.gitlab_url, args.gitlab_project,
            args.username, args.token,
            args.runner_names
        )
    else:
        # 未指定具体 Runner 名称时，至少检查项目是否至少分配了一个 Runner
        ensure_project_has_runners(
            args.gitlab_url, args.gitlab_project,
            args.username, args.token
        )

    # 构造 Tag 名称
    try:
        tag_name = build_tag_name(args.env, args.version, args.service)
    except ValueError as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        sys.exit(1)

    tag_message = args.message or f"Release {tag_name}"
    safe_url = f"{args.gitlab_url}/{args.gitlab_project}.git"

    print(f"[INFO] 目标仓库: {safe_url}")
    print(f"[INFO] Tag 名称: {tag_name}")
    print(f"[INFO] Tag 注释: {tag_message}")

    # ── 正式环境前置操作：自动设置 CUSTOM_TAG ──
    if args.env == "prod":
        print("\n[INFO] 正式环境发布，自动设置 CUSTOM_TAG 变量...")
        custom_tag_ok = ensure_custom_tag_variable(
            args.gitlab_url, args.gitlab_project,
            args.username, args.token,
            tag_name   # 完整 tag 名称，如 prod-1.0.0
        )
        if not custom_tag_ok:
            print("[ERROR] CUSTOM_TAG 设置失败，无法继续发布。", file=sys.stderr)
            sys.exit(1)
        print("[OK] CUSTOM_TAG 设置完成\n")

    # ── 方式1：使用 GitLab API 打 Tag ──
    if args.use_api:
        print("[INFO] 使用 GitLab API 创建 Tag...")
        success = create_tag_via_api(
            args.gitlab_url, args.gitlab_project,
            tag_name, args.branch, tag_message,
            args.username, args.token
        )
        if success:
            print(f"\n[SUCCESS] Tag 已通过 API 创建: {tag_name}")
            print(f"  仓库: {safe_url}")
            print(f"  Tag:  {tag_name}")
        else:
            print("[ERROR] API 打 Tag 失败，请检查权限或手动创建", file=sys.stderr)
            sys.exit(1)
        return

    # ── 方式2：本地 git 打 Tag 并推送 ──
    if not project_path.exists():
        print(f"[ERROR] 项目路径不存在: {project_path}", file=sys.stderr)
        sys.exit(1)

    git_dir = project_path / ".git"
    if not git_dir.exists():
        print("[ERROR] 项目目录不是 Git 仓库，请先执行 gitlab_push.py 推送代码", file=sys.stderr)
        sys.exit(1)

    # 检查 Tag 是否已存在
    if tag_exists_local(tag_name, project_path):
        print(f"[WARN] 本地 Tag 已存在: {tag_name}")
        print(f"[WARN] 若需重新创建，请先删除: git tag -d {tag_name}")
        # 尝试直接推送（可能远端还没有）
        print("[INFO] 尝试推送已有 Tag 到远端...")
    else:
        # 确保在目标分支
        result = run_git(["branch", "--show-current"], cwd=project_path, capture=True)
        current_branch = result.stdout.strip()
        if current_branch != args.branch:
            print(f"[INFO] 当前分支 {current_branch}，切换到 {args.branch}...")
            run_git(["checkout", args.branch], cwd=project_path)

        # 确保本地与远端同步
        remote_url = build_remote_url(args.gitlab_url, args.gitlab_project, args.username, args.token)
        remotes = run_git(["remote"], cwd=project_path, capture=True).stdout.strip().split()
        if "origin" not in remotes:
            run_git(["remote", "add", "origin", remote_url], cwd=project_path)
        else:
            run_git(["remote", "set-url", "origin", remote_url], cwd=project_path)

        # 拉取最新提交（确保 Tag 打在最新代码上）
        print("[INFO] 拉取最新提交...")
        pull_result = run_git(["pull", "origin", args.branch, "--rebase"], cwd=project_path, check=False)
        if pull_result.returncode != 0:
            print("[WARN] 拉取失败，将基于当前 HEAD 打 Tag")

        # 创建带注释的 Tag
        run_git(["tag", "-a", tag_name, "-m", tag_message], cwd=project_path)
        print(f"[OK] 本地 Tag 创建成功: {tag_name}")

    # 配置远端 URL（带认证）
    remote_url = build_remote_url(args.gitlab_url, args.gitlab_project, args.username, args.token)
    remotes = run_git(["remote"], cwd=project_path, capture=True).stdout.strip().split()
    if "origin" not in remotes:
        run_git(["remote", "add", "origin", remote_url], cwd=project_path)
    else:
        run_git(["remote", "set-url", "origin", remote_url], cwd=project_path)

    # 推送 Tag
    print(f"[INFO] 推送 Tag {tag_name} 到 {safe_url}...")
    run_git(["push", "origin", tag_name], cwd=project_path)

    print(f"\n[SUCCESS] Tag 已成功发布！")
    print(f"  仓库: {safe_url}")
    print(f"  Tag:  {tag_name}")
    print(f"  分支: {args.branch}")
    print(f"\n  CI/CD Pipeline 将自动触发，请使用 check_pipeline.py 监控状态：")
    print(f"  python check_pipeline.py --gitlab-url {args.gitlab_url} --gitlab-project {args.gitlab_project} --username <user> --token <token> --tag {tag_name}")

    # ── 温馨提示（初次发布） ──
    if args.env in ("prod", "testing"):
        env_label = "正式环境" if args.env == "prod" else "测试环境"
        print(f"\n{'='*60}")
        print(f"[温馨提示] {env_label}初次发布完成后，请联系云网安全系统工程师完成以下工作：")
        print(f"  1. 配置发布域名")
        print(f"  2. 进行域名解析操作")
        print(f"  3. 进行代码安全审计和漏洞扫描")
        print(f"{'='*60}")


if __name__ == "__main__":
    # Force UTF-8 output encoding (Windows compatibility)
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    main()
