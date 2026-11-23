import { describe, expect, it } from "vite-plus/test";

import {
  EMPTY_FORK_WINDOW_SESSION,
  parseForkWindowSession,
  removeForkWindow,
  upsertForkWindow,
  withWindowSlot,
} from "./ForkWindowSession.ts";

describe("ForkWindowSession", () => {
  it("drops broken entries, duplicates and the main slot", () => {
    expect(
      parseForkWindowSession({
        mainUrl: "t3://app/?windowSlot=main#/env/thread",
        windows: [
          {
            slot: "a",
            url: "t3://app/?windowSlot=a#/",
            bounds: { x: 0, y: 0, width: 900, height: 700 },
          },
          { slot: "a", url: "t3://app/#/again" },
          { slot: "main", url: "t3://app/" },
          { slot: "b", url: "t3://app/", bounds: { x: 0, y: 0, width: 10, height: 10 } },
          { slot: "", url: "t3://app/" },
          "junk",
        ],
      }),
    ).toEqual({
      mainUrl: "t3://app/?windowSlot=main#/env/thread",
      windows: [
        {
          slot: "a",
          url: "t3://app/?windowSlot=a#/",
          bounds: { x: 0, y: 0, width: 900, height: 700 },
        },
        { slot: "b", url: "t3://app/", bounds: null },
      ],
    });
    expect(parseForkWindowSession("nope")).toEqual(EMPTY_FORK_WINDOW_SESSION);
  });

  it("updates a window in place, adds new ones last, and forgets closed ones", () => {
    let session = upsertForkWindow(EMPTY_FORK_WINDOW_SESSION, {
      slot: "a",
      url: "1",
      bounds: null,
    });
    session = upsertForkWindow(session, { slot: "b", url: "2", bounds: null });
    session = upsertForkWindow(session, { slot: "a", url: "3", bounds: null });
    expect(session.windows.map((entry) => `${entry.slot}:${entry.url}`)).toEqual(["a:3", "b:2"]);
    expect(removeForkWindow(session, "a").windows.map((entry) => entry.slot)).toEqual(["b"]);
  });

  it("puts the slot in the query, before the hash route", () => {
    expect(withWindowSlot("t3://app/index.html?windowProject=p#/env/t", "w1")).toBe(
      "t3://app/index.html?windowProject=p&windowSlot=w1#/env/t",
    );
  });
});
