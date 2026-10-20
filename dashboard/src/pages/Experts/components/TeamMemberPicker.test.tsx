import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TeamMemberPicker, {
  mergeTeamPickerExperts,
  selectedRosterIds,
} from "./TeamMemberPicker";

const experts = [
  {
    agent_id: "a",
    name: "Alpha",
    state: "running",
    kind: "expert",
    is_owner: true,
  },
  {
    agent_id: "b",
    name: "Beta",
    state: "running",
    kind: "expert",
    is_owner: true,
  },
  {
    agent_id: "c",
    name: "Gamma",
    state: "running",
    kind: "expert",
    is_owner: true,
  },
];

describe("TeamMemberPicker", () => {
  it("hides closed experts and removes them from the submitted roster", () => {
    const candidates = [
      experts[0],
      { ...experts[1], state: "stopped" },
      { ...experts[2], state: "failed" },
    ];
    const { rerender } = render(
      <TeamMemberPicker value={["a", "b"]} experts={candidates} />,
    );
    expect(screen.getByRole("button", { name: /Alpha/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Beta|Gamma/ })).toBeNull();
    expect(selectedRosterIds(["a", "b", "c"], candidates)).toEqual(["a"]);
    rerender(
      <TeamMemberPicker
        value={["a", "b"]}
        experts={candidates.map((item) => ({ ...item, state: "stopped" }))}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Alpha|Beta|Gamma/ }),
    ).toBeNull();
  });

  it("does not restore a stopped member through cached edit-roster extras", () => {
    const candidates = mergeTeamPickerExperts(
      [{ ...experts[0], state: "stopped" }],
      [experts[0], { ...experts[1], state: "stopped" }],
    );
    expect(selectedRosterIds(["a", "b"], candidates)).toEqual([]);
  });

  it("does not offer the private general chat runtime as a specialist", () => {
    const general = {
      ...experts[0],
      agent_id: "main",
      config: { general_chat: true },
    };
    expect(selectedRosterIds(["main", "b"], [general, experts[1]])).toEqual([
      "b",
    ]);
  });

  it("adds and removes members like create", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <TeamMemberPicker
        value={["a", "b"]}
        onChange={onChange}
        experts={experts}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Gamma/ }));
    expect(onChange).toHaveBeenCalledWith(["a", "b", "c"]);

    fireEvent.click(screen.getByRole("button", { name: /Alpha/ }));
    expect(onChange).toHaveBeenCalledWith(["b"]);

    rerender(
      <TeamMemberPicker
        value={["b", "missing"]}
        onChange={onChange}
        experts={experts}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Gamma/ }));
    expect(onChange).toHaveBeenLastCalledWith(["b", "c"]);
  });

  it("treats selection as one full roster, dropping unusable ids", () => {
    expect(
      selectedRosterIds(
        ["a", "missing", "other-team", "b", "a"],
        [
          ...experts,
          {
            agent_id: "other-team",
            name: "Nested",
            kind: "team",
            is_owner: true,
          },
        ],
      ),
    ).toEqual(["a", "b"]);
  });

  it("does not pick peer (cloud-collab) experts for a local team", () => {
    expect(
      selectedRosterIds(
        ["a", "bridge:c1:x", "b"],
        [
          ...experts,
          {
            agent_id: "bridge:c1:x",
            name: "Peer",
            kind: "expert",
            is_owner: true,
            bridge: true,
          },
        ],
      ),
    ).toEqual(["a", "b"]);
  });

  it("keeps the first-load order when toggling selection", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <TeamMemberPicker value={["c"]} onChange={onChange} experts={experts} />,
    );
    const names = () =>
      screen.getAllByRole("button").map((el) => el.textContent ?? "");
    expect(names()[0]).toMatch(/Gamma/);

    fireEvent.click(screen.getByRole("button", { name: /Alpha/ }));
    expect(onChange).toHaveBeenCalledWith(["c", "a"]);
    rerender(
      <TeamMemberPicker
        value={["c", "a"]}
        onChange={onChange}
        experts={experts}
      />,
    );
    expect(names()[0]).toMatch(/Gamma/);
  });
});
