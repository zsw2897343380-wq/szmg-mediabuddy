/**
 * ConnectorInstanceCard.test.tsx — shared connector card layout (issue #626).
 *
 * What we cover:
 *   - long titles render via Typography ellipsis (tooltip shows the full
 *     title once the text actually truncates; jsdom cannot measure that,
 *     so we assert the ``*-typography-ellipsis`` hook class instead)
 *   - the shared owner stays alongside the card content, separate from try
 *   - non-shared instances render no tag
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "antd";

import type { ConnectorInstance } from "../../../api/modules/connectors";
import { ConnectorInstanceCard } from "./ConnectorInstanceCard";

const LONG_TITLE = "一个非常非常长的共享连接器名称用于验证标题截断与悬停提示";

function makeInstance(
  overrides: Partial<ConnectorInstance> = {},
): ConnectorInstance {
  return {
    instance_id: "inst-1",
    kind: "custom-mcp",
    display_name: LONG_TITLE,
    description: null,
    status: "active",
    mcp_server_name: "shared-mcp",
    has_credentials: true,
    shared: true,
    owner_user_id: 42,
    owner_username: "admin",
    owner_display_name: "Admin",
    can_manage: false,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

function renderCard(instance: ConnectorInstance) {
  return render(
    <App>
      <ConnectorInstanceCard
        instance={instance}
        catalogEntry={undefined}
        onEdit={() => undefined}
        onChanged={() => undefined}
      />
    </App>,
  );
}

describe("<ConnectorInstanceCard />", () => {
  it("keeps long titles ellipsis-enabled so hover shows the full title", () => {
    renderCard(makeInstance());

    const title = screen.getByText(LONG_TITLE);
    expect(title.className).toContain("typography-ellipsis");
  });

  it("keeps the shared owner separate from the try action", () => {
    renderCard(makeInstance({ can_manage: true }));

    const title = screen.getByText(LONG_TITLE);
    const tag = screen.getByText("来自 Admin");
    const tryButton = screen.getByRole("button", {
      name: "connectorCenter.tryNamed",
    });
    expect(tag.parentElement).toContainElement(title);
    expect(tryButton).not.toContainElement(tag);
  });

  it("renders no tag for non-shared instances", () => {
    renderCard(makeInstance({ shared: false }));

    expect(screen.queryByText("来自 Admin")).not.toBeInTheDocument();
    expect(screen.getByText(LONG_TITLE).className).toContain(
      "typography-ellipsis",
    );
  });
});
