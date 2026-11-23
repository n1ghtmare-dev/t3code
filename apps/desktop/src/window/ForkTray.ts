// @effect-diagnostics nodeBuiltinImport:off globalTimers:off -- Plain Electron tray glue that runs git and the fork launcher.
// Fork-only tray icon. The app keeps running in the tray when its windows close, checks the fork's
// git branch for updates, and installs one by quitting and handing over to the Windows launcher
// (scripts/windows/t3code-fork.cmd), which waits for this process, pulls, rebuilds and starts the
// app again. The window session (ForkWindowSession.ts) brings the windows and tabs back.

import * as NodeChildProcess from "node:child_process";
import * as NodePath from "node:path";

import * as Electron from "electron";

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const FIRST_UPDATE_CHECK_DELAY_MS = 60 * 1000;

export interface ForkTrayInput {
  readonly repoPath: string;
  readonly iconPath: string | null;
  readonly appName: string;
  readonly platform: NodeJS.Platform;
  readonly openMain: () => void;
  readonly newWindow: () => void;
  readonly quit: () => void;
}

type UpdateState =
  | { readonly kind: "idle" }
  | { readonly kind: "checking" }
  | { readonly kind: "up-to-date" }
  | { readonly kind: "available"; readonly commits: number }
  | { readonly kind: "error"; readonly message: string };

function git(repoPath: string, args: readonly string[]): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    NodeChildProcess.execFile(
      "git",
      ["-C", repoPath, ...args],
      { windowsHide: true, timeout: 120_000 },
      (error, stdout) => {
        const code = error === null ? 0 : typeof error.code === "number" ? error.code : -1;
        resolve({ code, stdout: String(stdout).trim() });
      },
    );
  });
}

/** Counts the fork commits not yet installed, or null when the check could not run. */
async function countAvailableUpdates(repoPath: string): Promise<number | null> {
  const branch = await git(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch.code !== 0 || branch.stdout === "" || branch.stdout === "HEAD") return null;
  const fetched = await git(repoPath, ["fetch", "-q", "origin", branch.stdout]);
  if (fetched.code !== 0) return null;
  // Local changes or a diverged branch: the launcher would skip the update, so offer none.
  const ancestor = await git(repoPath, ["merge-base", "--is-ancestor", "HEAD", "FETCH_HEAD"]);
  if (ancestor.code !== 0) return 0;
  const count = await git(repoPath, ["rev-list", "--count", "HEAD..FETCH_HEAD"]);
  const commits = Number.parseInt(count.stdout, 10);
  return count.code === 0 && Number.isFinite(commits) ? commits : null;
}

/** Quits and lets the launcher update (when there is an update) and start the app again. */
function restartThroughLauncher(input: ForkTrayInput): void {
  const launcher = NodePath.join(input.repoPath, "scripts", "windows", "t3code-fork.cmd");
  if (input.platform === "win32") {
    const child = NodeChildProcess.spawn(
      "cmd.exe",
      ["/d", "/c", `start "T3 Code update" "${launcher}" --wait-pid ${process.pid}`],
      { detached: true, stdio: "ignore", windowsVerbatimArguments: true },
    );
    child.unref();
  } else {
    Electron.app.relaunch();
  }
  input.quit();
}

// Electron removes a tray whose object is garbage collected.
let activeTray: Electron.Tray | null = null;

export function installForkTray(input: ForkTrayInput): void {
  if (activeTray !== null) return;
  let updateState: UpdateState = { kind: "idle" };
  let notifiedCommits = 0;
  const icon =
    input.iconPath === null
      ? Electron.nativeImage.createEmpty()
      : Electron.nativeImage.createFromPath(input.iconPath);
  const tray = new Electron.Tray(icon);
  activeTray = tray;
  tray.setToolTip(input.appName);

  const updateLabel = (): string => {
    switch (updateState.kind) {
      case "checking":
        return "Проверяю обновления…";
      case "available":
        return `Установить обновление и перезапустить (${updateState.commits})`;
      case "up-to-date":
        return "Обновлений нет — проверить ещё раз";
      case "error":
        return "Не удалось проверить — повторить";
      case "idle":
        return "Проверить обновления";
    }
  };

  const rebuildMenu = () => {
    tray.setContextMenu(
      Electron.Menu.buildFromTemplate([
        { label: `Открыть ${input.appName}`, click: input.openMain },
        { label: "Новое окно", click: input.newWindow },
        { type: "separator" },
        {
          label: updateLabel(),
          enabled: updateState.kind !== "checking",
          click: () => {
            if (updateState.kind === "available") restartThroughLauncher(input);
            else void checkForUpdates(true);
          },
        },
        {
          label: "Перезапустить",
          click: () => restartThroughLauncher(input),
        },
        { type: "separator" },
        { label: "Выйти", click: input.quit },
      ]),
    );
    tray.setToolTip(
      updateState.kind === "available" ? `${input.appName} — доступно обновление` : input.appName,
    );
  };

  const checkForUpdates = async (announceUpToDate: boolean) => {
    if (updateState.kind === "checking") return;
    updateState = { kind: "checking" };
    rebuildMenu();
    const commits = await countAvailableUpdates(input.repoPath);
    if (commits === null) {
      updateState = { kind: "error", message: "git" };
    } else if (commits === 0) {
      updateState = { kind: "up-to-date" };
      if (announceUpToDate && Electron.Notification.isSupported()) {
        new Electron.Notification({
          title: input.appName,
          body: "Установлена последняя версия.",
        }).show();
      }
    } else {
      updateState = { kind: "available", commits };
      if (commits !== notifiedCommits && Electron.Notification.isSupported()) {
        notifiedCommits = commits;
        const notification = new Electron.Notification({
          title: `${input.appName}: доступно обновление`,
          body: "Нажмите, чтобы установить и перезапустить. Окна и вкладки откроются снова.",
        });
        notification.on("click", () => restartThroughLauncher(input));
        notification.show();
      }
    }
    rebuildMenu();
  };

  tray.on("click", input.openMain);
  rebuildMenu();
  setTimeout(() => void checkForUpdates(false), FIRST_UPDATE_CHECK_DELAY_MS).unref?.();
  setInterval(() => void checkForUpdates(false), UPDATE_CHECK_INTERVAL_MS).unref?.();
}
