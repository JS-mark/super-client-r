import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import {
  createElement,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import "@xterm/xterm/css/xterm.css";
import "./DeviceTerminal.css";
import { Modal } from "antd";
import type { CommandResult } from "@/types/electron";
import { checkDangerousCommand } from "./dangerousCommands";

export interface DeviceTerminalProps {
  deviceId: string;
  disabled?: boolean;
  onCommand: (command: string, timeout?: number) => Promise<CommandResult>;
}

export interface DeviceTerminalRef {
  clear: () => void;
  focus: () => void;
}

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
  const display = home && cwd.startsWith(home) ? "~" + cwd.slice(home.length) : cwd;
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

export const DeviceTerminal = forwardRef<
  DeviceTerminalRef,
  DeviceTerminalProps
>(function DeviceTerminal({ deviceId, disabled = false, onCommand }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lineBufferRef = useRef("");
  const isExecutingRef = useRef(false);
  const disabledRef = useRef(disabled);
  const deviceIdRef = useRef(deviceId);
  const currentRequestIdRef = useRef<string | null>(null);
  const cursorPosRef = useRef(0);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const savedLineRef = useRef("");
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
          lineBufferRef.current = "";
          cursorPosRef.current = 0;
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
    terminal.write(
      `\x1b[38;2;88;91;112m${spinner[0]} ${loadingText}\x1b[0m`,
    );
    const spinTimer = setInterval(() => {
      spinIdx = (spinIdx + 1) % spinner.length;
      // 回到行首，重写 spinner
      terminal.write(`\r\x1b[38;2;88;91;112m${spinner[spinIdx]} ${loadingText}\x1b[0m`);
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
            const dur = result.duration >= 1000
              ? `${(result.duration / 1000).toFixed(1)}s`
              : `${result.duration}ms`;
            terminal.writeln(
              `\x1b[38;2;243;139;168m✘ exit ${result.exitCode}\x1b[0m\x1b[38;2;88;91;112m  ${dur}\x1b[0m`,
            );
          } else if (result.duration >= 1000) {
            // 成功但耗时较长: 灰色显示耗时
            const dur = `${(result.duration / 1000).toFixed(1)}s`;
            terminal.writeln(
              `\x1b[38;2;88;91;112m⏱ ${dur}\x1b[0m`,
            );
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

      // Helper: redraw from cursor to end of line
      const redrawFromCursor = () => {
        const line = lineBufferRef.current;
        const pos = cursorPosRef.current;
        terminal.write("\x1b[K");
        const tail = line.slice(pos);
        if (tail) {
          terminal.write(tail);
          terminal.write(`\x1b[${tail.length}D`);
        }
      };

      // Helper: replace entire input line
      const replaceLine = (newLine: string, newPos?: number) => {
        const oldPos = cursorPosRef.current;
        if (oldPos > 0) terminal.write(`\x1b[${oldPos}D`);
        terminal.write("\x1b[K");
        terminal.write(newLine);
        lineBufferRef.current = newLine;
        cursorPosRef.current = newPos ?? newLine.length;
        const back = newLine.length - cursorPosRef.current;
        if (back > 0) terminal.write(`\x1b[${back}D`);
      };

      // Escape sequences (arrows, Home, End, Delete)
      if (data.startsWith("\x1b[") || data.startsWith("\x1bO")) {
        const code = data.startsWith("\x1b[") ? data.slice(2) : data[2];
        switch (code) {
          case "A": { // Up — previous history
            const h = historyRef.current;
            if (!h.length) break;
            if (historyIndexRef.current === -1) {
              savedLineRef.current = lineBufferRef.current;
              historyIndexRef.current = h.length - 1;
            } else if (historyIndexRef.current > 0) {
              historyIndexRef.current--;
            } else break;
            replaceLine(h[historyIndexRef.current]);
            break;
          }
          case "B": { // Down — next history
            if (historyIndexRef.current === -1) break;
            if (historyIndexRef.current < historyRef.current.length - 1) {
              historyIndexRef.current++;
              replaceLine(historyRef.current[historyIndexRef.current]);
            } else {
              historyIndexRef.current = -1;
              replaceLine(savedLineRef.current);
            }
            break;
          }
          case "C": // Right
            if (cursorPosRef.current < lineBufferRef.current.length) {
              cursorPosRef.current++;
              terminal.write("\x1b[C");
            }
            break;
          case "D": // Left
            if (cursorPosRef.current > 0) {
              cursorPosRef.current--;
              terminal.write("\x1b[D");
            }
            break;
          case "H": // Home
          case "1~":
            if (cursorPosRef.current > 0) {
              terminal.write(`\x1b[${cursorPosRef.current}D`);
              cursorPosRef.current = 0;
            }
            break;
          case "F": // End
          case "4~": {
            const move =
              lineBufferRef.current.length - cursorPosRef.current;
            if (move > 0) {
              terminal.write(`\x1b[${move}C`);
              cursorPosRef.current = lineBufferRef.current.length;
            }
            break;
          }
          case "3~": { // Delete
            const pos = cursorPosRef.current;
            if (pos < lineBufferRef.current.length) {
              const line = lineBufferRef.current;
              lineBufferRef.current =
                line.slice(0, pos) + line.slice(pos + 1);
              redrawFromCursor();
            }
            break;
          }
        }
        return;
      }

      // Ctrl+A (Home)
      if (data === "\x01") {
        if (cursorPosRef.current > 0) {
          terminal.write(`\x1b[${cursorPosRef.current}D`);
          cursorPosRef.current = 0;
        }
        return;
      }
      // Ctrl+E (End)
      if (data === "\x05") {
        const move = lineBufferRef.current.length - cursorPosRef.current;
        if (move > 0) {
          terminal.write(`\x1b[${move}C`);
          cursorPosRef.current = lineBufferRef.current.length;
        }
        return;
      }
      // Ctrl+U (clear before cursor)
      if (data === "\x15") {
        if (cursorPosRef.current > 0) {
          const tail = lineBufferRef.current.slice(cursorPosRef.current);
          terminal.write(`\x1b[${cursorPosRef.current}D`);
          lineBufferRef.current = tail;
          cursorPosRef.current = 0;
          redrawFromCursor();
        }
        return;
      }
      // Ctrl+K (clear after cursor)
      if (data === "\x0b") {
        lineBufferRef.current = lineBufferRef.current.slice(
          0,
          cursorPosRef.current,
        );
        terminal.write("\x1b[K");
        return;
      }
      // Ctrl+W (delete previous word)
      if (data === "\x17") {
        const pos = cursorPosRef.current;
        if (pos > 0) {
          const line = lineBufferRef.current;
          let i = pos - 1;
          while (i > 0 && line[i - 1] === " ") i--;
          while (i > 0 && line[i - 1] !== " ") i--;
          const deleted = pos - i;
          lineBufferRef.current = line.slice(0, i) + line.slice(pos);
          cursorPosRef.current = i;
          terminal.write(`\x1b[${deleted}D`);
          redrawFromCursor();
        }
        return;
      }

      // Pasted text (multi-char, not escape, not newline)
      if (data.length > 1 && !data.includes("\r") && !data.includes("\n")) {
        const pos = cursorPosRef.current;
        const line = lineBufferRef.current;
        lineBufferRef.current = line.slice(0, pos) + data + line.slice(pos);
        cursorPosRef.current = pos + data.length;
        terminal.write(data);
        if (pos < line.length) redrawFromCursor();
        return;
      }

      for (const char of data) {
        switch (char) {
          case "\r": // Enter
          case "\n": {
            const cmd = lineBufferRef.current.trim();
            lineBufferRef.current = "";
            cursorPosRef.current = 0;
            terminal.writeln("");

            if (!cmd) {
              writePrompt();
              break;
            }

            // Add to history (deduplicate consecutive)
            const history = historyRef.current;
            if (!history.length || history[history.length - 1] !== cmd) {
              history.push(cmd);
              if (history.length > 500)
                history.splice(0, history.length - 500);
            }
            historyIndexRef.current = -1;
            savedLineRef.current = "";

            // Check dangerous command
            const danger = checkDangerousCommand(cmd);
            if (danger) {
              const rgb =
                danger.level === "danger"
                  ? "243;139;168"
                  : "249;226;175";
              terminal.writeln(
                `\x1b[38;2;${rgb}m⚠ [${danger.category}] ${danger.description}\x1b[0m`,
              );
              isAwaitingConfirmRef.current = true;
              Modal.confirm({
                title: "⚠️ 危险命令确认",
                content: createElement(
                  "div",
                  null,
                  createElement(
                    "p",
                    { style: { marginBottom: 8 } },
                    "将要执行以下命令：",
                  ),
                  createElement(
                    "pre",
                    {
                      style: {
                        background: "#1e1e2e",
                        color: "#cdd6f4",
                        padding: "8px 12px",
                        borderRadius: 6,
                        fontFamily: "monospace",
                        fontSize: 13,
                      },
                    },
                    cmd,
                  ),
                  createElement(
                    "p",
                    {
                      style: {
                        marginTop: 8,
                        color:
                          danger.level === "danger"
                            ? "#f38ba8"
                            : "#f9e2af",
                        fontWeight: 500,
                      },
                    },
                    `⚠ ${danger.category}: ${danger.description}`,
                  ),
                ),
                okText: "确认执行",
                cancelText: "取消",
                okButtonProps: { danger: true },
                onOk: () => {
                  isAwaitingConfirmRef.current = false;
                  executeCmd(cmd);
                },
                onCancel: () => {
                  isAwaitingConfirmRef.current = false;
                  terminal.writeln(
                    "\x1b[38;2;88;91;112m已取消\x1b[0m",
                  );
                  writePrompt();
                },
              });
            } else {
              executeCmd(cmd);
            }
            break;
          }
          case "\x7f": { // Backspace
            const pos = cursorPosRef.current;
            if (pos > 0) {
              const line = lineBufferRef.current;
              lineBufferRef.current =
                line.slice(0, pos - 1) + line.slice(pos);
              cursorPosRef.current = pos - 1;
              terminal.write("\b");
              redrawFromCursor();
            }
            break;
          }
          case "\t": { // Tab — completion
            const tabLine = lineBufferRef.current;
            const tabPos = cursorPosRef.current;
            window.electron.remoteDevice
              .tabComplete(deviceIdRef.current, tabLine, tabPos)
              .then((result) => {
                if (!result.data?.matches.length) return;
                if (
                  lineBufferRef.current !== tabLine ||
                  cursorPosRef.current !== tabPos ||
                  isExecutingRef.current
                )
                  return;

                const { matches, wordStart } = result.data;
                const currentWord = tabLine.slice(wordStart, tabPos);

                if (matches.length === 1) {
                  const match = matches[0];
                  const suffix = match.slice(currentWord.length) + " ";
                  lineBufferRef.current =
                    tabLine.slice(0, tabPos) +
                    suffix +
                    tabLine.slice(tabPos);
                  cursorPosRef.current = tabPos + suffix.length;
                  terminal.write(suffix);
                  if (tabPos < tabLine.length) redrawFromCursor();
                } else {
                  const common = findCommonPrefix(matches);
                  const newChars = common.slice(currentWord.length);

                  if (newChars) {
                    lineBufferRef.current =
                      tabLine.slice(0, tabPos) +
                      newChars +
                      tabLine.slice(tabPos);
                    cursorPosRef.current = tabPos + newChars.length;
                    terminal.write(newChars);
                    if (tabPos < tabLine.length) redrawFromCursor();
                  } else {
                    terminal.writeln("");
                    terminal.writeln(matches.join("  "));
                    writePrompt();
                    terminal.write(lineBufferRef.current);
                    const back =
                      lineBufferRef.current.length -
                      cursorPosRef.current;
                    if (back > 0)
                      terminal.write(`\x1b[${back}D`);
                  }
                }
              });
            break;
          }
          case "\x03": // Ctrl+C
            lineBufferRef.current = "";
            cursorPosRef.current = 0;
            historyIndexRef.current = -1;
            terminal.writeln("^C");
            writePrompt();
            break;
          case "\x0c": // Ctrl+L
            terminal.clear();
            terminal.write("\x1b[2J\x1b[H");
            lineBufferRef.current = "";
            cursorPosRef.current = 0;
            writePrompt();
            break;
          default:
            if (char >= " ") {
              const pos = cursorPosRef.current;
              const line = lineBufferRef.current;
              lineBufferRef.current =
                line.slice(0, pos) + char + line.slice(pos);
              cursorPosRef.current = pos + 1;
              terminal.write(char);
              if (pos < line.length) redrawFromCursor();
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

  return (
    <div
      ref={containerRef}
      className="w-full h-full rounded-lg overflow-hidden"
      style={{ minHeight: 380 }}
    />
  );
});
