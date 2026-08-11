/**
 * Shared plumbing for the jsdom component tests.
 *
 * Imported rather than wired up as a Vitest `setupFiles` entry, on purpose:
 * setup files run for EVERY test file in the project, so registering jest-dom
 * matchers and a DOM cleanup hook globally would make all 30 pure-function
 * suites pay for something only the component tests use. This module is loaded
 * exactly by the files that need it.
 *
 * Every consumer must ALSO carry `// @vitest-environment jsdom` on its first
 * line — importing this file does not change the environment, and without the
 * docblock `document` is undefined and the render call fails immediately.
 */
import { afterEach, expect } from "vitest";
import { cleanup } from "@testing-library/react";
import * as jestDom from "@testing-library/jest-dom/matchers";

expect.extend(jestDom);

// React Testing Library only auto-registers cleanup when `afterEach` is a
// global, and this project does not run Vitest with `globals: true`. Without
// this, every render stacks another copy of the component in the same
// document.body and `getByText` starts throwing "found multiple elements".
afterEach(cleanup);

export * from "@testing-library/react";
