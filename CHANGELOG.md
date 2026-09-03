# Changelog

## 1.2.1

- **Native footer toggle** — new `/claude-footer` command (`on` / `off`, no-arg flips).
  `on` restores pi's built-in footer so other extensions' footers survive
  (MCP adapters, pi-lens, …) while the CC status widget above the prompt
  hides itself to avoid duplicating model/context/cost. `off` (default)
  keeps the CC-clean look: mode/hints render in the footer slot and the
  status widget stays visible.
- **Stale-ctx crash fix** — after session replacement or reload, the captured
  extension ctx goes stale and any `ctx.ui` / `ctx.model` / `ctx.sessionManager`
  access inside `render()` threw an uncaught exception that killed pi.
  Third-party tool rows now use the live theme pi passes to the render
  factories (no captured ctx); the status widget falls back to last-good
  usage numbers; the editor cursor callback and the spinner tick timer no
  longer touch ctx.
- **`❯` alignment (CC fidelity)** — the prompt triangle always sits at
  column 0 in both the input and history bars; continuation lines indent
  2 columns so no glyph ever shares the triangle's column (pi's editor
  used to drop the padding on soft-wrapped rows).
- **Footer auto-compact** — while the input holds text, the footer shows
  only the mode label (`⏵⏵ auto mode on …`); the keybinding hints return
  when the input is empty or submitted.

## 1.2.0

- Collapsed tool output capped at 3 physical rows; CC-style fallback rows
  for MCP / third-party tools without their own renderers.

## 1.1.0

- CC-verbatim mode banner (`⏵⏵ auto` / `⏸ plan`); 3-line collapsed output.

## 1.0.0

- Initial release: Clawd header, slim prompt bar, CC tool rows, spinner
  verbs, status line, history bars, claude-code theme.
