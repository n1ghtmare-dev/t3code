import { describe, expect, it } from "vite-plus/test";

import { buildAppWindowUrl, readWindowProjectParam } from "./appWindows";

describe("buildAppWindowUrl", () => {
  it.each([
    {
      name: "browser path from a project window",
      href: "/env-1/thread-1",
      currentUrl: "https://app.t3.codes/env-1/old?windowProject=other",
      projectKey: null,
      expected: "https://app.t3.codes/env-1/thread-1",
    },
    {
      name: "desktop hash route keeps the app document",
      href: "#/env-1/thread-1",
      currentUrl: "t3://app/index.html?windowProject=other#/env-1/old",
      projectKey: null,
      expected: "t3://app/index.html#/env-1/thread-1",
    },
    {
      name: "project window scopes the new window",
      href: "#/",
      currentUrl: "t3://app/index.html#/env-1/old",
      projectKey: "repo:github.com/acme/app",
      expected: "t3://app/index.html?windowProject=repo%3Agithub.com%2Facme%2Fapp#/",
    },
  ])("$name", ({ href, currentUrl, projectKey, expected }) => {
    const url = buildAppWindowUrl(href, currentUrl, { projectKey });
    expect(url).toBe(expected);
    expect(readWindowProjectParam(new URL(url).search)).toBe(projectKey);
  });
});
