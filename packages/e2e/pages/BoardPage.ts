import type { Locator, Page } from "@playwright/test";

export class BoardPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly listTitleInput: Locator;
  readonly addListButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator(".board-page-body h1");
    this.listTitleInput = page.getByTestId("list-title-input");
    this.addListButton = page.getByTestId("create-list-submit");
  }

  async goto(boardId: string): Promise<void> {
    await this.page.goto(`/boards/${boardId}`);
  }

  // Waits for the new column to actually render before returning, rather than just
  // firing the click - each of these two-list tests fills+clicks "Add list" twice
  // back-to-back, and without this wait the second fill can land before React has
  // committed the first list's creation, so the "second" submission actually
  // overwrites the in-flight title instead of creating an independent list.
  // An action method should leave the page in the state its name promises, not
  // just dispatch the DOM event and hope the caller waits long enough itself.
  async addList(title: string): Promise<void> {
    await this.listTitleInput.fill(title);
    await this.addListButton.click();
    await this.listColumn(title).waitFor({ state: "visible" });
  }

  // Matches on the column's own <h2> heading, not `filter({ hasText: title })` on
  // the whole column. A loose hasText substring-matches the ENTIRE column's text,
  // which includes every card's "Move to..." <option> labels - once a card sits in
  // "Doing" with only "To Do" left to move to, that <option>To Do</option> text
  // made listColumn("To Do") match the "Doing" column too, and every assertion
  // after a move silently read the wrong column. Real bug, found because the
  // resulting flakiness didn't add up against direct API checks of the same move.
  listColumn(title: string): Locator {
    return this.page.getByTestId("list-column").filter({ has: this.page.getByRole("heading", { name: title, exact: true }) });
  }

  async deleteList(title: string): Promise<void> {
    const column = this.listColumn(title);
    await column.getByTestId("delete-list-button").click();
    await column.waitFor({ state: "detached" });
  }

  async addCard(listTitle: string, cardTitle: string): Promise<void> {
    const column = this.listColumn(listTitle);
    await column.getByTestId("card-title-input").fill(cardTitle);
    await column.getByTestId("create-card-submit").click();
    await this.cardItem(listTitle, cardTitle).waitFor({ state: "visible" });
  }

  // Same reasoning as listColumn: match on the card's own title element, not a
  // hasText substring match against the whole card (which also contains other
  // lists' names via its "Move to..." dropdown options).
  cardItem(listTitle: string, cardTitle: string): Locator {
    const title = this.page.getByTestId("card-item-title").filter({ hasText: cardTitle });
    return this.listColumn(listTitle).getByTestId("card-item").filter({ has: title });
  }

  async moveCard(listTitle: string, cardTitle: string, targetListTitle: string): Promise<void> {
    const select = this.cardItem(listTitle, cardTitle).getByTestId("move-card-select");
    await select.selectOption({ label: targetListTitle });
    await this.cardItem(targetListTitle, cardTitle).waitFor({ state: "visible" });
  }

  async deleteCard(listTitle: string, cardTitle: string): Promise<void> {
    const card = this.cardItem(listTitle, cardTitle);
    await card.getByTestId("delete-card-button").click();
    await card.waitFor({ state: "detached" });
  }
}
