#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate_dockerfile.py
智能检测项目类型，按模式生成对应文件：

模式一（Type=manual）：生成 Dockerfile + ReadMe + .gitlab-ci.yml
模式二（Type=html）：仅生成 ReadMe + .gitlab-ci.yml，不生成 Dockerfile
模式三（Java 项目）：仅复制 .gitlab-ci.yml，不生成 ReadMe 和 Dockerfile
  - Gradle 项目：检查 gradle.properties 中 mainModule=编译包名（不含 .jar）
  - Maven  项目：检查 pom.xml 中 <artifactId>编译包名</artifactId>（不含 .jar）
  - 提示用户在 GitLab 项目设置 Java_version 环境变量（1.8/11/17/21）
  - 参考规范：https://git.sztv.com.cn/misc/Guideline.git

用法:
  python generate_dockerfile.py --project-path /path/to/project
                                 [--services service1[|service2|...]]
                                 [--sub-dirs subdir1[|subdir2|...]]
                                 [--ports 8080[|8081|...]]
                                 [--types manual[|html|...]]
                                 [--project-types java-maven|java-gradle|...]
                                 [--dry-run]

参数:
  --project-path   本地项目根目录（默认：当前目录）
  --services       服务名，多服务用 | 分隔（模式三 Java 项目无需此参数）
  --sub-dirs       各服务对应的子文件夹，多服务用 | 分隔，无子目录则留空用|占位（如 |worker）
  --ports          各服务端口，多服务用 | 分隔（默认：8080）
  --types          发布类型，多服务用 | 分隔（默认：manual）
  --project-types  强制指定项目类型，多服务用 | 分隔（可选，留空则自动检测）
  --dry-run        只输出内容不写文件
"""

import argparse
import os
import re
import sys
import json
import xml.etree.ElementTree as ET
from pathlib import Path


# ─────────────────────────────────────────────
# 私有镜像仓库（腾讯云 TCR）
# ─────────────────────────────────────────────
PRIVATE_REGISTRY = "szgbdst.tencentcloudcr.com/idc"

PRIVATE_IMAGES = {
    "nginx":   f"{PRIVATE_REGISTRY}/nginx:1.31.1.1",
    "jdk_jar": f"{PRIVATE_REGISTRY}/jdk-jar:v3.0.0.0.2",
    "golang":  f"{PRIVATE_REGISTRY}/golang:1.25.3-alpine3.22",
    "node18":  f"{PRIVATE_REGISTRY}/node:18.20.8-slim",
    "node20":  f"{PRIVATE_REGISTRY}/node:20.20.2-slim",
    "node22":  f"{PRIVATE_REGISTRY}/node:22.22.2-slim",
    "node24":  f"{PRIVATE_REGISTRY}/node:24.15.0-slim",
}

# node 项目默认使用 18-slim；可在生成后手动替换为 20/22/24
NODE_DEFAULT = PRIVATE_IMAGES["node18"]


# ─────────────────────────────────────────────
# Java 项目检测与校验
# ─────────────────────────────────────────────

def is_java_project(project_path: Path) -> str:
    """
    检测是否为 Java 项目。
    返回：'gradle' | 'maven' | None
    """
    files_lower = {f.name.lower() for f in project_path.iterdir() if f.is_file()}

    if "pom.xml" in files_lower:
        return "maven"
    gradlew_exists = (project_path / "gradlew").exists()
    if "build.gradle" in files_lower or "build.gradle.kts" in files_lower or gradlew_exists:
        return "gradle"
    return None


def check_gradle_main_module(project_path: Path) -> tuple:
    """
    检查 Gradle 项目 gradle.properties 中是否定义了 mainModule。
    返回 (ok: bool, module_name: str|None, error_msg: str|None)
    """
    props_file = project_path / "gradle.properties"
    if not props_file.exists():
        return False, None, "未找到 gradle.properties 文件"

    content = props_file.read_text(encoding="utf-8", errors="replace")
    # 匹配 mainModule=xxxx（忽略前后空格，支持 # 注释行）
    for line in content.splitlines():
        line_stripped = line.strip()
        if not line_stripped or line_stripped.startswith("#"):
            continue
        if line_stripped.startswith("mainModule"):
            # 去掉行内注释（# 后面的内容）
            pure = line_stripped.split("#")[0].strip()
            if "=" in pure:
                val = pure.split("=", 1)[1].strip()
                if val:
                    return True, val, None
                else:
                    return False, None, f"mainModule 已定义但值为空：{line_stripped}"
    return False, None, "gradle.properties 中未定义 mainModule，请添加 mainModule=编译包名（不含 .jar）"


def check_maven_artifact_id(project_path: Path) -> tuple:
    """
    检查 Maven 项目 pom.xml 中 project > artifactId 是否定义了编译包名。
    使用 xml.etree.ElementTree 精确解析 XML，只取 <project> 的直接子元素
    <artifactId>，不受 <parent>、<dependency>、<plugin> 等嵌套块影响。
    返回 (ok: bool, artifact_id: str|None, error_msg: str|None)
    """
    pom_file = project_path / "pom.xml"
    if not pom_file.exists():
        return False, None, "未找到 pom.xml 文件"

    try:
        tree = ET.parse(str(pom_file))
        root = tree.getroot()
    except ET.ParseError as e:
        return False, None, f"pom.xml 解析失败: {e}"

    # 遍历 <project> 的直接子元素，找到第一个 <artifactId>
    artifact_id = None
    for child in root:
        # 去除命名空间前缀，兼容有无 namespace 两种写法
        tag = child.tag.split("}", 1)[-1] if "}" in child.tag else child.tag
        if tag == "artifactId":
            artifact_id = (child.text or "").strip()
            break

    if artifact_id is None:
        return False, None, (
            "pom.xml 中 <project> 直接子元素未定义 <artifactId> 编译包名，"
            "请添加 <artifactId>编译包名</artifactId>（不含 .jar）"
        )
    if not artifact_id:
        return False, None, "pom.xml 中 <artifactId> 内容为空，请填写编译包名（不含 .jar）"
    if artifact_id.endswith(".jar"):
        return False, artifact_id, "<artifactId> 值不应包含 .jar 后缀，请去掉后缀"
    return True, artifact_id, None


# ─────────────────────────────────────────────
# 项目类型检测（非 Java 项目）
# ─────────────────────────────────────────────

def detect_project_type(project_path: Path) -> str:
    """根据目录内容判断项目类型（非 Java 项目）"""
    files = [f.name.lower() for f in project_path.iterdir() if f.is_file()]

    if "package.json" in files:
        pkg = json.loads((project_path / "package.json").read_text(encoding="utf-8"))
        deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
        if "next" in deps:
            return "nextjs"
        if "react" in deps or "react-dom" in deps:
            return "react"
        if "vue" in deps or "@vue/core" in deps:
            return "vue"
        if "express" in deps or "koa" in deps or "fastify" in deps:
            return "nodejs"
        return "nodejs"

    if "requirements.txt" in files or "pyproject.toml" in files or "setup.py" in files:
        return "python"

    if "go.mod" in files:
        return "golang"

    if any(f.endswith(".csproj") or f.endswith(".sln") for f in files):
        return "dotnet"

    if "cargo.toml" in files:
        return "rust"

    if "composer.json" in files:
        return "php"

    if "gemfile" in files:
        return "ruby"

    return "generic"


# 快捷变量，供下方模板直接使用
NODE_IMG    = NODE_DEFAULT
NGINX_IMG   = PRIVATE_IMAGES["nginx"]
GOLANG_IMG  = PRIVATE_IMAGES["golang"]
JDK_JAR_IMG = PRIVATE_IMAGES["jdk_jar"]

# ─────────────────────────────────────────────
# Dockerfile 模板
# ─────────────────────────────────────────────

DOCKERFILE_TEMPLATES = {
    "nodejs": lambda port: f"""\
FROM {NODE_IMG} AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
# 构建产物统一放到 build/ 目录
RUN mv build build 2>/dev/null || mv dist build 2>/dev/null || mv out build 2>/dev/null

FROM {NGINX_IMG}
COPY --from=builder /app/build /usr/share/nginx/html
EXPOSE {port}
CMD ["nginx", "-g", "daemon off;"]
""",

    "nextjs": lambda port: f"""\
FROM {NODE_IMG} AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM {NODE_IMG} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 需在 next.config.js 中配置 output: 'export'
RUN npm run build
# 静态导出产物在 out/ 目录，移至 build/
RUN mv out build

FROM {NGINX_IMG}
COPY --from=builder /app/build /usr/share/nginx/html
EXPOSE {port}
CMD ["nginx", "-g", "daemon off;"]
""",

    "react": lambda port: f"""\
FROM {NODE_IMG} AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
# 构建产物统一放到 build/ 目录
RUN mv build build 2>/dev/null || mv dist build 2>/dev/null

FROM {NGINX_IMG}
COPY --from=builder /app/build /usr/share/nginx/html
EXPOSE {port}
CMD ["nginx", "-g", "daemon off;"]
""",

    "vue": lambda port: f"""\
FROM {NODE_IMG} AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
# 构建产物统一放到 build/ 目录
RUN mv dist build 2>/dev/null || mv build build 2>/dev/null

FROM {NGINX_IMG}
COPY --from=builder /app/build /usr/share/nginx/html
EXPOSE {port}
CMD ["nginx", "-g", "daemon off;"]
""",

    "html": lambda port: f"""\
FROM {NGINX_IMG}
COPY build/ /usr/share/nginx/html/
EXPOSE {port}
CMD ["nginx", "-g", "daemon off;"]
""",

    "java-maven": lambda port: f"""\
FROM maven:3.9-eclipse-temurin-17 AS builder
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -B
COPY src ./src
RUN mvn package -DskipTests -B

FROM {JDK_JAR_IMG}
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar
EXPOSE {port}
ENTRYPOINT ["java", "-jar", "app.jar"]
""",

    "java-gradle": lambda port: f"""\
FROM gradle:8-jdk17 AS builder
WORKDIR /app
COPY build.gradle settings.gradle ./
COPY src ./src
RUN gradle bootJar --no-daemon

FROM {JDK_JAR_IMG}
WORKDIR /app
COPY --from=builder /app/build/libs/*.jar app.jar
EXPOSE {port}
ENTRYPOINT ["java", "-jar", "app.jar"]
""",

    "python": lambda port: f"""\
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE {port}
CMD ["python", "main.py"]
""",

    "golang": lambda port: f"""\
FROM {GOLANG_IMG} AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/server .

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/server .
EXPOSE {port}
CMD ["./server"]
""",

    "dotnet": lambda port: f"""\
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS builder
WORKDIR /app
COPY *.csproj ./
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o out

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=builder /app/out .
EXPOSE {port}
ENTRYPOINT ["dotnet", "app.dll"]
""",

    "rust": lambda port: f"""\
FROM rust:1.75-alpine AS builder
RUN apk add --no-cache musl-dev
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/target/release/app .
EXPOSE {port}
CMD ["./app"]
""",

    "php": lambda port: f"""\
FROM php:8.2-fpm-alpine
WORKDIR /var/www/html
COPY composer.json composer.lock ./
RUN curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer
RUN composer install --no-dev --optimize-autoloader
COPY . .
EXPOSE {port}
CMD ["php-fpm"]
""",

    "ruby": lambda port: f"""\
FROM ruby:3.2-alpine
RUN apk add --no-cache build-base nodejs yarn
WORKDIR /app
COPY Gemfile Gemfile.lock ./
RUN bundle install --without development test
COPY . .
EXPOSE {port}
CMD ["bundle", "exec", "rails", "server", "-b", "0.0.0.0"]
""",

    "generic": lambda port: f"""\
FROM alpine:latest
WORKDIR /app
COPY . .
EXPOSE {port}
# TODO: 请根据实际项目修改启动命令
CMD ["/bin/sh", "-c", "echo 'Please configure CMD'"]
""",
}

# ─────────────────────────────────────────────
# .gitlab-ci.yml 模板（与 ReadMe 同目录）
# 来源：用户桌面 .gitlab-ci.yml，原样复制，不修改
# ─────────────────────────────────────────────
GITLAB_CI_YML = """stages:
  - dev
  - testing
  - staging
  - prod

dev:
  stage: dev
  script:
    - /bin/cp ~/bin/deploy.sh .
    - /bin/sh deploy.sh install  dev  ${CI_COMMIT_TAG}  ${CUSTOM_TAG}
  only:
    - '/dev-.*$/'
  except:
    - branches
  tags:
    - dev-runner

testing:
  stage: testing
  script:
    - /bin/cp ~/bin/deploy.sh .
    - /bin/sh deploy.sh install  testing  ${CI_COMMIT_TAG}  ${CUSTOM_TAG}
  only:
    - '/testing-.*$/'
  except:
    - branches
  tags:
    - testing-runner

staging:
  stage: staging
  script:
    - /bin/cp ~/bin/deploy.sh .
    - /bin/sh deploy.sh install  staging  ${CI_COMMIT_TAG}  ${CUSTOM_TAG}
  only:
    - '/staging-.*$/'
  except:
    - branches
  tags:
    - staging-runner

prod:
  stage: prod
  script:
    - /bin/cp ~/bin/deploy.sh .
    - /bin/sh deploy.sh install  prod  ${CI_COMMIT_TAG}  ${CUSTOM_TAG}
  only:
    - '/prod-.*$/'
  except:
    - branches
  tags:
    - prod-runner
"""


def get_default_port(proj_type: str) -> int:
    """根据项目类型返回默认端口，前端静态 HTML 80，后端 8080"""
    frontend_types = {"nextjs", "react", "vue", "nodejs", "html"}
    return 80 if proj_type in frontend_types else 8080


def get_dockerfile_content(project_type: str, port: int) -> str:
    template = DOCKERFILE_TEMPLATES.get(project_type, DOCKERFILE_TEMPLATES["generic"])
    return template(port)


# ─────────────────────────────────────────────
# 文件写入
# ─────────────────────────────────────────────

def write_file(path: Path, content: str, dry_run: bool):
    if dry_run:
        print(f"\n{'='*60}")
        print(f"[DRY-RUN] 文件: {path}")
        print('='*60)
        print(content)
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        print(f"[OK] 已生成: {path}")


# ─────────────────────────────────────────────
# Java 模式处理
# ─────────────────────────────────────────────

def handle_java_mode(project_path: Path, dry_run: bool) -> int:
    """
    Java 项目模式：
    1. 仅复制 .gitlab-ci.yml 到项目根目录
    2. 不生成 ReadMe 和 Dockerfile
    3. 校验 Gradle mainModule 或 Maven <artifactId>
    4. 提示用户设置 Java_version 环境变量
    """
    java_type = is_java_project(project_path)
    if java_type is None:
        return 1  # 不是 Java 项目，交由主流程处理

    print(f"\n{'='*60}")
    print(f"[Java 模式] 检测到 Java 项目（{java_type.upper()}）")
    print(f"{'='*60}")

    # ── 校验配置文件 ──
    if java_type == "gradle":
        ok, module_name, err_msg = check_gradle_main_module(project_path)
        if not ok:
            print(f"\n[ERROR] Gradle 项目配置不完整：")
            print(f"  {err_msg}")
            print(f"\n  请在 gradle.properties 中添加：")
            print(f"    mainModule=<编译包名（不含 .jar，一般与 GitLab 项目名一致）>")
            print(f"\n  参考规范：https://git.sztv.com.cn/misc/Guideline.git")
            print(f"{'='*60}")
            return 1
        print(f"[OK] Gradle 项目：mainModule = {module_name}")

    elif java_type == "maven":
        ok, artifact_id_val, err_msg = check_maven_artifact_id(project_path)
        if not ok:
            print(f"\n[ERROR] Maven 项目配置不完整：")
            print(f"  {err_msg}")
            print(f"\n  请在 pom.xml 中添加（或修改）：")
            print(f"    <artifactId>编译包名（不含 .jar，一般与 GitLab 项目名一致）</artifactId>")
            print(f"\n  参考规范：https://git.sztv.com.cn/misc/Guideline.git")
            print(f"{'='*60}")
            return 1
        print(f"[OK] Maven 项目：<artifactId> = {artifact_id_val}")

    # ── 复制 .gitlab-ci.yml ──
    write_file(project_path / ".gitlab-ci.yml", GITLAB_CI_YML, dry_run)

    # ── 提示 Java_version ──
    print(f"\n{'='*60}")
    print(f"[重要提示] 请在 GitLab 项目设置中配置 Java_version 环境变量：")
    print(f"  路径：项目 → Settings → CI/CD → Variables")
    print(f"  变量名：Java_version（不设置则默认使用 Java 11）")
    print(f"  可选值：1.8 | 11（默认）| 17 | 21")
    print(f"  说明：该变量控制 Pipeline 使用的 JDK 版本；未设置时 Pipeline 默认使用 Java 11")
    print(f"\n[参考规范] https://git.sztv.com.cn/misc/Guideline.git")
    print(f"{'='*60}")

    print(f"\n[SUCCESS] Java 项目配置检查完成！")
    print(f"  配置文件已就绪，现在可以打 Tag 发布。")
    return 0


# ─────────────────────────────────────────────
# 主逻辑
# ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="生成 Dockerfile / ReadMe / .gitlab-ci.yml")
    parser.add_argument("--project-path",   default=".",        help="本地项目根目录")
    parser.add_argument("--services",      default="",         help="服务名，多服务用 | 分隔（Java 项目无需此参数）")
    parser.add_argument("--sub-dirs",     default="",         help="各服务对应子目录，多服务用 | 分隔，无则留空")
    parser.add_argument("--ports",         default="8080",     help="各服务端口，多服务用 | 分隔")
    parser.add_argument("--types",         default="manual",   help="发布类型，多服务用 | 分隔（manual / html）")
    parser.add_argument("--project-types", default="",         help="强制指定项目类型，多服务用 | 分隔（可选）")
    parser.add_argument("--dry-run",       action="store_true", help="只输出内容不写文件")
    args = parser.parse_args()

    project_path = Path(args.project_path).resolve()
    if not project_path.exists():
        print(f"[ERROR] 项目路径不存在: {project_path}", file=sys.stderr)
        sys.exit(1)

    # ── 优先检查是否为 Java 项目 ──
    java_type = is_java_project(project_path)
    if java_type:
        ret = handle_java_mode(project_path, args.dry_run)
        sys.exit(ret)

    # ── 非 Java 项目：需要 --services ──
    if not args.services.strip():
        print(f"[ERROR] 非 Java 项目必须指定 --services 参数", file=sys.stderr)
        sys.exit(1)

    services = [s.strip() for s in args.services.split("|") if s.strip()]
    sub_dirs       = [s.strip() for s in args.sub_dirs.split("|")]     if args.sub_dirs       else [""] * len(services)
    ports_raw      = [s.strip() for s in args.ports.split("|")]
    types_raw      = [s.strip() for s in args.types.split("|")]
    proj_types_raw = [s.strip() for s in args.project_types.split("|")] if args.project_types else [""] * len(services)

    # 补齐长度
    while len(sub_dirs) < len(services):
        sub_dirs.append("")
    while len(types_raw) < len(services):
        types_raw.append("manual")
    while len(proj_types_raw) < len(services):
        proj_types_raw.append("")

    is_multi = len(services) > 1

    print(f"[INFO] 项目路径: {project_path}")
    print(f"[INFO] 服务列表: {services}")
    print(f"[INFO] 多服务模式: {is_multi}")

    # ── 生成 ReadMe（存在且格式正确则跳过）──
    project_line = "|".join(services)
    type_line    = "|".join(types_raw[:len(services)])
    readme_content = f"Project = {project_line}\nType = {type_line}\n"
    readme_path = project_path / "ReadMe"

    def is_valid_readme(path: Path, expected: str) -> bool:
        if not path.exists():
            return False
        try:
            return path.read_text(encoding="utf-8").strip() == expected.strip()
        except Exception:
            return False

    if is_valid_readme(readme_path, readme_content):
        print(f"[SKIP] ReadMe 已存在且格式正确，跳过: {readme_path}")
    else:
        if readme_path.exists():
            print(f"[INFO] ReadMe 格式异常，重新生成: {readme_path}")
        write_file(readme_path, readme_content, args.dry_run)

    # ── 生成 .gitlab-ci.yml ──
    write_file(project_path / ".gitlab-ci.yml", GITLAB_CI_YML, args.dry_run)

    # ── 生成 Dockerfile(s)：Type=html 时跳过 ──
    dockerfile_generated = False
    for i, service in enumerate(services):
        service_type = types_raw[i] if i < len(types_raw) else "manual"
        if service_type == "html":
            print(f"[SKIP] [{service}] Type=html，跳过 Dockerfile 生成（本地构建产物已在 build/ 目录）")
            continue

        dockerfile_generated = True
        sub_dir      = sub_dirs[i]
        forced_type  = proj_types_raw[i]

        detect_path = project_path / sub_dir if sub_dir else project_path
        if sub_dir and not detect_path.exists():
            print(f"[WARN] 子目录不存在: {detect_path}，将使用项目根目录检测类型")
            detect_path = project_path

        proj_type = forced_type or detect_project_type(detect_path)
        print(f"[INFO] [{service}] 类型: {proj_type}" + (f"（强制）" if forced_type else f"（自动检测）"))

        port = int(ports_raw[i]) if i < len(ports_raw) and ports_raw[i].isdigit() else get_default_port(proj_type)
        print(f"[INFO] [{service}] 端口: {port}")

        if is_multi:
            if sub_dir:
                write_file(project_path / f"Dockerfile-{service}",
                           f"dockerfilepath={sub_dir}\n", args.dry_run)
                write_file(project_path / sub_dir / "Dockerfile",
                           get_dockerfile_content(proj_type, port), args.dry_run)
            else:
                write_file(project_path / f"Dockerfile-{service}",
                           get_dockerfile_content(proj_type, port), args.dry_run)
        else:
            if sub_dir:
                write_file(project_path / "Dockerfile",
                           f"dockerfilepath={sub_dir}\n", args.dry_run)
                write_file(project_path / sub_dir / "Dockerfile",
                           get_dockerfile_content(proj_type, port), args.dry_run)
            else:
                write_file(project_path / "Dockerfile",
                           get_dockerfile_content(proj_type, port), args.dry_run)

    if dockerfile_generated:
        print("\n[SUCCESS] Dockerfile、ReadMe 生成完成！")
    else:
        print("\n[SUCCESS] ReadMe 生成完成（Type=html，未生成 Dockerfile）！")


if __name__ == "__main__":
    # Force UTF-8 output encoding (Windows compatibility)
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    main()
