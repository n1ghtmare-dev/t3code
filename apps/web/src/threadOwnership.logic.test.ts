import { describe, expect, it } from "vite-plus/test";

import {
  filterThreadsByOwner,
  knownThreadOwners,
  normalizeOwnerName,
  ownerTagFor,
  ownersOfThread,
} from "./threadOwnership.logic";

describe("owner tags", () => {
  it.each([
    { name: "  Олег  ", tag: "by:Олег" },
    { name: "Олег   Иванов", tag: "by:Олег Иванов" },
    { name: "   ", tag: null },
    { name: "x".repeat(80), tag: `by:${"x".repeat(61)}` },
  ])("$name", ({ name, tag }) => {
    expect(ownerTagFor(name)).toBe(tag);
    if (tag !== null) expect(tag.length).toBeLessThanOrEqual(64);
  });

  it("reads owners and ignores other tags", () => {
    expect(ownersOfThread(["by:Олег", "private", "by:", "by:Маша"])).toEqual(["Олег", "Маша"]);
    expect(ownersOfThread(undefined)).toEqual([]);
    expect(normalizeOwnerName("")).toBeNull();
  });

  it("lists every owner once, sorted", () => {
    expect(
      knownThreadOwners(
        [{ tags: ["by:Маша"] }, { tags: ["by:Олег", "by:Маша"] }, { tags: undefined }],
        (thread) => thread.tags,
      ),
    ).toEqual(["Маша", "Олег"]);
  });
});

describe("filterThreadsByOwner", () => {
  const threads = [
    { id: "a", tags: ["by:Олег"] },
    { id: "b", tags: ["by:Маша"] },
    { id: "c", tags: undefined },
  ];

  it("keeps the owner's threads and an unowned open thread", () => {
    expect(
      filterThreadsByOwner(
        threads,
        "Олег",
        (thread) => thread.tags,
        (thread) => thread.id === "c",
      ).map((thread) => thread.id),
    ).toEqual(["a", "c"]);
  });

  it("hides the open thread when someone else owns it", () => {
    expect(
      filterThreadsByOwner(
        threads,
        "Маша",
        (thread) => thread.tags,
        (thread) => thread.id === "a",
      ).map((thread) => thread.id),
    ).toEqual(["b"]);
  });

  it("lists every thread without an owner filter", () => {
    expect(
      filterThreadsByOwner(
        threads,
        null,
        (thread) => thread.tags,
        () => false,
      ),
    ).toBe(threads);
  });
});
