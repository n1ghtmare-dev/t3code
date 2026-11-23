import { T, useGT } from "gt-react";
import { useEffect, useId, useState } from "react";
import { create } from "zustand";

import { normalizeOwnerName } from "../threadOwnership.logic";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

type Request = {
  readonly current: string | null;
  readonly resolve: (name: string | null) => void;
};
const useRequest = create<{ request: Request | null }>(() => ({ request: null }));

/** Asks who uses this device. Resolves with the trimmed name, or null when cancelled. */
export function requestThreadOwnerName(current: string | null): Promise<string | null> {
  useRequest.getState().request?.resolve(null);
  return new Promise((resolve) => useRequest.setState({ request: { current, resolve } }));
}

function finish(name: string | null) {
  const request = useRequest.getState().request;
  useRequest.setState({ request: null });
  request?.resolve(name);
}

export function ThreadOwnerNameDialogHost() {
  const request = useRequest((state) => state.request);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- resolves a pending name request with null when the host unmounts
  useEffect(() => () => finish(null), []);
  return request ? <ThreadOwnerNameDialog current={request.current} /> : null;
}

function ThreadOwnerNameDialog(props: { readonly current: string | null }) {
  const gt = useGT();
  const id = useId();
  const [name, setName] = useState(props.current ?? "");
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) finish(null);
      }}
    >
      <DialogPopup className="sm:max-w-md">
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            const normalized = normalizeOwnerName(name);
            if (normalized === null) {
              setError(gt("Enter your name."));
              return;
            }
            finish(normalized);
          }}
        >
          <DialogHeader>
            <DialogTitle>
              <T>Your name on this device</T>
            </DialogTitle>
            <DialogDescription>
              <T>
                Threads you start here are marked with this name, so you can list only your threads
                on any device. Use the same name on your work and home computers.
              </T>
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-name`}>
                <T>Name</T>
              </Label>
              <Input
                id={`${id}-name`}
                autoFocus
                value={name}
                maxLength={61}
                onChange={(event) => {
                  setName(event.currentTarget.value);
                  setError(null);
                }}
              />
              {error ? (
                <p role="alert" className="text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => finish(null)}>
              <T>Cancel</T>
            </Button>
            <Button type="submit">
              <T>Save</T>
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
