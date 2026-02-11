import {
	DeleteOutlined,
	DownloadOutlined,
	EllipsisOutlined,
	ReloadOutlined,
	SearchOutlined,
	SyncOutlined,
	ToolOutlined,
} from "@ant-design/icons";
import type { MenuProps } from "antd";
import {
	Button,
	Card,
	Dropdown,
	Empty,
	Input,
	Modal,
	message,
	Pagination,
	Spin,
	Tabs,
	Tag,
	Tooltip,
} from "antd";
import * as React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { MainLayout } from "../components/layout/MainLayout";
import { useTitle } from "../hooks/useTitle";
import { useSkillStore } from "../stores/skillStore";
import type { Skill } from "../types/skills";

// Skill 详情弹窗组件
interface SkillDetailModalProps {
	skill: Skill | null;
	open: boolean;
	onClose: () => void;
}

const SkillDetailModal: React.FC<SkillDetailModalProps> = ({
	skill,
	open,
	onClose,
}) => {
	const { t } = useTranslation();
	const {
		installedSkills,
		installSkill,
		uninstallSkill,
		updateSkill,
		reinstallSkill,
		checkUpdate,
	} = useSkillStore();

	if (!skill) return null;

	const isInstalled = installedSkills.some((s) => s.id === skill.id);
	const hasUpdate = checkUpdate(skill.id);
	const installedVersion = installedSkills.find(
		(s) => s.id === skill.id,
	)?.version;

	const handleInstall = () => {
		installSkill(skill);
		message.success(
			t("messages.installed", { ns: "skills", name: skill.name }),
		);
	};

	const handleUninstall = () => {
		uninstallSkill(skill.id);
		message.success(
			t("messages.uninstalled", { ns: "skills", name: skill.name }),
		);
	};

	const handleUpdate = () => {
		updateSkill(skill.id);
		message.success(t("messages.updated", { ns: "skills", name: skill.name }));
	};

	const handleReinstall = () => {
		reinstallSkill(skill.id);
		message.success(
			t("messages.reinstalled", { ns: "skills", name: skill.name }),
		);
	};

	// 构建操作按钮
	const renderFooter = () => {
		const buttons = [];

		if (isInstalled) {
			buttons.push(
				<Button key="reinstall" onClick={handleReinstall}>
					<ReloadOutlined />
					{t("actions.reinstall", { ns: "skills" })}
				</Button>,
			);
			buttons.push(
				<Button key="uninstall" danger onClick={handleUninstall}>
					<DeleteOutlined />
					{t("actions.uninstall", { ns: "skills" })}
				</Button>,
			);
			if (hasUpdate) {
				buttons.push(
					<Button key="update" type="primary" onClick={handleUpdate}>
						<SyncOutlined />
						{t("actions.update", { ns: "skills" })}
					</Button>,
				);
			}
		} else {
			buttons.push(
				<Button key="install" type="primary" onClick={handleInstall}>
					<DownloadOutlined />
					{t("actions.install", { ns: "skills" })}
				</Button>,
			);
		}

		return buttons;
	};

	return (
		<Modal
			title={
				<div className="flex items-center gap-3">
					<span className="text-2xl">{skill.icon || "🧩"}</span>
					<div>
						<div className="text-lg font-semibold">{skill.name}</div>
						<div className="text-sm text-gray-400">
							{t("by", { ns: "skills" })} {skill.author}
						</div>
					</div>
				</div>
			}
			open={open}
			onCancel={onClose}
			footer={renderFooter()}
			width={600}
			destroyOnHidden={true}
			maskClosable={false}
		>
			<div className="space-y-4">
				<div className="flex items-center gap-2">
					<Tag>{skill.version}</Tag>
					{skill.category && <Tag>{skill.category}</Tag>}
					{isInstalled && (
						<Tag color="success">
							{t("status.installed", { ns: "skills" })}
							{installedVersion && installedVersion !== skill.version && (
								<span className="ml-1">
									({installedVersion} → {skill.version})
								</span>
							)}
						</Tag>
					)}
				</div>

				<div>
					<h4 className="text-sm font-medium text-gray-700 mb-2">
						{t("description", "Description", { ns: "skills" })}
					</h4>
					<p className="text-gray-600 whitespace-pre-wrap">
						{skill.description}
					</p>
				</div>

				{skill.readme && (
					<div>
						<h4 className="text-sm font-medium text-gray-700 mb-2">
							{t("readme", "README", { ns: "skills" })}
						</h4>
						<div className="bg-gray-50 p-4 rounded-lg max-h-96 overflow-y-auto">
							<pre className="text-sm text-gray-600 whitespace-pre-wrap">
								{skill.readme}
							</pre>
						</div>
					</div>
				)}

				{skill.repository && (
					<div>
						<h4 className="text-sm font-medium text-gray-700 mb-2">
							{t("repository", "Repository", { ns: "skills" })}
						</h4>
						<a
							href={skill.repository}
							target="_blank"
							rel="noopener noreferrer"
							className="text-blue-500 hover:text-blue-600"
						>
							{skill.repository}
						</a>
					</div>
				)}
			</div>
		</Modal>
	);
};

const SkillCard: React.FC<{
	skill: Skill;
	onClick: () => void;
}> = ({ skill, onClick }) => {
	const { t } = useTranslation();
	const {
		installedSkills,
		installSkill,
		uninstallSkill,
		updateSkill,
		reinstallSkill,
		checkUpdate,
	} = useSkillStore();

	const isInstalled = installedSkills.some((s) => s.id === skill.id);
	const hasUpdate = checkUpdate(skill.id);
	const installedVersion = installedSkills.find(
		(s) => s.id === skill.id,
	)?.version;

	const handleInstall = (e: React.MouseEvent) => {
		e.stopPropagation();
		installSkill(skill);
		message.success(
			t("messages.installed", { ns: "skills", name: skill.name }),
		);
	};

	const handleUninstall = (e: React.MouseEvent) => {
		e.stopPropagation();
		uninstallSkill(skill.id);
		message.success(
			t("messages.uninstalled", { ns: "skills", name: skill.name }),
		);
	};

	const handleUpdate = (e: React.MouseEvent) => {
		e.stopPropagation();
		updateSkill(skill.id);
		message.success(t("messages.updated", { ns: "skills", name: skill.name }));
	};

	const handleReinstall = (e: React.MouseEvent) => {
		e.stopPropagation();
		reinstallSkill(skill.id);
		message.success(
			t("messages.reinstalled", { ns: "skills", name: skill.name }),
		);
	};

	// 主要操作按钮：安装、重装、卸载
	const mainActions: React.ReactNode[] = [];
	// 更多操作按钮
	const moreItems: MenuProps["items"] = [];

	if (isInstalled) {
		// 如果有更新，优先显示更新按钮
		if (hasUpdate) {
			mainActions.push(
				<Button
					key="update"
					type="primary"
					size="small"
					icon={<SyncOutlined />}
					onClick={handleUpdate}
				>
					{t("actions.update", { ns: "skills" })}
				</Button>,
			);
		}
		// 已安装：显示重装和卸载
		mainActions.push(
			<Button
				key="reinstall"
				size="small"
				icon={<ReloadOutlined />}
				onClick={handleReinstall}
			>
				{t("actions.reinstall", { ns: "skills" })}
			</Button>,
		);
		mainActions.push(
			<Button
				key="uninstall"
				size="small"
				danger
				icon={<DeleteOutlined />}
				onClick={handleUninstall}
			>
				{t("actions.uninstall", { ns: "skills" })}
			</Button>,
		);
	} else {
		// 未安装：显示安装
		mainActions.push(
			<Button
				key="install"
				type="primary"
				size="small"
				icon={<DownloadOutlined />}
				onClick={handleInstall}
			>
				{t("actions.install", { ns: "skills" })}
			</Button>,
		);
	}

	// 构建 actions 数组
	const actions: React.ReactNode[] = [...mainActions];

	// 如果有更多操作，添加更多按钮
	if (moreItems.length > 0) {
		actions.push(
			<Dropdown key="more" menu={{ items: moreItems }} trigger={["click"]}>
				<Button type="text" size="small" icon={<EllipsisOutlined />} />
			</Dropdown>,
		);
	}

	return (
		<Card
			hoverable
			className="h-full flex flex-col cursor-pointer"
			actions={actions}
			onClick={onClick}
			title={
				<div className="flex items-center gap-2">
					<span className="text-xl">{skill.icon || "🧩"}</span>
					<span className="truncate" title={skill.name}>
						{skill.name}
					</span>
				</div>
			}
			extra={
				<div className="flex flex-col items-end">
					<Tag>{skill.version}</Tag>
					{isInstalled &&
						installedVersion &&
						installedVersion !== skill.version && (
							<span className="text-xs text-gray-400 mt-1">
								{t("installedVersion", { ns: "skills" })}
								{installedVersion}
							</span>
						)}
				</div>
			}
		>
			<div className="flex flex-col h-32 justify-between">
				<Tooltip
					title={skill.description}
					placement="topLeft"
					styles={{
						root: { maxWidth: 400 },
						container: {
							maxHeight: 200,
							overflow: "auto",
						},
					}}
				>
					<p className="text-gray-500 line-clamp-3 mb-2 grow cursor-help">
						{skill.description}
					</p>
				</Tooltip>
				<div className="flex justify-between items-center text-xs text-gray-400 mt-2">
					<span>
						{t("by", { ns: "skills" })} {skill.author}
					</span>
					{skill.category && <Tag variant="filled">{skill.category}</Tag>}
				</div>
			</div>
		</Card>
	);
};

const Skills: React.FC = () => {
	const { t } = useTranslation();

	// 页面标题组件 - 同时用于 TitleBar 和页面头部
	const pageTitle = useMemo(() => {
		return (
			<div className="flex items-center gap-2">
				<div className="w-6 h-6 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
					<ToolOutlined className="text-white text-xs" />
				</div>
				<span className="text-slate-700 dark:text-slate-200 text-sm font-medium">
					{t("title", "技能市场", { ns: "skills" })}
				</span>
			</div>
		);
	}, [t]);

	// 设置标题栏
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

	// 初始加载
	React.useEffect(() => {
		fetchMarketSkills();
	}, [fetchMarketSkills]);

	// 市场搜索时调用 API（带防抖）
	React.useEffect(() => {
		const timeoutId = setTimeout(() => {
			setCurrentPage(1);
			fetchMarketSkills(1, pageSize, undefined, marketSearchTerm);
		}, 300);
		return () => clearTimeout(timeoutId);
	}, [marketSearchTerm, fetchMarketSkills]);

	// 分页切换
	const handlePageChange = (page: number) => {
		setCurrentPage(page);
		fetchMarketSkills(page, pageSize, undefined, marketSearchTerm);
	};

	// 本地过滤已安装的技能
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
							<div className="flex justify-center items-center py-20">
								<Spin size="large" />
							</div>
						) : marketSkills.length === 0 ? (
							<Empty
								description={t("noData", { ns: "skills" })}
								className="py-20"
							/>
						) : (
							<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
								{marketSkills.map((item) => (
									<SkillCard
										key={item.id}
										skill={item}
										onClick={() => handleSkillClick(item)}
									/>
								))}
							</div>
						)}
					</div>
					{marketTotal > pageSize && (
						<div className="flex justify-center pt-4 shrink-0">
							<Pagination
								current={currentPage}
								total={marketTotal}
								pageSize={pageSize}
								onChange={handlePageChange}
								showSizeChanger={false}
							/>
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
						<Button
							type="primary"
							icon={<SearchOutlined />}
							onClick={() => {
								// 本地搜索，无需调用 API
							}}
						>
							{t("search", { ns: "common" })}
						</Button>
					</div>
					{filterInstalledSkills(installedSkills).length === 0 ? (
						<Empty
							description={t("noInstalled", { ns: "skills" })}
							className="py-20"
						/>
					) : (
						<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-4">
							{filterInstalledSkills(installedSkills).map((item) => (
								<SkillCard
									key={item.id}
									skill={item}
									onClick={() => handleSkillClick(item)}
								/>
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

				<SkillDetailModal
					skill={selectedSkill}
					open={modalOpen}
					onClose={handleCloseModal}
				/>
			</div>
		</MainLayout>
	);
};

export default Skills;
