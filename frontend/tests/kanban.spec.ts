import { expect, test, type Page } from "@playwright/test";

type ApiCard = {
  id: string;
  title: string;
  details: string;
};

type ApiColumn = {
  id: string;
  title: string;
  cards: ApiCard[];
};

type ApiBoard = {
  version: 1;
  board: {
    columns: ApiColumn[];
  };
};

const initialBoard = (): ApiBoard => ({
  version: 1,
  board: {
    columns: [
      { id: "col-backlog", title: "Backlog", cards: [] },
      { id: "col-discovery", title: "Discovery", cards: [] },
      { id: "col-progress", title: "In Progress", cards: [] },
      { id: "col-review", title: "Review", cards: [] },
      { id: "col-done", title: "Done", cards: [] },
    ],
  },
});

const setupApiMocks = async (page: Page) => {
  let authenticated = false;
  let board = initialBoard();

  await page.route("**/api/auth/me", async (route) => {
    if (!authenticated) {
      await route.fulfill({ status: 401, body: JSON.stringify({ authenticated: false }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ authenticated: true, user: { username: "user" } }),
    });
  });

  await page.route("**/api/auth/login", async (route) => {
    const body = route.request().postDataJSON() as { username?: string; password?: string };
    if (body.username === "user" && body.password === "password") {
      authenticated = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, user: { username: "user" } }),
      });
      return;
    }

    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Invalid credentials" }),
    });
  });

  await page.route("**/api/auth/logout", async (route) => {
    authenticated = false;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.route("**/api/kanban", async (route) => {
    if (!authenticated) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unauthorized" }),
      });
      return;
    }

    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(board),
      });
      return;
    }

    if (route.request().method() === "PUT") {
      board = route.request().postDataJSON() as ApiBoard;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(board),
      });
      return;
    }

    await route.fulfill({ status: 405 });
  });

  await page.route("**/api/ai/chat", async (route) => {
    if (!authenticated) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unauthorized" }),
      });
      return;
    }

    const body = route.request().postDataJSON() as {
      message?: string;
      history?: Array<{ role: string; content: string }>;
    };
    const message = (body.message || "").toLowerCase();

    if (message.includes("rename")) {
      const updated: ApiBoard = JSON.parse(JSON.stringify(board));
      updated.board.columns[0].title = "AI Backlog";
      board = updated;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          assistant_message: "Renamed the first column to AI Backlog.",
          board_update: updated,
          model: "openai/gpt-4o-mini",
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        assistant_message: "No changes needed.",
        board_update: null,
        model: "openai/gpt-4o-mini",
      }),
    });
  });
};

const login = async (page: Page) => {
  await setupApiMocks(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Project Management MVP" })).toBeVisible();
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
};

test("logs in and logs out", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: /logout/i }).click();
  await expect(page.getByRole("heading", { name: "Project Management MVP" })).toBeVisible();
});

test("persists rename/add/move across reload", async ({ page }) => {
  await login(page);
  const backlogColumn = page.getByTestId("column-col-backlog");
  const reviewColumn = page.getByTestId("column-col-review");
  const uniqueTitle = `playwright-persist-${Date.now()}`;
  const renamedBacklog = `Backlog ${Date.now()}`;

  const backlogInput = backlogColumn.getByLabel("Column title");
  await backlogInput.fill(renamedBacklog);

  await backlogColumn.getByRole("button", { name: /add a card/i }).click();
  await backlogColumn.getByPlaceholder("Card title").fill(uniqueTitle);
  await backlogColumn.getByPlaceholder("Details").fill("Persistence check");
  await backlogColumn.getByRole("button", { name: /add card/i }).click();

  await expect(backlogColumn.getByText(uniqueTitle)).toBeVisible();
  await page.reload();
  await expect(backlogColumn.getByLabel("Column title")).toHaveValue(renamedBacklog);
  await expect(backlogColumn.getByText(uniqueTitle)).toBeVisible();

  const card = page.locator("article", { hasText: uniqueTitle });
  const cardBox = await card.boundingBox();
  const columnBox = await reviewColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(columnBox.x + columnBox.width / 2, columnBox.y + 140, {
    steps: 12,
  });
  await page.mouse.up();

  await expect(reviewColumn.getByText(uniqueTitle)).toBeVisible();
  await page.reload();
  await expect(reviewColumn.getByText(uniqueTitle)).toBeVisible();

});

test("applies chat-driven board update and keeps state after reload", async ({ page }) => {
  await login(page);

  await page.getByPlaceholder("Ask AI to update your board...").fill("Rename the first column");
  await page.getByRole("button", { name: /^send$/i }).click();

  await expect(page.getByText("Renamed the first column to AI Backlog.")).toBeVisible();
  await expect(page.getByTestId("column-col-backlog").getByLabel("Column title")).toHaveValue(
    "AI Backlog"
  );

  await page.reload();
  await expect(page.getByTestId("column-col-backlog").getByLabel("Column title")).toHaveValue(
    "AI Backlog"
  );
});
