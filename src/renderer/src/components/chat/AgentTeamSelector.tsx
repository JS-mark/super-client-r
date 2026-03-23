import { TeamOutlined } from "@ant-design/icons";
import { Select, theme } from "antd";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AgentTeam } from "@/types/electron";
import { getAgentTeams } from "../../services/agent/agentSDKService";
import { useChatStore } from "../../stores/chatStore";

const { useToken } = theme;

/**
 * Agent 团队选择器
 * 在 Agent 模式下显示在输入框工具栏中
 */
export function AgentTeamSelector() {
	const { t } = useTranslation("chat");
	const { token } = useToken();
	const [teams, setTeams] = useState<AgentTeam[]>([]);
	const selectedTeamId = useChatStore((s) => s.selectedTeamId);
	const setSelectedTeamId = useChatStore((s) => s.setSelectedTeamId);

	useEffect(() => {
		getAgentTeams()
			.then(setTeams)
			.catch(() => {});
	}, []);

	const handleChange = useCallback(
		(value: string | undefined) => {
			setSelectedTeamId(value || null);
		},
		[setSelectedTeamId],
	);

	if (teams.length === 0) return null;

	return (
		<Select
			value={selectedTeamId || undefined}
			onChange={handleChange}
			allowClear
			placeholder={
				<span className="flex items-center gap-1">
					<TeamOutlined className="text-[10px]" />
					<span>{t("agentTeam.selectTeam")}</span>
				</span>
			}
			size="small"
			variant="borderless"
			popupMatchSelectWidth={false}
			className="min-w-0!"
			style={{ maxWidth: 140 }}
			options={teams.map((team) => ({
				value: team.id,
				label: (
					<span className="flex items-center gap-1 text-xs">
						<TeamOutlined className="text-[10px]" />
						{team.name}
					</span>
				),
			}))}
			optionRender={(option) => {
				const team = teams.find((t) => t.id === option.value);
				return (
					<div className="py-0.5">
						<div className="text-[12px] font-medium">{team?.name}</div>
						{team?.description && (
							<div
								className="text-[10px]"
								style={{ color: token.colorTextQuaternary }}
							>
								{team.description}
							</div>
						)}
					</div>
				);
			}}
		/>
	);
}
