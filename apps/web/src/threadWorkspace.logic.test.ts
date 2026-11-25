import { describe, expect, it } from "vite-plus/test";

import {
  EMPTY_THREAD_WORKSPACE,
  MAX_SPLIT_PANES,
  activateThread,
  closeOtherThreadTabs,
  closeThreadTab,
  deactivateThread,
  moveThreadTab,
  openThreadSplit,
  openThreadTab,
  sanitizeThreadWorkspace,
  threadTabsInGroup,
  type ThreadWorkspaceState,
} from "./threadWorkspace.logic";

const workspace = (state: Partial<ThreadWorkspaceState>): ThreadWorkspaceState => ({
  ...EMPTY_THREAD_WORKSPACE,
  ...state,
});

describe("activateThread", () => {
  it.each([
    {
      name: "plain navigation reuses the current tab",
      state: workspace({ tabs: ["a", "b"], activeKey: "a" }),
      key: "c",
      expected: workspace({ tabs: ["c", "b"], activeKey: "c" }),
    },
    {
      name: "a thread with a tab keeps every tab",
      state: workspace({ tabs: ["a", "b"], activeKey: "a" }),
      key: "b",
      expected: workspace({ tabs: ["a", "b"], activeKey: "b" }),
    },
    {
      name: "the first thread after a draft gets its own tab",
      state: deactivateThread(workspace({ tabs: ["a"], activeKey: "a" })),
      key: "b",
      expected: workspace({ tabs: ["a", "b"], activeKey: "b" }),
    },
    {
      name: "a split pane trades places with the main pane",
      state: workspace({ tabs: ["a", "b"], splits: ["b"], activeKey: "a" }),
      key: "b",
      expected: workspace({ tabs: ["a", "b"], splits: ["a"], activeKey: "b" }),
    },
    {
      name: "a split thread without a tab keeps the main thread's tab",
      state: workspace({ tabs: ["a"], splits: ["b"], activeKey: "a" }),
      key: "b",
      expected: workspace({ tabs: ["a", "b"], splits: ["a"], activeKey: "b" }),
    },
    {
      name: "after a reload a split route thread leaves the split",
      state: workspace({ tabs: ["a", "b"], splits: ["b"], activeKey: null }),
      key: "b",
      expected: workspace({ tabs: ["a", "b"], splits: [], activeKey: "b" }),
    },
  ])("$name", ({ state, key, expected }) => {
    expect(activateThread(state, key)).toEqual(expected);
  });
});

describe("tabs", () => {
  it("opens a new tab right after the active one, once", () => {
    const state = workspace({ tabs: ["a", "b"], activeKey: "a" });
    const opened = openThreadTab(state, "c");
    expect(opened.tabs).toEqual(["a", "c", "b"]);
    expect(openThreadTab(opened, "c")).toBe(opened);
    // Navigating to the new tab keeps the tab it came from.
    expect(activateThread(opened, "c").tabs).toEqual(["a", "c", "b"]);
  });

  it.each([
    { key: "b", next: "c", tabs: ["a", "c"] },
    { key: "c", next: null, tabs: ["a", "b"] },
  ])("closing $key moves the route to $next", ({ key, next, tabs }) => {
    const state = workspace({ tabs: ["a", "b", "c"], splits: ["c"], activeKey: "b" });
    const closed = closeThreadTab(state, key);
    expect(closed.next).toBe(next);
    expect(closed.state.tabs).toEqual(tabs);
    expect(closed.state.splits).toEqual(key === "c" ? [] : ["c"]);
  });

  it("falls back to the left tab when the last tab closes", () => {
    const state = workspace({ tabs: ["a", "b"], activeKey: "b" });
    expect(closeThreadTab(state, "b").next).toBe("a");
  });

  it("closing other tabs also closes split panes", () => {
    const state = workspace({ tabs: ["a", "b", "c"], splits: ["c"], activeKey: "a" });
    expect(closeOtherThreadTabs(state, "b")).toEqual(
      workspace({ tabs: ["b"], splits: [], activeKey: "a" }),
    );
  });
});

describe("openThreadSplit", () => {
  it("ignores the main thread and keeps the newest panes past the limit", () => {
    let state = workspace({ tabs: ["main"], activeKey: "main" });
    expect(openThreadSplit(state, "main")).toBe(state);
    for (let index = 0; index <= MAX_SPLIT_PANES; index += 1) {
      state = openThreadSplit(state, `s${index}`);
    }
    expect(state.splits).toEqual(
      Array.from({ length: MAX_SPLIT_PANES }, (_, index) => `s${index + 1}`),
    );
    expect(state.tabs).toContain("s0");
  });
});

describe("sanitizeThreadWorkspace", () => {
  it("keeps unique string keys and leaves the route to pick the active thread", () => {
    expect(
      sanitizeThreadWorkspace({ tabs: ["a", "a", 3, ""], splits: ["b"], activeKey: "a" }),
    ).toEqual(workspace({ tabs: ["a"], splits: ["b"] }));
    expect(sanitizeThreadWorkspace(null)).toEqual(EMPTY_THREAD_WORKSPACE);
  });
});

describe("tabs by project", () => {
  // a* threads belong to project A, b* threads to project B.
  const groupOf = (key: string) => key.charAt(0).toUpperCase();

  it("plain navigation into another project keeps the current project's tab", () => {
    const state = workspace({ tabs: ["a1", "b1"], activeKey: "a1" });
    expect(activateThread(state, "b2", groupOf)).toEqual(
      workspace({ tabs: ["a1", "b1", "b2"], activeKey: "b2" }),
    );
    expect(activateThread(state, "a2", groupOf).tabs).toEqual(["a2", "b1"]);
  });

  it("a new tab joins the end of its project's tabs", () => {
    const state = workspace({ tabs: ["a1", "b1", "a2"], activeKey: "b1" });
    expect(openThreadTab(state, "a3", groupOf).tabs).toEqual(["a1", "b1", "a2", "a3"]);
    expect(threadTabsInGroup(["a1", "b1", "a2"], "A", groupOf)).toEqual(["a1", "a2"]);
  });

  it("closing the open tab moves to a tab of the same project", () => {
    const state = workspace({ tabs: ["a1", "a2", "b1"], activeKey: "a2" });
    expect(closeThreadTab(state, "a2", groupOf).next).toBe("a1");
    expect(
      closeThreadTab(workspace({ tabs: ["a1", "b1"], activeKey: "a1" }), "a1", groupOf).next,
    ).toBeNull();
  });

  it("closing other tabs leaves other projects alone", () => {
    const state = workspace({ tabs: ["a1", "b1", "a2"], splits: ["a2", "b1"], activeKey: "a1" });
    expect(closeOtherThreadTabs(state, "a1", groupOf)).toEqual(
      workspace({ tabs: ["a1", "b1"], splits: ["b1"], activeKey: "a1" }),
    );
  });
});

describe("moveThreadTab", () => {
  it.each([
    { key: "c", target: "a", side: "before" as const, tabs: ["c", "a", "b"] },
    { key: "a", target: "c", side: "after" as const, tabs: ["b", "c", "a"] },
    { key: "a", target: "b", side: "before" as const, tabs: ["a", "b", "c"] },
  ])("moves $key $side $target", ({ key, target, side, tabs }) => {
    const state = workspace({ tabs: ["a", "b", "c"] });
    const moved = moveThreadTab(state, key, target, side);
    expect(moved.tabs).toEqual(tabs);
    if (tabs.join() === state.tabs.join()) expect(moved).toBe(state);
  });
});
