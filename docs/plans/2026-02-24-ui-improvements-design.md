# UI Improvements Design

Date: 2026-02-24

## Problem

The current Kanban board UI has several layout issues:
- 5 columns + always-visible AI sidebar cramps the board
- Text-based "Remove" and "Cancel" buttons waste space
- Large decorative header takes vertical space without adding value
- Horizontal space is underutilized

## Design

### Full-width board with collapsible AI sidebar
- Board columns span full viewport width in a 5-column flex/grid layout
- AI sidebar becomes a slide-out overlay panel toggled by a header button
- Panel slides in from the right with a semi-transparent backdrop
- Clicking backdrop or close button dismisses the panel

### Icons instead of text buttons
- Card delete: X icon (inline SVG) replacing "Remove" text
- Add card: "+" icon in a circular button
- NewCardForm cancel: X icon instead of "Cancel" text
- Logout: door/arrow-out icon instead of text
- AI toggle: chat bubble icon in header

### Compact header
- Single-line header bar: title left, status center, actions right
- Remove: subtitle text, "Focus" badge, column pills summary
- Keep: title, loading/saving/error indicators, logout and AI toggle buttons

### Better horizontal space
- Columns use min-width with flex-grow to fill available space
- Cards use tighter padding (px-3 py-3 instead of px-4 py-4)
- No max-width constraint on main container (let it use full viewport)

## Files to modify

| File | Changes |
|------|---------|
| `frontend/src/components/KanbanCard.tsx` | Replace "Remove" with X icon |
| `frontend/src/components/KanbanColumn.tsx` | Tighter spacing |
| `frontend/src/components/NewCardForm.tsx` | Icon buttons for add/cancel |
| `frontend/src/components/KanbanBoard.tsx` | Full-width layout, slim header |
| `frontend/src/app/page.tsx` | Collapsible sidebar panel, header actions |
| `frontend/src/app/globals.css` | Panel animation styles if needed |

## Constraints
- No new dependencies (inline SVGs for icons)
- Preserve all existing functionality (drag-drop, add/delete/rename, AI chat)
- Keep project color scheme
