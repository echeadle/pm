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
  const [chatOpen, setChatOpen] = useState(false);

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
          history: chatMessages,
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
          { role: "assistant", content: body.assistant_message },
        ]);
      }

      if (body.board_update) {
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
    <KanbanBoard
      headerActions={
        <>
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            className="rounded-full border border-[var(--stroke)] p-2 text-[var(--navy-dark)] transition hover:bg-[var(--surface)]"
            aria-label="Open AI assistant"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h12v9H6l-3 3V3z" /></svg>
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-full border border-[var(--stroke)] p-2 text-[var(--navy-dark)] transition hover:bg-[var(--surface)]"
            aria-label="Logout"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 15H3V3h4M12 12l3-3-3-3M6 9h9" /></svg>
          </button>
        </>
      }
      rightSidebar={
        <>
          {chatOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm transition-opacity"
              onClick={() => setChatOpen(false)}
            />
          )}
          <aside
            className={`fixed right-0 top-0 z-50 flex h-full w-[380px] max-w-[90vw] flex-col border-l border-[var(--stroke)] bg-white shadow-[-8px_0_30px_rgba(3,33,71,0.1)] transition-transform duration-300 ${chatOpen ? "translate-x-0" : "translate-x-full"}`}
          >
            <div className="flex items-center justify-between border-b border-[var(--stroke)] px-5 py-3">
              <h2 className="font-display text-lg font-semibold text-[var(--navy-dark)]">
                AI Assistant
              </h2>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                className="rounded-full p-1.5 text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--navy-dark)]"
                aria-label="Close AI assistant"
              >
                <svg width="16" height="16" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 2l10 10M12 2L2 12" /></svg>
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
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

            <form className="border-t border-[var(--stroke)] p-4" onSubmit={handleChatSubmit}>
              <textarea
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Ask AI to update your board..."
                rows={3}
                className="w-full resize-none rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm outline-none focus:border-[var(--primary-blue)]"
              />
              {chatError ? (
                <p className="mt-2 text-sm font-medium text-[var(--secondary-purple)]">{chatError}</p>
              ) : null}
              <button
                type="submit"
                disabled={chatSending}
                className="mt-2 w-full rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
              >
                {chatSending ? "Sending..." : "Send"}
              </button>
            </form>
          </aside>
        </>
      }
    />
  );
}
