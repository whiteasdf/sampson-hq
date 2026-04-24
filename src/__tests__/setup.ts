// Global test setup — runs before every test file.
// happy-dom provides window/localStorage, so no polyfills needed.
// We reset localStorage before each test to guarantee isolation.

import { beforeEach } from "vitest";

beforeEach(() => {
  localStorage.clear();
});
