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
        name: "chatWelcome.categories.newsWriting.label",
      }),
    );
    expect(onPromptClick).toHaveBeenCalledWith(
      "chatWelcome.categories.newsWriting.prompt",
      { prefill: true },
    );
    rerender(
      <WelcomeComposerHeader scene="code" onPromptClick={onPromptClick} />,
    );
    expect(
      screen.queryByRole("button", {
        name: "chatWelcome.categories.newsWriting.label",
      }),
    ).toBeNull();
    expect(
      screen.getByRole("button", {
        name: "chatWelcome.categories.storyboard.label",
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

  it("uses media suggestions for general chat while retaining expert prompts", () => {
    const onPromptClick = vi.fn();
    const quickCards = [
      {
        title: "Expert task",
        description: "",
        prompt: "Expert prompt",
        color: "#888",
      },
    ];
    const { rerender } = render(
      <WelcomeSuggestions
        generalChat
        quickCards={quickCards}
        onPromptClick={onPromptClick}
      />,
    );
    expect(screen.queryByRole("button", { name: /^Expert task/ })).toBeNull();
    fireEvent.click(
      screen.getByRole("button", {
        name: /^chatWelcome\.categories\.topicPlanning\.label/,
      }),
    );
    expect(onPromptClick).toHaveBeenCalledWith(
      "chatWelcome.categories.topicPlanning.prompt",
      { prefill: true },
    );
    rerender(
      <WelcomeSuggestions
        quickCards={quickCards}
        onPromptClick={onPromptClick}
      />,
    );
    expect(screen.getByRole("button", { name: /^Expert task/ })).toBeVisible();
  });

  it("marks the selected task template and clears it when clicked again", () => {
    const onCategoryChange = vi.fn();
    const onPromptClick = vi.fn();
    const { rerender } = render(
      <WelcomeComposerHeader
        scene="office"
        selectedCategory="shortVideo"
        onCategoryChange={onCategoryChange}
        onPromptClick={onPromptClick}
      />,
    );
    const selected = screen.getByRole("button", {
      name: "chatWelcome.categories.shortVideo.label",
    });
    expect(selected).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(selected);
    expect(onCategoryChange).toHaveBeenLastCalledWith(null);
    expect(onPromptClick).toHaveBeenLastCalledWith("", { prefill: true });
    rerender(
      <WelcomeComposerHeader
        scene="office"
        selectedCategory={null}
        onCategoryChange={onCategoryChange}
        onPromptClick={onPromptClick}
      />,
    );
    fireEvent.click(selected);
    expect(onCategoryChange).toHaveBeenLastCalledWith("shortVideo");
    expect(onPromptClick).toHaveBeenLastCalledWith(
      "chatWelcome.categories.shortVideo.prompt",
      { prefill: true },
    );
  });

  it("replaces general suggestions with four prompts for the selected template", () => {
    const onPromptClick = vi.fn();
    const { rerender } = render(
      <WelcomeSuggestions
        scene="office"
        selectedCategory="shortVideo"
        quickCards={[
          {
            title: "General",
            description: "",
            prompt: "General",
            color: "#888",
          },
        ]}
        onPromptClick={onPromptClick}
      />,
    );
    expect(screen.queryByRole("button", { name: /^General/ })).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(4);
    fireEvent.click(
      screen.getByRole("button", {
        name: /^chatWelcome\.taskSuggestions\.shortVideo\.2/,
      }),
    );
    expect(onPromptClick).toHaveBeenCalledWith(
      "chatWelcome.taskSuggestions.shortVideo.2",
      { prefill: true },
    );
    rerender(
      <WelcomeSuggestions
        scene="office"
        selectedCategory="newsWriting"
        quickCards={[]}
        onPromptClick={onPromptClick}
      />,
    );
    expect(
      screen.queryByRole("button", {
        name: /^chatWelcome\.taskSuggestions\.shortVideo\.2/,
      }),
    ).toBeNull();
    expect(
      screen.getByRole("button", {
        name: /^chatWelcome\.taskSuggestions\.newsWriting\.1/,
      }),
    ).toBeVisible();
  });
});
