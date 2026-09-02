/**
 * Claude Code TUI 复刻扩展（v2 — 全页面复刻）
 * 参考 Claude Code 官方源码 UI（spinnerVerbs / Clawd / BuiltinStatusLine / PromptInput /
 * AssistantToolUseMessage），在 pi 上复刻其 TUI 观感：
 * - 启动头：Clawd 吉祥物 + "Claude Code vX" + 模型名（第三方模型名原样保留）+ cwd
 * - 输入框：CC 式半开圆角边框（只有上下边）+ accent 块状光标（移植自 MIT 的
 *   pi-claude-code-tui 包，见 lib/claude-tui-editor.ts）
 * - 工具行：用公共 API 实例化内置工具并原样委托 execute，只覆写渲染为
 *   CC 风格 `⏺ Tool(args)` + `⎿  输出`（错误红色、edit 带彩色 diff、
 *   read 折叠摘要），renderShell "self" 去掉背景盒
 * - Spinner：✻ 花型动画 + Claude 橙 + 190 个 Claude Code 俏皮动词轮换 + (esc to interrupt · Ns)
 * - 收尾：✻ Worked for 12s（CC 过去式动词）
 * - 状态栏：模型 │ Context 23% (50k/200k) │ $0.042 │ 分支
 *
 * Commands:
 *   /claude-tui  — 开/关整套复刻 UI
 *   /claude-verb — 立即换一个随机动词
 */

import { VERSION, keyHint, createBashToolDefinition, createEditToolDefinition, createFindToolDefinition, createGrepToolDefinition, createLsToolDefinition, createReadToolDefinition, createWriteToolDefinition, renderDiff } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { CodexStyleEditor, cursorOpenFromFgAnsi } from "./lib/claude-tui-editor.ts";

// --- Claude Code palette (dark theme, from src/utils/theme.ts) ---
const CLAUDE = "\x1b[38;2;215;119;87m";
const CLAUDE_DIM = "\x1b[38;2;153;153;153m";
const RESET = "\x1b[39m";

const orange = (s: string) => `${CLAUDE}${s}${RESET}`;
const gray = (s: string) => `${CLAUDE_DIM}${s}${RESET}`;

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

// `⏺ Tool(args)` call row: orange dot, bold tool name, plain args.
const ccCall = (theme: CCTheme, name: string, args: string): Text =>
	new Text(`${theme.fg("accent", "⏺")} ${theme.bold(name)}${args ? `(${args})` : ""}`, 0, 0);

// `⎿  output` result rows: dim gutter + dim text (red on error), collapsed
// preview with an expand hint, like Claude Code.
const ccResult = (
	theme: CCTheme,
	name: string,
	result: unknown,
	options: { expanded?: boolean },
	isError: boolean,
): Text => {
	const gutter = theme.fg("dim", "  ⎿  ");
	const cont = "     ";
	const output = textOfResult(result).replace(/\n+$/, "");
	const lines = output ? output.split("\n") : [];

	// Errors: red summary + red detail lines, like CC's `⎿  Error: ...`
	if (isError) {
		const errLines = lines.slice(0, options.expanded ? lines.length : 6);
		const body = errLines.map((l, i) => `${i === 0 ? gutter : cont}${theme.fg("error", l)}`).join("\n");
		return new Text(body || `${gutter}${theme.fg("error", "Error")}`, 0, 0);
	}

	// Edit: summary + colored diff, CC-style
	if (name === "edit") {
		const diff = (result as { details?: { diff?: string } }).details?.diff;
		let body = `${gutter}${theme.fg("toolOutput", lines[0] || "Updated file")}`;
		if (diff) {
			body +=
				"\n" +
				renderDiff(diff)
					.split("\n")
					.map((l) => cont + l)
					.join("\n");
		}
		return new Text(body, 0, 0);
	}

	// Read collapsed: one-line summary, like CC
	if (name === "read" && !options.expanded) {
		return new Text(
			`${gutter}${theme.fg("toolOutput", `Read ${lines.length} lines`)} ${theme.fg("dim", `(${keyHint("app.tools.expand", "to expand")})`)}`,
			0,
			0,
		);
	}

	if (lines.length === 0) {
		return new Text(`${gutter}${theme.fg("toolOutput", "(no content)")}`, 0, 0);
	}

	// Generic collapsed preview
	const maxLines = options.expanded ? lines.length : 6;
	const display = lines.slice(0, maxLines);
	const remaining = lines.length - display.length;
	let body = display.map((l, i) => `${i === 0 ? gutter : cont}${theme.fg("toolOutput", l)}`).join("\n");
	if (remaining > 0) {
		body += `\n${cont}${theme.fg("dim", `... +${remaining} lines (${keyHint("app.tools.expand", "to expand")})`)}`;
	}
	return new Text(body, 0, 0);
};

export default function (pi: ExtensionAPI) {
	let enabled = false;
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
	const SUGGESTIONS = [
		'Try "fix typecheck errors"',
		'Try "how does this project work?"',
		'Try "summarize TODO.md"',
		'Try "write a test for the parser"',
		'Try "find and fix the race condition"',
		'Try "explain the build pipeline"',
		'Try "refactor the duplicated code"',
		'Try "add error handling to the CLI"',
	];
	let suggestion = randomOf(SUGGESTIONS);
	const setEditor = (ctx: ExtensionContext) => {
		ctx.ui.setEditorComponent((tui, theme, keybindings) => {
			activeEditor = new CodexStyleEditor(
				tui,
				theme,
				keybindings,
				() => cursorOpenFromFgAnsi(ctx.ui.theme.getFgAnsi("accent")),
				() => suggestion,
			);
			return activeEditor;
		});
	};

	// --- Tool rendering overrides: delegate execute to real built-ins ---
	const registerToolOverrides = () => {
		const cwd = process.cwd();
		const builtins = {
			read: createReadToolDefinition(cwd),
			bash: createBashToolDefinition(cwd),
			grep: createGrepToolDefinition(cwd),
			find: createFindToolDefinition(cwd),
			ls: createLsToolDefinition(cwd),
			write: createWriteToolDefinition(cwd),
			edit: createEditToolDefinition(cwd),
		};

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
			renderCall(args: unknown, theme: unknown) {
				return ccCall(theme as CCTheme, name, (callArgs[name] ?? (() => ""))((args ?? {}) as Record<string, unknown>));
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

	// --- Footer: hint line (all real pi keybindings) + CC status line ---
	const setFooter = (ctx: ExtensionContext) => {
		ctx.ui.setFooter((tui, theme, footerData) => {
			const unsub = footerData.onBranchChange(() => tui.requestRender());
			return {
				dispose: unsub,
				invalidate() {},
				render(width: number): string[] {
					// Hint line: only features that actually exist in pi
					const hints = theme.fg(
						"dim",
						"! for bash mode · ctrl+p for model · shift+tab for thinking · ctrl+o for tools · ctrl+g for editor",
					);

					const modelName = currentModelName || ctx.model?.name || ctx.model?.id || "no model";
					const sep = theme.fg("dim", " │ ");

					// Context usage from the last assistant message
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
					const win = currentContextWindow || ctx.model?.contextWindow || 0;
					const pct = win > 0 ? Math.min(100, Math.round((used / win) * 100)) : 0;

					const parts = [modelName];
					if (win > 0 && used > 0) {
						parts.push(
							`${theme.fg("dim", "Context ")}${pct}%${theme.fg("dim", ` (${formatTokens(used)}/${formatTokens(win)})`)}`,
						);
					}
					if (cost > 0) {
						parts.push(`$${cost >= 0.01 ? cost.toFixed(2) : cost.toFixed(4)}`);
					}
					const branch = footerData.getGitBranch();
					if (branch) parts.push(theme.fg("dim", branch));

					const status = truncateToWidth(parts.join(sep), width);
					// Hint line only while the editor is empty, like CC
					if (activeEditor && activeEditor.getText().length > 0) {
						return [status];
					}
					return [truncateToWidth(hints, width), status];
				},
			};
		});
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
			ticks++;
			if (ticks % 7 === 0) verb = randomOf(SPINNER_VERBS);
			ctx.ui.setWorkingMessage(
				`${orange(verb)}…  ${gray(`(esc to interrupt · ${formatDuration(Date.now() - runStart)})`)}`,
			);
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
		suggestion = randomOf(SUGGESTIONS);
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
		setHeader(ctx);
		setEditor(ctx);
		setFooter(ctx);
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
		ctx.ui.setFooter(undefined);
		ctx.ui.setWorkingIndicator();
		ctx.ui.setWorkingMessage();
	};

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

	pi.registerCommand("claude-verb", {
		description: "Reroll the Claude Code spinner verb",
		handler: async (_args, ctx) => {
			verb = randomOf(SPINNER_VERBS);
			ctx.ui.notify(`✻ ${verb}…`, "info");
		},
	});

	registerToolOverrides();

	// History user messages: CC-style slim bar — dim `❯` at column 0 (outputPad
	// setting is 0) on a one-row near-black background spanning the content
	// width. Display-only: session and model context keep the original text.
	pi.registerMarkdownTransformer((markdown, { messageType, availableWidth }) => {
		if (messageType !== "user") return markdown;
		const bg = "\x1b[48;2;30;30;30m";
		const bgOff = "\x1b[49m";
		const width = Math.max(1, Math.floor(availableWidth ?? 80));
		// Pad with NBSPs: plain trailing spaces get trimmed by the markdown
		// renderer, NBSPs survive, so the bar spans the full row.
		return markdown
			.split("\n")
			.map((line, i) => {
				const content = i === 0 ? `${gray("❯")} ${line}` : line;
				const pad = "\u00A0".repeat(Math.max(0, width - visibleWidth(content) - 1));
				return `${bg}${content}${pad}${bgOff}`;
			})
			.join("\n");
	});
}
