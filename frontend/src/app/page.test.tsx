import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";

vi.mock("@/components/KanbanBoard", () => ({
  KanbanBoard: ({ headerActions, rightSidebar }: { headerActions?: React.ReactNode; rightSidebar?: React.ReactNode }) => (
    <div>
      Kanban Board Mock
      {headerActions}
      {rightSidebar}
    </div>
  ),
}));

type MockResponse = {
  ok: boolean;
  status?: number;
  json?: () => Promise<unknown>;
};

const response = (ok: boolean, status = ok ? 200 : 401): MockResponse => ({
  ok,
  status,
  json: async () => ({}),
});

describe("Home auth gate", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it("keeps user logged out on invalid credentials", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(false))
      .mockResolvedValueOnce(response(false));

    global.fetch = fetchMock as typeof fetch;

    render(<Home />);

    await screen.findByRole("button", { name: /sign in/i });

    await userEvent.clear(screen.getByLabelText(/username/i));
    await userEvent.type(screen.getByLabelText(/username/i), "user");
    await userEvent.clear(screen.getByLabelText(/password/i));
    await userEvent.type(screen.getByLabelText(/password/i), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/invalid username or password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("shows board after successful login", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(false))
      .mockResolvedValueOnce(response(true));

    global.fetch = fetchMock as typeof fetch;

    render(<Home />);

    await screen.findByRole("button", { name: /sign in/i });
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/kanban board mock/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /logout/i })).toBeInTheDocument();
  });

  it("logs out back to sign-in screen", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(true))
      .mockResolvedValueOnce(response(true));

    global.fetch = fetchMock as typeof fetch;

    render(<Home />);

    await screen.findByRole("button", { name: /logout/i });
    await userEvent.click(screen.getByRole("button", { name: /logout/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    });
  });
});
