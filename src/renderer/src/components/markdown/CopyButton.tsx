import { CheckOutlined, CopyOutlined } from "@ant-design/icons";
import { theme } from "antd";
import { useCallback, useState, type FC } from "react";

const { useToken } = theme;

interface CopyButtonProps {
	getText: () => string;
	className?: string;
}

export const CopyButton: FC<CopyButtonProps> = ({ getText, className }) => {
	const { token } = useToken();
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			const text = getText();
			navigator.clipboard.writeText(text);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		},
		[getText],
	);

	return (
		<button
			type="button"
			onClick={handleCopy}
			className={`flex items-center justify-center w-7 h-7 rounded-md border-none cursor-pointer transition-all duration-200 ${className ?? ""}`}
			style={{
				backgroundColor: copied
					? token.colorSuccessBg
					: token.colorFillSecondary,
				color: copied ? token.colorSuccess : token.colorTextSecondary,
			}}
		>
			{copied ? (
				<CheckOutlined style={{ fontSize: 12 }} />
			) : (
				<CopyOutlined style={{ fontSize: 12 }} />
			)}
		</button>
	);
};
