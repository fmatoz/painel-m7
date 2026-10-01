import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const lock = readFileSync(new URL("../bun.lock", import.meta.url), "utf8");

test("every locked TanStack Start runtime includes the XSS security fix", () => {
  const minimum = {
    "react-start": [1, 168, 60],
    "start-server-core": [1, 169, 39],
  };
  for (const [name, required] of Object.entries(minimum)) {
    const versions = [...lock.matchAll(new RegExp(`@tanstack/${name}@(\\d+)\\.(\\d+)\\.(\\d+)`, "g"))];
    assert.ok(versions.length > 0, `Missing ${name} in lockfile`);
    for (const match of versions) {
      const actual = match.slice(1).map(Number);
      const firstDifference = actual.findIndex((part, i) => part !== required[i]);
      assert.ok(firstDifference === -1 || actual[firstDifference] > required[firstDifference], `${name}: ${actual.join(".")} is vulnerable`);
    }
  }
});
