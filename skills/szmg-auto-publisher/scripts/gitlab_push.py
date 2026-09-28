#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gitlab_push.py
初始化本地 Git 仓库（如需），关联远程 GitLab，提交并推送代码。

用法:
  python gitlab_push.py --project-path /path/to/project
                         --gitlab-url https://git.sztv.com.cn
                         --gitlab-project group/repo-name
                         --username your_username
                         --token your_token
                         [--branch main]
                         [--commit-message "feat: initial commit"]
                         [--create-remote]

参数:
  --project-path     本地项目根目录（默认：当前目录）
  --gitlab-url       GitLab 服务地址（默认：https://git.sztv.com.cn）
  --gitlab-project   GitLab 项目路径，如 mygroup/myrepo
  --username         GitLab 用户名
  --token          GitLab Token（Personal Access Token）
  --branch           推送分支（默认：main）
  --commit-message   提交信息（默认：Update: <时间戳>）
  --create-remote    若 GitLab 上不存在项目则自动创建（需要 API 权限）
"""

import argparse
import os
import subprocess
import sys
import urllib.request
import urllib.parse
import json
from datetime import datetime
from pathlib import Path


GITLAB_URL = "https://git.sztv.com.cn"


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
    """运行 git 命令"""
    cmd = ["git"] + args
    print(f"[GIT] {' '.join(cmd)}")
    result = subprocess.run(
        cmd,
        cwd=str(cwd),
        capture_output=capture,
        text=True
    )
    if check and result.returncode != 0:
        err = result.stderr if capture else ""
        print(f"[ERROR] git 命令失败 (exit {result.returncode}): {err}", file=sys.stderr)
        sys.exit(result.returncode)
    return result


def build_remote_url(gitlab_url: str, gitlab_project: str, username: str, token: str) -> str:
    """构造带认证的远程 URL"""
    parsed = urllib.parse.urlparse(gitlab_url)
    encoded_user = urllib.parse.quote(username, safe="")
    encoded_pass = urllib.parse.quote(token, safe="")
    return f"{parsed.scheme}://{encoded_user}:{encoded_pass}@{parsed.netloc}/{gitlab_project.lstrip('/')}.git"


def gitlab_api_request(url: str, method: str = "GET", data: dict = None, token: str = None, username: str = None):
    """发送 GitLab API 请求"""
    req = urllib.request.Request(url, method=method)
    req.add_header("Content-Type", "application/json")

    if token and (token.startswith("glpat-") or len(token) >= 20):
        req.add_header("PRIVATE-TOKEN", token)
    elif username and token:
        import base64
        creds = base64.b64encode(f"{username}:{token}".encode()).decode()
        req.add_header("Authorization", f"Basic {creds}")

    if data:
        req.data = json.dumps(data).encode("utf-8")

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8")), resp.status
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        return {"error": body, "status_code": e.code}, e.code


def get_gitlab_token(gitlab_url: str, username: str, token: str) -> str:
    """通过用户名密码换取 Personal Access Token（GitLab API）"""
    api_url = f"{gitlab_url}/api/v4/session"
    result, status = gitlab_api_request(
        api_url, method="POST",
        data={"login": username, "password": token}
    )
    if status == 201 and "private_token" in result:
        return result["private_token"]
    return ""


def ensure_gitlab_project_exists(gitlab_url: str, gitlab_project: str, token: str, username: str):
    """检查 GitLab 项目是否存在，不存在则创建"""
    encoded_path = urllib.parse.quote(gitlab_project, safe="")
    check_url = f"{gitlab_url}/api/v4/projects/{encoded_path}"

    result, status = gitlab_api_request(check_url, token=token, username=username)

    if status == 200:
        print(f"[OK] GitLab 项目已存在: {gitlab_project}")
        return True

    if status == 404:
        print(f"[INFO] GitLab 项目不存在，尝试创建: {gitlab_project}")
        parts = gitlab_project.strip("/").split("/")
        repo_name = parts[-1]
        namespace = "/".join(parts[:-1]) if len(parts) > 1 else ""

        create_data = {
            "name": repo_name,
            "path": repo_name,
            "visibility": "private",
            "initialize_with_readme": False,
        }

        if namespace:
            # 先查找 namespace id
            ns_url = f"{gitlab_url}/api/v4/namespaces?search={urllib.parse.quote(namespace)}"
            ns_result, ns_status = gitlab_api_request(ns_url, token=token, username=username)
            if ns_status == 200 and isinstance(ns_result, list) and ns_result:
                create_data["namespace_id"] = ns_result[0]["id"]

        create_url = f"{gitlab_url}/api/v4/projects"
        create_result, create_status = gitlab_api_request(
            create_url, method="POST", data=create_data,
            token=token, username=username
        )

        if create_status in (200, 201):
            print(f"[OK] GitLab 项目创建成功: {gitlab_project}")
            return True
        else:
            print(f"[WARN] 自动创建项目失败 (HTTP {create_status}): {create_result.get('error', '')}")
            print("[WARN] 请手动在 GitLab 上创建项目后重试")
            return False

    print(f"[WARN] 无法确认 GitLab 项目状态 (HTTP {status}): {result.get('error', '')}")
    return False


def main():
    parser = argparse.ArgumentParser(description="推送代码到私有 GitLab")
    parser.add_argument("--project-path", default=".", help="本地项目根目录")
    parser.add_argument("--gitlab-url", default=GITLAB_URL, help="GitLab 地址")
    parser.add_argument("--gitlab-project", required=True, help="GitLab 项目路径，如 group/repo")
    parser.add_argument("--username", required=True, help="GitLab 用户名")
    parser.add_argument("--token", required=True, help="GitLab Token（Personal Access Token）")
    parser.add_argument("--branch", default="main", help="目标分支（默认：main）")
    parser.add_argument("--commit-message", default="", help="提交信息")
    parser.add_argument("--create-remote", action="store_true", help="自动创建远程项目")
    args = parser.parse_args()

    check_git_installed()

    project_path = Path(args.project_path).resolve()
    if not project_path.exists():
        print(f"[ERROR] 项目路径不存在: {project_path}", file=sys.stderr)
        sys.exit(1)

    commit_msg = args.commit_message or f"Update: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    remote_url = build_remote_url(args.gitlab_url, args.gitlab_project, args.username, args.token)
    safe_url = f"{args.gitlab_url}/{args.gitlab_project}.git"  # 不含密码的展示用 URL

    print(f"[INFO] 项目路径: {project_path}")
    print(f"[INFO] 目标仓库: {safe_url}")
    print(f"[INFO] 目标分支: {args.branch}")

    # ── 1. 初始化本地 Git 仓库 ──
    git_dir = project_path / ".git"
    if not git_dir.exists():
        print("[INFO] 初始化 Git 仓库...")
        run_git(["init"], cwd=project_path)
        run_git(["checkout", "-b", args.branch], cwd=project_path)
    else:
        print("[INFO] Git 仓库已存在，跳过初始化")
        # 确保在目标分支
        result = run_git(["branch", "--show-current"], cwd=project_path, capture=True)
        current_branch = result.stdout.strip()
        if current_branch != args.branch:
            # 尝试切换分支
            check = run_git(["checkout", args.branch], cwd=project_path, check=False)
            if check.returncode != 0:
                run_git(["checkout", "-b", args.branch], cwd=project_path)

    # ── 2. 配置远程仓库 ──
    result = run_git(["remote"], cwd=project_path, capture=True)
    remotes = result.stdout.strip().split()
    if "origin" in remotes:
        run_git(["remote", "set-url", "origin", remote_url], cwd=project_path)
        print(f"[OK] 已更新远程 origin → {safe_url}")
    else:
        run_git(["remote", "add", "origin", remote_url], cwd=project_path)
        print(f"[OK] 已添加远程 origin → {safe_url}")

    # ── 3. 确保 GitLab 项目存在（可选）──
    if args.create_remote:
        token = args.token if args.token.startswith("glpat-") or len(args.token) >= 20 else ""
        ensure_gitlab_project_exists(
            args.gitlab_url, args.gitlab_project,
            token=token, username=args.username
        )

    # ── 4. 配置用户信息（如未配置）──
    user_name = run_git(["config", "user.name"], cwd=project_path, check=False, capture=True).stdout.strip()
    user_email = run_git(["config", "user.email"], cwd=project_path, check=False, capture=True).stdout.strip()
    if not user_name:
        run_git(["config", "user.name", args.username], cwd=project_path)
    if not user_email:
        run_git(["config", "user.email", f"{args.username}@git.sztv.com.cn"], cwd=project_path)

    # ── 5. 添加所有文件并提交 ──
    run_git(["add", "-A"], cwd=project_path)

    # 检查是否有需要提交的内容
    status_result = run_git(["status", "--porcelain"], cwd=project_path, capture=True)
    if not status_result.stdout.strip():
        print("[INFO] 没有新的变更，跳过提交")
    else:
        run_git(["commit", "-m", commit_msg], cwd=project_path)
        print(f"[OK] 已提交: {commit_msg}")

    # ── 6. 推送到远程 ──
    print(f"[INFO] 推送到 {safe_url} 分支 {args.branch}...")
    run_git(["push", "-u", "origin", args.branch], cwd=project_path)
    print(f"\n[SUCCESS] 代码已成功推送到 GitLab！")
    print(f"  仓库: {safe_url}")
    print(f"  分支: {args.branch}")


if __name__ == "__main__":
    # Force UTF-8 output encoding (Windows compatibility)
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    main()
