import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import WelcomeScreen, { WelcomeSuggestions } from "./WelcomeScreen";

vi.mock("../../Experts/components/iconForName", () => ({
  ExpertIcon: () => null,
}));

describe("task welcome interactions", () => {
  it("changes the real conversation mode from the home selector", () => {
    const onChange = vi.fn();
    render(
      <WelcomeScreen
        conversationMode="craft"
        onConversationModeChange={onChange}
      />,
    );
    expect(
      screen.getByRole("button", { name: "chat.conversationMode.craft" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(
      screen.getByRole("button", { name: "chat.conversationMode.plan" }),
    );
    expect(onChange).toHaveBeenCalledWith("plan");
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
