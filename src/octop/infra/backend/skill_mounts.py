"""Read-only runtime mounts for shared package and personal skill selections."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from deepagents.backends.filesystem import FilesystemBackend
from deepagents.backends.protocol import (
    BackendProtocol,
    DeleteResult,
    EditResult,
    FileUploadResponse,
    WriteResult,
)
from octop_harness.backends import MountedCompositeBackend
from octop_harness.backends.workspace import BackendWorkspace

PACKAGE_SKILL_MOUNT = "/__octop_packages__/"
USER_SKILL_MOUNT = "/__octop_library__/"


class ReadOnlySkillBackend(FilesystemBackend):
    """A virtual filesystem mount exposing package resources without mutations.

    FilesystemBackend's async mutations delegate to these synchronous methods.
    It does not implement the shell/execute protocol.
    """

    def write(self, file_path: str, content: str) -> WriteResult:
        return WriteResult(error="permission_denied")

    def edit(
        self, file_path: str, old_string: str, new_string: str, replace_all: bool = False
    ) -> EditResult:
        return EditResult(error="permission_denied")

    def delete(self, file_path: str) -> DeleteResult:
        return DeleteResult(error="permission_denied")

    def upload_files(self, files: list[tuple[str, bytes]]) -> list[FileUploadResponse]:
        return [FileUploadResponse(path=path, error="permission_denied") for path, _ in files]


class ReadOnlySkillMounts(MountedCompositeBackend):
    """Keep facade mkdir/delete/move from falling through a readonly mount."""

    def __init__(
        self,
        *,
        default: BackendProtocol,
        routes: dict[str, BackendProtocol],
        workspace_dir: Path,
        artifacts_root: str = "/",
    ) -> None:
        super().__init__(default=default, routes=routes, artifacts_root=artifacts_root)
        self._default_workspace = BackendWorkspace(default, workspace_dir)

    def _guard_mutation(self, path: str) -> None:
        if any(path == prefix.rstrip("/") or path.startswith(prefix) for prefix in self.routes):
            raise PermissionError("permission_denied")

    def _workspace_mutation_path(self, path: str) -> str:
        # BackendWorkspace's optional mutation protocol emits workspace-relative
        # slash keys for a host-mode backend, but backend keys in virtual mode.
        # Restore that public helper contract before delegating to its facade.
        return path if self.virtual_mode else path.lstrip("/")

    def mkdir_path(self, path: str) -> None:
        self._guard_mutation(path)
        self._default_workspace.mkdir(self._workspace_mutation_path(path))

    def delete_path(self, path: str) -> None:
        self._guard_mutation(path)
        self._default_workspace.delete(self._workspace_mutation_path(path))

    def move_path(self, source: str, destination: str) -> None:
        self._guard_mutation(source)
        self._guard_mutation(destination)
        self._default_workspace.move(
            self._workspace_mutation_path(source), self._workspace_mutation_path(destination)
        )


def with_readonly_skill_mounts(
    backend: Any,
    *,
    workspace_dir: Path,
    package_root: Path,
    user_cache_root: Path | None,
    system_files_path: str,
) -> ReadOnlySkillMounts:
    """Wrap an existing backend using the harness's public composite contract."""
    from octop_harness.backends import resolve_backend

    routes: dict[str, BackendProtocol] = {
        PACKAGE_SKILL_MOUNT: ReadOnlySkillBackend(root_dir=package_root, virtual_mode=True)
    }
    if user_cache_root is not None:
        routes[USER_SKILL_MOUNT] = ReadOnlySkillBackend(root_dir=user_cache_root, virtual_mode=True)
    resolved = resolve_backend(
        backend, workspace_dir=workspace_dir, system_files_path=system_files_path
    )
    return ReadOnlySkillMounts(
        default=resolved,
        routes=routes,
        workspace_dir=workspace_dir,
        artifacts_root=str(getattr(resolved, "artifacts_root", "/")),
    )
