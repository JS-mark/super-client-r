import {
	Camera,
	GripVertical,
	Languages,
	MessageCircle,
	Mic,
	Monitor,
	Phone,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

const FloatWidget: React.FC = () => {
	const [isHovered, setIsHovered] = useState(false);
	const navigate = useNavigate();

	const handleMouseEnter = () => {
		setIsHovered(true);
		window.electron.ipc.send("resize-float-window", {
			width: 300,
			height: 400,
		});
	};

	const handleMouseLeave = () => {
		setIsHovered(false);
		window.electron.ipc.send("resize-float-window", { width: 300, height: 60 });
	};

	const handleMainClick = () => {
		window.electron.ipc.send("open-main-window");
	};

	const menuItems = [
		{ icon: Phone, label: "语音通话" },
		{ icon: Monitor, label: "共享应用或屏幕" },
		{ icon: Mic, label: "记录会议" },
		{ icon: Camera, label: "截图提问" },
		{ icon: Languages, label: "实时双语字幕" },
	];

	return (
		<div
			className="h-screen w-screen bg-transparent flex flex-col items-center pt-2 select-none"
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
		>
			{/* Capsule Input Bar */}
			<div
				className="w-[280px] h-[48px] bg-white rounded-full shadow-lg flex items-center px-4 cursor-pointer hover:bg-gray-50 transition-colors border border-gray-100"
				onClick={handleMainClick}
			>
				<div
					className="w-6 h-6 flex items-center justify-center mr-2 cursor-grab active:cursor-grabbing hover:bg-gray-100 rounded-full transition-colors"
					style={{ "-webkit-app-region": "drag" } as React.CSSProperties}
					onClick={(e) => e.stopPropagation()}
				>
					<GripVertical className="w-4 h-4 text-gray-400" />
				</div>
				<div className="w-1 h-5 bg-blue-500 rounded-full mr-3"></div>
				<span className="text-gray-400 text-sm truncate">问问豆包...</span>
				<div className="flex-1"></div>
				<MessageCircle className="w-5 h-5 text-gray-400" />
			</div>

			{/* Dropdown Menu */}
			{isHovered && (
				<div className="w-[280px] mt-2 bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 animate-in fade-in slide-in-from-top-2 duration-200">
					{menuItems.map((item, index) => (
						<div
							key={index}
							className="flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
							onClick={handleMainClick} // For now, all open main window
						>
							<item.icon className="w-5 h-5 text-gray-600 mr-3" />
							<span className="text-gray-700 text-sm">{item.label}</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
};

export default FloatWidget;
