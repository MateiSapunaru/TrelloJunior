import type { Locator, Page } from "@playwright/test";

export class BoardsPage {
  readonly page: Page;
  readonly titleInput: Locator;
  readonly createButton: Locator;
  readonly boardList: Locator;
  readonly logoutButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.titleInput = page.getByTestId("board-title-input");
    this.createButton = page.getByTestId("create-board-submit");
    this.boardList = page.getByTestId("board-list");
    this.logoutButton = page.getByTestId("logout-button");
  }

  async goto(): Promise<void> {
    await this.page.goto("/boards");
  }

  async createBoard(title: string): Promise<void> {
    await this.titleInput.fill(title);
    await this.createButton.click();
  }

  boardLink(title: string): Locator {
    return this.boardList.getByRole("link", { name: title });
  }
}
