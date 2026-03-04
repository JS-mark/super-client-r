import { useEffect, useRef, useCallback } from "react";
import { Button, Empty, Tag, Tooltip } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { useRemoteControlEventStore } from "@/stores/remoteControlEventStore";
import type { RemoteControlEvent } from "@/types/electron";

function formatTime(ts: number): string {
	return new Date(ts).toLocaleString("zh-CN", {
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

function getEventTag(event: RemoteControlEvent) {
	const map: Record<string, { color: string; label: string }> = {
		im_message_received: { color: "blue", label: "收到消息" },
		im_message_sent: { color: "cyan", label: "发送消息" },
		device_command_sent: { color: "orange", label: "发送命令" },
		device_command_result: { color: "purple", label: "命令结果" },
		device_online: { color: "success", label: "设备上线" },
		device_offline: { color: "default", label: "设备离线" },
	};
	const info = map[event.type] || { color: "default", label: event.type };
	return <Tag color={info.color}>{info.label}</Tag>;
}

function getDirectionIcon(direction: string) {
	switch (direction) {
		case "incoming":
			return "←";
		case "outgoing":
			return "→";
		default:
			return "●";
	}
}

export function EventTimeline() {
	const { events, isLoading, fetchEvents, clearEvents, addEvent } =
		useRemoteControlEventStore();
	const bottomRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	// 自动滚底
	const scrollToBottom = useCallback(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, []);

	// 初始化: 先订阅 onNewEvent，再加载历史
	useEffect(() => {
		const unsubscribe = window.electron.remoteControl.onNewEvent(
			(event: RemoteControlEvent) => {
				addEvent(event);
			},
		);

		fetchEvents();

		return unsubscribe;
	}, [addEvent, fetchEvents]);

	// 事件变更时自动滚底
	useEffect(() => {
		scrollToBottom();
	}, [events, scrollToBottom]);

	const handleClear = useCallback(async () => {
		await clearEvents();
	}, [clearEvents]);

	if (events.length === 0 && !isLoading) {
		return (
			<div className="flex flex-col items-center justify-center py-12">
				<Empty description="暂无事件记录" />
				<p className="text-xs text-gray-400 mt-2">
					启动 IM 机器人或连接远程设备后，事件将自动显示在此处
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full">
			<div className="flex justify-between items-center mb-2">
				<span className="text-xs text-gray-500">共 {events.length} 条事件</span>
				<Button
					size="small"
					icon={<DeleteOutlined />}
					onClick={handleClear}
					danger
				>
					清空
				</Button>
			</div>

			<div
				ref={containerRef}
				className="flex-1 overflow-y-auto space-y-1 pr-1"
				style={{ maxHeight: 500 }}
			>
				{events.map((event) => (
					<div
						key={event.id}
						className="flex items-start gap-2 px-3 py-2 rounded text-sm hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
					>
						<Tooltip title={event.direction}>
							<span className="text-gray-400 select-none flex-shrink-0 w-4 text-center">
								{getDirectionIcon(event.direction)}
							</span>
						</Tooltip>

						<span className="text-gray-400 text-xs flex-shrink-0 w-32 pt-0.5">
							{formatTime(event.timestamp)}
						</span>

						<span className="flex-shrink-0">{getEventTag(event)}</span>

						<span className="text-xs text-gray-500 flex-shrink-0">
							{event.source.name}
						</span>

						<span className="flex-1 break-all whitespace-pre-wrap text-xs font-mono leading-relaxed">
							{event.content}
						</span>
					</div>
				))}
				<div ref={bottomRef} />
			</div>
		</div>
	);
}
