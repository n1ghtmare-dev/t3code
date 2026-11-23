// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalRandom:off -- A tiny synchronous JSON file written from Electron event handlers; slots only need to differ.
// Fork-only: remembers which app windows were open and where, so a restart (an update, a reboot,
// quitting from the tray) reopens them on the same threads. Each window has a slot that also keys
// its tabs and splits in the renderer's localStorage (apps/web/src/appWindows.ts).

import * as NodeFS from "node:fs";

export const WINDOW_SLOT_PARAM = "windowSlot";
export const MAIN_WINDOW_SLOT = "main";

export interface ForkWindowBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ForkWindowEntry {
  readonly slot: string;
  readonly url: string;
  readonly bounds: ForkWindowBounds | null;
}

export interface ForkWindowSession {
  /** The main window's last route; null until it has one. */
  readonly mainUrl: string | null;
  /** Extra windows, in the order they opened. */
  readonly windows: readonly ForkWindowEntry[];
}

export const EMPTY_FORK_WINDOW_SESSION: ForkWindowSession = { mainUrl: null, windows: [] };

export function withWindowSlot(url: string, slot: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set(WINDOW_SLOT_PARAM, slot);
    return parsed.href;
  } catch {
    return url;
  }
}

export function newWindowSlot(): string {
  return `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function parseBounds(value: unknown): ForkWindowBounds | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const { x, y, width, height } = record;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(width) || !isFiniteNumber(height))
    return null;
  if (width < 200 || height < 200) return null;
  return { x, y, width, height };
}

export function parseForkWindowSession(value: unknown): ForkWindowSession {
  if (typeof value !== "object" || value === null) return EMPTY_FORK_WINDOW_SESSION;
  const record = value as Record<string, unknown>;
  const mainUrl =
    typeof record.mainUrl === "string" && record.mainUrl !== "" ? record.mainUrl : null;
  const seen = new Set<string>();
  const windows: ForkWindowEntry[] = [];
  for (const entry of Array.isArray(record.windows) ? record.windows : []) {
    if (typeof entry !== "object" || entry === null) continue;
    const { slot, url, bounds } = entry as Record<string, unknown>;
    if (typeof slot !== "string" || slot === "" || slot === MAIN_WINDOW_SLOT) continue;
    if (typeof url !== "string" || url === "" || seen.has(slot)) continue;
    seen.add(slot);
    windows.push({ slot, url, bounds: parseBounds(bounds) });
  }
  return { mainUrl, windows };
}

export function readForkWindowSession(filePath: string): ForkWindowSession {
  try {
    return parseForkWindowSession(JSON.parse(NodeFS.readFileSync(filePath, "utf8")));
  } catch {
    return EMPTY_FORK_WINDOW_SESSION;
  }
}

export function writeForkWindowSession(filePath: string, session: ForkWindowSession): void {
  try {
    const temporary = `${filePath}.tmp`;
    NodeFS.writeFileSync(temporary, JSON.stringify(session, null, 2));
    NodeFS.renameSync(temporary, filePath);
  } catch {
    // Losing the window layout must never break the app.
  }
}

export function upsertForkWindow(
  session: ForkWindowSession,
  entry: ForkWindowEntry,
): ForkWindowSession {
  const index = session.windows.findIndex((candidate) => candidate.slot === entry.slot);
  const windows =
    index === -1
      ? [...session.windows, entry]
      : session.windows.map((candidate, at) => (at === index ? entry : candidate));
  return { ...session, windows };
}

export function removeForkWindow(session: ForkWindowSession, slot: string): ForkWindowSession {
  return { ...session, windows: session.windows.filter((entry) => entry.slot !== slot) };
}
