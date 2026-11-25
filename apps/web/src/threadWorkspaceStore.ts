import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { parseScopedThreadKey } from "@t3tools/client-runtime/environment";

import { windowStateStorage } from "./appWindows";
import { resolveStorage } from "./lib/storage";
import { readThreadShell } from "./state/entities";
import {
  EMPTY_THREAD_WORKSPACE,
  activateThread,
  closeOtherThreadTabs,
  closeThreadSplit,
  closeThreadTab,
  deactivateThread,
  moveThreadTab,
  openThreadSplit,
  openThreadTab,
  sanitizeThreadWorkspace,
  type ThreadWorkspaceState,
} from "./threadWorkspace.logic";

/** The project of a thread tab, from the thread's shell; null until the shell has loaded. */
function threadTabGroup(key: string): string | null {
  const ref = parseScopedThreadKey(key);
  if (ref === null) return null;
  const shell = readThreadShell(ref);
  return shell === null ? null : `${shell.environmentId}:${shell.projectId}`;
}

interface ThreadWorkspaceStore extends ThreadWorkspaceState {
  activate: (key: string) => void;
  deactivate: () => void;
  openTab: (key: string) => void;
  /** Returns the tab to navigate to when the route thread closed, else null. */
  closeTab: (key: string) => string | null;
  closeOtherTabs: (key: string) => void;
  moveTab: (key: string, target: string, side: "before" | "after") => void;
  /** The tab being dragged in this window, if any. Not persisted. */
  draggingKey: string | null;
  setDraggingKey: (key: string | null) => void;
  openSplit: (key: string) => void;
  closeSplit: (key: string) => void;
}

const pick = ({ tabs, splits, activeKey }: ThreadWorkspaceState): ThreadWorkspaceState => ({
  tabs,
  splits,
  activeKey,
});

// Each window keeps its own tabs and splits: in sessionStorage, or keyed by the window's slot when
// the desktop app reopens its windows after a restart.
const WORKSPACE_STORAGE_KEY = "t3code:thread-workspace:v1";
const workspacePlace = windowStateStorage(WORKSPACE_STORAGE_KEY);
export const useThreadWorkspaceStore = create<ThreadWorkspaceStore>()(
  persist(
    (set, get) => ({
      ...EMPTY_THREAD_WORKSPACE,
      draggingKey: null,
      activate: (key) => set((state) => activateThread(pick(state), key, threadTabGroup)),
      deactivate: () => set((state) => deactivateThread(pick(state))),
      openTab: (key) => set((state) => openThreadTab(pick(state), key, threadTabGroup)),
      closeTab: (key) => {
        const result = closeThreadTab(pick(get()), key, threadTabGroup);
        set(result.state);
        return result.next;
      },
      closeOtherTabs: (key) =>
        set((state) => closeOtherThreadTabs(pick(state), key, threadTabGroup)),
      moveTab: (key, target, side) => set((state) => moveThreadTab(pick(state), key, target, side)),
      setDraggingKey: (key) => set({ draggingKey: key }),
      openSplit: (key) => set((state) => openThreadSplit(pick(state), key, threadTabGroup)),
      closeSplit: (key) => set((state) => closeThreadSplit(pick(state), key)),
    }),
    {
      name: workspacePlace?.key ?? WORKSPACE_STORAGE_KEY,
      storage: createJSONStorage(() => resolveStorage(workspacePlace?.storage)),
      version: 1,
      partialize: ({ tabs, splits }) => ({ tabs, splits }),
      merge: (persisted, current) => ({ ...current, ...sanitizeThreadWorkspace(persisted) }),
    },
  ),
);
