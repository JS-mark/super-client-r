/**
 * 终端行编辑器
 *
 * 把远程终端输入行的缓冲、光标定位、历史导航与行内编辑逻辑从
 * `DeviceTerminal` 组件中抽离为纯类。每个编辑操作返回需要写入
 * xterm 终端的控制序列字符串（ANSI），不直接依赖 xterm 实例，
 * 因此可独立单测且保持与原组件行为完全等价。
 */

const MAX_HISTORY = 500;

export class LineEditor {
	/** 当前输入行内容 */
	line = "";
	/** 光标在行内的位置（0 到 line.length） */
	cursorPos = 0;
	/** 命令历史 */
	readonly history: string[] = [];
	/** 历史浏览索引，-1 表示未在浏览历史 */
	historyIndex = -1;
	/** 进入历史浏览前暂存的当前行 */
	savedLine = "";

	/** 从光标处到行尾重绘（先清行尾，再补写 tail 并回退光标） */
	private redrawFromCursor(): string {
		const tail = this.line.slice(this.cursorPos);
		let out = "\x1b[K";
		if (tail) {
			out += tail;
			out += `\x1b[${tail.length}D`;
		}
		return out;
	}

	/** 整行替换（历史导航使用） */
	replaceLine(newLine: string, newPos?: number): string {
		let out = "";
		const oldPos = this.cursorPos;
		if (oldPos > 0) out += `\x1b[${oldPos}D`;
		out += "\x1b[K";
		out += newLine;
		this.line = newLine;
		this.cursorPos = newPos ?? newLine.length;
		const back = newLine.length - this.cursorPos;
		if (back > 0) out += `\x1b[${back}D`;
		return out;
	}

	/** 在光标处插入文本（单字符输入与粘贴共用） */
	insertText(text: string): string {
		const pos = this.cursorPos;
		const line = this.line;
		this.line = line.slice(0, pos) + text + line.slice(pos);
		this.cursorPos = pos + text.length;
		let out = text;
		if (pos < line.length) out += this.redrawFromCursor();
		return out;
	}

	/** Backspace：删除光标前一个字符 */
	backspace(): string {
		const pos = this.cursorPos;
		if (pos === 0) return "";
		const line = this.line;
		this.line = line.slice(0, pos - 1) + line.slice(pos);
		this.cursorPos = pos - 1;
		return "\b" + this.redrawFromCursor();
	}

	/** Delete：删除光标处字符 */
	deleteForward(): string {
		const pos = this.cursorPos;
		if (pos >= this.line.length) return "";
		this.line = this.line.slice(0, pos) + this.line.slice(pos + 1);
		return this.redrawFromCursor();
	}

	/** 光标左移一位 */
	moveLeft(): string {
		if (this.cursorPos <= 0) return "";
		this.cursorPos--;
		return "\x1b[D";
	}

	/** 光标右移一位 */
	moveRight(): string {
		if (this.cursorPos >= this.line.length) return "";
		this.cursorPos++;
		return "\x1b[C";
	}

	/** 光标移到行首（Home / Ctrl+A） */
	moveHome(): string {
		if (this.cursorPos <= 0) return "";
		const out = `\x1b[${this.cursorPos}D`;
		this.cursorPos = 0;
		return out;
	}

	/** 光标移到行尾（End / Ctrl+E） */
	moveEnd(): string {
		const move = this.line.length - this.cursorPos;
		if (move <= 0) return "";
		this.cursorPos = this.line.length;
		return `\x1b[${move}C`;
	}

	/** 清除光标前的内容（Ctrl+U） */
	clearBeforeCursor(): string {
		if (this.cursorPos <= 0) return "";
		const tail = this.line.slice(this.cursorPos);
		const out = `\x1b[${this.cursorPos}D`;
		this.line = tail;
		this.cursorPos = 0;
		return out + this.redrawFromCursor();
	}

	/** 清除光标后的内容（Ctrl+K） */
	clearAfterCursor(): string {
		this.line = this.line.slice(0, this.cursorPos);
		return "\x1b[K";
	}

	/** 删除光标前一个单词（Ctrl+W） */
	deleteWord(): string {
		const pos = this.cursorPos;
		if (pos <= 0) return "";
		const line = this.line;
		let i = pos - 1;
		while (i > 0 && line[i - 1] === " ") i--;
		while (i > 0 && line[i - 1] !== " ") i--;
		const deleted = pos - i;
		this.line = line.slice(0, i) + line.slice(pos);
		this.cursorPos = i;
		return `\x1b[${deleted}D` + this.redrawFromCursor();
	}

	/** 历史上一条（↑）。无变更时返回空串。 */
	historyPrev(): string {
		const h = this.history;
		if (!h.length) return "";
		if (this.historyIndex === -1) {
			this.savedLine = this.line;
			this.historyIndex = h.length - 1;
		} else if (this.historyIndex > 0) {
			this.historyIndex--;
		} else {
			return "";
		}
		return this.replaceLine(h[this.historyIndex]);
	}

	/** 历史下一条（↓）。未在浏览历史时返回空串。 */
	historyNext(): string {
		if (this.historyIndex === -1) return "";
		if (this.historyIndex < this.history.length - 1) {
			this.historyIndex++;
			return this.replaceLine(this.history[this.historyIndex]);
		}
		this.historyIndex = -1;
		return this.replaceLine(this.savedLine);
	}

	/**
	 * 提交当前行：返回 trim 后的命令，并把非空命令加入历史（去重连续重复），
	 * 重置行缓冲与历史浏览状态。
	 */
	commit(): string {
		const cmd = this.line.trim();
		this.line = "";
		this.cursorPos = 0;
		if (cmd) {
			const history = this.history;
			if (!history.length || history[history.length - 1] !== cmd) {
				history.push(cmd);
				if (history.length > MAX_HISTORY) {
					history.splice(0, history.length - MAX_HISTORY);
				}
			}
			this.historyIndex = -1;
			this.savedLine = "";
		}
		return cmd;
	}

	/** 清空当前行（Ctrl+C / Ctrl+L / clear），不改动历史。 */
	reset(): void {
		this.line = "";
		this.cursorPos = 0;
		this.historyIndex = -1;
	}

	/**
	 * 分发不涉及终端副作用的纯行编辑输入：光标移动（方向键 / Home / End /
	 * Ctrl+A / Ctrl+E）、行内删除（Delete / Ctrl+U / Ctrl+K / Ctrl+W）、
	 * 历史导航（↑↓）以及多字符粘贴。
	 *
	 * 返回需要写入终端的 ANSI 序列（可能为空串，表示已处理但无输出）；
	 * 返回 `null` 表示该输入不属于上述类别，调用方需继续逐字符处理
	 * （Enter / Backspace / Tab / Ctrl+C / Ctrl+L / 普通字符输入）。
	 */
	handleControlInput(data: string): string | null {
		// Escape sequences (arrows, Home, End, Delete)
		if (data.startsWith("\x1b[") || data.startsWith("\x1bO")) {
			const code = data.startsWith("\x1b[") ? data.slice(2) : data[2];
			switch (code) {
				case "A": // Up — previous history
					return this.historyPrev();
				case "B": // Down — next history
					return this.historyNext();
				case "C": // Right
					return this.moveRight();
				case "D": // Left
					return this.moveLeft();
				case "H": // Home
				case "1~":
					return this.moveHome();
				case "F": // End
				case "4~":
					return this.moveEnd();
				case "3~": // Delete
					return this.deleteForward();
				default:
					// 未识别的转义序列：已消费但无输出（与原组件一致）
					return "";
			}
		}
		// Ctrl+A (Home)
		if (data === "\x01") return this.moveHome();
		// Ctrl+E (End)
		if (data === "\x05") return this.moveEnd();
		// Ctrl+U (clear before cursor)
		if (data === "\x15") return this.clearBeforeCursor();
		// Ctrl+K (clear after cursor)
		if (data === "\x0b") return this.clearAfterCursor();
		// Ctrl+W (delete previous word)
		if (data === "\x17") return this.deleteWord();
		// Pasted text (multi-char, not escape, not newline)
		if (data.length > 1 && !data.includes("\r") && !data.includes("\n")) {
			return this.insertText(data);
		}
		return null;
	}
}
