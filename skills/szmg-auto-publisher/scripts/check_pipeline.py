#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
check_pipeline.py
轮询检查 GitLab CI/CD Pipeline 状态，直到成功、失败或超时。

用法:
  python check_pipeline.py --gitlab-url https://git.sztv.com.cn
                            --gitlab-project group/repo-name
                            --username your_username
                            --token your_token
                            --tag testing-0.0.0.0.1
                            [--interval 30]
                            [--timeout 1800]

参数:
  --gitlab-url      GitLab 地址（默认：https://git.sztv.com.cn）
  --gitlab-project  GitLab 项目路径，如 group/repo
  --username        GitLab 用户名
  --token           GitLab Token（Personal Access Token）
  --tag             要检查的 Tag 名称
  --pipeline-id     直接指定 Pipeline ID（可选，与 --tag 二选一）
  --interval        轮询间隔秒数（默认：30）
  --timeout         最长等待秒数（默认：1800，即 30 分钟）

Pipeline 状态说明:
  pending   → 等待运行
  running   → 正在运行
  success   → 成功
  failed    → 失败
  canceled  → 已取消
  skipped   → 已跳过
  manual    → 等待手动触发
"""

import argparse
import sys
import time
import urllib.request
import urllib.parse
import urllib.error
import json
import base64
from datetime import datetime, timedelta


GITLAB_URL = "https://git.sztv.com.cn"

# 终止状态
TERMINAL_STATES = {"success", "failed", "canceled", "skipped"}
# 运行中状态
RUNNING_STATES = {"pending", "running", "created", "waiting_for_resource", "preparing"}


def make_headers(username: str, token: str) -> dict:
    """构造认证请求头，使用 Token 认证"""
    if token.startswith("glpat-") or len(token) >= 20:
        return {"PRIVATE-TOKEN": token, "Content-Type": "application/json"}
    else:
        creds = base64.b64encode(f"{username}:{token}".encode()).decode()
        return {"Authorization": f"Basic {creds}", "Content-Type": "application/json"}


def api_get(url: str, headers: dict):
    """发送 GET 请求，返回 (data, status_code)"""
    req = urllib.request.Request(url)
    for k, v in headers.items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data, resp.status
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        return {"error": body}, e.code
    except urllib.error.URLError as e:
        return {"error": str(e)}, 0


def get_pipelines_for_tag(gitlab_url: str, gitlab_project: str, tag: str, headers: dict):
    """获取指定 Tag 关联的 Pipeline 列表"""
    encoded_path = urllib.parse.quote(gitlab_project, safe="")
    url = f"{gitlab_url}/api/v4/projects/{encoded_path}/pipelines?ref={urllib.parse.quote(tag)}&order_by=id&sort=desc&per_page=5"
    data, status = api_get(url, headers)
    if status == 200 and isinstance(data, list):
        return data
    print(f"[WARN] 获取 Pipeline 列表失败 (HTTP {status}): {data.get('error', '') if isinstance(data, dict) else data}")
    return []


def get_pipeline_detail(gitlab_url: str, gitlab_project: str, pipeline_id: int, headers: dict):
    """获取 Pipeline 详情"""
    encoded_path = urllib.parse.quote(gitlab_project, safe="")
    url = f"{gitlab_url}/api/v4/projects/{encoded_path}/pipelines/{pipeline_id}"
    data, status = api_get(url, headers)
    if status == 200:
        return data
    return None


def get_pipeline_jobs(gitlab_url: str, gitlab_project: str, pipeline_id: int, headers: dict):
    """获取 Pipeline 下所有 Jobs"""
    encoded_path = urllib.parse.quote(gitlab_project, safe="")
    url = f"{gitlab_url}/api/v4/projects/{encoded_path}/pipelines/{pipeline_id}/jobs?per_page=50"
    data, status = api_get(url, headers)
    if status == 200 and isinstance(data, list):
        return data
    return []


def format_duration(seconds: float) -> str:
    if seconds < 60:
        return f"{int(seconds)}s"
    elif seconds < 3600:
        return f"{int(seconds//60)}m{int(seconds%60)}s"
    else:
        return f"{int(seconds//3600)}h{int((seconds%3600)//60)}m"


def print_pipeline_status(pipeline: dict, jobs: list, elapsed: float):
    """打印 Pipeline 状态摘要"""
    status = pipeline.get("status", "unknown")
    pipeline_id = pipeline.get("id", "?")
    web_url = pipeline.get("web_url", "")
    created_at = pipeline.get("created_at", "")
    finished_at = pipeline.get("finished_at", "")

    status_icon = {
        "success": "✅",
        "failed": "❌",
        "running": "⏳",
        "pending": "⌛",
        "canceled": "🚫",
        "skipped": "⏭️",
        "manual": "🔧",
        "created": "⌛",
    }.get(status, "❓")

    print(f"\n{'─'*60}")
    print(f"  Pipeline #{pipeline_id}  {status_icon} {status.upper()}")
    print(f"  已等待: {format_duration(elapsed)}")
    if web_url:
        print(f"  链接: {web_url}")

    if jobs:
        print(f"  Stages ({len(jobs)} jobs):")
        for job in jobs[:20]:  # 最多显示 20 个 job
            job_status = job.get("status", "unknown")
            job_icon = {
                "success": "✅", "failed": "❌", "running": "⏳",
                "pending": "⌛", "canceled": "🚫", "skipped": "⏭️", "manual": "🔧"
            }.get(job_status, "❓")
            job_name = job.get("name", "?")
            stage = job.get("stage", "?")
            duration = job.get("duration") or 0
            print(f"    {job_icon} [{stage}] {job_name} ({format_duration(duration)})")

    print(f"{'─'*60}")


def main():
    parser = argparse.ArgumentParser(description="检查 GitLab Pipeline 状态")
    parser.add_argument("--gitlab-url", default=GITLAB_URL, help="GitLab 地址")
    parser.add_argument("--gitlab-project", required=True, help="GitLab 项目路径，如 group/repo")
    parser.add_argument("--username", required=True, help="GitLab 用户名")
    parser.add_argument("--token", required=True, help="GitLab Token（Personal Access Token）")
    parser.add_argument("--tag", default="", help="要检查的 Tag 名称")
    parser.add_argument("--pipeline-id", type=int, default=0, help="直接指定 Pipeline ID")
    parser.add_argument("--interval", type=int, default=30, help="轮询间隔秒数（默认：30）")
    parser.add_argument("--timeout", type=int, default=1800, help="最长等待秒数（默认：1800）")
    args = parser.parse_args()

    if not args.tag and not args.pipeline_id:
        print("[ERROR] 必须指定 --tag 或 --pipeline-id", file=sys.stderr)
        sys.exit(1)

    headers = make_headers(args.username, args.token)
    start_time = time.time()

    safe_project = f"{args.gitlab_url}/{args.gitlab_project}"
    print(f"[INFO] 仓库: {safe_project}")
    if args.tag:
        print(f"[INFO] Tag:  {args.tag}")
    if args.pipeline_id:
        print(f"[INFO] Pipeline ID: {args.pipeline_id}")
    print(f"[INFO] 最长等待: {format_duration(args.timeout)}")
    print(f"[INFO] 轮询间隔: {args.interval}s")
    print(f"[INFO] 开始时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    pipeline_id = args.pipeline_id
    retry_count = 0
    max_retries = 5

    while True:
        elapsed = time.time() - start_time

        # 超时检查
        if elapsed > args.timeout:
            print(f"\n[TIMEOUT] 等待超过 {format_duration(args.timeout)}，Pipeline 仍未完成")
            print(f"[INFO] 请手动访问 GitLab 查看状态：{safe_project}")
            sys.exit(2)

        # ── 获取 Pipeline ID ──
        if not pipeline_id:
            print(f"\n[INFO] 查询 Tag '{args.tag}' 关联的 Pipeline...")
            pipelines = get_pipelines_for_tag(args.gitlab_url, args.gitlab_project, args.tag, headers)

            if not pipelines:
                retry_count += 1
                if retry_count > max_retries:
                    print(f"[ERROR] 多次查询未找到 Tag '{args.tag}' 对应的 Pipeline，请确认 Tag 已正确推送")
                    print(f"[INFO] 可能原因：1) CI/CD 配置不匹配 2) Tag 未触发 Pipeline 3) 权限不足")
                    sys.exit(1)
                print(f"[WARN] 未找到 Pipeline，{retry_count}/{max_retries} 次重试，{args.interval}s 后再试...")
                time.sleep(args.interval)
                continue
            else:
                retry_count = 0
                pipeline_id = pipelines[0]["id"]
                print(f"[OK] 找到 Pipeline ID: {pipeline_id}")

        # ── 获取 Pipeline 状态 ──
        pipeline = get_pipeline_detail(args.gitlab_url, args.gitlab_project, pipeline_id, headers)
        if not pipeline:
            print(f"[WARN] 获取 Pipeline #{pipeline_id} 详情失败，将重试...")
            time.sleep(args.interval)
            continue

        status = pipeline.get("status", "unknown")
        jobs = get_pipeline_jobs(args.gitlab_url, args.gitlab_project, pipeline_id, headers)

        print_pipeline_status(pipeline, jobs, elapsed)

        # ── 检查终止状态 ──
        if status == "success":
            print(f"\n[SUCCESS] Pipeline #{pipeline_id} 发布成功！🎉")
            print(f"  Tag:    {args.tag or '指定 Pipeline'}")
            print(f"  耗时:   {format_duration(elapsed)}")
            print(f"  链接:   {pipeline.get('web_url', safe_project)}")

            # ── 温馨提示（初次发布） ──
            if args.tag and (args.tag.startswith("prod-") or args.tag.startswith("testing-")):
                env_label = "正式环境" if args.tag.startswith("prod-") else "测试环境"
                print(f"\n{'='*60}")
                print(f"[温馨提示] {env_label}初次发布完成后，请联系云网安全系统工程师完成以下工作：")
                print(f"  1. 配置发布域名")
                print(f"  2. 进行域名解析操作")
                print(f"  3. 进行代码安全审计和漏洞扫描")
                print(f"{'='*60}")

            sys.exit(0)

        elif status == "failed":
            failed_jobs = [j for j in jobs if j.get("status") == "failed"]
            print(f"\n[FAILED] Pipeline #{pipeline_id} 发布失败！❌")
            if failed_jobs:
                print("  失败的 Jobs:")
                for j in failed_jobs:
                    print(f"    - [{j.get('stage','?')}] {j.get('name','?')}")
            print(f"  链接: {pipeline.get('web_url', safe_project)}")
            sys.exit(1)

        elif status == "canceled":
            print(f"\n[CANCELED] Pipeline #{pipeline_id} 已被取消")
            sys.exit(1)

        elif status == "skipped":
            print(f"\n[SKIPPED] Pipeline #{pipeline_id} 被跳过（可能没有匹配的 CI/CD 规则）")
            sys.exit(0)

        elif status == "manual":
            print(f"\n[MANUAL] Pipeline #{pipeline_id} 等待手动触发")
            print(f"  请访问 GitLab 手动触发: {pipeline.get('web_url', safe_project)}")
            sys.exit(0)

        elif status in RUNNING_STATES:
            next_check = datetime.now() + timedelta(seconds=args.interval)
            print(f"\n  Pipeline 运行中，下次检查: {next_check.strftime('%H:%M:%S')} (等待 {args.interval}s)")
            time.sleep(args.interval)
        else:
            print(f"\n[WARN] 未知状态: {status}，继续等待...")
            time.sleep(args.interval)


if __name__ == "__main__":
    # Force UTF-8 output encoding (Windows compatibility)
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    main()
