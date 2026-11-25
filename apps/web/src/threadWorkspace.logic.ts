// Open threads in one window: a tab strip of the open project's threads over the main pane,
// and split panes beside it.
// Keys are scoped thread keys. The route thread is always the main pane; a split pane
// never shows the route thread.

export const MAX_SPLIT_PANES = 3;

export interface ThreadWorkspaceState {
  /** Tab order. Holds the route thread once a server thread is open. */
  readonly tabs: readonly string[];
  /** Threads shown beside the main pane, left to right. */
  readonly splits: readonly string[];
  /** The route thread, or null while a draft or no thread is open. */
  readonly activeKey: string | null;
}

export const EMPTY_THREAD_WORKSPACE: ThreadWorkspaceState = {
  tabs: [],
  splits: [],
  activeKey: null,
};

/**
 * The project a thread belongs to, as a stable string, or null while it is unknown. Tabs are
 * grouped by project: the strip shows only the open project's tabs, and plain navigation reuses
 * a tab only within one project.
 */
type ThreadTabGroupOf = (key: string) => string | null;

const NO_GROUPS: ThreadTabGroupOf = () => null;

function without(list: readonly string[], key: string): string[] {
  return list.filter((candidate) => candidate !== key);
}

function insertAfter(list: readonly string[], anchor: string | null, key: string): string[] {
  const index = anchor === null ? -1 : list.indexOf(anchor);
  if (index === -1) return [...list, key];
  return [...list.slice(0, index + 1), key, ...list.slice(index + 1)];
}

function sameGroup(groupOf: ThreadTabGroupOf, left: string, right: string): boolean {
  return groupOf(left) === groupOf(right);
}

/** Right after `anchor` when it shares the project, else after the project's last tab. */
function insertInGroup(
  list: readonly string[],
  anchor: string | null,
  key: string,
  groupOf: ThreadTabGroupOf,
): string[] {
  if (anchor !== null && list.includes(anchor) && sameGroup(groupOf, anchor, key)) {
    return insertAfter(list, anchor, key);
  }
  const lastOfGroup = list.findLast((candidate) => sameGroup(groupOf, candidate, key));
  return insertAfter(list, lastOfGroup ?? null, key);
}

/** The tabs the strip shows for one project, in order. */
export function threadTabsInGroup(
  tabs: readonly string[],
  group: string | null,
  groupOf: ThreadTabGroupOf,
): string[] {
  return tabs.filter((key) => groupOf(key) === group);
}

/**
 * The route moved to `key`. Plain navigation reuses the current tab, like a preview tab, when
 * both threads share a project; a thread that already has a tab keeps it. A split pane that
 * becomes the route trades places with the previous route thread.
 */
export function activateThread(
  state: ThreadWorkspaceState,
  key: string,
  groupOf: ThreadTabGroupOf = NO_GROUPS,
): ThreadWorkspaceState {
  const previous = state.activeKey;
  if (previous === key) {
    return state.tabs.includes(key) ? state : { ...state, tabs: [...state.tabs, key] };
  }
  const splitIndex = state.splits.indexOf(key);
  const swapped = splitIndex !== -1 && previous !== null;
  const splits =
    splitIndex === -1
      ? state.splits
      : swapped
        ? state.splits.map((candidate) => (candidate === key ? previous : candidate))
        : without(state.splits, key);
  let tabs: string[] = [...state.tabs];
  if (!tabs.includes(key)) {
    const previousIndex = previous === null ? -1 : tabs.indexOf(previous);
    // The previous thread stays reachable when it moved into a split pane, and another
    // project's tab is never replaced.
    if (
      previousIndex !== -1 &&
      !swapped &&
      previous !== null &&
      sameGroup(groupOf, previous, key)
    ) {
      tabs[previousIndex] = key;
    } else {
      tabs = insertInGroup(tabs, previous, key, groupOf);
    }
  }
  return { tabs, splits, activeKey: key };
}

/** A draft or an empty route is open; the next thread gets a tab of its own. */
export function deactivateThread(state: ThreadWorkspaceState): ThreadWorkspaceState {
  return state.activeKey === null ? state : { ...state, activeKey: null };
}

/** Adds a tab for `key` right after the active tab of its project, without changing the route. */
export function openThreadTab(
  state: ThreadWorkspaceState,
  key: string,
  groupOf: ThreadTabGroupOf = NO_GROUPS,
): ThreadWorkspaceState {
  if (state.tabs.includes(key)) return state;
  return { ...state, tabs: insertInGroup(state.tabs, state.activeKey, key, groupOf) };
}

/**
 * Closes the tab for `key`. When it was the route thread, `next` is the tab to show instead:
 * the next one of the same project to its right, else to its left, else null.
 */
export function closeThreadTab(
  state: ThreadWorkspaceState,
  key: string,
  groupOf: ThreadTabGroupOf = NO_GROUPS,
): { readonly state: ThreadWorkspaceState; readonly next: string | null } {
  if (!state.tabs.includes(key)) return { state, next: null };
  const siblings = threadTabsInGroup(state.tabs, groupOf(key), groupOf);
  const index = siblings.indexOf(key);
  const remaining = without(siblings, key);
  const next = key === state.activeKey ? (remaining[index] ?? remaining[index - 1] ?? null) : null;
  return {
    state: { ...state, tabs: without(state.tabs, key), splits: without(state.splits, key) },
    next,
  };
}

/** Closes the other tabs of the same project, and their split panes. */
export function closeOtherThreadTabs(
  state: ThreadWorkspaceState,
  key: string,
  groupOf: ThreadTabGroupOf = NO_GROUPS,
): ThreadWorkspaceState {
  const group = groupOf(key);
  const tabs = state.tabs.filter((candidate) => candidate === key || groupOf(candidate) !== group);
  return { ...state, tabs, splits: state.splits.filter((candidate) => tabs.includes(candidate)) };
}

/** Moves the tab `key` next to `target`, as dragging a tab does. */
export function moveThreadTab(
  state: ThreadWorkspaceState,
  key: string,
  target: string,
  side: "before" | "after",
): ThreadWorkspaceState {
  if (key === target || !state.tabs.includes(key) || !state.tabs.includes(target)) return state;
  const rest = without(state.tabs, key);
  const index = rest.indexOf(target) + (side === "after" ? 1 : 0);
  const tabs = [...rest.slice(0, index), key, ...rest.slice(index)];
  return tabs.every((candidate, position) => candidate === state.tabs[position])
    ? state
    : { ...state, tabs };
}

/** Shows `key` beside the main pane. The oldest split pane gives way past the limit. */
export function openThreadSplit(
  state: ThreadWorkspaceState,
  key: string,
  groupOf: ThreadTabGroupOf = NO_GROUPS,
): ThreadWorkspaceState {
  if (key === state.activeKey || state.splits.includes(key)) return state;
  const splits = [...state.splits, key].slice(-MAX_SPLIT_PANES);
  return { ...openThreadTab(state, key, groupOf), splits };
}

export function closeThreadSplit(state: ThreadWorkspaceState, key: string): ThreadWorkspaceState {
  return state.splits.includes(key) ? { ...state, splits: without(state.splits, key) } : state;
}

export function sanitizeThreadWorkspace(value: unknown): ThreadWorkspaceState {
  if (typeof value !== "object" || value === null) return EMPTY_THREAD_WORKSPACE;
  const record = value as Record<string, unknown>;
  const keys = (list: unknown) =>
    Array.isArray(list)
      ? [...new Set(list.filter((key): key is string => typeof key === "string" && key !== ""))]
      : [];
  const tabs = keys(record.tabs);
  // The route decides the active thread again after a reload.
  return { tabs, splits: keys(record.splits).slice(-MAX_SPLIT_PANES), activeKey: null };
}
