import {
	SearchOutlined,
	ToolOutlined,
} from "@ant-design/icons";
import {
	Button,
	Empty,
	Input,
	Pagination,
	Spin,
	Tabs,
	theme,
} from "antd";
import * as React from "react";
import { useMemo } from "react";

const { useToken } = theme;
import { useTranslation } from "react-i18next";
import { MainLayout } from "../components/layout/MainLayout";
import { SkillCard } from "../components/skill/SkillCard";
import { SkillDetailModal } from "../components/skill/SkillDetailModal";
import { useTitle } from "../hooks/useTitle";
import { useSkillStore } from "../stores/skillStore";
import type { Skill } from "../types/skills";

const Skills: React.FC = () => {
	const { t } = useTranslation();
	const { token } = useToken();

	const pageTitle = useMemo(() => {
		return (
			<div className="flex items-center gap-2">
				<div className="w-6 h-6 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
					<ToolOutlined className="text-white text-xs" />
				</div>
				<span
					className="text-sm font-medium"
					style={{ color: token.colorText }}
				>
					{t("title", "技能市场", { ns: "skills" })}
				</span>
			</div>
		);
	}, [t, token.colorText]);
	useTitle(pageTitle);

	const {
		installedSkills,
		marketSkills,
		marketTotal,
		fetchMarketSkills,
		isLoading,
	} = useSkillStore();
	const [marketSearchTerm, setMarketSearchTerm] = React.useState("");
	const [installedSearchTerm, setInstalledSearchTerm] = React.useState("");
	const [selectedSkill, setSelectedSkill] = React.useState<Skill | null>(null);
	const [modalOpen, setModalOpen] = React.useState(false);
	const [currentPage, setCurrentPage] = React.useState(1);
	const pageSize = 12;

	const handleSkillClick = (skill: Skill) => {
		setSelectedSkill(skill);
		setModalOpen(true);
	};

	const handleCloseModal = () => {
		setModalOpen(false);
		setSelectedSkill(null);
	};

	React.useEffect(() => {
		fetchMarketSkills();
	}, [fetchMarketSkills]);

	React.useEffect(() => {
		const timeoutId = setTimeout(() => {
			setCurrentPage(1);
			fetchMarketSkills(1, pageSize, undefined, marketSearchTerm);
		}, 300);
		return () => clearTimeout(timeoutId);
	}, [marketSearchTerm, fetchMarketSkills]);

	const handlePageChange = (page: number) => {
		setCurrentPage(page);
		fetchMarketSkills(page, pageSize, undefined, marketSearchTerm);
	};

	const filterInstalledSkills = (skills: Skill[]) => {
		if (!installedSearchTerm) return skills;
		return skills.filter(
			(s) =>
				s.name.toLowerCase().includes(installedSearchTerm.toLowerCase()) ||
				s.description.toLowerCase().includes(installedSearchTerm.toLowerCase()),
		);
	};

	const items = [
		{
			key: "market",
			label: t("tabs.market", { ns: "skills" }),
			children: (
				<div className="h-full flex flex-col pr-2">
					<div className="mb-4 flex gap-2 shrink-0">
						<Input
							prefix={<SearchOutlined className="text-gray-400" />}
							placeholder={t("searchPlaceholder", { ns: "skills" })}
							allowClear
							value={marketSearchTerm}
							onChange={(e) => setMarketSearchTerm(e.target.value)}
							onPressEnter={() => {
								setCurrentPage(1);
								fetchMarketSkills(1, pageSize, undefined, marketSearchTerm);
							}}
						/>
						<Button
							type="primary"
							icon={<SearchOutlined />}
							onClick={() => {
								setCurrentPage(1);
								fetchMarketSkills(1, pageSize, undefined, marketSearchTerm);
							}}
							loading={isLoading}
						>
							{t("search", { ns: "common" })}
						</Button>
					</div>
					<div className="flex-1 overflow-y-auto min-h-0">
						{isLoading ? (
							<div className="flex justify-center items-center py-20"><Spin size="large" /></div>
						) : marketSkills.length === 0 ? (
							<Empty description={t("noData", { ns: "skills" })} className="py-20" />
						) : (
							<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
								{marketSkills.map((item) => (
									<SkillCard key={item.id} skill={item} onClick={() => handleSkillClick(item)} />
								))}
							</div>
						)}
					</div>
					{marketTotal > pageSize && (
						<div className="flex justify-center pt-4 shrink-0">
							<Pagination current={currentPage} total={marketTotal} pageSize={pageSize} onChange={handlePageChange} showSizeChanger={false} />
						</div>
					)}
				</div>
			),
		},
		{
			key: "installed",
			label: `${t("tabs.installed", { ns: "skills" })} (${installedSkills.length})`,
			children: (
				<div className="h-full overflow-y-auto pr-2">
					<div className="mb-4 flex gap-2">
						<Input
							prefix={<SearchOutlined className="text-gray-400" />}
							placeholder={t("searchPlaceholder", { ns: "skills" })}
							allowClear
							value={installedSearchTerm}
							onChange={(e) => setInstalledSearchTerm(e.target.value)}
						/>
						<Button type="primary" icon={<SearchOutlined />} onClick={() => {}}>
							{t("search", { ns: "common" })}
						</Button>
					</div>
					{filterInstalledSkills(installedSkills).length === 0 ? (
						<Empty description={t("noInstalled", { ns: "skills" })} className="py-20" />
					) : (
						<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-4">
							{filterInstalledSkills(installedSkills).map((item) => (
								<SkillCard key={item.id} skill={item} onClick={() => handleSkillClick(item)} />
							))}
						</div>
					)}
				</div>
			),
		},
	];

	return (
		<MainLayout>
			<div className="p-4 h-full overflow-auto">
				<Tabs
					defaultActiveKey="market"
					items={items}
					className="flex-1 min-h-0 [&_.ant-tabs-content]:h-full [&_.ant-tabs-tabpane]:h-full"
				/>
				<SkillDetailModal skill={selectedSkill} open={modalOpen} onClose={handleCloseModal} />
			</div>
		</MainLayout>
	);
};

export default Skills;
