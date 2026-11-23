import type { EnvironmentId, ThreadId } from "@t3tools/contracts";

import { threadEnvironment } from "../state/threads";
import { useOrchestrationCommand } from "../state/use-orchestration-command";
import { ownerTagFor } from "../threadOwnership.logic";
import { useUiStateStore } from "../uiStateStore";

/** Marks a thread as started by this device's person, when the device has a name. */
export function useTagThreadAsMine() {
  const setTag = useOrchestrationCommand(threadEnvironment.setTag, { reportFailure: false });
  return (environmentId: EnvironmentId, threadId: ThreadId) => {
    const name = useUiStateStore.getState().threadOwnerName;
    const tag = name === null ? null : ownerTagFor(name);
    if (tag === null) return;
    void setTag({ environmentId, input: { threadId, tag, tagged: true } });
  };
}

/** Adds or removes an owner tag, such as marking an older thread as yours. */
export function useSetThreadOwner() {
  const setTag = useOrchestrationCommand(threadEnvironment.setTag);
  return (environmentId: EnvironmentId, threadId: ThreadId, owner: string, tagged: boolean) => {
    const tag = ownerTagFor(owner);
    if (tag === null) return Promise.resolve(null);
    return setTag({ environmentId, input: { threadId, tag, tagged } });
  };
}
