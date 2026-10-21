"""Ready-to-use media business role templates, using explicit operation grants."""

from octop.infra.users.permissions import PERMISSION_ACTIONS


def _grants(**modules: str) -> set[str]:
    return {
        f"{module}.{action}"
        for module, actions in modules.items()
        for action in (PERMISSION_ACTIONS[module] if actions == "*" else actions.split())
    }


_READER = _grants(
    chat="view use upload",
    records="view edit delete export",
    assistants="view use",
    experts="view use",
    skills="view use",
    skill_packages="view use",
    connectors="view use",
    knowledge_bases="view use",
    workspace="view edit upload delete export",
    token_usage="view export",
)
_CREATOR = _READER | _grants(
    assistants="create edit delete",
    experts="create edit delete",
    skills="create edit delete export",
    skill_packages="create edit delete export",
    knowledge_bases="create upload edit delete export",
    tasks="*",
)
_OPERATOR = _CREATOR | _grants(
    experts="publish",
    skill_packages="publish",
    knowledge_bases="publish",
    connectors="create edit delete publish",
    public_resources="*",
    token_usage="all",
)
_MAINTAINER = _READER | _grants(
    providers="*",
    ollama_models="*",
    storage_backends="*",
    plugins="*",
    security="*",
    bridge="*",
    channels="*",
    terminal="*",
    browser="*",
    desktop="*",
    acp="*",
)

# Stable ids identify initial templates; administrators may edit these copies.
ROLE_PRESETS = (
    (
        "media_reader",
        "媒体使用者",
        "聊天、上传附件，使用专家、技能和知识库，管理自己的任务记录。",
        _READER,
    ),
    (
        "media_creator",
        "媒体创作者",
        "在媒体使用者基础上，创建和维护自己的专家、技能、知识库与定时任务。",
        _CREATOR,
    ),
    (
        "media_operator",
        "资源运营员",
        "在媒体创作者基础上，共享资源、管理公共资源上架下架，查看全平台用量。",
        _OPERATOR,
    ),
    (
        "platform_maintainer",
        "平台运维员",
        "管理模型、存储、插件、安全策略、通道及远端协作，使用终端和远程桌面。",
        _MAINTAINER,
    ),
)
