import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GeneratingIndicator from "./GeneratingIndicator";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: string | Record<string, unknown>) => {
      if (typeof options === "string") return options;
      return String(options?.defaultValue || key).replace(
        /{{(\w+)}}/g,
        (_, name: string) => String(options?.[name] ?? ""),
      );
    },
  }),
}));

vi.mock("../../../hooks/useElapsedSeconds", () => ({
  useElapsedSince: () => 3,
}));

describe("GeneratingIndicator speaker labels", () => {
  it("hides the default expert name in solo conversations", () => {
    render(<GeneratingIndicator speakerNames={["小通 · 通用助手"]} />);
    expect(screen.getByRole("status")).toHaveTextContent("正在回答");
    expect(screen.queryByText(/小通/)).not.toBeInTheDocument();
  });

  it("keeps elapsed feedback without the solo expert name", () => {
    render(
      <GeneratingIndicator
        speakerNames={["小通 · 通用助手"]}
        startedAt={1000}
        showElapsed
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("正在回答 · 3s");
  });

  it("names multiple experts and the final remaining expert", () => {
    const { rerender } = render(
      <GeneratingIndicator
        speakerNames={["临床助手", "护理助手"]}
        showSpeakerNames
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "临床助手、护理助手 正在回答",
    );
    rerender(
      <GeneratingIndicator
        speakerNames={["护理助手"]}
        showSpeakerNames
        membersOnly
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("护理助手 正在回答");
  });

  it("does not identify a solo late reply as a team member", () => {
    render(<GeneratingIndicator speakerNames={["小通"]} membersOnly />);
    expect(screen.getByRole("status")).toHaveTextContent("正在回答");
    expect(screen.queryByText(/小通|成员/)).not.toBeInTheDocument();
  });
});
