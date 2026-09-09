import { test as base, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

const API_URL = process.env.E2E_API_URL ?? "http://localhost:4000";

type TestUser = {
  email: string;
  password: string;
  name: string;
};

type AuthFixtures = {
  testUser: TestUser;
  authenticatedPage: Page;
};

export const test = base.extend<AuthFixtures>({
  // A fresh, throwaway user per test - so tests never collide with each other's
  // data, and never depend on run order or a shared seeded account.
  testUser: async ({}, use) => {
    const id = randomUUID().slice(0, 8);
    await use({
      email: `e2e-${id}@example.com`,
      password: "supersecret123",
      name: `E2E User ${id}`,
    });
  },

  // Signs up via the API directly instead of driving the signup form, then
  // navigates to /boards already authenticated. `context.request` shares its
  // cookie jar with the browser context it belongs to, so the httpOnly auth
  // cookie set by this API call is exactly the one the page sends on every
  // subsequent request - no UI interaction needed for tests that aren't
  // specifically testing signup/login themselves.
  authenticatedPage: async ({ page, context, testUser }, use) => {
    const res = await context.request.post(`${API_URL}/auth/signup`, {
      data: testUser,
    });
    if (!res.ok()) {
      throw new Error(`Failed to create test user via API: ${res.status()} ${await res.text()}`);
    }

    await page.goto("/boards");
    await use(page);
  },
});

export { expect } from "@playwright/test";
