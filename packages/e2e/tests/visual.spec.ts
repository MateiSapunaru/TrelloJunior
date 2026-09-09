import { expect, test } from "../fixtures/auth.fixture";
import { BoardPage } from "../pages/BoardPage";
import { BoardsPage } from "../pages/BoardsPage";

// Baselines were generated locally on Windows. Font rendering differs between
// operating systems, so these will need regenerating (`--update-snapshots`) once
// CI runs on Linux (Day 3) - a known, well-documented cross-platform limitation of
// pixel-based visual regression, not something specific to this setup.
test("board view with lists and cards matches its visual baseline", async ({ authenticatedPage }) => {
  const boardsPage = new BoardsPage(authenticatedPage);
  await boardsPage.createBoard("Visual Regression Board");
  await boardsPage.boardLink("Visual Regression Board").click();

  const boardPage = new BoardPage(authenticatedPage);
  await boardPage.addList("To Do");
  await boardPage.addList("Doing");
  await boardPage.addCard("To Do", "Write tests");
  await boardPage.addCard("To Do", "Review PR");

  await expect(authenticatedPage).toHaveScreenshot("board-view.png");
});
