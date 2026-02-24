"use client";

import { type ReactNode, useMemo, useState, useEffect, useRef } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { createId, initialData, moveCard, type BoardData } from "@/lib/kanban";

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

type ApiBoardPayload = {
  version: 1;
  board: {
    columns: ApiColumn[];
  };
};

const normalizeBoard = (data: unknown): BoardData | null => {
  if (
    !data ||
    typeof data !== "object" ||
    !("board" in data) ||
    !data.board ||
    typeof data.board !== "object" ||
    !("columns" in data.board) ||
    !Array.isArray(data.board.columns)
  ) {
    return null;
  }

  const columns = data.board.columns.map((col: any) => ({
    id: col.id,
    title: col.title,
    cardIds: Array.isArray(col.cards) ? col.cards.map((c: any) => c.id) : [],
  }));

  const cards: Record<string, ApiCard> = {};
  data.board.columns.forEach((col: any) => {
    if (!Array.isArray(col.cards)) {
      return;
    }

    col.cards.forEach((card: any) => {
      if (!card || !card.id) {
        return;
      }
      cards[card.id] = {
        id: card.id,
        title: card.title || "",
        details: card.details || "",
      };
    });
  });

  return { columns, cards };
};

const serializeBoard = (board: BoardData): ApiBoardPayload => ({
  version: 1,
  board: {
    columns: board.columns.map((column) => ({
      id: column.id,
      title: column.title,
      cards: column.cardIds
        .map((cardId) => board.cards[cardId])
        .filter(Boolean)
        .map((card) => ({
          id: card.id,
          title: card.title,
          details: card.details,
        })),
    })),
  },
});

type KanbanBoardProps = {
  rightSidebar?: ReactNode;
  headerActions?: ReactNode;
};

export const KanbanBoard = ({ rightSidebar, headerActions }: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData>(() => initialData);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const lastMutationIdRef = useRef(0);

  useEffect(() => {
    let mounted = true;

    const tryFetch = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);
        const r = await fetch("/api/kanban", { credentials: "include" });
        if (!r.ok) {
          throw new Error("Failed to load board");
        }

        const json = await r.json();
        const normalized = normalizeBoard(json);
        if (!normalized) {
          throw new Error("Invalid board payload");
        }

        if (mounted) {
          setBoard(normalized);
        }
      } catch {
        if (mounted) {
          setLoadError("Could not load board from server. Showing last known state.");
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    void tryFetch();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const handleApplyBoardUpdate = (event: Event) => {
      const custom = event as CustomEvent<unknown>;
      const normalized = normalizeBoard(custom.detail);
      if (normalized) {
        setBoard(normalized);
        setSaveError(null);
      }
    };

    window.addEventListener("kanban:apply-board-update", handleApplyBoardUpdate);
    return () => {
      window.removeEventListener("kanban:apply-board-update", handleApplyBoardUpdate);
    };
  }, []);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 3 },
    })
  );

  const collisionDetectionStrategy: CollisionDetection = (args) => {
    const pointerHits = pointerWithin(args);
    if (pointerHits.length > 0) {
      return pointerHits;
    }
    return rectIntersection(args);
  };

  const cardsById = useMemo(() => board.cards, [board.cards]);

  const persistBoard = async (
    nextBoard: BoardData,
    previousBoard: BoardData,
    mutationId: number
  ) => {
    setIsSaving(true);
    setSaveError(null);

    try {
      const response = await fetch("/api/kanban", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serializeBoard(nextBoard)),
      });

      if (!response.ok) {
        throw new Error("Failed to save board");
      }
    } catch {
      if (mutationId === lastMutationIdRef.current) {
        setBoard(previousBoard);
        setSaveError("Could not save latest change. Reverted.");
      }
    } finally {
      if (mutationId === lastMutationIdRef.current) {
        setIsSaving(false);
      }
    }
  };

  const applyBoardUpdate = (updater: (prev: BoardData) => BoardData) => {
    setBoard((prev) => {
      const next = updater(prev);
      if (next === prev) {
        return prev;
      }

      const mutationId = lastMutationIdRef.current + 1;
      lastMutationIdRef.current = mutationId;
      void persistBoard(next, prev, mutationId);
      return next;
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    setBoard((prev) => {
      const activeId = active.id as string;
      const overId = over.id as string;

      const sourceCol = prev.columns.find((c) => c.cardIds.includes(activeId));
      const isOverColumn = prev.columns.some((c) => c.id === overId);
      const destCol = isOverColumn
        ? prev.columns.find((c) => c.id === overId)
        : prev.columns.find((c) => c.cardIds.includes(overId));

      if (!sourceCol || !destCol || sourceCol.id === destCol.id) {
        return prev;
      }

      const nextSourceCards = sourceCol.cardIds.filter((id) => id !== activeId);
      const nextDestCards = [...destCol.cardIds];
      if (isOverColumn) {
        nextDestCards.push(activeId);
      } else {
        const overIndex = destCol.cardIds.indexOf(overId);
        nextDestCards.splice(overIndex >= 0 ? overIndex : nextDestCards.length, 0, activeId);
      }

      return {
        ...prev,
        columns: prev.columns.map((col) => {
          if (col.id === sourceCol.id) return { ...col, cardIds: nextSourceCards };
          if (col.id === destCol.id) return { ...col, cardIds: nextDestCards };
          return col;
        }),
      };
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!over || active.id === over.id) {
      return;
    }

    applyBoardUpdate((prev) => ({
      ...prev,
      columns: moveCard(prev.columns, active.id as string, over.id as string),
    }));
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    applyBoardUpdate((prev) => ({
      ...prev,
      columns: prev.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column
      ),
    }));
  };

  const handleAddCard = (columnId: string, title: string, details: string) => {
    const id = createId("card");
    applyBoardUpdate((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [id]: { id, title, details: details || "No details yet." },
      },
      columns: prev.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, id] }
          : column
      ),
    }));
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    applyBoardUpdate((prev) => ({
      ...prev,
      cards: Object.fromEntries(
        Object.entries(prev.cards).filter(([id]) => id !== cardId)
      ),
      columns: prev.columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              cardIds: column.cardIds.filter((id) => id !== cardId),
            }
          : column
      ),
    }));
  };

  const activeCard = activeCardId ? cardsById[activeCardId] : null;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <header className="relative z-10 flex items-center justify-between border-b border-[var(--stroke)] bg-white/80 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-4">
          <h1 className="font-display text-xl font-semibold text-[var(--navy-dark)]">
            Kanban Studio
          </h1>
          <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--gray-text)]">
            {isLoading ? <span>Loading...</span> : null}
            {isSaving ? <span>Saving...</span> : null}
            {loadError ? (
              <span className="text-[var(--secondary-purple)]" role="status">
                {loadError}
              </span>
            ) : null}
            {saveError ? (
              <span className="text-[var(--secondary-purple)]" role="status">
                {saveError}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {headerActions}
        </div>
      </header>

      <main className="relative flex flex-1 flex-col px-4 pb-8 pt-4">
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetectionStrategy}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <section className="grid flex-1 grid-cols-5 gap-4">
            {board.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={column.cardIds.map((cardId) => board.cards[cardId])}
                onRename={handleRenameColumn}
                onAddCard={handleAddCard}
                onDeleteCard={handleDeleteCard}
              />
            ))}
          </section>
          <DragOverlay>
            {activeCard ? (
              <div className="w-[240px]">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>

      {rightSidebar ?? null}
    </div>
  );
};
