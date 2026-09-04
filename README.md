# pi-claude-code-tui

一个复刻 Anthropic Claude Code TUI 外观与手感的 [pi](https://pi.dev) 包。

<img width="691" height="448" alt="image" src="https://github.com/user-attachments/assets/3a030401-ed14-4705-b865-fdaf35fcba4f" />


## 你能得到什么

- **启动头** — 像素风 Clawd 吉祥物 + 粗体 `Claude Code` 标题 + 当前模型名与 cwd（第三方模型名原样显示）
- **精简提示栏** — 平面分隔线、金色 `❯` 提示符、金色条状光标；编辑器为空时显示暗色旋转的 `Try "..."` 建议
- **CC 风格工具行** — `⏺ Tool(args)` 格式 + 暗色 `⎿` 输出槽、彩色 diff、红色错误提示（内置工具的执行逻辑完全不动，仅渲染层改造）。折叠输出上限为 **3 个物理行**（单行压缩 JSON 可能换行成几十个终端行，所以折叠按换行后的行数计算，而非逻辑行数），并带展开提示。
- **第三方 / MCP 工具回退** — 其他扩展注册的工具（MCP 适配器、`task` 等）没有自带渲染器，会用 pi 默认的 10 行 fallback 淹没对话记录；本扩展通过 prototype-patch `ToolExecutionComponent`，让任何没有 `renderCall`/`renderResult` 的工具都能获得同样的 CC 风格折叠行。
- **旋转状态动词** — 全套 190 个 Claude Code 俏皮动词（`Pondering…`、`Vibing…`、`Flibbertigibbeting…`），配花瓣旋转动画，完成时显示 `✻ Worked for 12s` 收尾行
- **状态行** — 提示栏上方显示 `model │ Context 23% (50k/200k) │ $0.042`。运行 `/claude-footer on` 可换回 pi 原生 footer（保留其他扩展的 footer，如 MCP 适配器——CC 状态组件会自动隐藏，避免重复）
- **底部提示行** — `⏵⏵ auto mode on …` 按键提示；输入框有内容时自动压缩为仅模式标签
- **历史消息** — 已发送的消息渲染为细长全宽条，带暗色 `❯` 前缀
- **claude-code 主题** — 将 Claude Code 暗色调色板应用到整个 TUI

以上全部只是显示层：**不会改变任何发给模型的内容**。

## 安装

```bash
pi install git:github.com/Shiorangerin/pi-claude-code-tui
```

然后在 pi 中打开 `/settings`，选择 **claude-code** 主题，重启 pi。

### 或者直接把这段复制给你的 AI 助手

```text
请帮我安装 pi 包 "pi-claude-code-tui"：
1. 运行：pi install git:github.com/Shiorangerin/pi-claude-code-tui
2. 打开 pi，运行 /settings，选择 "claude-code" 主题
3. 重启 pi
```

## 命令

| 命令 | 说明 |
| --- | --- |
| `/claude-tui` | 整体开关复刻效果（头图 / 编辑器 / 旋转动画 / 状态行；工具行独立控制，见下） |
| `/claude-tools` | 独立开关 CC 工具行（`on` / `off`，不带参数则翻转） |
| `/claude-footer` | 切换 pi 原生 footer（`on`：保留 MCP 等扩展的 footer、隐藏 CC 状态组件；`off`：纯 CC 干净外观） |
| `/claude-verb` | 重新掷一个旋转动画动词 |
| `Shift+Tab` 或 `/mode` | 切换 **Plan Mode** / **Auto Mode** |

### 模式

- **Auto Mode** — 正常的完整工具权限（默认）
- **Plan Mode** — 只读研究：`edit`/`write` 工具被禁用，模型被指示先探索并给出方案，而不是直接改动

当前模式始终显示在提示栏下方提示行的左侧。

## 与其他 TUI 扩展的兼容性

pi 中工具渲染是单占位机制：`read` / `bash` / `grep` / `find` / `ls` / `write` / `edit` 这几行的样式只能由一个扩展接管。本包默认自动让位：

- **自动检测（默认）** — 每次会话启动时检查 `pi.getAllTools()` 的源元数据。如果其他扩展（如 [pi-cc-extensions](https://github.com/minuque/pi-cc-extensions)）已占用内置工具行，CC 工具行保持关闭并一次性提示原因。无需任何配置。
- **手动覆盖** — `/claude-tools on` 收回工具行，`/claude-tools off` 让出，`/claude-tools auto` 恢复自动检测。选择会保存到 `~/.pi/agent/claude-tui.json`，在 `/reload` 和重启后依然生效；`CC_TUI_TOOL_ROWS=0` 可强制关闭。
- **头图/编辑器槽位**同样是单占位（后写者胜）。如果与其他 TUI 套件同时使用，请在 `settings.json` 的 `packages` 列表里把本包放在**后面**，这样头图和编辑器由本包接管。

## 推荐设置

两个 Claude Code 行为存在于你的 pi 设置中（不在本包内），把它们加到 `~/.pi/agent/settings.json`：

```json
{
  "tuiMode": "fullscreen",
  "outputPad": 0,
  "quietStartup": true
}
```

- `tuiMode: "fullscreen"` — 将提示栏和状态行固定到终端底部，对话记录可滚动（Claude Code 的行为方式）
- 注意：`Shift+Tab` 被改为切换模式，不再是 pi 内置的思考层级循环
- `outputPad: 0` — 已发送的消息从第 0 列开始顶格显示
- `quietStartup: true` — 隐藏启动时的资源列表（自定义头图保留）

## 说明

- 主题假定使用深色终端。
- 工具行样式覆盖了 `read`、`bash`、`grep`、`find`、`ls`、`write`、`edit` 的内置渲染器；执行始终委托给 pi 的内置实现。
- 编辑器组件改编自 Phoobobo 的 MIT 许可项目 [pi-claude-code-tui](https://github.com/Phoobobo/pi-claude-code-tui)。
- Claude Code 是 Anthropic 的产品。本包只模仿其终端美学，不含其任何代码。

## 故障排查

- **头图（Clawd）不见了** — 很可能是另一个 TUI 扩展在本包之后加载，清空了共享头图槽位。请在 `settings.json` 的 `packages` 列表里把本包放在它**后面**，然后 `/reload`。另外检查对方扩展自己的头图开关（pi-cc-extensions 是 `~/.pi/agent/claude-code-style.json` 里的 `showStartupHeader`）。
- **工具行显示异常 / 双重样式** — 两个扩展在样式化同一批工具行。运行 `/claude-tools off`（`/reload` 后依然生效）把工具渲染让给另一个扩展，或 `/claude-tools on` 收回。
- **切换了选项但没有任何变化** — pi 会在磁盘上缓存编译后的扩展。运行 `rm $TMPDIR/jiti/*claude-tui* $TMPDIR/jiti/*claude-code-tui*`，重启 pi 再试。
- **`/claude-tools off` 在 `/reload` 后失效** — 你用的是 ≤ 1.2.2 版本。重新运行 `pi install git:github.com/Shiorangerin/pi-claude-code-tui` 升级到 ≥ 1.3.1，该版本会持久化选择。

如果以上都没用，请开一个 issue，附上你的 pi 版本（`pi --version`）、包版本和 `packages` 列表顺序。

## 许可证

MIT