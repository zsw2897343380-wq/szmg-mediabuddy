import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketExpert } from "../../../api/modules/expertMarket";
import WorkBuddyExpertCenter from "./WorkBuddyExpertCenter";
import type { OctopAgent } from "../../../context/AgentContext";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  request: vi.fn(),
  setActiveAgent: vi.fn(),
}));
vi.mock("../../../api/modules/expertMarket", () => ({
  expertMarketApi: { list: mocks.list, get: mocks.get },
}));
vi.mock("../../../api/request", () => ({ request: mocks.request }));
vi.mock("../../../context/AgentContext", () => ({
  useAgent: () => ({ setActiveAgent: mocks.setActiveAgent }),
}));
vi.mock("react-i18next", () => {
  const t = (key: string) => key;
  return { useTranslation: () => ({ t }) };
});
vi.mock("../../../components/Markdown/LazyMarkdown", () => ({
  default: ({ content }: { content: string }) => <p>{content}</p>,
}));
vi.mock("./iconForName", () => ({ ExpertIcon: () => <span /> }));

const expert: MarketExpert = {
  id: "skillhub:reporter",
  slug: "reporter",
  label: { zh: "采访专家" },
  description: { zh: "整理采访记录" },
  scene: "media",
  quick_prompts: [
    {
      title: { zh: "拟采访提纲" },
      description: {},
      prompt: { zh: "为我拟定采访提纲" },
    },
  ],
};
const defaultProps = {
  experts: [],
  publishedExperts: [],
  agents: [],
  loading: false,
  lang: "zh" as const,
  onManage: vi.fn(),
  onCreate: vi.fn(),
  teamsContent: <p>Teams management</p>,
};
function Location() {
  const location = useLocation();
  return (
    <output data-testid="route">
      {JSON.stringify({ path: location.pathname, state: location.state })}
    </output>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue({ items: [expert], scenes: ["media"] });
  mocks.get.mockResolvedValue(expert);
});

describe("WorkBuddy expert center", () => {
  it("opens real details and routes a quick question to the existing installed expert", async () => {
    render(
      <MemoryRouter>
        <WorkBuddyExpertCenter
          {...defaultProps}
          agents={[
            {
              agent_id: "own-reporter",
              template_name: expert.id,
              config: {},
            } as OctopAgent,
          ]}
        />
        <Location />
      </MemoryRouter>,
    );
    const cards = await screen.findAllByRole("button", { name: /采访专家/ });
    fireEvent.click(cards[cards.length - 1]!);
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith("reporter"));
    fireEvent.click(
      await within(dialog).findByRole("button", { name: "拟采访提纲" }),
    );
    expect(mocks.setActiveAgent).toHaveBeenCalledWith("own-reporter");
    expect(screen.getByTestId("route").textContent).toContain(
      '"path":"/chat/own-reporter"',
    );
    expect(screen.getByTestId("route").textContent).toContain(
      '"prefillInput":"为我拟定采访提纲"',
    );
    expect(defaultProps.onCreate).not.toHaveBeenCalled();
  });

  it("ignores a detail request that finishes after its dialog is dismissed", async () => {
    let resolve!: (value: MarketExpert) => void;
    mocks.get.mockImplementation(
      () =>
        new Promise<MarketExpert>((done) => {
          resolve = done;
        }),
    );
    render(
      <MemoryRouter>
        <WorkBuddyExpertCenter {...defaultProps} />
      </MemoryRouter>,
    );
    const cards = await screen.findAllByRole("button", { name: /采访专家/ });
    fireEvent.click(cards[cards.length - 1]!);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await act(async () => {
      resolve({ ...expert, label: { zh: "过期详情" } });
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByText("过期详情")).toBeNull();
  });

  it("filters the real catalog and preserves expert team management", async () => {
    render(
      <MemoryRouter>
        <WorkBuddyExpertCenter {...defaultProps} />
      </MemoryRouter>,
    );
    await screen.findAllByRole("button", { name: /采访专家/ });
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "不存在" },
    });
    expect(screen.getByText("experts.searchEmpty")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("tab", { name: "experts.workbuddy.teams" }),
    );
    expect(screen.getByText("Teams management")).toBeTruthy();
  });
});
