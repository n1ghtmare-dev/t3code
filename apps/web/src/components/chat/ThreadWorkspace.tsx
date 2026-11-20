import { parseScopedThreadKey, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { settlePromise } from "@t3tools/client-runtime/state/runtime";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useRouter } from "@tanstack/react-router";
import { useGT } from "gt-react";
import { ArrowLeftRightIcon, XIcon } from "lucide-react";
import { useEffect, type MouseEvent as ReactMouseEvent } from "react";

import { openAppWindow } from "../../appWindows";
import { ComposerHandleContext } from "../../composerHandleContext";
import { contextMenuSourceOf } from "../../contextMenuSource";
import type { ToolCallDiffTarget } from "../../diffPanelStore";
import { useDiffPanelStore } from "../../diffPanelStore";
import type { SideChatParentPanel } from "../../lib/sideChatPane";
import { cn } from "../../lib/utils";
import { readLocalApi } from "../../localApi";
import { useRightPanelStore } from "../../rightPanelStore";
import { useQuietThreadShell } from "../../state/entities";
import { buildThreadRouteParams } from "../../threadRoutes";
import { useThreadWorkspaceStore } from "../../threadWorkspaceStore";
import ChatView from "../ChatView";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
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

/** The open threads of this window. Hidden until a second thread is opened in a tab. */
export function ThreadTabStrip() {
  const tabs = useThreadWorkspaceStore((state) => state.tabs);
  const activeKey = useThreadWorkspaceStore((state) => state.activeKey);
  const splits = useThreadWorkspaceStore((state) => state.splits);
  const gt = useGT();
  if (tabs.length < 2) return null;
  return (
    <div
      role="tablist"
      aria-label={gt("Open threads")}
      className="flex h-8 min-h-8 shrink-0 items-stretch overflow-x-auto border-b border-border bg-muted/30 [scrollbar-width:none]"
    >
      {tabs.map((key) => (
        <ThreadTab
          key={key}
          threadKey={key}
          active={key === activeKey}
          inSplit={splits.includes(key)}
        />
      ))}
    </div>
  );
}

function ThreadTab(props: { threadKey: string; active: boolean; inSplit: boolean }) {
  const { threadKey, active, inSplit } = props;
  const gt = useGT();
  const navigation = useThreadNavigation();
  const ref = parseScopedThreadKey(threadKey);
  const shell = useQuietThreadShell(ref);
  if (ref === null) return null;
  const title = shell?.title ?? gt("Thread");

  const close = () => {
    const next = useThreadWorkspaceStore.getState().closeTab(threadKey);
    if (!active) return;
    const nextRef = next === null ? null : parseScopedThreadKey(next);
    if (nextRef === null) navigation.openHome();
    else navigation.open(nextRef);
  };

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
      title={title}
      className={cn(
        "group relative flex max-w-56 min-w-28 shrink-0 cursor-default items-center gap-1 border-r border-border pr-1 pl-3 text-xs select-none",
        active
          ? "bg-background font-medium text-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
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
    >
      {inSplit ? <ArrowLeftRightIcon aria-hidden className="size-3 shrink-0 opacity-60" /> : null}
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={gt("Close tab")}
        className={cn("size-5 shrink-0", active ? "" : "opacity-0 group-hover:opacity-100")}
        onClick={(event) => {
          event.stopPropagation();
          close();
        }}
      >
        <XIcon className="size-3" />
      </Button>
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
      className="hidden min-h-0 min-w-80 flex-1 flex-col border-l border-border md:flex"
    >
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border pr-1 pl-3">
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-xs font-medium hover:underline"
          title={gt("Show in the main pane")}
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
