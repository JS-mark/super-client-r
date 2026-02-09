import { SendOutlined, PaperClipOutlined, ClearOutlined } from "@ant-design/icons";
import { Button, Input } from "antd";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils";

const { TextArea } = Input;

interface ChatInputProps {
	value: string;
	onChange: (value: string) => void;
	onSend: () => void;
	onClear?: () => void;
	disabled?: boolean;
	isStreaming?: boolean;
	className?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
	value,
	onChange,
	onSend,
	onClear,
	disabled = false,
	isStreaming = false,
	className,
}) => {
	const { t } = useTranslation();

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			if (value.trim() && !disabled) {
				onSend();
			}
		}
	};

	return (
		<div
			className={cn(
				"border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4",
				className,
			)}
		>
			<div className="flex gap-3 items-end max-w-4xl mx-auto">
				{/* Attachment Button */}
				<Button
					type="text"
					icon={<PaperClipOutlined />}
					className="flex-shrink-0 h-10 w-10 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
					disabled={disabled}
				/>

				{/* Input Area */}
				<TextArea
					value={value}
					onChange={(e) => onChange(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder={t("chat.placeholder")}
					autoSize={{ minRows: 1, maxRows: 6 }}
					disabled={disabled}
					className="flex-1 !rounded-2xl !border-gray-200 dark:!border-gray-700 !bg-gray-50 dark:!bg-gray-800 focus:!border-blue-500 focus:!shadow-none"
				/>

				{/* Clear Button */}
				{onClear && value && (
					<Button
						type="text"
						icon={<ClearOutlined />}
						onClick={onClear}
						className="flex-shrink-0 h-10 w-10 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
						disabled={disabled}
					/>
				)}

				{/* Send Button */}
				<Button
					type="primary"
					icon={<SendOutlined />}
					onClick={onSend}
					disabled={disabled || !value.trim()}
					loading={isStreaming}
					className="flex-shrink-0 h-10 w-10 rounded-full !bg-gradient-to-r !from-blue-500 !to-blue-600 hover:!from-blue-600 hover:!to-blue-700 !border-0"
				/>
			</div>

			{/* Hint Text */}
			<div className="text-center mt-2">
				<span className="text-xs text-gray-400">
					{t("chat.hint", "Press Enter to send, Shift+Enter for new line")}
				</span>
			</div>
		</div>
	);
};