import type { Locator, Page } from "@playwright/test";

export class SignupPage {
  readonly page: Page;
  readonly nameInput: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.nameInput = page.getByTestId("signup-name");
    this.emailInput = page.getByTestId("signup-email");
    this.passwordInput = page.getByTestId("signup-password");
    this.submitButton = page.getByTestId("signup-submit");
    this.errorMessage = page.getByTestId("signup-error");
  }

  async goto(): Promise<void> {
    await this.page.goto("/signup");
  }

  async signup(name: string, email: string, password: string): Promise<void> {
    await this.nameInput.fill(name);
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}
