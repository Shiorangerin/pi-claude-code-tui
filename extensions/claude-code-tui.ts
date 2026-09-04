/**
 * Claude Code TUI 复刻扩展（v2 — 全页面复刻）
 * 参考 Claude Code 官方源码 UI（spinnerVerbs / Clawd / BuiltinStatusLine / PromptInput /
 * AssistantToolUseMessage），在 pi 上复刻其 TUI 观感：
 * - 启动头：Clawd 吉祥物 + "Claude Code vX" + 模型名（第三方模型名原样保留）+ cwd
 * - 输入框：CC 式半开圆角边框（只有上下边）+ accent 块状光标（移植自 MIT 的
 *   pi-claude-code-tui 包，见 lib/claude-tui-editor.ts）
 * - 工具行：用公共 API 实例化内置工具并原样委托 execute，只覆写渲染为
 *   CC 风格 `⏺ Tool(args)` + `⎿  输出`（错误红色、edit 带彩色 diff、
 *   read 折叠摘要），renderShell "self" 去掉背景盒；折叠按物理行封顶
 *   3 行（长 JSON 行 wrap 后也不会刷屏）
 * - 第三方/MCP 工具兜底：原型补丁 ToolExecutionComponent，凡无自带
 *   renderCall/renderResult 的工具（MCP、task 等）同样渲染为折叠的 CC 行
 * - Spinner：✻ 花型动画 + Claude 橙 + 190 个 Claude Code 俏皮动词轮换 + (esc to interrupt · Ns)
 * - 收尾：✻ Worked for 12s（CC 过去式动词）
 * - 状态栏：模型 │ Context 23% (50k/200k) │ $0.042（/claude-footer 切换；
 *   开原生底栏时自动隐藏，避免与 pi-mcp-adapter / pi-lens 的 footer 重复）
 *
 * Commands:
 *   /claude-tui  — 开/关整套复刻 UI（头 / 输入框 / 转圈 / 状态栏，不含工具行）
 *   /claude-tools — 单独开/关 CC 工具行（与其它 TUI 扩展共存用）
 *   /claude-verb — 立即换一个随机动词
 *   /claude-footer — 开/关原生底栏（开：兼容其它扩展 footer；关：CC 极简风）
 */

import { VERSION, keyHint, ToolExecutionComponent, UserMessageComponent, createBashToolDefinition, createEditToolDefinition, createFindToolDefinition, createGrepToolDefinition, createLsToolDefinition, createReadToolDefinition, createWriteToolDefinition, renderDiff } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { CodexStyleEditor, cursorOpenFromFgAnsi } from "./lib/claude-tui-editor.ts";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// --- Claude Code palette (dark theme, from src/utils/theme.ts) ---
const CLAUDE = "\x1b[38;2;215;119;87m";
const CLAUDE_DIM = "\x1b[38;2;153;153;153m";
const CLAUDE_WARNING = "\x1b[38;2;255;193;7m";
const CLAUDE_PLAN = "\x1b[38;2;72;150;140m";
const RESET = "\x1b[39m";

const orange = (s: string) => `${CLAUDE}${s}${RESET}`;
const gray = (s: string) => `${CLAUDE_DIM}${s}${RESET}`;
const yellow = (s: string) => `${CLAUDE_WARNING}${s}${RESET}`;
const teal = (s: string) => `${CLAUDE_PLAN}${s}${RESET}`;

// --- Spinner frames (src/components/Spinner/utils.ts getDefaultCharacters) ---
const BLOSSOM = ["·", "✢", "✱", "✶", "✻", "✽"];
const SPINNER_FRAMES = [...BLOSSOM, ...[...BLOSSOM].reverse()];

// --- 190 playful verbs (src/constants/spinnerVerbs.ts) ---
const SPINNER_VERBS = [
	"Accomplishing", "Actioning", "Actualizing", "Architecting", "Baking", "Beaming",
	"Beboppin'", "Befuddling", "Billowing", "Blanching", "Bloviating", "Boogieing",
	"Boondoggling", "Booping", "Bootstrapping", "Brewing", "Bunning", "Burrowing",
	"Calculating", "Canoodling", "Caramelizing", "Cascading", "Catapulting",
	"Cerebrating", "Channeling", "Channelling", "Choreographing", "Churning",
	"Clauding", "Coalescing", "Cogitating", "Combobulating", "Composing", "Computing",
	"Concocting", "Considering", "Contemplating", "Cooking", "Crafting", "Creating",
	"Crunching", "Crystallizing", "Cultivating", "Deciphering", "Deliberating",
	"Determining", "Dilly-dallying", "Discombobulating", "Doing", "Doodling",
	"Drizzling", "Ebbing", "Effecting", "Elucidating", "Embellishing", "Enchanting",
	"Envisioning", "Evaporating", "Fermenting", "Fiddle-faddling", "Finagling",
	"Flambéing", "Flibbertigibbeting", "Flowing", "Flummoxing", "Fluttering",
	"Forging", "Forming", "Frolicking", "Frosting", "Gallivanting", "Galloping",
	"Garnishing", "Generating", "Gesticulating", "Germinating", "Gitifying",
	"Grooving", "Gusting", "Harmonizing", "Hashing", "Hatching", "Herding",
	"Honking", "Hullaballooing", "Hyperspacing", "Ideating", "Imagining",
	"Improvising", "Incubating", "Inferring", "Infusing", "Ionizing",
	"Jitterbugging", "Julienning", "Kneading", "Leavening", "Levitating",
	"Lollygagging", "Manifesting", "Marinating", "Meandering", "Metamorphosing",
	"Misting", "Moonwalking", "Moseying", "Mulling", "Mustering", "Musing",
	"Nebulizing", "Nesting", "Newspapering", "Noodling", "Nucleating", "Orbiting",
	"Orchestrating", "Osmosing", "Perambulating", "Percolating", "Perusing",
	"Philosophising", "Photosynthesizing", "Pollinating", "Pondering",
	"Pontificating", "Pouncing", "Precipitating", "Prestidigitating", "Processing",
	"Proofing", "Propagating", "Puttering", "Puzzling", "Quantumizing",
	"Razzle-dazzling", "Razzmatazzing", "Recombobulating", "Reticulating",
	"Roosting", "Ruminating", "Sautéing", "Scampering", "Schlepping", "Scurrying",
	"Seasoning", "Shenaniganing", "Shimmying", "Simmering", "Skedaddling",
	"Sketching", "Slithering", "Smooshing", "Sock-hopping", "Spelunking",
	"Spinning", "Sprouting", "Stewing", "Sublimating", "Swirling", "Swooping",
	"Symbioting", "Synthesizing", "Tempering", "Thinking", "Thundering",
	"Tinkering", "Tomfoolering", "Topsy-turvying", "Transfiguring", "Transmuting",
	"Twisting", "Undulating", "Unfurling", "Unravelling", "Vibing", "Waddling",
	"Wandering", "Warping", "Whatchamacalliting", "Whirlpooling", "Whirring",
	"Whisking", "Wibbling", "Working", "Wrangling", "Zesting", "Zigzagging",
];

// Past-tense verbs for turn completion (src/constants/turnCompletionVerbs.ts)
const TURN_COMPLETION_VERBS = [
	"Baked", "Brewed", "Churned", "Cogitated", "Cooked", "Crunched", "Sautéed", "Worked",
];

const randomOf = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

const formatDuration = (ms: number): string => {
	const s = Math.round(ms / 1000);
	if (s < 60) return `${s}s`;
	return `${Math.floor(s / 60)}m ${s % 60}s`;
};

const formatTokens = (n: number): string => {
	if (n < 1000) return `${n}`;
	if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
	return `${(n / 1_000_000).toFixed(1)}M`;
};

const shortenCwd = (): string => {
	const cwd = process.cwd();
	return cwd.replace(/^\/Users\/[^/]+/, "~");
};

// --- CC tool rows (`⏺ Tool(args)` + `⎿  output`) ---
// Built-in tool definitions are instantiated via pi's public API and their
// execute is delegated to unchanged; only renderCall/renderResult are
// replaced with Claude Code-style rows, and renderShell "self" drops the
// background box.

const strArg = (v: unknown): string => (typeof v === "string" ? v : "");
const collapseCommand = (cmd: string): string => {
	const first = cmd.split("\n")[0] ?? "";
	return cmd.includes("\n") ? `${first} …` : first;
};

const textOfResult = (result: unknown): string => {
	const content = (result as { content?: Array<{ type?: string; text?: string }> }).content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((c) => c && c.type === "text" && typeof c.text === "string")
		.map((c) => c.text as string)
		.join("\n");
};

interface CCTheme {
	fg(color: string, s: string): string;
	bold(s: string): string;
}

// ⏺ dot state (CC): orange while running, green on success, red on error.
// pi rebuilds the call row when the result lands, so `isPartial === false`
// flips the dot without any extra subscription.
type CCDotStatus = "running" | "success" | "error";
const DOT_COLOR: Record<CCDotStatus, string> = {
	running: "accent",
	success: "success",
	error: "error",
};
const dotStatus = (rctx?: { isError?: boolean; isPartial?: boolean }): CCDotStatus => {
	if (rctx?.isError) return "error";
	if (rctx?.isPartial === false) return "success";
	return "running";
};

// `⏺ Tool(args)` call row: single line with args ellipsized to fit (CC
// style), so long commands can never wrap or misalign the dot. The dot
// turns red when the tool failed.
const ccCall = (theme: CCTheme, name: string, args: string, status: CCDotStatus) => ({
	invalidate() {},
	render(width: number): string[] {
		const white = "\x1b[38;2;255;255;255m";
		const head = `${theme.fg(DOT_COLOR[status], "⏺")} ${white}${theme.bold(name)}(`;
		const avail = Math.max(1, width - visibleWidth(head) - 1);
		const shown = truncateToWidth(args, avail, "…");
		return [`${head}${shown})${RESET}`];
	},
});

// `⎿  output` result rows: dim gutter, output wrapped and aligned under the
// gutter, collapsed preview with expand hint, red on error. Collapse is
// capped at MAX_RESULT_ROWS PHYSICAL rows: a single minified JSON line can
// wrap into dozens of terminal rows, so counting logical lines is not enough.
const MAX_RESULT_ROWS = 3;

const ccResult = (
	theme: CCTheme,
	name: string,
	result: unknown,
	options: { expanded?: boolean },
	isError: boolean,
) => ({
	invalidate() {},
	render(width: number): string[] {
	const gutter = theme.fg("dim", "  ⎿  ");
	const cont = "     ";
	const paint = (s: string) => (isError ? theme.fg("error", s) : theme.fg("toolOutput", s));
	const wrapW = Math.max(10, width - cont.length);
	const expandHint = theme.fg("dim", `(${keyHint("app.tools.expand", "to expand")})`);

	// Wraps pre-colored logical lines into physical rows and, unless expanded,
	// caps the block at MAX_RESULT_ROWS rows total (expand hint included).
	const emit = (logicalLines: string[]): string[] => {
		const physical: string[] = [];
		for (const line of logicalLines) physical.push(...wrapTextWithAnsi(line, wrapW));
		if (options.expanded || physical.length <= MAX_RESULT_ROWS) {
			return physical.map((l, i) => `${i === 0 ? gutter : cont}${l}`);
		}
		const shown = physical.slice(0, MAX_RESULT_ROWS - 1);
		const rows = shown.map((l, i) => `${i === 0 ? gutter : cont}${l}`);
		rows.push(`${cont}${theme.fg("dim", `... +${physical.length - shown.length} lines`)} ${expandHint}`);
		return rows;
	};

	const output = textOfResult(result).replace(/\n+$/, "");
	const lines = output ? output.split("\n") : [];

	// Errors: red summary lines, like CC's `⎿  Error: ...`
	if (isError) {
		return emit((lines.length ? lines : ["Error"]).map((l) => theme.fg("error", l)));
	}

	// Edit: summary + colored diff
	if (name === "edit") {
		const diff = (result as { details?: { diff?: string } }).details?.diff;
		const logical = [lines[0] || "Updated file"];
		if (diff) logical.push(...renderDiff(diff).split("\n"));
		return emit(logical);
	}

	// Read collapsed: one-line summary, like CC
	if (name === "read" && !options.expanded) {
		return [
			`${gutter}${theme.fg("toolOutput", `Read ${lines.length} lines`)} ${theme.fg("dim", `(${keyHint("app.tools.expand", "to expand")})`)}`,
		];
	}

	if (lines.length === 0) {
		return [`${gutter}${theme.fg("toolOutput", "(no content)")}`];
	}

	// Generic collapsed preview
	return emit(lines.map(paint));
	},
});

export default function (pi: ExtensionAPI) {
	let enabled = false;
	// --- Tool rows (cards) live on their own switch: the CC `⏺ Tool(args)` +
	// `⎿ output` rows for the 7 built-ins plus the third-party fallback can be
	// turned off independently (`/claude-tools`, or `CC_TUI_TOOL_ROWS=0`), so
	// another TUI extension (e.g. minuque/pi-cc-extensions) can own tool
	// rendering while the rest of the replica (header / editor / spinner /
	// status) stays on. Default on = previous behavior.
	// Persisted in ~/.pi/agent/claude-tui.json so `/claude-tools off` survives
	// /reload and restarts; CC_TUI_TOOL_ROWS=0 still forces off (env wins).
	const toolRowsPrefPath = join(process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent"), "claude-tui.json");
	const loadToolRowsPref = (): boolean => {
		try {
			if (process.env.CC_TUI_TOOL_ROWS === "0") return false;
			if (!existsSync(toolRowsPrefPath)) return true;
			const pref = JSON.parse(readFileSync(toolRowsPrefPath, "utf8")) as { toolRows?: unknown };
			return pref.toolRows !== false;
		} catch {
			return true;
		}
	};
	const saveToolRowsPref = (on: boolean): void => {
		try {
			mkdirSync(dirname(toolRowsPrefPath), { recursive: true });
			writeFileSync(toolRowsPrefPath, JSON.stringify({ toolRows: on }, null, 2));
		} catch {
			// Never break the TUI over a preference write.
		}
	};
	let toolRowsEnabled = loadToolRowsPref();
	let verb = randomOf(SPINNER_VERBS);
	let runStart = 0;
	let tickTimer: ReturnType<typeof setInterval> | null = null;
	let currentModelName = "";
	let currentProviderName = "";
	let currentContextWindow = 0;

	// --- Big Clawd sprite (CC v2.1.x startup logo, reconstructed from the
	// official render: chunky body, slit eyes = the ▜ gaps, full-width arms,
	// four legs). 9 cols × 3 rows, arms symmetric (2 half-cells per side),
	// plain accent fg — no background needed.
	const clawdLines = (accent: (s: string) => string): string[] => [
		accent(" █▜███▜▌ "),
		accent("▀██████▛▘"),
		accent("  ▘▘ ▘▘  "),
	];

	// --- Header: CC CondensedLogo layout (Clawd left + 3-line info column) ---
	const setHeader = (ctx: ExtensionContext) => {
		ctx.ui.setHeader((_tui, theme) => {
			const dim = (s: string) => theme.fg("dim", s);
			const accent = (s: string) => theme.fg("accent", s);
			const modelLine = currentProviderName
				? `${currentModelName} · ${currentProviderName}`
				: currentModelName || "no model";
			const cwdLine = shortenCwd();
			const art = clawdLines(accent);
			// CC's title is pale gold (sampled rgb(232,216,176) from the real
			// render), not the orange accent
			const gold = (s: string) => `\x1b[38;2;232;216;176m${s}\x1b[39m`;
			const info = [
				`${theme.bold(gold("Claude Code"))} ${dim(`v${VERSION}`)}`,
				dim(modelLine),
				dim(cwdLine),
			];
			return {
				invalidate() {},
				render(_width: number): string[] {
					// Clawd (8 cols) + 2-col gap + info column, like CC's CondensedLogo
					return art.map((l, i) => truncateToWidth(`${l}  ${info[i] ?? ""}`, 120, ""));
				},
			};
		});
	};

	// --- Editor: flat rules + orange ❯ + rotating "Try ..." placeholder ---
	let activeEditor: CodexStyleEditor | null = null;
	// --- Mode state: Plan (read-only) vs Auto (full) ---
	type Mode = "auto" | "plan";
	let mode: Mode = "auto";
	let toolsBeforePlan: string[] | undefined;
	let dockTui: { requestRender: (force?: boolean) => void } | null = null;

	// Mode banner, verbatim from CC: symbols + colors of its dark theme
	// (auto = warning rgb(255,193,7), plan = planMode rgb(72,150,140))
	const MODE_LABELS: Record<Mode, string> = {
		auto: `${yellow("⏵⏵ auto mode on")}${gray(" (shift+tab to cycle)")}`,
		plan: `${teal("⏸ plan mode on")}${gray(" (shift+tab to cycle)")}`,
	};

	// --- Editor: flat rules + gold ❯ + blinking bar cursor ---
	const setEditor = (ctx: ExtensionContext) => {
		ctx.ui.setEditorComponent((tui, theme, keybindings) => {
			// NOTE: the factory body runs synchronously inside
			// setEditorComponent (ctx live), but cursorOpen fires on every
			// editor render — it must not touch ctx (stale after session
			// replace/reload → uncaught throw kills pi).
			// cursorOpenFromFgAnsi currently ignores its arg (fixed gold bar).
			activeEditor = new CodexStyleEditor(tui, theme, keybindings, () =>
				cursorOpenFromFgAnsi(""),
			);
			// Shift+Tab toggles Plan/Auto (intercepted in the editor before pi's
			// built-in thinking-cycle can claim it)
			activeEditor.onShiftTab = () => toggleMode();
			return activeEditor;
		});
	};

	// --- Fallback CC rows for third-party/MCP tools ---
	// Tools registered by other extensions (MCP adapters, pi-task, …) ship no
	// renderCall/renderResult, so pi's fallback floods the transcript with 10+
	// wrapped lines. Prototype-patch ToolExecutionComponent (same module
	// instance pi's TUI uses, like the UserMessageComponent patch below) so any
	// tool WITHOUT its own renderers gets CC-style collapsed rows; tools that
	// do define renderers (built-in overrides, webfetch) are untouched.
	const patchThirdPartyToolRows = () => {
		const proto = ToolExecutionComponent.prototype as unknown as {
			toolName: string;
			args: unknown;
			toolDefinition?: unknown;
			builtInToolDefinition?: unknown;
			getCallRenderer: () => unknown;
			getResultRenderer: () => unknown;
			getRenderShell: () => string;
			__ccRowsPatched?: boolean;
		};
		if (proto.__ccRowsPatched) return;
		const origCall = proto.getCallRenderer;
		const origResult = proto.getResultRenderer;
		const origShell = proto.getRenderShell;
		const isBuiltin = (self: { builtInToolDefinition?: unknown }) => self.builtInToolDefinition !== undefined;
		// NOTE: theme must come from pi core's factory args (always live).
		// Never capture ctx.ui.theme here: a session_start ctx goes stale
		// after newSession/fork/switchSession/reload, and touching ctx.ui
		// inside render() throws where pi can't catch it (kills pi).
		proto.getCallRenderer = function () {
			const orig = origCall.call(this);
			if (orig || !enabled || !toolRowsEnabled || isBuiltin(this)) return orig;
			// renderCall is a factory: (args, theme, ctx) => component
			return (args: unknown, theme: unknown, rctx?: { isError?: boolean; isPartial?: boolean }) =>
				ccCall(theme as CCTheme, this.toolName, JSON.stringify(args ?? {}), dotStatus(rctx));
		};
		proto.getResultRenderer = function () {
			const orig = origResult.call(this);
			if (orig || !enabled || !toolRowsEnabled || isBuiltin(this)) return orig;
			return (result: unknown, options: { expanded?: boolean }, theme: unknown, rctx: { isError?: boolean }) =>
				ccResult(theme as CCTheme, "", result, options, Boolean(rctx?.isError));
		};
		// Drop the pending/success background box for third-party tools so they
		// match the flat CC look of the overridden built-ins.
		proto.getRenderShell = function () {
			if (enabled && toolRowsEnabled && !isBuiltin(this) && this.toolDefinition !== undefined) return "self";
			return origShell.call(this);
		};
		proto.__ccRowsPatched = true;
	};

	// Last-good usage numbers: widget render must survive a stale ctx
	// (session replaced/reloaded) — see setStatusWidget below.
	let cachedUsage = { used: 0, cost: 0 };

	// --- Status widget: compact CC statusline, right-aligned ABOVE the prompt ---
	const setStatusWidget = (ctx: ExtensionContext) => {
		ctx.ui.setWidget("cc-status", (tui, theme) => ({
			invalidate() {},
			render(width: number): string[] {
				dockTui = tui;
				// NOTE: never touch ctx.* in render — after session
				// replacement/reload the captured ctx is stale and any
				// access throws uncaught inside render (kills pi). Model
				// info stays fresh via model_select; usage falls back to
				// last-good values on stale ctx.
				const modelName = currentModelName || "no model";
				const sep = theme.fg("dim", " │ ");

				try {
					let used = 0;
					let cost = 0;
					for (const entry of ctx.sessionManager.getBranch()) {
						if (entry.type === "message" && entry.message.role === "assistant") {
							const usage = (entry.message as { usage?: { input: number; output: number; cacheRead: number; cacheWrite: number; cost?: { total?: number } } }).usage;
							if (usage) {
								used = usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
								cost += usage.cost?.total ?? 0;
							}
						}
					}
					cachedUsage = { used, cost };
				} catch {
					// stale ctx: reuse last-good numbers, never throw
				}
				const { used, cost } = cachedUsage;
				const win = currentContextWindow || 0;
				const pct = win > 0 ? Math.min(100, Math.round((used / win) * 100)) : 0;

				const muted = (s: string) => theme.fg("muted", s);
				const parts = [muted(modelName)];
				if (win > 0 && used > 0) {
					parts.push(
						`${theme.fg("dim", "Context ")}${muted(`${pct}%`)}${theme.fg("dim", ` (${formatTokens(used)}/${formatTokens(win)})`)}`,
					);
				}
				if (cost > 0) {
					parts.push(muted(`$${cost >= 0.01 ? cost.toFixed(2) : cost.toFixed(4)}`));
				}
				// NOTE: branch intentionally omitted — pi's built-in footer
				// already shows the git branch.

				const line = parts.join(sep);
				const pad = " ".repeat(Math.max(0, width - visibleWidth(line)));
				return [truncateToWidth(pad + line, width)];
			},
		}));
	};
	// --- Tool rendering overrides: delegate execute to real built-ins ---
	// Shared builder so the CC overrides and the stock natives stay in sync.
	const buildBuiltins = () => {
		const cwd = process.cwd();
		return {
			read: createReadToolDefinition(cwd),
			bash: createBashToolDefinition(cwd),
			grep: createGrepToolDefinition(cwd),
			find: createFindToolDefinition(cwd),
			ls: createLsToolDefinition(cwd),
			write: createWriteToolDefinition(cwd),
			edit: createEditToolDefinition(cwd),
		};
	};
	const registerToolOverrides = () => {
		const builtins = buildBuiltins();

		const callArgs: Record<string, (a: Record<string, unknown>) => string> = {
			read: (a) => strArg(a.path),
			bash: (a) => collapseCommand(strArg(a.command)),
			grep: (a) => {
				const p = strArg(a.pattern);
				const path = strArg(a.path);
				return path ? `${p} in ${path}` : p;
			},
			find: (a) => {
				const p = strArg(a.pattern);
				const path = strArg(a.path);
				return path ? `${p} in ${path}` : p;
			},
			ls: (a) => strArg(a.path) || ".",
			write: (a) => strArg(a.path),
			edit: (a) => strArg(a.path),
		};

		const registerCC = (name: string, builtin: { name: string }, override: { renderCall: unknown; renderResult: unknown }) => {
			pi.registerTool({
				...builtin,
				...override,
				renderShell: "self" as const,
			} as Parameters<typeof pi.registerTool>[0]);
		};

		const ccRenderers = (name: string) => ({
			renderCall(args: unknown, theme: unknown, context: unknown) {
				return ccCall(theme as CCTheme, name, (callArgs[name] ?? (() => ""))((args ?? {}) as Record<string, unknown>), dotStatus(context as { isError?: boolean; isPartial?: boolean }));
			},
			renderResult(result: unknown, options: unknown, theme: unknown, context: unknown) {
				const opts = options as { expanded?: boolean };
				const isError = Boolean((context as { isError?: boolean })?.isError);
				return ccResult(theme as CCTheme, name, result, opts, isError);
			},
		});

		registerCC("read", builtins.read, ccRenderers("read"));
		registerCC("bash", builtins.bash, ccRenderers("bash"));
		registerCC("grep", builtins.grep, ccRenderers("grep"));
		registerCC("find", builtins.find, ccRenderers("find"));
		registerCC("ls", builtins.ls, ccRenderers("ls"));
		registerCC("write", builtins.write, ccRenderers("write"));
		registerCC("edit", builtins.edit, ccRenderers("edit"));
	};

	// Stock natives (same definitions, no render overrides): re-registered
	// when the user turns the CC tool rows off at runtime, so the transcript
	// immediately stops using CC rows. Another TUI extension that owns tool
	// rendering takes over fully after a /reload (load order decides).
	const registerNativeTools = () => {
		const builtins = buildBuiltins();
		for (const builtin of Object.values(builtins)) {
			pi.registerTool(builtin as Parameters<typeof pi.registerTool>[0]);
		}
	};

	// --- Footer line as belowEditor widget (native-on mode; keeps the
	// footer slot free so other extensions' footers survive) ---
	// One-line footer text shared by both footer modes (slot vs widget).
	// CC behavior: while the input holds text, only the mode label shows —
	// the hints collapse away and return when the input is empty/submitted.
	const editorHasText = (): boolean => {
		try {
			return (activeEditor?.getText() ?? "").trim().length > 0;
		} catch {
			return false;
		}
	};
	const footerLineText = (fgDim: (s: string) => string, width: number): string => {
		const label = MODE_LABELS[mode];
		if (editorHasText()) return truncateToWidth(label, width, "");
		const hints = fgDim("· ! for bash mode · ctrl+p model · ctrl+o tools");
		return truncateToWidth(`${label} ${hints}`, width);
	};

	const setFooterLine = (ctx: ExtensionContext) => {
		ctx.ui.setWidget("cc-footer", (_tui, theme) => ({
			invalidate() {},
			render(width: number): string[] {
				return [footerLineText((s) => theme.fg("dim", s), width)];
			},
		}), { placement: "belowEditor" });
	};

	// Footer-slot version of the mode/hints line (native-off mode). The dock
	// layout reserves minSize:1 for the footer container, so the slot must
	// render exactly one line — an empty footer would leave a blank row and
	// push the editor up instead of docking it at the bottom.
	const setFooterModeLine = (ctx: ExtensionContext) => {
		ctx.ui.setFooter((_tui, theme) => ({
			invalidate() {},
			render(width: number): string[] {
				return [footerLineText((s) => theme.fg("dim", s), width)];
			},
		}));
	};

	// --- Native footer toggle (/claude-footer) ---
	// showNativeFooter = true  → pi's built-in footer (keeps other
	//   extensions' footers / setStatus texts); mode/hints live as the
	//   cc-footer widget, cc-status hides to avoid duplicating info.
	// showNativeFooter = false → footer slot renders mode/hints (fills its
	//   minSize:1, editor stays docked); cc-status widget shows above input.
	// The footer slot is single-occupancy: occupying it is an explicit user
	// choice here, flippable at any time with /claude-footer.
	// Default off = v1.2.0 look, zero visual regression for existing users.
	let showNativeFooter = false;
	const applyFooterMode = (ctx: ExtensionContext) => {
		if (ctx.mode !== "tui") return;
		if (showNativeFooter) {
			ctx.ui.setFooter(undefined); // restore built-in footer
			ctx.ui.setWidget("cc-status", undefined);
			setFooterLine(ctx); // mode/hints live as belowEditor widget
		} else {
			setFooterModeLine(ctx); // fills footer's minSize:1, no gap
			ctx.ui.setWidget("cc-footer", undefined);
			setStatusWidget(ctx);
		}
	};

	// --- Working indicator + verb rotation ---
	const applyWorking = (ctx: ExtensionContext) => {
		ctx.ui.setWorkingIndicator({
			frames: SPINNER_FRAMES.map((f) => orange(f)),
			intervalMs: 120,
		});
		ctx.ui.setWorkingMessage(
			`${orange(verb)}…  ${gray("(esc to interrupt)")}`,
		);
	};

	const startRun = (ctx: ExtensionContext) => {
		if (!enabled) return;
		runStart = Date.now();
		verb = randomOf(SPINNER_VERBS);
		if (tickTimer) clearInterval(tickTimer);
		let ticks = 0;
		tickTimer = setInterval(() => {
			try {
				ticks++;
				if (ticks % 7 === 0) verb = randomOf(SPINNER_VERBS);
				ctx.ui.setWorkingMessage(
					`${orange(verb)}…  ${gray(`(esc to interrupt · ${formatDuration(Date.now() - runStart)})`)}`,
				);
			} catch {
				// ctx went stale (session replaced/reloaded mid-run): stop
				// ticking quietly instead of throwing uncaught (kills pi).
				if (tickTimer) {
					clearInterval(tickTimer);
					tickTimer = null;
				}
			}
		}, 1000);
	};

	const endRun = (ctx: ExtensionContext) => {
		if (tickTimer) {
			clearInterval(tickTimer);
			tickTimer = null;
		}
		if (!enabled || runStart === 0) return;
		const elapsed = Date.now() - runStart;
		runStart = 0;
		if (elapsed >= 1000) {
			ctx.ui.notify(orange(`✻ ${randomOf(TURN_COMPLETION_VERBS)} for ${formatDuration(elapsed)}`), "info");
		}
	};

	const enable = (ctx: ExtensionContext) => {
		enabled = true;
		if (ctx.mode !== "tui") return;
		currentModelName = ctx.model?.name || ctx.model?.id || "";
		currentProviderName = ctx.model?.provider || "";
		currentContextWindow = ctx.model?.contextWindow || 0;
		patchThirdPartyToolRows();
		setHeader(ctx);
		setEditor(ctx);
		applyFooterMode(ctx);
		applyWorking(ctx);
	};

	const disable = (ctx: ExtensionContext) => {
		enabled = false;
		if (tickTimer) {
			clearInterval(tickTimer);
			tickTimer = null;
		}
		if (ctx.mode !== "tui") return;
		ctx.ui.setHeader(undefined);
		ctx.ui.setEditorComponent(undefined);
		// Replica fully off: relinquish the footer slot (restores pi's
		// built-in footer). Single-occupancy caveat still applies, but an
		// explicit off means the user wants stock pi back.
		ctx.ui.setFooter(undefined);
		ctx.ui.setWidget("cc-status", undefined);
		ctx.ui.setWidget("cc-footer", undefined);
		if (toolsBeforePlan) {
			pi.setActiveTools(toolsBeforePlan);
			toolsBeforePlan = undefined;
		}
		ctx.ui.setWorkingIndicator();
		ctx.ui.setWorkingMessage();
	};

	const setMode = (next: Mode) => {
		if (mode === next) return;
		mode = next;
		if (next === "plan") {
			toolsBeforePlan = pi.getActiveTools();
			pi.setActiveTools(toolsBeforePlan.filter((t) => t !== "edit" && t !== "write"));
		} else if (toolsBeforePlan) {
			pi.setActiveTools(toolsBeforePlan);
			toolsBeforePlan = undefined;
		}
		dockTui?.requestRender(true);
	};

	const toggleMode = () => {
		setMode(mode === "auto" ? "plan" : "auto");
	};

	pi.registerCommand("mode", {
		description: "Toggle Plan Mode / Auto Mode (or: /mode plan, /mode auto)",
		handler: async (args) => {
			const a = args.trim().toLowerCase();
			if (a === "plan" || a === "auto") setMode(a);
			else toggleMode();
		},
	});

	pi.on("before_agent_start", async (event) => {
		if (mode !== "plan") return;
		const directive = [

			"## Plan Mode",
			"Plan Mode is ACTIVE. In this turn you are a read-only researcher:",
			"- Do NOT edit, create, or delete any files.",
			"- Explore the codebase, then present a concise, numbered implementation plan.",
			"- Wait for explicit user approval before proposing to make changes.",
		].join("\n");
		return { systemPrompt: `${event.systemPrompt}\n\n${directive}` };
	});

	pi.on("session_start", async (_event, ctx) => {
		enable(ctx);
	});

	pi.on("model_select", async (event, _ctx) => {
		currentModelName = event.model?.name || event.model?.id || "";
		currentProviderName = event.model?.provider || "";
		currentContextWindow = event.model?.contextWindow || 0;
	});

	pi.on("agent_start", async (_event, ctx) => {
		startRun(ctx);
	});

	pi.on("agent_settled", async (_event, ctx) => {
		endRun(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		if (tickTimer) {
			clearInterval(tickTimer);
			tickTimer = null;
		}
		if (ctx.mode === "tui") {
			ctx.ui.setWorkingIndicator();
			ctx.ui.setEditorComponent(undefined);
		}
	});

	pi.registerCommand("claude-tui", {
		description: "Toggle the Claude Code TUI replica (header / editor / spinner / status line)",
		handler: async (_args, ctx) => {
			if (enabled) {
				disable(ctx);
				ctx.ui.notify("Claude Code TUI replica disabled", "info");
			} else {
				enable(ctx);
				ctx.ui.notify("Claude Code TUI replica enabled", "info");
			}
		},
	});

	pi.registerCommand("claude-tools", {
		description: "Toggle the CC tool rows independently (off: coexist with other TUI extensions' tool rendering)",
		handler: async (args, ctx) => {
			const a = args.trim().toLowerCase();
			const next = a === "on" ? true : a === "off" ? false : !toolRowsEnabled;
			toolRowsEnabled = next;
			saveToolRowsPref(next);
			if (next) {
				registerToolOverrides();
				ctx.ui.notify("CC tool rows on", "info");
			} else {
				registerNativeTools();
				ctx.ui.notify("CC tool rows off — run /reload if another TUI extension should take over tool rendering", "info");
			}
		},
	});

	pi.registerCommand("claude-verb", {
		description: "Reroll the Claude Code spinner verb",
		handler: async (_args, ctx) => {
			verb = randomOf(SPINNER_VERBS);
			ctx.ui.notify(`✻ ${verb}…`, "info");
		},
	});

	pi.registerCommand("claude-footer", {
		description: "Toggle pi's native footer (on: keep MCP/other footers, hide CC status widget; off: CC-clean look)",
		handler: async (args, ctx) => {
			const a = args.trim().toLowerCase();
			if (a === "on" || a === "off") showNativeFooter = a === "on";
			else showNativeFooter = !showNativeFooter;
			if (enabled) applyFooterMode(ctx);
			ctx.ui.notify(
				`Native footer ${showNativeFooter ? "on — CC status widget hidden" : "off — CC status widget shown"}`,
				"info",
			);
		},
	});

	// Off at load (CC_TUI_TOOL_ROWS=0): don't touch tool registration at all,
	// so another TUI extension owns tool rendering from the start.
	if (toolRowsEnabled) registerToolOverrides();

	// Compact CC-style user bars: UserMessageComponent wraps content in a Box
	// with hardcoded paddingY=1 (a blank row above and below the bar). Patch
	// rebuild to zero it so the bar sits tight against neighboring messages.
	const userProto = UserMessageComponent.prototype as unknown as { rebuild: () => void; __ccCompact?: boolean };
	if (!userProto.__ccCompact) {
		const origRebuild = userProto.rebuild;
		userProto.rebuild = function (this: { children?: Array<{ paddingY?: number }> }) {
			origRebuild.call(this);
			for (const child of this.children ?? []) {
				if (child && typeof child.paddingY === "number" && child.paddingY > 0) child.paddingY = 0;
			}
		};
		userProto.__ccCompact = true;
	}

	// History user messages: CC-style slim bar — dim `❯` at column 0 (outputPad
	// setting is 0) on a one-row near-black background spanning the content
	// width. Continuation lines indent 2 cols so no glyph ever shares ❯'s
	// column, like CC. Display-only: session and model context keep the
	// original text.
	// CC renders conversation text explicitly white; pi leaves it at the
	// terminal default (which can be any color, e.g. Gruvbox cream). Force
	// white on plain lines; markdown-styled lines (headings, lists, code,
	// tables) keep their own theme colors.
	const WHITE = "\x1b[38;2;255;255;255m";
	const plainLine = (l: string) => !/^(\s*[#>*`\-|]|\s*\d+\.)/.test(l) && l.trim() !== "";

	pi.registerMarkdownTransformer((markdown, { messageType, availableWidth }) => {
		if (messageType === "assistant") {
			let inFence = false;
			return markdown
				.split("\n")
				.map((l) => {
					if (/^\s*```/.test(l)) {
						inFence = !inFence;
						return l;
					}
					if (inFence) return l; // keep syntax highlighting
					// list items: wrap only the text after the marker so the
					// markdown list structure survives
					const m = l.match(/^(\s*(?:[-*+]|\d+\.)\s+)(.*)$/);
					if (m && m[2]!.trim() !== "") return `${m[1]}${WHITE}${m[2]}${RESET}`;
					return plainLine(l) ? `${WHITE}${l}${RESET}` : l;
				})
				.join("\n");
		}
		if (messageType !== "user") return markdown;
		const bg = "\x1b[48;2;55;55;55m"; // CC userMessageBackground rgb(55,55,55)
		const bgOff = "\x1b[49m";
		const width = Math.max(1, Math.floor(availableWidth ?? 80));
		// Pad with NBSPs: plain trailing spaces get trimmed by the markdown
		// renderer, NBSPs survive, so the bar spans the full row.
		return markdown
			.split("\n")
			.map((line, i) => {
				const text = `${WHITE}${line}${RESET}`;
				const content = i === 0 ? `${gray("❯")} ${text}` : `  ${text}`;
				const pad = "\u00A0".repeat(Math.max(0, width - visibleWidth(content) - 1));
				return `${bg}${content}${pad}${bgOff}`;
			})
			.join("\n");
	});
}
