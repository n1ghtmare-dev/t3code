import { describe, expect, it } from "vite-plus/test";

import {
  filterThreadsByMachine,
  machineMenuLabels,
  resolveMachineFilter,
  toggleMachineFilter,
} from "./sidebarMachineFilter.logic";

const known = new Set(["work", "home", "office-2"]);

describe("resolveMachineFilter", () => {
  it.each([
    { stored: [], expected: null },
    { stored: ["work", "gone"], expected: new Set(["work"]) },
    // Only forgotten machines left: list everything, never an empty sidebar.
    { stored: ["gone"], expected: null },
  ])("$stored", ({ stored, expected }) => {
    expect(resolveMachineFilter(stored, known)).toEqual(expected);
  });
});

describe("toggleMachineFilter", () => {
  it.each([
    { stored: [], id: "work", expected: ["work"] },
    { stored: ["work"], id: "home", expected: ["work", "home"] },
    { stored: ["work", "home"], id: "home", expected: ["work"] },
    { stored: ["work"], id: "work", expected: [] },
    { stored: ["work", "home"], id: "office-2", expected: [] },
    { stored: ["gone"], id: "work", expected: ["work"] },
  ])("$stored + $id", ({ stored, id, expected }) => {
    expect(toggleMachineFilter(stored, id, known)).toEqual(expected);
  });
});

describe("machineMenuLabels", () => {
  it("marks this device and tells machines with the same name apart", () => {
    const labels = machineMenuLabels(
      [
        ["abcdef123", "BSQL"],
        ["zyxwvu987", "BSQL"],
        ["home-1", "WIN-HOME"],
      ],
      "zyxwvu987",
      "(this computer)",
    );
    expect([...labels.values()]).toEqual([
      "BSQL · abcdef",
      "BSQL · zyxwvu (this computer)",
      "WIN-HOME",
    ]);
  });
});

describe("filterThreadsByMachine", () => {
  const threads = [
    { id: "a", environmentId: "work" },
    { id: "b", environmentId: "office-2" },
    { id: "c", environmentId: "home" },
  ];

  it("keeps chosen machines and the open thread", () => {
    const visible = filterThreadsByMachine(
      threads,
      new Set(["work", "home"]),
      (thread) => thread.id === "b",
    );
    expect(visible.map((thread) => thread.id)).toEqual(["a", "b", "c"]);
    expect(
      filterThreadsByMachine(threads, new Set(["home"]), () => false).map((thread) => thread.id),
    ).toEqual(["c"]);
  });

  it("returns the same list without a filter", () => {
    expect(filterThreadsByMachine(threads, null, () => false)).toBe(threads);
  });
});
