import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import WelcomeScreen, {
  WelcomeSuggestions,
  WelcomeComposerHeader,
} from "./WelcomeScreen";

vi.mock("../../Experts/components/iconForName", () => ({
  ExpertIcon: () => null,
}));

describe("task welcome interactions", () => {
  it("changes work scene without changing the execution mode or sending a task", () => {
    const onChange = vi.fn();
    render(<WelcomeScreen scene="office" onSceneChange={onChange} />);
    expect(
      screen.getByRole("button", { name: "chatWelcome.scenes.office" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(
      screen.getByRole("button", { name: "chatWelcome.scenes.code" }),
    );
    expect(onChange).toHaveBeenCalledWith("code");
  });

  it("prefills a category prompt for the selected scene", () => {
    const onPromptClick = vi.fn();
    const { rerender } = render(
      <WelcomeComposerHeader scene="office" onPromptClick={onPromptClick} />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "chatWelcome.categories.document.label",
      }),
    );
    expect(onPromptClick).toHaveBeenCalledWith(
      "chatWelcome.categories.document.prompt",
      { prefill: true },
    );
    rerender(
      <WelcomeComposerHeader scene="code" onPromptClick={onPromptClick} />,
    );
    expect(
      screen.queryByRole("button", {
        name: "chatWelcome.categories.document.label",
      }),
    ).toBeNull();
    expect(
      screen.getByRole("button", {
        name: "chatWelcome.categories.debug.label",
      }),
    ).toBeVisible();
  });

  it("prefills suggestions and lets the user reveal the remaining tasks", () => {
    const onPromptClick = vi.fn();
    const quickCards = Array.from({ length: 5 }, (_, i) => ({
      title: `Task ${i}`,
      description: `Description ${i}`,
      prompt: `Prompt ${i}`,
      color: "#888888",
    }));
    render(
      <WelcomeSuggestions
        quickCards={quickCards}
        onPromptClick={onPromptClick}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /^Task 4/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Task 0/ }));
    expect(onPromptClick).toHaveBeenCalledWith("Prompt 0", { prefill: true });
    fireEvent.click(
      screen.getByRole("button", { name: "chatWelcome.showMore" }),
    );
    expect(screen.getByRole("button", { name: /^Task 4/ })).toBeVisible();
  });
});
