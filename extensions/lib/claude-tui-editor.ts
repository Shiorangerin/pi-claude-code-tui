/**
 * Claude-style half-open rounded editor (Codex/CC input box).
 *
 * Adapted from the MIT-licensed pi-claude-code-tui package
 * (https://github.com/Phoobobo/pi-claude-code-tui): CustomEditor subclass that
 * paints rounded top/bottom borders only (CC PromptInput uses borderStyle
 * "round" with borderLeft/borderRight disabled) and restyles the fake cursor
 * into an accent-colored block.
 */

import { CustomEditor, type KeybindingsManager } from "@earendil-works/pi-coding-agent";
import { CURSOR_MARKER, truncateToWidth, visibleWidth, type EditorTheme, type TUI } from "@earendil-works/pi-tui";

/** Strip CSI SGR and APC sequences so border detection can inspect plain text. */
export function stripAnsi(text: string): string {
	return text.replace(/\x1b\[[0-9;]*m/g, "").replace(/\x1b_[^\x07]*\x07/g, "");
}

export function isEditorBorderLine(line: string): boolean {
	const plain = stripAnsi(line);
	if (/^─+$/.test(plain)) return true;
	if (/^─*\s*[↑↓]\s+\d+\s+more\s*─*$/.test(plain)) return true;
	return false;
}

/** Index of the bottom border in Editor.render output (before autocomplete rows). */
export function findBottomBorderIndex(lines: string[]): number {
	for (let i = lines.length - 1; i >= 1; i--) {
		if (isEditorBorderLine(lines[i]!)) return i;
	}
	return Math.max(0, lines.length - 1);
}

export function padRight(line: string, width: number): string {
	const visible = visibleWidth(line);
	return visible >= width ? line : line + " ".repeat(width - visible);
}

export function roundedBorderLine(
	sourceLine: string,
	width: number,
	kind: "top" | "bottom",
	color: (text: string) => string,
): string {
	if (width < 2) return color(truncateToWidth(kind === "top" ? "╭╮" : "╰╯", width, ""));

	const corners = kind === "top" ? (["╭", "╮"] as const) : (["╰", "╯"] as const);
	const plain = stripAnsi(sourceLine);
	const scrollMatch = plain.match(/([↑↓]\s+\d+\s+more)/);

	if (scrollMatch) {
		const label = `─── ${scrollMatch[1]} `;
		const fill = Math.max(0, width - 2 - visibleWidth(label));
		return color(`${corners[0]}${label}${"─".repeat(fill)}${corners[1]}`);
	}

	return color(`${corners[0]}${"─".repeat(Math.max(0, width - 2))}${corners[1]}`);
}

/**
 * Restyle only the editor fake cursor (reverse-video span), not other reverse video.
 * Prefer the focused form with CURSOR_MARKER; fall back to the first short reverse span.
 */
export function restyleEditorCursor(line: string, openStyle: string): string {
	const markerIdx = line.indexOf(CURSOR_MARKER);
	if (markerIdx !== -1) {
		// Focused editor: replace the reverse-video span after the marker with
		// the bar style (the bar takes over the cell, like CC's bar cursor).
		const afterMarker = markerIdx + CURSOR_MARKER.length;
		const tail = line.slice(afterMarker);
		const replacedTail = tail.replace(/\x1b\[7m[^\x1b]*\x1b\[0m/, openStyle);
		return line.slice(0, afterMarker) + replacedTail;
	}

	// Unfocused: restyle only the first reverse-video span with no nested escapes.
	return line.replace(/\x1b\[7m[^\x1b]*\x1b\[0m/, openStyle);
}

/**
 * Apply half-open rounded borders (top + bottom only) to Editor.render output.
 * Leaves content rows and autocomplete rows without vertical sides.
 */
export function applyRoundedEditorBorders(
	lines: string[],
	width: number,
	color: (text: string) => string,
): string[] {
	if (lines.length === 0 || width < 4) return lines;

	const result = lines.slice();
	const bottomIdx = findBottomBorderIndex(result);

	result[0] = roundedBorderLine(result[0]!, width, "top", color);
	result[bottomIdx] = roundedBorderLine(result[bottomIdx]!, width, "bottom", color);

	return result.map((line) => padRight(truncateToWidth(line, width, ""), width));
}

/**
 * Build a bar-cursor style from a theme foreground ANSI sequence.
 * Turns `38;…` (fg) into `48;…` (bg) and pairs it with a dark foreground.
 */
export function cursorOpenFromFgAnsi(_fgAnsi: string): string {
	// gold bar, matching the ❯ prompt and text color
	return `\x1b[38;2;232;216;176m▏\x1b[39m`;
}

export class CodexStyleEditor extends CustomEditor {
	constructor(
		tui: TUI,
		theme: EditorTheme,
		keybindings: KeybindingsManager,
		private readonly cursorOpen: () => string,
		private readonly placeholder?: () => string,
	) {
		super(tui, theme, keybindings, { paddingX: 1 });
	}

	render(width: number): string[] {
		// CC style: flat full-width rules (pi's native editor borders) with an
		// orange `❯` prompt on the first content line, accent block cursor, and
		// a dim placeholder when empty.
		const open = this.cursorOpen();
		const prompt = `\x1b[38;2;232;216;176m❯\x1b[39m`; // same gold as the title/text
		const lines = super.render(width).map((line) => restyleEditorCursor(line, open));

		const firstContent = lines.findIndex((l) => !isEditorBorderLine(stripAnsi(l)));
		if (firstContent !== -1) {
			// strip the editor's own 1-col padding so the prompt sits snug: `❯ ▏text`
			let line = `${prompt} ${lines[firstContent]!.replace(/^ /, "")}`;
			// The editor pads lines to full width; trim before appending so the
			// placeholder isn't cut off by truncation.
			if (this.placeholder && /^\s*$/.test(this.getText())) {
				line = `${line.trimEnd()}\x1b[38;2;153;153;153m${this.placeholder()}\x1b[39m`;
			}
			lines[firstContent] = truncateToWidth(line, width, "");
		}
		return lines;
	}
}
