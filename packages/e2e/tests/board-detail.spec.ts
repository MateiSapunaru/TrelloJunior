import { expect, test } from "../fixtures/auth.fixture";
import { BoardPage } from "../pages/BoardPage";
import { BoardsPage } from "../pages/BoardsPage";

test("creates lists and cards, and moves a card between lists", async ({ authenticatedPage }) => {
  const boardsPage = new BoardsPage(authenticatedPage);
  await boardsPage.createBoard("Sprint Board");
  await boardsPage.boardLink("Sprint Board").click();

  const boardPage = new BoardPage(authenticatedPage);
  await boardPage.addList("To Do");
  await boardPage.addList("Doing");

  await boardPage.addCard("To Do", "Write tests");
  await expect(boardPage.cardItem("To Do", "Write tests")).toBeVisible();

  await boardPage.moveCard("To Do", "Write tests", "Doing");

  await expect(boardPage.cardItem("Doing", "Write tests")).toBeVisible();
  await expect(boardPage.listColumn("To Do").getByTestId("card-item")).toHaveCount(0);
});

test("deletes a card, then deletes the list it was in", async ({ authenticatedPage }) => {
  const boardsPage = new BoardsPage(authenticatedPage);
  await boardsPage.createBoard("Cleanup Board");
  await boardsPage.boardLink("Cleanup Board").click();

  const boardPage = new BoardPage(authenticatedPage);
  await boardPage.addList("Backlog");
  await boardPage.addCard("Backlog", "Temp card");
  await expect(boardPage.cardItem("Backlog", "Temp card")).toBeVisible();

  await boardPage.deleteCard("Backlog", "Temp card");
  await expect(boardPage.cardItem("Backlog", "Temp card")).toHaveCount(0);

  await boardPage.deleteList("Backlog");
  await expect(boardPage.listColumn("Backlog")).toHaveCount(0);
});

test("a card in the only list on a board has no 'move to' dropdown", async ({ authenticatedPage }) => {
  const boardsPage = new BoardsPage(authenticatedPage);
  await boardsPage.createBoard("Single List Board");
  await boardsPage.boardLink("Single List Board").click();

  const boardPage = new BoardPage(authenticatedPage);
  await boardPage.addList("Only List");
  await boardPage.addCard("Only List", "Lonely card");

  await expect(boardPage.cardItem("Only List", "Lonely card").getByTestId("move-card-select")).toHaveCount(0);
});
