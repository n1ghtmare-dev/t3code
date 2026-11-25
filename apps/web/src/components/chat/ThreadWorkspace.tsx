import {
  parseScopedThreadKey,
  scopeThreadRef,
  scopedThreadKey,
} from "@t3tools/client-runtime/environment";
import { settlePromise } from "@t3tools/client-runtime/state/runtime";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useRouter } from "@tanstack/react-router";
import { useGT } from "gt-react";
import { ArrowLeftRightIcon, Columns2Icon, MessageSquareIcon, XIcon } from "lucide-react";
import {
  useEffect,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { openAppWindow } from "../../appWindows";
import { ComposerHandleContext } from "../../composerHandleContext";
import { contextMenuSourceOf } from "../../contextMenuSource";
import type { ToolCallDiffTarget } from "../../diffPanelStore";
import { useDiffPanelStore } from "../../diffPanelStore";
import type { SideChatParentPanel } from "../../lib/sideChatPane";
import { cn } from "../../lib/utils";
import { readLocalApi } from "../../localApi";
import { useRightPanelStore } from "../../rightPanelStore";
import { useQuietThreadShell, useQuietThreadShells } from "../../state/entities";
import { buildThreadRouteParams } from "../../threadRoutes";
import { threadTabsInGroup } from "../../threadWorkspace.logic";
import { useThreadWorkspaceStore } from "../../threadWorkspaceStore";
import ChatView from "../ChatView";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { BackgroundThreadContext } from "./backgroundThread";

function useThreadNavigation() {
  const router = useRouter();
  const hrefOf = (ref: ScopedThreadRef) =>
    router.history.createHref(
      router.buildLocation({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) })
        .href,
    );
  return {
    open: (ref: ScopedThreadRef) =>
      void router.navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(ref),
      }),
    openHome: () => void router.navigate({ to: "/" }),
    openWindow: (ref: ScopedThreadRef) => openAppWindow(hrefOf(ref)),
  };
}

type TabMenuId = "split" | "unsplit" | "new-window" | "close" | "close-others";

// Tabs drag with their own type, so the composer, the file drop and the sidebar ignore them.
const THREAD_TAB_DRAG_TYPE = "application/x-t3code-thread-tab";

function isThreadTabDrag(event: ReactDragEvent): boolean {
  return event.dataTransfer.types.includes(THREAD_TAB_DRAG_TYPE);
}

/** A tab dropped beyond the window's edges moves the thread to a window of its own. */
function droppedOutsideWindow(event: ReactDragEvent): boolean {
  if (event.dataTransfer.dropEffect !== "none") return false;
  const { screenX, screenY } = event;
  // Some platforms report no position for a cancelled drag.
  if (screenX === 0 && screenY === 0) return false;
  return (
    screenX < window.screenX ||
    screenY < window.screenY ||
    screenX > window.screenX + window.outerWidth ||
    screenY > window.screenY + window.outerHeight
  );
}

type ThreadNavigation = ReturnType<typeof useThreadNavigation>;

function closeTabAndFollow(threadKey: string, wasActive: boolean, navigation: ThreadNavigation) {
  const next = useThreadWorkspaceStore.getState().closeTab(threadKey);
  if (!wasActive) return;
  const nextRef = next === null ? null : parseScopedThreadKey(next);
  if (nextRef === null) navigation.openHome();
  else navigation.open(nextRef);
}

type DropSide = "before" | "after";

/**
 * The open threads of this window that belong to the open project (`projectKey`, as
 * `environmentId:projectId`). Hidden until the project has a second tab, or while a draft
 * leaves a tab to go back to.
 */
export function ThreadTabStrip(props: { readonly projectKey: string | null }) {
  const tabs = useThreadWorkspaceStore((state) => state.tabs);
  const activeKey = useThreadWorkspaceStore((state) => state.activeKey);
  const splits = useThreadWorkspaceStore((state) => state.splits);
  const shells = useQuietThreadShells();
  const gt = useGT();
  const [dropTarget, setDropTarget] = useState<{
    readonly key: string;
    readonly side: DropSide;
  } | null>(null);
  const groupByKey = new Map<string, string>();
  for (const shell of shells) {
    groupByKey.set(
      scopedThreadKey(scopeThreadRef(shell.environmentId, shell.id)),
      `${shell.environmentId}:${shell.projectId}`,
    );
  }
  const visible = threadTabsInGroup(tabs, props.projectKey, (key) => groupByKey.get(key) ?? null);
  if (props.projectKey === null) return null;
  if (visible.length < 2 && !(activeKey === null && visible.length === 1)) return null;
  const lastKey = visible.at(-1) ?? null;
  const showDropTarget = (key: string, side: DropSide) =>
    setDropTarget((current) =>
      current?.key === key && current.side === side ? current : { key, side },
    );
  return (
    <div
      role="tablist"
      aria-label={gt("Open threads")}
      className="relative flex h-9 min-h-9 shrink-0 items-end gap-0.5 overflow-x-auto bg-muted/50 px-1.5 [scrollbar-width:none] after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border"
      onDragOver={(event) => {
        if (!isThreadTabDrag(event) || lastKey === null) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        // Past the last tab drops at the end of the strip.
        if (event.target === event.currentTarget) showDropTarget(lastKey, "after");
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null);
      }}
      onDrop={(event) => {
        const dragged = event.dataTransfer.getData(THREAD_TAB_DRAG_TYPE);
        setDropTarget(null);
        if (dragged === "" || dropTarget === null) return;
        event.preventDefault();
        useThreadWorkspaceStore.getState().moveTab(dragged, dropTarget.key, dropTarget.side);
      }}
    >
      {visible.map((key) => (
        <ThreadTab
          key={key}
          threadKey={key}
          active={key === activeKey}
          inSplit={splits.includes(key)}
          dropSide={dropTarget?.key === key ? dropTarget.side : null}
          onDropSide={(side) => showDropTarget(key, side)}
        />
      ))}
    </div>
  );
}

function ThreadTab(props: {
  threadKey: string;
  active: boolean;
  inSplit: boolean;
  dropSide: DropSide | null;
  onDropSide: (side: DropSide) => void;
}) {
  const { threadKey, active, inSplit, dropSide, onDropSide } = props;
  const gt = useGT();
  const navigation = useThreadNavigation();
  const ref = parseScopedThreadKey(threadKey);
  const shell = useQuietThreadShell(ref);
  const dragging = useThreadWorkspaceStore((state) => state.draggingKey === threadKey);
  if (ref === null) return null;
  const title = shell?.title ?? gt("Thread");

  const close = () => closeTabAndFollow(threadKey, active, navigation);

  const showMenu = (event: ReactMouseEvent) => {
    event.preventDefault();
    const api = readLocalApi();
    if (!api) return;
    void (async () => {
      const clicked = await settlePromise(() =>
        api.contextMenu.show<TabMenuId>(
          [
            ...(active
              ? []
              : [
                  inSplit
                    ? { id: "unsplit" as const, label: gt("Close split view") }
                    : { id: "split" as const, label: gt("Open in split view") },
                ]),
            { id: "new-window", label: gt("Open in new window"), icon: "app-window" },
            { id: "close", label: gt("Close tab"), separatorBefore: true },
            { id: "close-others", label: gt("Close other tabs") },
          ],
          { x: event.clientX, y: event.clientY },
          contextMenuSourceOf(event),
        ),
      );
      if (clicked._tag === "Failure" || clicked.value === null) return;
      const workspace = useThreadWorkspaceStore.getState();
      switch (clicked.value) {
        case "split":
          workspace.openSplit(threadKey);
          return;
        case "unsplit":
          workspace.closeSplit(threadKey);
          return;
        case "new-window":
          navigation.openWindow(ref);
          return;
        case "close":
          close();
          return;
        case "close-others":
          workspace.closeOtherTabs(threadKey);
          if (!active) navigation.open(ref);
          return;
      }
    })();
  };

  return (
    <div
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      draggable
      className={cn(
        "group/tab relative flex h-7.5 max-w-60 min-w-32 shrink-0 cursor-default items-center gap-1.5 rounded-t-lg border border-b-0 pr-1 pl-2.5 text-xs select-none",
        active
          ? "z-[1] border-border bg-background font-medium text-foreground before:absolute before:inset-x-3 before:-top-px before:h-0.5 before:rounded-b-full before:bg-primary"
          : "border-transparent text-muted-foreground hover:bg-background/60 hover:text-foreground",
        dragging && "opacity-40",
      )}
      onClick={() => {
        if (!active) navigation.open(ref);
      }}
      onAuxClick={(event) => {
        // Middle click closes, as in a browser.
        if (event.button !== 1) return;
        event.preventDefault();
        close();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !active) navigation.open(ref);
      }}
      onContextMenu={showMenu}
      onDragStart={(event) => {
        event.dataTransfer.setData(THREAD_TAB_DRAG_TYPE, threadKey);
        event.dataTransfer.effectAllowed = "move";
        // Rendering the drop zones during dragstart can cancel the drag in Chromium.
        window.setTimeout(() => useThreadWorkspaceStore.getState().setDraggingKey(threadKey), 0);
      }}
      onDragEnd={(event) => {
        useThreadWorkspaceStore.getState().setDraggingKey(null);
        if (!droppedOutsideWindow(event)) return;
        navigation.openWindow(ref);
        close();
      }}
      onDragOver={(event) => {
        if (!isThreadTabDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        const rect = event.currentTarget.getBoundingClientRect();
        onDropSide(event.clientX < rect.left + rect.width / 2 ? "before" : "after");
      }}
    >
      {dropSide === null ? null : (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-1 w-0.5 rounded-full bg-primary",
            dropSide === "before" ? "-left-px" : "-right-px",
          )}
        />
      )}
      {inSplit ? (
        <Columns2Icon aria-hidden className="size-3.5 shrink-0 text-primary" />
      ) : (
        <MessageSquareIcon aria-hidden className="size-3.5 shrink-0 opacity-60" />
      )}
      <Tooltip>
        <TooltipTrigger render={<span className="min-w-0 flex-1 truncate" />}>
          {title}
        </TooltipTrigger>
        <TooltipPopup side="bottom">{title}</TooltipPopup>
      </Tooltip>
      <span
        className={cn(
          "flex shrink-0",
          !active && "opacity-0 group-hover/tab:opacity-100 focus-within:opacity-100",
        )}
      >
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={gt("Close tab")}
          draggable={false}
          className="size-5"
          onClick={(event) => {
            event.stopPropagation();
            close();
          }}
        >
          <XIcon className="size-3" />
        </Button>
      </span>
    </div>
  );
}

type DropZone = "here" | "split";

/**
 * Shown over the chat while one of its tabs is dragged: drop on the left half to open the
 * thread here, on the right half to open it beside the main pane.
 */
export function ThreadTabDropZones(props: { readonly mainThreadKey: string | null }) {
  const draggingKey = useThreadWorkspaceStore((state) => state.draggingKey);
  const gt = useGT();
  const navigation = useThreadNavigation();
  const [hovered, setHovered] = useState<DropZone | null>(null);
  if (draggingKey === null || draggingKey === props.mainThreadKey) return null;
  const zone = (side: DropZone, label: string) => (
    <div
      key={side}
      className="flex flex-1 p-2"
      onDragOver={(event) => {
        if (!isThreadTabDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (hovered !== side) setHovered(side);
      }}
      onDragLeave={() => setHovered((current) => (current === side ? null : current))}
      onDrop={(event) => {
        const key = event.dataTransfer.getData(THREAD_TAB_DRAG_TYPE);
        setHovered(null);
        const ref = key === "" ? null : parseScopedThreadKey(key);
        if (ref === null) return;
        event.preventDefault();
        if (side === "split") useThreadWorkspaceStore.getState().openSplit(key);
        else navigation.open(ref);
      }}
    >
      <div
        className={cn(
          "pointer-events-none flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm font-medium",
          hovered === side
            ? "border-primary bg-primary/10 text-primary"
            : "border-border/60 text-muted-foreground",
        )}
      >
        {side === "split" ? <Columns2Icon aria-hidden className="size-4" /> : null}
        {label}
      </div>
    </div>
  );
  return (
    <div className="absolute inset-0 z-40 flex bg-background/85">
      {zone(
        "here",
        gt("Open here", { $context: "drop target that opens a dragged thread tab in this pane" }),
      )}
      {zone("split", gt("Open in split view"))}
    </div>
  );
}

/** Threads kept open beside the main pane. Each is a compact chat; its panels open in the main pane. */
export function ThreadSplitPanes(props: { readonly mainThreadKey: string | null }) {
  const splits = useThreadWorkspaceStore((state) => state.splits);
  const shown = splits.filter((key) => key !== props.mainThreadKey);
  if (shown.length === 0) return null;
  return (
    <>
      {shown.map((key) => (
        <ThreadSplitPane key={key} threadKey={key} />
      ))}
    </>
  );
}

function ThreadSplitPane(props: { readonly threadKey: string }) {
  const { threadKey } = props;
  const gt = useGT();
  const navigation = useThreadNavigation();
  const ref = parseScopedThreadKey(threadKey);
  const shell = useQuietThreadShell(ref);

  // Panel actions from this pane (diffs, files, previews) land in its own panel state, which only
  // the main pane shows, so any of them moves this thread into the main pane.
  const router = useRouter();
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- promotes the split thread to the main pane when one of its panel actions runs
  useEffect(() => {
    const target = parseScopedThreadKey(threadKey);
    if (target === null) return;
    let revision = useRightPanelStore.getState().userActionRevisionByThreadKey[threadKey] ?? 0;
    return useRightPanelStore.subscribe((state) => {
      const next = state.userActionRevisionByThreadKey[threadKey] ?? 0;
      if (next === revision) return;
      revision = next;
      if (!state.byThreadKey[threadKey]?.isOpen) return;
      void router.navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(target),
      });
    });
  }, [router, threadKey]);

  if (ref === null) return null;

  const parentPanel: SideChatParentPanel = {
    // A split pane has no parent thread; it hosts itself.
    hostRef: ref,
    openToolDiff: (target: ToolCallDiffTarget) => {
      useDiffPanelStore.getState().selectToolCall(ref, target);
      useRightPanelStore.getState().open(ref, "diff");
      navigation.open(ref);
    },
    runShellCommand: () => {
      navigation.open(ref);
      toastManager.add({
        type: "info",
        title: gt("Moved to the main pane"),
        description: gt("Run the command again from the main pane, where the terminal is."),
      });
    },
  };

  return (
    <section
      data-side-chat-pane={ref.threadId}
      data-thread-split-pane
      aria-label={shell?.title ?? gt("Thread")}
      className="hidden min-h-0 min-w-80 flex-1 flex-col border-l border-border bg-background md:flex"
    >
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border bg-muted/30 pr-1.5 pl-3">
        <Columns2Icon aria-hidden className="size-3.5 shrink-0 text-primary" />
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-xs font-medium hover:text-primary"
          onClick={() => navigation.open(ref)}
        >
          {shell?.title ?? gt("Thread")}
        </button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={gt("Show in the main pane")}
          onClick={() => navigation.open(ref)}
        >
          <ArrowLeftRightIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={gt("Close split view")}
          onClick={() => useThreadWorkspaceStore.getState().closeSplit(threadKey)}
        >
          <XIcon />
        </Button>
      </div>
      {shell === null ? null : (
        <BackgroundThreadContext value>
          <ComposerHandleContext value={null}>
            <ChatView
              environmentId={ref.environmentId}
              threadId={ref.threadId}
              routeKind="server"
              embedded={parentPanel}
            />
          </ComposerHandleContext>
        </BackgroundThreadContext>
      )}
    </section>
  );
}

/** Opens a thread in a new tab of this window, or beside the main pane. */
export function useOpenThreadInWorkspace() {
  const navigation = useThreadNavigation();
  return {
    openInNewTab: (ref: ScopedThreadRef) => {
      useThreadWorkspaceStore.getState().openTab(scopedThreadKey(ref));
      navigation.open(ref);
    },
    openInSplit: (ref: ScopedThreadRef) => {
      useThreadWorkspaceStore.getState().openSplit(scopedThreadKey(ref));
    },
  };
}
