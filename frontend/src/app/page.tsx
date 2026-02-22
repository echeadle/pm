"use client";

import { FormEvent, useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";

type AuthState = "loading" | "loggedOut" | "loggedIn";
type ChatRole = "user" | "assistant";
type ChatMessage = {
  role: ChatRole;
  content: string;
};

export default function Home() {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch("/api/auth/me", { credentials: "include" });
        setAuthState(response.ok ? "loggedIn" : "loggedOut");
      } catch {
        setAuthState("loggedOut");
      }
    };

    void checkSession();
  }, []);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      setError("Invalid username or password.");
      setAuthState("loggedOut");
      return;
    }

    setAuthState("loggedIn");
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    setChatMessages([]);
    setChatInput("");
    setChatError(null);
    setAuthState("loggedOut");
  };

  const handleChatSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed || chatSending) {
      return;
    }

    const nextMessages: ChatMessage[] = [...chatMessages, { role: "user", content: trimmed }];
    setChatMessages(nextMessages);
    setChatInput("");
    setChatSending(true);
    setChatError(null);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: chatMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const message =
          typeof errorBody.error === "string" ? errorBody.error : "AI request failed";
        throw new Error(message);
      }

      const body = await response.json();
      if (typeof body.assistant_message === "string") {
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: body.assistant_message as string },
        ]);
      }

      if (body.board_update) {
        const persist = await fetch("/api/kanban", {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body.board_update),
        });

        if (!persist.ok) {
          throw new Error("Failed to persist AI board update");
        }

        window.dispatchEvent(
          new CustomEvent("kanban:apply-board-update", { detail: body.board_update })
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI request failed. Try again.";
      setChatError(message);
    } finally {
      setChatSending(false);
    }
  };

  if (authState === "loading") {
    return (
      <main className="mx-auto flex min-h-screen max-w-[560px] items-center justify-center px-6">
        <p className="text-sm text-[var(--gray-text)]">Checking session...</p>
      </main>
    );
  }

  if (authState === "loggedOut") {
    return (
      <main className="mx-auto flex min-h-screen max-w-[560px] items-center justify-center px-6">
        <section className="w-full rounded-3xl border border-[var(--stroke)] bg-white p-8 shadow-[var(--shadow)]">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
            Sign In
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold text-[var(--navy-dark)]">
            Project Management MVP
          </h1>
          <p className="mt-2 text-sm text-[var(--gray-text)]">
            Use <span className="font-semibold text-[var(--navy-dark)]">user</span> /{" "}
            <span className="font-semibold text-[var(--navy-dark)]">password</span>.
          </p>

          <form className="mt-6 flex flex-col gap-4" onSubmit={handleLogin}>
            <label className="text-sm text-[var(--gray-text)]" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              className="rounded-xl border border-[var(--stroke)] px-4 py-3 text-sm outline-none focus:border-[var(--primary-blue)]"
              placeholder="user"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
            />

            <label className="text-sm text-[var(--gray-text)]" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="rounded-xl border border-[var(--stroke)] px-4 py-3 text-sm outline-none focus:border-[var(--primary-blue)]"
              placeholder="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />

            {error ? (
              <p className="text-sm font-medium text-[var(--secondary-purple)]">{error}</p>
            ) : null}

            <button
              type="submit"
              className="mt-2 rounded-full bg-[var(--secondary-purple)] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Sign In
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen">
      <button
        type="button"
        onClick={handleLogout}
        className="absolute right-6 top-6 z-20 rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)] shadow-[var(--shadow)]"
      >
        Logout
      </button>
      <KanbanBoard
        rightSidebar={
          <aside className="mx-0 mb-6 flex h-[calc(100vh-8rem)] min-h-0 w-full flex-col rounded-3xl border border-[var(--stroke)] bg-white p-5 shadow-[var(--shadow)] lg:sticky lg:top-20 lg:h-[calc(100vh-7rem)]">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold text-[var(--navy-dark)]">
              AI Assistant
            </h2>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
              Kanban-aware
            </span>
          </div>

          <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-3">
            {chatMessages.length === 0 ? (
              <p className="text-sm text-[var(--gray-text)]">
                Ask AI to create, edit, or move cards.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {chatMessages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={
                      message.role === "user"
                        ? "self-end rounded-2xl bg-[var(--primary-blue)] px-3 py-2 text-sm text-white"
                        : "self-start rounded-2xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)]"
                    }
                  >
                    {message.content}
                  </div>
                ))}
              </div>
            )}
          </div>

          <form className="mt-4 flex flex-col gap-2 border-t border-[var(--stroke)] pt-3" onSubmit={handleChatSubmit}>
            <textarea
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="Ask AI to update your board..."
              rows={3}
              className="w-full resize-none rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm outline-none focus:border-[var(--primary-blue)]"
            />
            {chatError ? (
              <p className="text-sm font-medium text-[var(--secondary-purple)]">{chatError}</p>
            ) : null}
            <button
              type="submit"
              disabled={chatSending}
              className="w-full rounded-full border-2 border-[var(--navy-dark)] bg-[var(--secondary-purple)] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(117,57,145,0.45)] ring-2 ring-[color:rgba(236,173,10,0.4)] transition hover:brightness-110 disabled:opacity-60"
            >
              {chatSending ? "Sending..." : "Send"}
            </button>
          </form>
          </aside>
        }
      />
    </main>
  );
}
