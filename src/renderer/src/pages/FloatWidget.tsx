import {
	GripVertical,
	MessageCircle,
	Mic,
	Paperclip,
	Send,
	X,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

type Mode = "idle" | "hover" | "active";

interface SelectedFile {
	name: string;
	path: string;
	size: number;
	mimeType: string;
	dataUrl: string;
}

const SIZES = {
	idle: { width: 56, height: 56 },
	hover: { width: 300, height: 56 },
	active: { width: 300, height: 340 },
} as const;

const HOVER_LEAVE_DELAY = 300;
const TRANSITION_MS = 200;
const TOAST_DURATION = 2000;

const FloatWidget: React.FC = () => {
	const [mode, setMode] = useState<Mode>("idle");
	const modeRef = useRef<Mode>("idle");
	const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const shrinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const inputValueRef = useRef("");
	const [inputValue, setInputValue] = useState("");
	const [files, setFiles] = useState<SelectedFile[]>([]);
	const [toast, setToast] = useState<string | null>(null);
	const isDraggingRef = useRef(false);

	// Keep ref in sync with state for use in callbacks
	const handleInputChange = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			const val = e.target.value;
			inputValueRef.current = val;
			setInputValue(val);
		},
		[],
	);

	const updateMode = useCallback((next: Mode) => {
		modeRef.current = next;
		setMode(next);
	}, []);

	const resizeWindow = useCallback((m: Mode) => {
		window.electron.ipc.send("resize-float-window", SIZES[m]);
	}, []);

	const clearTimers = useCallback(() => {
		if (leaveTimerRef.current) {
			clearTimeout(leaveTimerRef.current);
			leaveTimerRef.current = null;
		}
		if (shrinkTimerRef.current) {
			clearTimeout(shrinkTimerRef.current);
			shrinkTimerRef.current = null;
		}
	}, []);

	const showToast = useCallback((msg: string) => {
		if (toastTimerRef.current) {
			clearTimeout(toastTimerRef.current);
		}
		setToast(msg);
		toastTimerRef.current = setTimeout(() => setToast(null), TOAST_DURATION);
	}, []);

	// Expand: resize window first (transparent bg invisible), then CSS animates
	const expandTo = useCallback(
		(next: Mode) => {
			clearTimers();
			resizeWindow(next);
			updateMode(next);
		},
		[clearTimers, resizeWindow, updateMode],
	);

	// Collapse: CSS animates first, then shrink window after transition ends
	const collapseTo = useCallback(
		(next: Mode) => {
			clearTimers();
			updateMode(next);
			shrinkTimerRef.current = setTimeout(() => {
				resizeWindow(next);
			}, TRANSITION_MS);
		},
		[clearTimers, resizeWindow, updateMode],
	);

	const handleMouseEnter = useCallback(() => {
		clearTimers();
		if (modeRef.current === "idle") {
			expandTo("hover");
		}
	}, [clearTimers, expandTo]);

	const handleMouseLeave = useCallback(() => {
		if (isDraggingRef.current) return;
		clearTimers();
		leaveTimerRef.current = setTimeout(() => {
			if (isDraggingRef.current) return;
			const current = modeRef.current;
			if (current === "hover" || current === "active") {
				collapseTo("idle");
			}
		}, HOVER_LEAVE_DELAY);
	}, [clearTimers, collapseTo]);

	const handleDragStart = useCallback(() => {
		isDraggingRef.current = true;
	}, []);

	// Global mouseup to clear dragging state
	useEffect(() => {
		const handleMouseUp = () => {
			if (isDraggingRef.current) {
				isDraggingRef.current = false;
			}
		};
		window.addEventListener("mouseup", handleMouseUp);
		return () => window.removeEventListener("mouseup", handleMouseUp);
	}, []);

	const handleInputAreaClick = useCallback(() => {
		if (modeRef.current === "hover") {
			expandTo("active");
		}
	}, [expandTo]);

	// Use ref to always read the latest input value — avoids stale closures
	const handleSend = useCallback(() => {
		const text = inputValueRef.current.trim();
		if (text) {
			window.electron.ipc.send("open-main-window", { message: text });
			inputValueRef.current = "";
			setInputValue("");
			setFiles([]);
		} else {
			window.electron.ipc.send("open-main-window");
		}
		collapseTo("idle");
	}, [collapseTo]);

	const handleMicClick = useCallback(() => {
		showToast("功能开发中...");
	}, [showToast]);

	// File picker — same as main chat's FileUploadButton
	const handleFileSelect = useCallback(
		async (fileList: FileList | null) => {
			if (!fileList || fileList.length === 0) return;

			const newFiles: SelectedFile[] = [];
			for (const file of Array.from(fileList)) {
				const reader = new FileReader();
				const dataUrl = await new Promise<string>((resolve) => {
					reader.onloadend = () => resolve(reader.result as string);
					reader.readAsDataURL(file);
				});
				newFiles.push({
					name: file.name,
					path: (file as any).path || file.name,
					size: file.size,
					mimeType: file.type || "application/octet-stream",
					dataUrl,
				});
			}
			setFiles((prev) => [...prev, ...newFiles]);
		},
		[],
	);

	const handleAttachClick = useCallback(() => {
		fileInputRef.current?.click();
	}, []);

	const removeFile = useCallback((index: number) => {
		setFiles((prev) => prev.filter((_, i) => i !== index));
	}, []);

	// Escape on outer div
	const handleOuterKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Escape") {
				collapseTo("idle");
			}
		},
		[collapseTo],
	);

	// Enter on textarea directly — most reliable
	const handleTextareaKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				handleSend();
			}
		},
		[handleSend],
	);

	// Auto-focus textarea when entering active mode
	useEffect(() => {
		if (mode === "active" && textareaRef.current) {
			requestAnimationFrame(() => textareaRef.current?.focus());
		}
	}, [mode]);

	// Cleanup timers on unmount
	useEffect(() => {
		return () => {
			clearTimers();
			if (toastTimerRef.current) {
				clearTimeout(toastTimerRef.current);
			}
		};
	}, [clearTimers]);

	const isExpanded = mode === "hover" || mode === "active";
	const hasContent = inputValue.trim() || files.length > 0;

	return (
		<div
			className="h-screen w-screen bg-transparent select-none flex justify-end items-start pr-1 pt-1"
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
			onKeyDown={handleOuterKeyDown}
		>
			{/* Hidden file input */}
			<input
				ref={fileInputRef}
				type="file"
				multiple
				className="hidden"
				onChange={(e) => {
					handleFileSelect(e.target.files);
					e.target.value = "";
				}}
			/>

			<div className="flex flex-col items-end">
				{/* Morphing circle → capsule */}
				<div
					className="bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg overflow-hidden relative flex items-center transition-all ease-out"
					style={{
						width: isExpanded ? 280 : 48,
						height: isExpanded ? 44 : 48,
						borderRadius: 9999,
						transitionDuration: `${TRANSITION_MS}ms`,
					}}
				>
					{/* Circle content (idle) — fades out on expand */}
					<div
						className="absolute inset-0 flex items-center justify-center transition-opacity cursor-pointer"
						style={{
							opacity: isExpanded ? 0 : 1,
							pointerEvents: isExpanded ? "none" : "auto",
							WebkitAppRegion: isExpanded ? "no-drag" : "drag",
							transitionDuration: `${TRANSITION_MS}ms`,
						} as React.CSSProperties}
					>
						<MessageCircle className="w-6 h-6 text-white" />
					</div>

					{/* Capsule content (hover/active) — fades in on expand */}
					<div
						className="flex items-center h-full px-3 transition-opacity"
						style={{
							width: 280,
							opacity: isExpanded ? 1 : 0,
							pointerEvents: isExpanded ? "auto" : "none",
							transitionDuration: `${TRANSITION_MS}ms`,
						}}
					>
						{/* Drag handle */}
						<div
							className="w-7 h-7 flex items-center justify-center cursor-grab active:cursor-grabbing hover:bg-white/20 rounded-full transition-colors shrink-0"
							style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
							onMouseDown={handleDragStart}
						>
							<GripVertical className="w-4 h-4 text-white/70" />
						</div>

						{/* Placeholder / clickable area */}
						<div
							className="flex-1 min-w-0 cursor-text"
							onClick={handleInputAreaClick}
						>
							<span className="text-white/70 text-sm truncate block">
								有问题尽管问我...
							</span>
						</div>

						{/* Chat icon — also draggable */}
						<div
							className="w-7 h-7 flex items-center justify-center cursor-grab active:cursor-grabbing hover:bg-white/20 rounded-full transition-colors shrink-0 ml-1"
							style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
							onMouseDown={handleDragStart}
						>
							<MessageCircle className="w-5 h-5 text-white/70" />
						</div>
					</div>
				</div>

				{/* Active: Expanded input panel */}
				<div
					className="w-[280px] rounded-2xl shadow-xl mt-2 overflow-hidden transition-all ease-out"
					style={{
						maxHeight: mode === "active" ? 280 : 0,
						opacity: mode === "active" ? 1 : 0,
						transitionDuration: `${TRANSITION_MS}ms`,
						background:
							"linear-gradient(135deg, #f0f0ff 0%, #f5f0ff 100%)",
						border: "1px solid rgba(147,51,234,0.15)",
					}}
				>
					{/* Attached files */}
					{files.length > 0 && (
						<div className="px-3 pt-2 flex flex-wrap gap-1">
							{files.map((file, i) => (
								<div
									key={file.name + i}
									className="flex items-center gap-1 bg-purple-50 text-purple-600 text-xs rounded-full px-2 py-0.5 max-w-[200px]"
								>
									<Paperclip className="w-3 h-3 shrink-0" />
									<span className="truncate">{file.name}</span>
									<button
										type="button"
										className="shrink-0 hover:text-purple-800"
										onClick={() => removeFile(i)}
									>
										<X className="w-3 h-3" />
									</button>
								</div>
							))}
						</div>
					)}

					{/* Textarea */}
					<div className="p-3">
						<textarea
							ref={textareaRef}
							value={inputValue}
							onChange={handleInputChange}
							onKeyDown={handleTextareaKeyDown}
							placeholder="输入你的问题..."
							className="w-full resize-none text-sm text-gray-700 placeholder-gray-400 outline-none bg-transparent leading-relaxed"
							style={{ height: files.length > 0 ? 140 : 180 }}
						/>
					</div>

					{/* Toolbar */}
					<div className="flex items-center justify-between px-3 pb-3">
						<div className="flex items-center gap-1">
							<button
								type="button"
								className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-purple-100 transition-colors text-purple-400 hover:text-purple-600"
								onClick={handleAttachClick}
							>
								<Paperclip className="w-[18px] h-[18px]" />
							</button>
							<button
								type="button"
								className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-purple-100 transition-colors text-purple-400 hover:text-purple-600"
								onClick={handleMicClick}
							>
								<Mic className="w-[18px] h-[18px]" />
							</button>
						</div>

						{/* Send button */}
						<button
							type="button"
							className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
								hasContent
									? "bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-sm"
									: "bg-purple-100 text-purple-300"
							}`}
							onClick={handleSend}
						>
							<Send className="w-4 h-4" />
						</button>
					</div>
				</div>

				{/* Toast */}
				{toast && (
					<div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-gray-800/90 text-white text-xs rounded-lg whitespace-nowrap animate-in fade-in duration-150">
						{toast}
					</div>
				)}
			</div>
		</div>
	);
};

export default FloatWidget;
