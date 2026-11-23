// Who started a thread, for teams that share one T3 Connect account. A device names its person
// once; threads it starts get the tag `by:<name>`. Tags live on the thread on the server, so
// every device sees the same owners and a person's filter works on all their devices.

export const OWNER_TAG_PREFIX = "by:";
// Server tags hold at most 64 characters.
const MAX_TAG_LENGTH = 64;

export function normalizeOwnerName(name: string): string | null {
  const trimmed = name.replace(/\s+/g, " ").trim();
  if (trimmed === "") return null;
  return trimmed.slice(0, MAX_TAG_LENGTH - OWNER_TAG_PREFIX.length);
}

export function ownerTagFor(name: string): string | null {
  const normalized = normalizeOwnerName(name);
  return normalized === null ? null : `${OWNER_TAG_PREFIX}${normalized}`;
}

export function ownersOfThread(tags: readonly string[] | undefined): string[] {
  return (tags ?? [])
    .filter((tag) => tag.startsWith(OWNER_TAG_PREFIX) && tag.length > OWNER_TAG_PREFIX.length)
    .map((tag) => tag.slice(OWNER_TAG_PREFIX.length));
}

/** Every owner named on these threads, sorted for a stable menu. */
export function knownThreadOwners<T>(
  threads: readonly T[],
  tagsOf: (thread: T) => readonly string[] | undefined,
): string[] {
  const owners = new Set<string>();
  for (const thread of threads) {
    for (const owner of ownersOfThread(tagsOf(thread))) owners.add(owner);
  }
  return [...owners].sort((left, right) => left.localeCompare(right));
}

/**
 * Keeps the threads tagged with `owner`, or every thread for a null owner. The open thread
 * always stays listed, so a link to someone else's thread still shows where you are.
 */
export function filterThreadsByOwner<T>(
  threads: readonly T[],
  owner: string | null,
  tagsOf: (thread: T) => readonly string[] | undefined,
  isOpenThread: (thread: T) => boolean,
): readonly T[] {
  if (owner === null) return threads;
  const tag = ownerTagFor(owner);
  if (tag === null) return threads;
  return threads.filter((thread) => (tagsOf(thread) ?? []).includes(tag) || isOpenThread(thread));
}
