// Extra app windows: one thread, or one project with its threads, beside the main window.
//
// The browser opens these as popup windows. Desktop recognizes the target-name prefix in its
// window-open handler (apps/desktop/src/window/DesktopWindow.ts) and opens a full app window.
const APP_WINDOW_TARGET_PREFIX = "t3code-window-";

// The project a window opened for. The sidebar scope of such a window lives in its
// sessionStorage, so scoping a project window never changes the main window's scope.
const WINDOW_PROJECT_SEARCH_PARAM = "windowProject";
const WINDOW_SIDEBAR_SCOPE_STORAGE_KEY = "t3code:window-sidebar-scope";
// The fork's desktop app names each window with a slot that survives restarts
// (apps/desktop/src/window/ForkWindowSession.ts).
const WINDOW_SLOT_SEARCH_PARAM = "windowSlot";

/** This window's restart-stable slot, or null outside the fork's desktop app. */
function readWindowSlot(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const slot = new URLSearchParams(window.location.search).get(WINDOW_SLOT_SEARCH_PARAM);
    return slot === null || slot.trim() === "" ? null : slot;
  } catch {
    return null;
  }
}

/**
 * Where per-window state lives: sessionStorage normally, or localStorage keyed by the window's
 * slot when the desktop app reopens windows after a restart.
 */
export function windowStateStorage(
  key: string,
): { readonly storage: Storage; readonly key: string } | null {
  if (typeof window === "undefined") return null;
  const slot = readWindowSlot();
  return slot === null
    ? { storage: window.sessionStorage, key }
    : { storage: window.localStorage, key: `${key}:${slot}` };
}

const POPUP_DEFAULT_WIDTH = 1200;
const POPUP_DEFAULT_HEIGHT = 820;

function newWindowTarget(): string {
  // Only needs to differ from other open windows' names, not be unguessable.
  return `${APP_WINDOW_TARGET_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * `href` comes from router.history.createHref, so it is a path in the browser and a
 * `#/path` hash on desktop. The opener's own search never carries over to the new window.
 */
export function buildAppWindowUrl(
  href: string,
  currentUrl: string,
  options: { readonly projectKey?: string | null } = {},
): string {
  const url = new URL(href, currentUrl);
  url.search = "";
  if (options.projectKey) {
    url.searchParams.set(WINDOW_PROJECT_SEARCH_PARAM, options.projectKey);
  }
  return url.href;
}

/** Opens an app route in a new window. A projectKey scopes that window's sidebar to the project. */
export function openAppWindow(
  href: string,
  options: { readonly projectKey?: string | null } = {},
): void {
  if (typeof window === "undefined") return;
  const url = buildAppWindowUrl(href, window.location.href, options);
  const width = Math.min(window.outerWidth || POPUP_DEFAULT_WIDTH, POPUP_DEFAULT_WIDTH);
  const height = Math.min(window.outerHeight || POPUP_DEFAULT_HEIGHT, POPUP_DEFAULT_HEIGHT);
  // A unique target keeps each request in its own window instead of reusing the last one.
  window.open(url, newWindowTarget(), `popup,noopener,width=${width},height=${height}`);
}

export function readWindowProjectParam(search: string): string | null {
  try {
    const value = new URLSearchParams(search).get(WINDOW_PROJECT_SEARCH_PARAM);
    return value === null || value.trim() === "" ? null : value;
  } catch {
    return null;
  }
}

function sanitizeScopeKeys(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((key): key is string => typeof key === "string" && key.length > 0);
}

let windowSidebarScopeInitialized = false;

/**
 * The sidebar project scope owned by this window, or null when the window shares the
 * persisted scope (the main window, and every plain browser tab).
 */
export function readWindowSidebarScope(): string[] | null {
  const place = windowStateStorage(WINDOW_SIDEBAR_SCOPE_STORAGE_KEY);
  if (place === null) return null;
  try {
    if (!windowSidebarScopeInitialized) {
      windowSidebarScopeInitialized = true;
      const projectKey = readWindowProjectParam(window.location.search);
      // A reload keeps the scope the user picked in this window.
      if (projectKey !== null && place.storage.getItem(place.key) === null) {
        place.storage.setItem(place.key, JSON.stringify([projectKey]));
      }
    }
    const raw = place.storage.getItem(place.key);
    return raw === null ? null : sanitizeScopeKeys(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeWindowSidebarScope(keys: readonly string[]): void {
  const place = windowStateStorage(WINDOW_SIDEBAR_SCOPE_STORAGE_KEY);
  if (place === null) return;
  try {
    place.storage.setItem(place.key, JSON.stringify(keys));
  } catch {}
}
