import { describe, expect, it } from "vitest";
import { LineEditor } from "./terminalLineEditor";

describe("LineEditor", () => {
	describe("insertText", () => {
		it("在行尾插入单字符只输出该字符", () => {
			const ed = new LineEditor();
			expect(ed.insertText("a")).toBe("a");
			expect(ed.insertText("b")).toBe("b");
			expect(ed.line).toBe("ab");
			expect(ed.cursorPos).toBe(2);
		});

		it("在行中插入需重绘行尾并回退光标", () => {
			const ed = new LineEditor();
			ed.insertText("abc");
			ed.cursorPos = 1; // 光标在 a 之后
			// 插入 X -> "aXbc"，尾部 "bc" 重绘
			expect(ed.insertText("X")).toBe("X\x1b[Kbc\x1b[2D");
			expect(ed.line).toBe("aXbc");
			expect(ed.cursorPos).toBe(2);
		});

		it("粘贴多字符文本一次性插入", () => {
			const ed = new LineEditor();
			expect(ed.insertText("hello")).toBe("hello");
			expect(ed.line).toBe("hello");
			expect(ed.cursorPos).toBe(5);
		});
	});

	describe("backspace", () => {
		it("行尾退格输出 \\b 并清行尾", () => {
			const ed = new LineEditor();
			ed.insertText("ab");
			expect(ed.backspace()).toBe("\b\x1b[K");
			expect(ed.line).toBe("a");
			expect(ed.cursorPos).toBe(1);
		});

		it("行首退格无操作", () => {
			const ed = new LineEditor();
			ed.insertText("ab");
			ed.cursorPos = 0;
			expect(ed.backspace()).toBe("");
			expect(ed.line).toBe("ab");
		});

		it("行中退格重绘行尾", () => {
			const ed = new LineEditor();
			ed.insertText("abc");
			ed.cursorPos = 2; // 光标在 b 之后
			expect(ed.backspace()).toBe("\b\x1b[Kc\x1b[1D");
			expect(ed.line).toBe("ac");
			expect(ed.cursorPos).toBe(1);
		});
	});

	describe("deleteForward", () => {
		it("删除光标处字符", () => {
			const ed = new LineEditor();
			ed.insertText("abc");
			ed.cursorPos = 1;
			expect(ed.deleteForward()).toBe("\x1b[Kc\x1b[1D");
			expect(ed.line).toBe("ac");
			expect(ed.cursorPos).toBe(1);
		});

		it("行尾删除无操作", () => {
			const ed = new LineEditor();
			ed.insertText("ab");
			expect(ed.deleteForward()).toBe("");
			expect(ed.line).toBe("ab");
		});
	});

	describe("光标移动", () => {
		it("moveLeft / moveRight 边界", () => {
			const ed = new LineEditor();
			ed.insertText("ab");
			expect(ed.moveRight()).toBe(""); // 已在行尾
			expect(ed.moveLeft()).toBe("\x1b[D");
			expect(ed.cursorPos).toBe(1);
			expect(ed.moveLeft()).toBe("\x1b[D");
			expect(ed.cursorPos).toBe(0);
			expect(ed.moveLeft()).toBe(""); // 已在行首
			expect(ed.moveRight()).toBe("\x1b[C");
			expect(ed.cursorPos).toBe(1);
		});

		it("moveHome / moveEnd", () => {
			const ed = new LineEditor();
			ed.insertText("abcd");
			expect(ed.moveHome()).toBe("\x1b[4D");
			expect(ed.cursorPos).toBe(0);
			expect(ed.moveHome()).toBe(""); // 已在行首
			expect(ed.moveEnd()).toBe("\x1b[4C");
			expect(ed.cursorPos).toBe(4);
			expect(ed.moveEnd()).toBe(""); // 已在行尾
		});
	});

	describe("行内清除", () => {
		it("clearBeforeCursor (Ctrl+U)", () => {
			const ed = new LineEditor();
			ed.insertText("hello world");
			ed.cursorPos = 6; // 光标在 "world" 之前
			expect(ed.clearBeforeCursor()).toBe("\x1b[6D\x1b[Kworld\x1b[5D");
			expect(ed.line).toBe("world");
			expect(ed.cursorPos).toBe(0);
		});

		it("clearAfterCursor (Ctrl+K)", () => {
			const ed = new LineEditor();
			ed.insertText("hello world");
			ed.cursorPos = 5;
			expect(ed.clearAfterCursor()).toBe("\x1b[K");
			expect(ed.line).toBe("hello");
			expect(ed.cursorPos).toBe(5);
		});

		it("deleteWord (Ctrl+W) 删除前一个单词及其前导空格", () => {
			const ed = new LineEditor();
			ed.insertText("foo bar baz");
			// 光标在行尾(11)，删除 "baz"
			expect(ed.deleteWord()).toBe("\x1b[3D\x1b[K");
			expect(ed.line).toBe("foo bar ");
			expect(ed.cursorPos).toBe(8);
		});

		it("deleteWord 跳过尾随空格", () => {
			const ed = new LineEditor();
			ed.insertText("foo bar ");
			// 光标在行尾(8)，先跳过空格再删 "bar"
			expect(ed.deleteWord()).toBe("\x1b[4D\x1b[K");
			expect(ed.line).toBe("foo ");
			expect(ed.cursorPos).toBe(4);
		});
	});

	describe("历史导航", () => {
		it("historyPrev/Next 循环并复原暂存行", () => {
			const ed = new LineEditor();
			ed.history.push("cmd1", "cmd2");
			ed.insertText("draft");

			// ↑ -> cmd2
			ed.historyPrev();
			expect(ed.line).toBe("cmd2");
			expect(ed.historyIndex).toBe(1);
			// ↑ -> cmd1
			ed.historyPrev();
			expect(ed.line).toBe("cmd1");
			expect(ed.historyIndex).toBe(0);
			// ↑ 已到顶，无变更
			expect(ed.historyPrev()).toBe("");
			expect(ed.line).toBe("cmd1");
			// ↓ -> cmd2
			ed.historyNext();
			expect(ed.line).toBe("cmd2");
			// ↓ -> 复原 draft
			ed.historyNext();
			expect(ed.line).toBe("draft");
			expect(ed.historyIndex).toBe(-1);
		});

		it("空历史时 historyPrev 无操作", () => {
			const ed = new LineEditor();
			ed.insertText("x");
			expect(ed.historyPrev()).toBe("");
			expect(ed.line).toBe("x");
		});

		it("未浏览历史时 historyNext 无操作", () => {
			const ed = new LineEditor();
			ed.history.push("cmd1");
			expect(ed.historyNext()).toBe("");
		});
	});

	describe("commit", () => {
		it("提交非空命令加入历史并重置状态", () => {
			const ed = new LineEditor();
			ed.insertText("  ls -la  ");
			const cmd = ed.commit();
			expect(cmd).toBe("ls -la");
			expect(ed.history).toEqual(["ls -la"]);
			expect(ed.line).toBe("");
			expect(ed.cursorPos).toBe(0);
			expect(ed.historyIndex).toBe(-1);
		});

		it("连续重复命令去重", () => {
			const ed = new LineEditor();
			ed.insertText("ls");
			ed.commit();
			ed.insertText("ls");
			ed.commit();
			expect(ed.history).toEqual(["ls"]);
		});

		it("空命令不加入历史且不重置历史浏览状态", () => {
			const ed = new LineEditor();
			ed.history.push("prev");
			ed.historyIndex = 0;
			ed.savedLine = "keep";
			const cmd = ed.commit();
			expect(cmd).toBe("");
			expect(ed.history).toEqual(["prev"]);
			// 空命令分支不重置 historyIndex/savedLine（与原组件行为一致）
			expect(ed.historyIndex).toBe(0);
			expect(ed.savedLine).toBe("keep");
		});

		it("历史超过上限时裁剪到 500 条", () => {
			const ed = new LineEditor();
			for (let i = 0; i < 505; i++) {
				ed.insertText(`cmd${i}`);
				ed.commit();
			}
			expect(ed.history.length).toBe(500);
			expect(ed.history[0]).toBe("cmd5");
			expect(ed.history[499]).toBe("cmd504");
		});
	});

	describe("replaceLine", () => {
		it("从有内容替换为新行并定位光标到行尾", () => {
			const ed = new LineEditor();
			ed.insertText("old");
			expect(ed.replaceLine("newer")).toBe("\x1b[3D\x1b[Knewer");
			expect(ed.line).toBe("newer");
			expect(ed.cursorPos).toBe(5);
		});
	});

	describe("reset", () => {
		it("清空行但保留历史", () => {
			const ed = new LineEditor();
			ed.history.push("cmd1");
			ed.insertText("draft");
			ed.reset();
			expect(ed.line).toBe("");
			expect(ed.cursorPos).toBe(0);
			expect(ed.historyIndex).toBe(-1);
			expect(ed.history).toEqual(["cmd1"]);
		});
	});
});
