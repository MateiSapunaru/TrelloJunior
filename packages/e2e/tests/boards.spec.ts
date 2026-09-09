import { BoardsPage } from "../pages/BoardsPage";
import { expect, test } from "../fixtures/auth.fixture";

test("creates a board via the API-bootstrapped session and sees it listed", async ({ authenticatedPage }) => {
  const boardsPage = new BoardsPage(authenticatedPage);

  await boardsPage.createBoard("Sprint Board");

  await expect(boardsPage.boardLink("Sprint Board")).toBeVisible();
});

test("a freshly signed-up user has no boards yet", async ({ authenticatedPage }) => {
  const boardsPage = new BoardsPage(authenticatedPage);

  await expect(boardsPage.boardList).toBeEmpty();
});
