import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import { initialData } from "@/lib/kanban";

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

const buildApiBoardPayload = () => ({
  version: 1,
  board: {
    columns: initialData.columns.map((column) => ({
      id: column.id,
      title: column.title,
      cards: column.cardIds.map((cardId) => initialData.cards[cardId]),
    })),
  },
});

describe("KanbanBoard", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => buildApiBoardPayload(),
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  const renderBoard = async () => {
    render(<KanbanBoard />);
    await screen.findByTestId("column-col-backlog");
    await waitFor(() => {
      expect(screen.queryByText(/^loading\.\.\.$/i)).not.toBeInTheDocument();
    });
  };

  it("renders five columns", async () => {
    await renderBoard();
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("renames a column", async () => {
    await renderBoard();
    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");
  });

  it("adds and removes a card", async () => {
    await renderBoard();
    const column = getFirstColumn();
    const addButton = within(column).getByRole("button", {
      name: /add card/i,
    });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(within(column).getByRole("button", { name: /^add$/i }));

    expect(within(column).getByText("New card")).toBeInTheDocument();

    const deleteButton = within(column).getByRole("button", {
      name: /delete new card/i,
    });
    await userEvent.click(deleteButton);

    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
  });

  it("rolls back optimistic changes when save fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => buildApiBoardPayload(),
      })
      .mockResolvedValue({
        ok: false,
        json: async () => ({}),
      });
    global.fetch = fetchMock as typeof fetch;

    await renderBoard();
    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "Rollback");

    expect(await screen.findByText(/could not save latest change\. reverted\./i)).toBeInTheDocument();
    expect(input).toHaveValue("Backlog");
  });
});
