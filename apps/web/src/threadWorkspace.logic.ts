// Open threads in one window: a tab strip over the main pane, and split panes beside it.
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

function without(list: readonly string[], key: string): string[] {
  return list.filter((candidate) => candidate !== key);
}

function insertAfter(list: readonly string[], anchor: string | null, key: string): string[] {
  const index = anchor === null ? -1 : list.indexOf(anchor);
  if (index === -1) return [...list, key];
  return [...list.slice(0, index + 1), key, ...list.slice(index + 1)];
}

/**
 * The route moved to `key`. Plain navigation reuses the current tab, like a preview tab; a
 * thread that already has a tab keeps it. A split pane that becomes the route trades places
 * with the previous route thread.
 */
export function activateThread(state: ThreadWorkspaceState, key: string): ThreadWorkspaceState {
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
    // The previous thread stays reachable when it moved into a split pane.
    if (previousIndex !== -1 && !swapped) tabs[previousIndex] = key;
    else tabs = insertAfter(tabs, previous, key);
  }
  return { tabs, splits, activeKey: key };
}

/** A draft or an empty route is open; the next thread gets a tab of its own. */
export function deactivateThread(state: ThreadWorkspaceState): ThreadWorkspaceState {
  return state.activeKey === null ? state : { ...state, activeKey: null };
}

/** Adds a tab for `key` right after the active tab, without changing the route. */
export function openThreadTab(state: ThreadWorkspaceState, key: string): ThreadWorkspaceState {
  if (state.tabs.includes(key)) return state;
  return { ...state, tabs: insertAfter(state.tabs, state.activeKey, key) };
}

/**
 * Closes the tab for `key`. When it was the route thread, `next` is the tab to show instead:
 * the one to its right, else to its left, else null for an empty window.
 */
export function closeThreadTab(
  state: ThreadWorkspaceState,
  key: string,
): { readonly state: ThreadWorkspaceState; readonly next: string | null } {
  const index = state.tabs.indexOf(key);
  if (index === -1) return { state, next: null };
  const tabs = without(state.tabs, key);
  const next = key === state.activeKey ? (tabs[index] ?? tabs[index - 1] ?? null) : null;
  return { state: { ...state, tabs, splits: without(state.splits, key) }, next };
}

export function closeOtherThreadTabs(
  state: ThreadWorkspaceState,
  key: string,
): ThreadWorkspaceState {
  return { ...state, tabs: state.tabs.includes(key) ? [key] : [], splits: [] };
}

/** Shows `key` beside the main pane. The oldest split pane gives way past the limit. */
export function openThreadSplit(state: ThreadWorkspaceState, key: string): ThreadWorkspaceState {
  if (key === state.activeKey || state.splits.includes(key)) return state;
  const splits = [...state.splits, key].slice(-MAX_SPLIT_PANES);
  return { ...openThreadTab(state, key), splits };
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
