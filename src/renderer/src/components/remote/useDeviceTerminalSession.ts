import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import {
	type ForwardedRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
} from "react";
import { confirmDangerousCommand } from "./confirmDangerousCommand";
import type { DeviceTerminalRef } from "./DeviceTerminal";
import { checkDangerousCommand } from "./dangerousCommands";
import { LineEditor } from "./terminalLineEditor";
import type { CommandResult } from "@/types/electron";

// Catppuccin Mocha palette
const THEME = {
	background: "#1e1e2e",
	foreground: "#cdd6f4",
	cursor: "#f5e0dc",
	cursorAccent: "#1e1e2e",
	selectionBackground: "#585b7066",
	black: "#45475a",
	red: "#f38ba8",
	green: "#a6e3a1",
	yellow: "#f9e2af",
	blue: "#89b4fa",
	magenta: "#f5c2e7",
	cyan: "#94e2d5",
	white: "#bac2de",
	brightBlack: "#585b70",
	brightRed: "#f38ba8",
	brightGreen: "#a6e3a1",
	brightYellow: "#f9e2af",
	brightBlue: "#89b4fa",
	brightMagenta: "#f5c2e7",
	brightCyan: "#94e2d5",
	brightWhite: "#a6adc8",
};

/** 生成带 cwd 的 prompt: 蓝色路径 + 绿色 $ */
function makePrompt(cwd?: string): string {
	if (!cwd) return "\x1b[38;2;166;227;161m$\x1b[0m ";
	// 缩短 home 目录为 ~
	const home = cwd.match(/^\/(?:home\/[^/]+|Users\/[^/]+|root)/)?.[0];
	const display =
		home && cwd.startsWith(home) ? "~" + cwd.slice(home.length) : cwd;
	return `\x1b[38;2;137;180;250m${display}\x1b[0m \x1b[38;2;166;227;161m$\x1b[0m `;
}

function findCommonPrefix(strings: string[]): string {
	if (!strings.length) return "";
	let prefix = strings[0];
	for (let i = 1; i < strings.length; i++) {
		while (!strings[i].startsWith(prefix)) {
			prefix = prefix.slice(0, -1);
			if (!prefix) return "";
		}
	}
	return prefix;
}

export interface DeviceTerminalSessionOptions {
	deviceId: string;
	disabled: boolean;
	onCommand: (command: string, timeout?: number) => Promise<CommandResult>;
}

/**
 * 承载 DeviceTerminal 的全部会话生命周期：创建 xterm 实例、加载插件、
 * 连接设备（getCwd）、注册键盘输入处理（委托 LineEditor）、订阅流式输出、
 * 监听容器 resize，并在卸载时清理定时器 / 订阅 / observer / 终端实例。
 *
 * 返回需要挂到容器 div 上的 ref。逻辑与原组件内联实现完全等价，仅做下沉。
 */
export function useDeviceTerminalSession(
	{ deviceId, disabled, onCommand }: DeviceTerminalSessionOptions,
	ref: ForwardedRef<DeviceTerminalRef>,
) {
	const containerRef = useRef<HTMLDivElement>(null);
	const terminalRef = useRef<Terminal | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const editorRef = useRef(new LineEditor());
	const isExecutingRef = useRef(false);
	const disabledRef = useRef(disabled);
	const deviceIdRef = useRef(deviceId);
	const currentRequestIdRef = useRef<string | null>(null);
	const isAwaitingConfirmRef = useRef(false);
	const cwdRef = useRef<string | undefined>(undefined);

	// Keep refs in sync
	disabledRef.current = disabled;
	deviceIdRef.current = deviceId;

	const writePrompt = useCallback(() => {
		terminalRef.current?.write(makePrompt(cwdRef.current));
	}, []);

	useImperativeHandle(
		ref,
		() => ({
			clear: () => {
				const term = terminalRef.current;
				if (term) {
					term.clear();
					term.write("\x1b[2J\x1b[H");
					editorRef.current.line = "";
					editorRef.current.cursorPos = 0;
					writePrompt();
				}
			},
			focus: () => {
				terminalRef.current?.focus();
			},
		}),
		[writePrompt],
	);

	useEffect(() => {
		if (!containerRef.current) return;
		let active = true;

		const terminal = new Terminal({
			theme: THEME,
			fontFamily:
				"'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
			fontSize: 13,
			lineHeight: 1.4,
			cursorBlink: true,
			cursorStyle: "bar",
			scrollback: 5000,
			convertEol: true,
			allowProposedApi: true,
		});

		const fitAddon = new FitAddon();
		const webLinksAddon = new WebLinksAddon();

		terminal.loadAddon(fitAddon);
		terminal.loadAddon(webLinksAddon);
		terminal.open(containerRef.current);

		// Initial fit
		requestAnimationFrame(() => {
			try {
				fitAddon.fit();
			} catch {
				// Container may not be visible yet
			}
		});

		// Intercept keyboard events so Electron doesn't steal Ctrl+C/L
		terminal.attachCustomKeyEventHandler((event) => {
			if (event.type !== "keydown") return true;
			// Ctrl+C: if text is selected, let browser copy; otherwise xterm handles
			if (event.ctrlKey && event.key === "c") {
				return !terminal.hasSelection();
			}
			// Ctrl+L: always let xterm handle
			if (event.ctrlKey && event.key === "l") {
				return true;
			}
			// Ctrl+V: let browser paste (xterm will receive via onData)
			if (event.ctrlKey && event.key === "v") {
				return false;
			}
			return true;
		});

		// 提前赋值 ref，writePrompt / onData 等闭包中会用到
		terminalRef.current = terminal;
		fitAddonRef.current = fitAddon;

		// Welcome message
		terminal.writeln(
			"\x1b[38;2;88;91;112m远程终端 - 输入命令并按 Enter 执行\x1b[0m",
		);
		terminal.writeln(
			"\x1b[38;2;88;91;112mCtrl+C 终止 | Ctrl+L 清屏 | ↑↓ 历史命令 | 支持行内编辑\x1b[0m",
		);
		terminal.writeln("");

		// 加载动画
		const spinner = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
		let spinIdx = 0;
		const loadingText = "连接设备中";
		terminal.write(`\x1b[38;2;88;91;112m${spinner[0]} ${loadingText}\x1b[0m`);
		const spinTimer = setInterval(() => {
			spinIdx = (spinIdx + 1) % spinner.length;
			// 回到行首，重写 spinner
			terminal.write(
				`\r\x1b[38;2;88;91;112m${spinner[spinIdx]} ${loadingText}\x1b[0m`,
			);
		}, 80);

		// 获取初始工作目录后替换为 prompt
		window.electron.remoteDevice
			.getCwd(deviceIdRef.current)
			.then((result) => {
				if (!active) return;
				if (result.success && result.data) cwdRef.current = result.data;
			})
			.catch(() => {})
			.finally(() => {
				clearInterval(spinTimer);
				if (!active) return;
				// 清除加载行，写入 prompt
				terminal.write("\r\x1b[K");
				writePrompt();
			});

		// Execute command helper (extracted for reuse with danger confirmation)
		const executeCmd = (cmd: string) => {
			isExecutingRef.current = true;
			onCommand(cmd)
				.then((result) => {
					// 更新 cwd
					if (result.cwd) cwdRef.current = result.cwd;
					if (result.exitCode !== 0) {
						// 失败: 红色退出码 + 耗时
						const dur =
							result.duration >= 1000
								? `${(result.duration / 1000).toFixed(1)}s`
								: `${result.duration}ms`;
						terminal.writeln(
							`\x1b[38;2;243;139;168m✘ exit ${result.exitCode}\x1b[0m\x1b[38;2;88;91;112m  ${dur}\x1b[0m`,
						);
					} else if (result.duration >= 1000) {
						// 成功但耗时较长: 灰色显示耗时
						const dur = `${(result.duration / 1000).toFixed(1)}s`;
						terminal.writeln(`\x1b[38;2;88;91;112m⏱ ${dur}\x1b[0m`);
					}
				})
				.catch((err: unknown) => {
					const msg = err instanceof Error ? err.message : String(err);
					terminal.writeln(`\x1b[38;2;243;139;168m  ${msg}\x1b[0m`);
				})
				.finally(() => {
					isExecutingRef.current = false;
					currentRequestIdRef.current = null;
					writePrompt();
				});
		};

		// Handle input
		terminal.onData((data) => {
			if (disabledRef.current || isAwaitingConfirmRef.current) return;
			const editor = editorRef.current;

			// During execution, only handle Ctrl+C and Ctrl+L
			if (isExecutingRef.current) {
				for (const char of data) {
					if (char === "\x03") {
						const reqId = currentRequestIdRef.current;
						if (reqId) {
							terminal.writeln("^C");
							window.electron.remoteDevice.killCommand(
								deviceIdRef.current,
								reqId,
							);
						}
					} else if (char === "\x0c") {
						terminal.clear();
						terminal.write("\x1b[2J\x1b[H");
					}
				}
				return;
			}

			// 纯行编辑输入（光标移动 / 行内删除 / 历史导航 / 粘贴）委托 LineEditor
			const controlOutput = editor.handleControlInput(data);
			if (controlOutput !== null) {
				terminal.write(controlOutput);
				return;
			}

			for (const char of data) {
				switch (char) {
					case "\r": // Enter
					case "\n": {
						const cmd = editor.commit();
						terminal.writeln("");

						if (!cmd) {
							writePrompt();
							break;
						}

						// Check dangerous command
						const danger = checkDangerousCommand(cmd);
						if (danger) {
							const rgb =
								danger.level === "danger" ? "243;139;168" : "249;226;175";
							terminal.writeln(
								`\x1b[38;2;${rgb}m⚠ [${danger.category}] ${danger.description}\x1b[0m`,
							);
							isAwaitingConfirmRef.current = true;
							confirmDangerousCommand({
								command: cmd,
								danger,
								onConfirm: () => {
									isAwaitingConfirmRef.current = false;
									executeCmd(cmd);
								},
								onCancel: () => {
									isAwaitingConfirmRef.current = false;
									terminal.writeln("\x1b[38;2;88;91;112m已取消\x1b[0m");
									writePrompt();
								},
							});
						} else {
							executeCmd(cmd);
						}
						break;
					}
					case "\x7f": // Backspace
						terminal.write(editor.backspace());
						break;
					case "\t": {
						// Tab — completion
						const tabLine = editor.line;
						const tabPos = editor.cursorPos;
						window.electron.remoteDevice
							.tabComplete(deviceIdRef.current, tabLine, tabPos)
							.then((result) => {
								if (!result.data?.matches.length) return;
								if (
									editor.line !== tabLine ||
									editor.cursorPos !== tabPos ||
									isExecutingRef.current
								)
									return;

								const { matches, wordStart } = result.data;
								const currentWord = tabLine.slice(wordStart, tabPos);

								if (matches.length === 1) {
									const match = matches[0];
									const suffix = match.slice(currentWord.length) + " ";
									terminal.write(editor.insertText(suffix));
								} else {
									const common = findCommonPrefix(matches);
									const newChars = common.slice(currentWord.length);

									if (newChars) {
										terminal.write(editor.insertText(newChars));
									} else {
										terminal.writeln("");
										terminal.writeln(matches.join("  "));
										writePrompt();
										terminal.write(editor.line);
										const back = editor.line.length - editor.cursorPos;
										if (back > 0) terminal.write(`\x1b[${back}D`);
									}
								}
							});
						break;
					}
					case "\x03": // Ctrl+C
						editor.reset();
						terminal.writeln("^C");
						writePrompt();
						break;
					case "\x0c": // Ctrl+L
						terminal.clear();
						terminal.write("\x1b[2J\x1b[H");
						editor.line = "";
						editor.cursorPos = 0;
						writePrompt();
						break;
					default:
						if (char >= " ") {
							terminal.write(editor.insertText(char));
						}
						break;
				}
			}
		});

		// Subscribe to streaming command output chunks
		const unsubscribeOutput = window.electron.remoteDevice.onCommandOutput(
			(chunk) => {
				if (chunk.deviceId !== deviceIdRef.current) return;

				// Track the requestId for Ctrl+C kill
				currentRequestIdRef.current = chunk.requestId;

				if (chunk.stream === "stderr") {
					terminal.write("\x1b[38;2;243;139;168m" + chunk.data + "\x1b[0m");
				} else {
					terminal.write(chunk.data);
				}
			},
		);

		// ResizeObserver for container
		const resizeObserver = new ResizeObserver(() => {
			requestAnimationFrame(() => {
				try {
					fitAddon.fit();
				} catch {
					// ignore
				}
			});
		});
		resizeObserver.observe(containerRef.current);

		return () => {
			active = false;
			clearInterval(spinTimer);
			unsubscribeOutput();
			resizeObserver.disconnect();
			terminal.dispose();
			terminalRef.current = null;
			fitAddonRef.current = null;
		};
	}, [onCommand, writePrompt]);

	return containerRef;
}
