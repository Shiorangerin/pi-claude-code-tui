# pi-claude-code-tui

A [pi](https://pi.dev) package that recreates the look and feel of Anthropic's Claude Code TUI.

<img width="691" height="448" alt="image" src="https://github.com/user-attachments/assets/3a030401-ed14-4705-b865-fdaf35fcba4f" />


## What you get

- **Startup header** — the pixel Clawd mascot next to a bold `Claude Code` title, your active model name and cwd (third-party model names are shown as-is)
- **Slim prompt bar** — flat rules, gold `❯` prompt, gold bar cursor, and a dim rotating `Try "..."` suggestion when the editor is empty
- **CC-style tool rows** — `⏺ Tool(args)` with a dim `⎿` gutter for output, colored diffs, red errors (built-in tool execution is untouched — rendering only). Collapsed output is capped at **3 physical rows** (a single minified JSON line can wrap into dozens of terminal rows, so collapse counts wrapped rows, not logical lines) with an expand hint.
- **Third-party / MCP tool fallback** — tools registered by other extensions (MCP adapters, `task`, …) ship no renderers and would flood the transcript with pi's 10-line fallback; the extension prototype-patches `ToolExecutionComponent` so any tool without its own `renderCall`/`renderResult` gets the same CC-style collapsed rows.
- **Spinner verbs** — the full set of 190 Claude Code playful verbs (`Pondering…`, `Vibing…`, `Flibbertigibbeting…`) on a blossom spinner, with a `✻ Worked for 12s` completion line
- **Status line** — `model │ Context 23% (50k/200k) │ $0.042 │ branch`
- **History** — sent messages render as a slim full-width bar with a dim `❯` prefix
- **claude-code theme** — the Claude Code dark palette applied to the whole TUI

Everything is display-only: nothing changes what gets sent to the model.

## Install

```bash
pi install git:github.com/Shiorangerin/pi-claude-code-tui
```

Then open `/settings` in pi and pick the **claude-code** theme. Restart pi.

### Or just paste this to your AI assistant

```text
Please install the pi package "pi-claude-code-tui" for me:
1. Run: pi install git:github.com/Shiorangerin/pi-claude-code-tui
2. Open pi, run /settings, and select the "claude-code" theme
3. Restart pi
```

## Commands

| Command | Description |
| --- | --- |
| `/claude-tui` | Toggle the whole replica (header / editor / spinner / status line) |
| `/claude-verb` | Reroll the spinner verb |
| `Shift+Tab` or `/mode` | Toggle **Plan Mode** / **Auto Mode** |

### Modes

- **Auto Mode** — normal full tool access (default)
- **Plan Mode** — read-only research: `edit`/`write` tools are disabled and the model is instructed to explore and present a plan instead of making changes

The current mode is always shown at the left of the hint line below the prompt bar.

## Recommended settings

Two Claude Code behaviors live in your pi settings (not in this package), add them to `~/.pi/agent/settings.json`:

```json
{
  "tuiMode": "fullscreen",
  "outputPad": 0,
  "quietStartup": true
}
```

- `tuiMode: "fullscreen"` — pins the prompt bar and status line to the bottom of the terminal with a scrollable transcript (how Claude Code behaves)
- Note: `Shift+Tab` toggles modes instead of pi's built-in thinking-level cycling
- `outputPad: 0` — sent messages start flush at column 0
- `quietStartup: true` — hide the startup resource lists (the custom header stays)

## Notes

- The theme assumes a dark terminal.
- Tool row styling overrides built-in renderers for `read`, `bash`, `grep`, `find`, `ls`, `write`, `edit`; execution always delegates to pi's built-in implementations.
- The editor component is adapted from the MIT-licensed [pi-claude-code-tui](https://github.com/Phoobobo/pi-claude-code-tui) by Phoobobo.
- Claude Code is a product of Anthropic. This package only mimics its terminal aesthetics and ships none of its code.

## License

MIT
