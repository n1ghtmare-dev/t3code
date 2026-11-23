// The sidebar's machine filter: list only threads that live on chosen environments, such as a
// person's own work and home computers when several people share one T3 Connect account.

/**
 * The environments to list, or null for every machine. Machines this client no longer knows
 * drop out, and a filter left with none of them lists everything rather than nothing.
 */
export function resolveMachineFilter(
  stored: readonly string[],
  knownEnvironmentIds: ReadonlySet<string>,
): ReadonlySet<string> | null {
  const active = stored.filter((id) => knownEnvironmentIds.has(id));
  return active.length === 0 ? null : new Set(active);
}

/**
 * Menu labels that tell machines apart: this device's own environment says so, and machines that
 * share a name get a short id, since several computers often report the same host name.
 */
export function machineMenuLabels(
  machines: readonly (readonly [environmentId: string, label: string])[],
  thisDeviceId: string | null,
  thisDeviceSuffix: string,
): Map<string, string> {
  const count = new Map<string, number>();
  for (const [, label] of machines) count.set(label, (count.get(label) ?? 0) + 1);
  return new Map(
    machines.map(([environmentId, label]) => {
      const parts = [label];
      if ((count.get(label) ?? 0) > 1) parts.push(`· ${environmentId.slice(0, 6)}`);
      if (environmentId === thisDeviceId) parts.push(thisDeviceSuffix);
      return [environmentId, parts.join(" ")] as const;
    }),
  );
}

/** Turns one machine on or off. Choosing every known machine is the same as no filter. */
export function toggleMachineFilter(
  stored: readonly string[],
  environmentId: string,
  knownEnvironmentIds: ReadonlySet<string>,
): string[] {
  const current = [...(resolveMachineFilter(stored, knownEnvironmentIds) ?? [])];
  const next = current.includes(environmentId)
    ? current.filter((id) => id !== environmentId)
    : [...current, environmentId];
  return next.length >= knownEnvironmentIds.size ? [] : next;
}

/**
 * Keeps the threads on the chosen machines. The open thread always stays listed, so a link to
 * a thread on another machine still shows where you are.
 */
export function filterThreadsByMachine<T extends { readonly environmentId: string }>(
  threads: readonly T[],
  filter: ReadonlySet<string> | null,
  isOpenThread: (thread: T) => boolean,
): readonly T[] {
  if (filter === null) return threads;
  return threads.filter((thread) => filter.has(thread.environmentId) || isOpenThread(thread));
}
