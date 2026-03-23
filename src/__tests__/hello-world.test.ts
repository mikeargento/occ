// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import { describe, test } from "node:test";
import * as assert from "node:assert/strict";

describe("hello world", () => {
  test("passes", () => {
    assert.strictEqual("hello world", "hello world");
  });
});
