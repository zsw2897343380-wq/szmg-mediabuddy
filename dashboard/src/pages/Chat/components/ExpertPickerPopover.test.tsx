import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ExpertPickerPopover from "./ExpertPickerPopover";
import {
  HIDDEN_SHARED_EXPERTS_STORAGE_KEY,
  hiddenExpertsStorageKey,
} from "../utils/hiddenExpertsPrefs";

vi.mock("../../../hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ id: 1, username: "tester" }),
}));

const agents = [
  {
    agent_id: "own-1",
    name: "我的专家",
    is_shared: false,
    is_owner: true,
  },
  {
    agent_id: "shared-1",
    name: "共享专家甲",
    is_shared: true,
    is_owner: false,
  },
  {
    agent_id: "shared-2",
    name: "共享专家乙",
    is_shared: true,
    is_owner: false,
  },
];

describe("ExpertPickerPopover hide shared experts", () => {
  beforeEach(() => {
    localStorage.removeItem(HIDDEN_SHARED_EXPERTS_STORAGE_KEY);
    localStorage.removeItem(hiddenExpertsStorageKey(1));
  });

  it("can return to general chat without mentioning an expert", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onUseGeneralChat = vi.fn();
    const onNavigateAway = vi.fn();
    render(
      <MemoryRouter>
        <ExpertPickerPopover
          agents={agents}
          selectedAgentIds={[]}
          onSelect={onSelect}
          onUseGeneralChat={onUseGeneralChat}
          onNavigateAway={onNavigateAway}
        />
      </MemoryRouter>,
    );
    await user.click(
      screen.getByRole("button", { name: "chat.generalChat.label" }),
    );
    expect(onUseGeneralChat).toHaveBeenCalledOnce();
    expect(onNavigateAway).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("shows general chat as selected even when no specialists exist", () => {
    render(
      <MemoryRouter>
        <ExpertPickerPopover
          agents={[]}
          selectedAgentIds={[]}
          onSelect={vi.fn()}
          generalChat
          onUseGeneralChat={vi.fn()}
        />
      </MemoryRouter>,
    );
    const general = screen.getByRole("button", {
      name: "chat.generalChat.label",
    });
    expect(general).toHaveAttribute("aria-pressed", "true");
    expect(general).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "chat.expertPickerManage" }),
    ).toBeEnabled();
  });

  it("shows the current expert without allowing a self mention", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <MemoryRouter>
        <ExpertPickerPopover
          agents={agents}
          currentAgentId="own-1"
          selectedAgentIds={[]}
          onSelect={onSelect}
        />
      </MemoryRouter>,
    );

    const current = screen.getByRole("button", {
      name: /我的专家.*(?:Current expert|当前专家|chat\.expertPickerCurrent)/,
    });
    expect(current).toBeDisabled();
    await user.click(current);
    expect(onSelect).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /共享专家甲/ }));
    expect(onSelect).toHaveBeenCalledWith(agents[1]);
  });

  it("hides a shared expert and can restore via hidden list", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <MemoryRouter>
        <ExpertPickerPopover
          agents={agents}
          selectedAgentIds={[]}
          onSelect={onSelect}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("共享专家甲")).toBeInTheDocument();
    expect(screen.getByText("共享专家乙")).toBeInTheDocument();
    expect(screen.getByText("我的专家")).toBeInTheDocument();

    const hideButtons = screen.getAllByRole("button", {
      name: /chat\.expertHide|Hide shared expert|隐藏共享专家/,
    });
    expect(hideButtons.length).toBe(2);
    await user.click(hideButtons[0]);

    expect(screen.queryByText("共享专家甲")).not.toBeInTheDocument();
    expect(screen.getByText("共享专家乙")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: /chat\.expertPickerHidden|Hidden experts|已隐藏专家/,
      }),
    );
    expect(screen.getByText("共享专家甲")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: /chat\.expertUnhide|Show expert again|重新显示专家/,
      }),
    );
    // Last hidden expert restored → auto-return to the visible list.
    expect(screen.getByText("共享专家甲")).toBeInTheDocument();
    expect(screen.getByText("共享专家乙")).toBeInTheDocument();
    expect(screen.getByText("我的专家")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /chat\.expertPickerHidden|Hidden experts|已隐藏专家/,
      }),
    ).not.toBeInTheDocument();
  });
});
