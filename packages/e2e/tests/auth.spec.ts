import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { BoardsPage } from "../pages/BoardsPage";
import { LoginPage } from "../pages/LoginPage";
import { SignupPage } from "../pages/SignupPage";

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}@example.com`;
}

test("signs up, lands on Boards, and stays authenticated after a reload", async ({ page }) => {
  const signupPage = new SignupPage(page);
  const boardsPage = new BoardsPage(page);
  const email = uniqueEmail("signup");

  await signupPage.goto();
  await signupPage.signup("New User", email, "supersecret123");

  await expect(page).toHaveURL(/\/boards$/);

  // Reload to prove the session survives via the httpOnly cookie, not just
  // in-memory React state - this is the actual thing worth testing here.
  await page.reload();
  await expect(page).toHaveURL(/\/boards$/);
  await expect(boardsPage.logoutButton).toBeVisible();
});

test("shows an error for the wrong password", async ({ page }) => {
  const signupPage = new SignupPage(page);
  const loginPage = new LoginPage(page);
  const email = uniqueEmail("wrongpw");

  await signupPage.goto();
  await signupPage.signup("Wrong Password User", email, "supersecret123");
  await expect(page).toHaveURL(/\/boards$/);

  const boardsPage = new BoardsPage(page);
  await boardsPage.logoutButton.click();
  await expect(page).toHaveURL(/\/login$/);

  await loginPage.login(email, "not-the-right-password");
  await expect(loginPage.errorMessage).toHaveText("invalid credentials");
});

test("logs out and can no longer reach a protected page", async ({ page }) => {
  const signupPage = new SignupPage(page);
  const boardsPage = new BoardsPage(page);
  const email = uniqueEmail("logout");

  await signupPage.goto();
  await signupPage.signup("Logout User", email, "supersecret123");
  await expect(page).toHaveURL(/\/boards$/);

  await boardsPage.logoutButton.click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/boards");
  await expect(page).toHaveURL(/\/login$/);
});
