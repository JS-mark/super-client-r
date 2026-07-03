/**
 * LegacyImportPrompt — Phase G-3
 *
 * App 启动后调一次 `legacyData.detect()`：若发现老 `<userData>/chats/<userId>/`
 * 下还有 conversation 数据且尚未导入（migrationV2Done = false），弹一次性
 * Modal 询问用户是否导入。
 *
 * 用户行为：
 *  - 确认 → 调 `importAll()`，结果汇报 + 刷新 chatStore
 *  - 取消 → 仅关闭 Modal，**不**置 done flag，下次启动还会询问（让用户有"再想想"的机会）
 *  - 永不询问 → 调一个 silent `importAll()`（其内部会置 done flag）但什么也不导
 *    —— 简化实现：当前版本只提供"导入"和"暂时不导"两个按钮
 */

import { Alert, Button, Modal, Typography, message } from "antd";
import { LiteList as List } from "@/components/ui/LiteList";
import { useEffect, useState } from "react";
import { useChatStore } from "../../stores/chatStore";

const { Text } = Typography;

interface LegacyConv {
	id: string;
	name: string;
	createdAt: number;
	updatedAt: number;
	messageCount: number;
	preview: string;
}

interface DetectInfo {
	count: number;
	alreadyImported: boolean;
	legacyDir: string;
	preview: LegacyConv[];
}

export function LegacyImportPrompt() {
	const [info, setInfo] = useState<DetectInfo | null>(null);
	const [open, setOpen] = useState(false);
	const [importing, setImporting] = useState(false);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await window.electron.legacyData.detect();
				if (cancelled) return;
				if (!res.success || !res.data) return;
				const d = res.data;
				if (d.alreadyImported || d.count === 0) return;
				setInfo(d);
				setOpen(true);
			} catch (err) {
				console.warn("[LegacyImportPrompt] detect failed:", err);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const handleImport = async () => {
		setImporting(true);
		try {
			const res = await window.electron.legacyData.importAll();
			if (!res.success || !res.data) {
				message.error("导入失败：" + (res.error || "unknown"));
				return;
			}
			const { imported, skipped, failures } = res.data;
			if (failures.length > 0) {
				message.warning(
					`已导入 ${imported} 条，跳过 ${skipped} 条；${failures.length} 条失败`,
				);
			} else {
				message.success(`已导入 ${imported} 条历史对话`);
			}
			// 刷新 chatStore 让 sidebar 立刻看到导入的会话
			await useChatStore.getState().loadConversations();
			setOpen(false);
		} catch (err) {
			message.error(err instanceof Error ? err.message : String(err));
		} finally {
			setImporting(false);
		}
	};

	if (!info) return null;

	return (
		<Modal
			open={open}
			title={`发现 ${info.count} 条历史对话`}
			onCancel={() => setOpen(false)}
			centered
			width={560}
			footer={[
				<Button key="later" onClick={() => setOpen(false)}>
					暂时不导入
				</Button>,
				<Button
					key="import"
					type="primary"
					loading={importing}
					onClick={handleImport}
				>
					导入
				</Button>,
			]}
		>
			<Alert
				type="info"
				showIcon
				message="新版本启用了新的会话存储格式。这些历史对话来自旧版本，需要导入后才能继续访问。"
				description="导入会保留消息内容、附件与时间戳；项目绑定不会自动恢复，导入后会作为「无项目 Agent 会话」出现，可以手动绑定到项目。原始老数据保留不删除。"
				className="mb-3"
			/>
			{info.preview.length > 0 && (
				<>
					<Text type="secondary" className="block mb-1 text-xs">
						最近的 {info.preview.length} 条预览：
					</Text>
					<List
						size="small"
						bordered
						dataSource={info.preview}
						renderItem={(conv) => (
							<List.Item>
								<List.Item.Meta
									title={conv.name || "未命名对话"}
									description={
										<span className="text-xs text-slate-500">
											{conv.messageCount} 条消息 ·{" "}
											{new Date(conv.updatedAt).toLocaleString()}
										</span>
									}
								/>
							</List.Item>
						)}
					/>
				</>
			)}
		</Modal>
	);
}
