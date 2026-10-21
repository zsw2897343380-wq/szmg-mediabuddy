"""Module and operation grants, with compatibility for existing module grants.

Menus, HTTP adapters and live controls use the same catalog. Administrators
bypass permission checks; resource ownership is enforced independently.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Protocol


class PermissionUser(Protocol):
    @property
    def is_admin(self) -> bool: ...

    permissions: list[str]


@dataclass(frozen=True)
class PermissionDef:
    key: str
    category: str  # "settings" | "control" | "admin"
    label_zh: str
    label_en: str
    page: str = ""
    page_zh: str = ""
    page_en: str = ""
    extra_tabs: tuple[tuple[str, str], ...] = ()
    parent: str = ""


def _p(
    key: str,
    category: str,
    label_zh: str,
    label_en: str,
    *,
    page: str = "",
    page_zh: str = "",
    page_en: str = "",
    extra_tabs: tuple[tuple[str, str], ...] = (),
) -> PermissionDef:
    return PermissionDef(key, category, label_zh, label_en, page, page_zh, page_en, extra_tabs)


PERMISSIONS: dict[str, PermissionDef] = {
    # Ungrouped pages. Baseline modules stay default-on for new users.
    "experts": _p("experts", "nav", "专家", "Experts"),
    "chat": _p("chat", "nav", "新建任务", "New chat"),
    "assistants": _p("assistants", "nav", "媒体助理", "Media assistants"),
    "records": _p("records", "nav", "任务记录", "Chat history"),
    "tasks": _p("tasks", "nav", "定时任务", "Scheduled tasks"),
    "token_usage": _p("token_usage", "settings", "Token 统计", "Token usage"),
    # --- settings (nav.settings) — listed & default-selected for new users ---
    # Personalization tabs. ``channels`` is also a sidebar item; the rest are
    # tabs on the personalization page. ``agent_plugins`` is per-agent plugin
    # switches — distinct from the admin ``plugins`` catalog.
    "skills": _p(
        "skills",
        "settings",
        "技能",
        "Skills",
        page="personalization",
        page_zh="个性化",
        page_en="Personalization",
    ),
    "subagents": _p(
        "subagents",
        "settings",
        "子智能体",
        "Subagents",
        page="personalization",
        page_zh="个性化",
        page_en="Personalization",
    ),
    "tools": _p(
        "tools",
        "settings",
        "工具",
        "Tools",
        page="personalization",
        page_zh="个性化",
        page_en="Personalization",
    ),
    "agent_plugins": _p(
        "agent_plugins",
        "settings",
        "插件",
        "Plugins",
        page="personalization",
        page_zh="个性化",
        page_en="Personalization",
    ),
    "mbti": _p(
        "mbti",
        "settings",
        "MBTI",
        "MBTI",
        page="personalization",
        page_zh="个性化",
        page_en="Personalization",
    ),
    "memory": _p(
        "memory",
        "settings",
        "记忆",
        "Memory",
        page="personalization",
        page_zh="个性化",
        page_en="Personalization",
    ),
    "channels": _p("channels", "settings", "通道", "Channels"),
    "bridge": _p("bridge", "settings", "云端协同", "Cloud collaboration"),
    "connectors": _p("connectors", "settings", "连接器", "Connectors"),
    "skill_packages": _p("skill_packages", "settings", "技能包", "Skill Packages"),
    "knowledge_bases": _p("knowledge_bases", "settings", "知识库", "Knowledge Base"),
    # --- control (nav.control) — page/tab labels ---
    "terminal": _p("terminal", "control", "工作台/终端", "Workbench / Terminal"),
    "workspace": _p("workspace", "settings", "工作区文件", "Workspace files"),
    "browser": _p("browser", "control", "工作台/浏览器", "Workbench / Browser"),
    "desktop": _p("desktop", "control", "远程桌面", "Remote Desktop"),
    "mobile": _p("mobile", "control", "远程手机", "Remote Phone"),
    "acp": _p("acp", "control", "ACP 协作", "ACP collaboration"),
    "public_resources": _p("public_resources", "admin", "公共资源管理", "Public resources"),
    # --- admin: grouped by page, chip = tab title ---
    "users": _p(
        "users",
        "admin",
        "用户管理",
        "User management",
        page="users",
        page_zh="用户",
        page_en="Users",
    ),
    "sso": _p(
        "sso",
        "admin",
        "单点登录",
        "Single sign-on",
        page="users",
        page_zh="用户",
        page_en="Users",
    ),
    "providers": _p(
        "providers",
        "admin",
        "云端",
        "Cloud",
        page="models",
        page_zh="模型",
        page_en="Models",
    ),
    "ollama_models": _p(
        "ollama_models",
        "admin",
        "Ollama",
        "Ollama",
        page="models",
        page_zh="模型",
        page_en="Models",
    ),
    "onnx_models": _p(
        "onnx_models",
        "admin",
        "ONNX",
        "ONNX",
        page="models",
        page_zh="模型",
        page_en="Models",
    ),
    "storage_backends": _p("storage_backends", "admin", "存储", "Storage"),
    "plugins": _p(
        "plugins",
        "admin",
        "已安装",
        "Installed",
        page="plugins",
        page_zh="插件",
        page_en="Plugins",
    ),
    "security": _p(
        "security",
        "admin",
        "防护策略",
        "Policy",
        page="security",
        page_zh="安全防护",
        page_en="Security",
    ),
    "admin_console": _p(
        "admin_console",
        "admin",
        "审计日志",
        "Audit log",
        page="security",
        page_zh="安全防护",
        page_en="Security",
    ),
    "envs": _p(
        "envs",
        "admin",
        "环境变量",
        "Environment",
        page="advanced",
        page_zh="应用设置",
        page_en="App settings",
    ),
    "search": _p(
        "search",
        "admin",
        "搜索引擎",
        "Search engines",
        page="models",
        page_zh="模型",
        page_en="Models",
    ),
    "knowledge_settings": _p(
        "knowledge_settings",
        "admin",
        "知识库设置",
        "Knowledge-base settings",
        page="advanced",
        page_zh="应用设置",
        page_en="App settings",
    ),
    "voice": _p(
        "voice",
        "admin",
        "语音模型",
        "Voice models",
        page="models",
        page_zh="模型",
        page_en="Models",
    ),
    "observability": _p(
        "observability",
        "admin",
        "可观测",
        "Observability",
        page="advanced",
        page_zh="应用设置",
        page_en="App settings",
    ),
    "backup": _p(
        "backup",
        "admin",
        "备份与恢复",
        "Backup & restore",
        page="advanced",
        page_zh="应用设置",
        page_en="App settings",
    ),
    "tls": _p(
        "tls",
        "admin",
        "HTTPS",
        "HTTPS",
        page="advanced",
        page_zh="应用设置",
        page_en="App settings",
    ),
    "update": _p(
        "update",
        "admin",
        "应用更新",
        "Updates",
        page="advanced",
        page_zh="应用设置",
        page_en="App settings",
    ),
    "captcha": _p(
        "captcha",
        "admin",
        "登录验证码",
        "Login captcha",
        page="advanced",
        page_zh="应用设置",
        page_en="App settings",
    ),
}

# Bare module keys remain valid legacy grants. The picker exposes explicit
# operations so removing one operation cannot leave a hidden all-access grant.
PERMISSION_ACTIONS: dict[str, tuple[str, ...]] = {
    "chat": ("view", "use", "upload"),
    "assistants": ("view", "create", "edit", "delete", "use"),
    "records": ("view", "edit", "delete", "export"),
    "experts": ("view", "use", "create", "edit", "delete", "publish"),
    "tasks": ("view", "create", "edit", "delete", "use"),
    "token_usage": ("view", "all", "export"),
    "skills": ("view", "use", "create", "edit", "delete", "export"),
    "skill_packages": ("view", "use", "create", "edit", "delete", "export", "publish"),
    "connectors": ("view", "use", "create", "edit", "delete", "publish"),
    "knowledge_bases": ("view", "use", "create", "upload", "edit", "delete", "export", "publish"),
    "bridge": ("view", "use", "create", "edit", "delete"),
    "channels": ("view", "create", "edit", "delete", "use"),
    "users": ("view", "create", "edit", "delete", "reset_password", "permissions", "roles"),
    "acp": ("view", "use", "edit", "delete"),
    "public_resources": ("view", "experts", "skills", "connectors"),
    "terminal": ("view", "use"),
    "workspace": ("view", "edit", "upload", "delete", "export"),
    "browser": ("view", "use", "edit"),
    "desktop": ("view", "use", "edit"),
    "mobile": ("view", "use", "edit"),
    "backup": ("view", "create", "export", "restore", "delete", "edit"),
    "plugins": ("view", "create", "edit", "delete"),
    "security": ("view", "edit", "hitl", "filesystem", "pii", "tool_guard", "skill_scan"),
}
for _module in tuple(PERMISSIONS):
    PERMISSION_ACTIONS.setdefault(_module, ("view", "edit"))

_ACTION_LABELS = {
    "view": ("查看", "View"),
    "use": ("使用／执行", "Use / run"),
    "create": ("新增／导入", "Create / import"),
    "edit": ("编辑／配置", "Edit / configure"),
    "delete": ("删除", "Delete"),
    "upload": ("上传", "Upload"),
    "publish": ("共享／发布", "Share / publish"),
    "export": ("导出／下载", "Export / download"),
    "restore": ("恢复", "Restore"),
    "all": ("查看全平台", "View all users"),
    "reset_password": ("重置密码", "Reset passwords"),
    "permissions": ("分配权限", "Assign permissions"),
    "roles": ("管理角色", "Manage roles"),
    "experts": ("专家上架／下架", "Publish / withdraw experts"),
    "skills": ("技能上架／下架", "Publish / withdraw skills"),
    "connectors": ("连接器上架／下架", "Publish / withdraw connectors"),
    "hitl": ("人工审批策略", "Approval policy"),
    "filesystem": ("文件访问策略", "Filesystem policy"),
    "pii": ("敏感信息策略", "PII policy"),
    "tool_guard": ("命令防护策略", "Command guard policy"),
    "skill_scan": ("技能扫描策略", "Skill scan policy"),
}
for _module, _actions in PERMISSION_ACTIONS.items():
    _definition = PERMISSIONS[_module]
    for _action in _actions:
        _zh, _en = _ACTION_LABELS[_action]
        _key = f"{_module}.{_action}"
        PERMISSIONS[_key] = replace(
            _definition,
            key=_key,
            parent=_module,
            category="admin" if _key == "token_usage.all" else _definition.category,
            label_zh=f"{_definition.label_zh} · {_zh}",
            label_en=f"{_definition.label_en} · {_en}",
            extra_tabs=(),
        )

ALL_PERMISSION_KEYS: set[str] = set(PERMISSIONS)

# Business functions are available to every authenticated account. Keep legacy
# keys valid for stored roles/API clients, but do not expose them as grant knobs.
DEFAULT_OPEN_MODULES: frozenset[str] = frozenset(
    {
        "chat",
        "assistants",
        "records",
        "experts",
        "tasks",
        "skills",
        "skill_packages",
        "connectors",
        "knowledge_bases",
    }
)

# Pre-checked for new users. Stored explicitly — not granted unless written.
# ``nav`` pages used to be open to everyone, so they stay in the default set.
BASELINE_PERMISSIONS: set[str] = {
    key for key, p in PERMISSIONS.items() if not p.parent and p.category in {"settings", "nav"}
}


def user_has_permission(user: PermissionUser, key: str) -> bool:
    """Return True if ``user`` may access the module ``key``.

    Unknown keys are denied. ``admin`` bypasses everything.
    """
    if key not in PERMISSIONS:
        return False
    if user.is_admin:
        return True
    if key.split(".", 1)[0] in DEFAULT_OPEN_MODULES:
        return True
    held = set(user.permissions or [])
    definition = PERMISSIONS[key]
    if definition.parent:
        if key == "token_usage.all":
            return key in held
        return key in held or definition.parent in held
    return key in held or any(f"{key}.{action}" in held for action in PERMISSION_ACTIONS[key])


def expand_permissions(keys: list[str]) -> set[str]:
    """Expand legacy module grants into explicit operations for editing/assignment."""
    return {
        operation
        for key in keys
        for operation in (
            [
                f"{key}.{action}"
                for action in PERMISSION_ACTIONS[key]
                if f"{key}.{action}" != "token_usage.all"
            ]
            if key in PERMISSION_ACTIONS
            else [key]
        )
    }


def assert_permission(user: PermissionUser, key: str) -> None:
    """Enforce an operation inside a multi-operation adapter or service."""
    if not user_has_permission(user, key):
        from octop.infra.errors import ErrorCode, OctopError

        raise OctopError(ErrorCode.FORBIDDEN, "permission required", details={"permission": key})


def validate_permission_keys(keys: list[str]) -> list[str]:
    """Return a deduped list or raise ``ValueError`` on unknown keys."""
    unknown = sorted({k for k in keys if k not in PERMISSIONS})
    if unknown:
        raise ValueError(f"unknown permission keys: {unknown}")
    seen: set[str] = set()
    out: list[str] = []
    for k in keys:
        if k not in seen:
            seen.add(k)
            out.append(k)
    return out


def effective_permissions(user: PermissionUser) -> list[str]:
    """Permissions to expose on ``/auth/me`` / login (admin gets the full catalog)."""
    if user.is_admin:
        return sorted(ALL_PERMISSION_KEYS)
    return list(user.permissions or [])
