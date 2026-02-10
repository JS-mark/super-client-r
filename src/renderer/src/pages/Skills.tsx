import {
	DeleteOutlined,
	DownloadOutlined,
	EllipsisOutlined,
	ReloadOutlined,
	SearchOutlined,
	SyncOutlined,
} from "@ant-design/icons";
import type { MenuProps } from "antd";
import {
	Button,
	Card,
	Dropdown,
	Empty,
	Input,
	message,
	Modal,
	Pagination,
	Spin,
	Tabs,
	Tag,
} from "antd";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { MainLayout } from "../components/layout/MainLayout";
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
		message.success(t("skills.messages.installed", { name: skill.name }));
	};

	const handleUninstall = () => {
		uninstallSkill(skill.id);
		message.success(t("skills.messages.uninstalled", { name: skill.name }));
	};

	const handleUpdate = () => {
		updateSkill(skill.id);
		message.success(t("skills.messages.updated", { name: skill.name }));
	};

	const handleReinstall = () => {
		reinstallSkill(skill.id);
		message.success(t("skills.messages.reinstalled", { name: skill.name }));
	};

	// 构建操作按钮
	const renderFooter = () => {
		const buttons = [];

		if (isInstalled) {
			buttons.push(
				<Button key="reinstall" onClick={handleReinstall}>
					<ReloadOutlined />
					{t("skills.actions.reinstall")}
				</Button>,
			);
			buttons.push(
				<Button key="uninstall" danger onClick={handleUninstall}>
					<DeleteOutlined />
					{t("skills.actions.uninstall")}
				</Button>,
			);
			if (hasUpdate) {
				buttons.push(
					<Button key="update" type="primary" onClick={handleUpdate}>
						<SyncOutlined />
						{t("skills.actions.update")}
					</Button>,
				);
			}
		} else {
			buttons.push(
				<Button key="install" type="primary" onClick={handleInstall}>
					<DownloadOutlined />
					{t("skills.actions.install")}
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
							{t("skills.by")} {skill.author}
						</div>
					</div>
				</div>
			}
			open={open}
			onCancel={onClose}
			footer={renderFooter()}
			width={600}
		>
			<div className="space-y-4">
				<div className="flex items-center gap-2">
					<Tag>{skill.version}</Tag>
					{skill.category && <Tag>{skill.category}</Tag>}
					{isInstalled && (
						<Tag color="success">
							{t("skills.status.installed")}
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
						{t("skills.description", "Description")}
					</h4>
					<p className="text-gray-600 whitespace-pre-wrap">
						{skill.description}
					</p>
				</div>

				{skill.readme && (
					<div>
						<h4 className="text-sm font-medium text-gray-700 mb-2">
							{t("skills.readme", "README")}
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
							{t("skills.repository", "Repository")}
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
		message.success(t("skills.messages.installed", { name: skill.name }));
	};

	const handleUninstall = (e: React.MouseEvent) => {
		e.stopPropagation();
		uninstallSkill(skill.id);
		message.success(t("skills.messages.uninstalled", { name: skill.name }));
	};

	const handleUpdate = (e: React.MouseEvent) => {
		e.stopPropagation();
		updateSkill(skill.id);
		message.success(t("skills.messages.updated", { name: skill.name }));
	};

	const handleReinstall = (e: React.MouseEvent) => {
		e.stopPropagation();
		reinstallSkill(skill.id);
		message.success(t("skills.messages.reinstalled", { name: skill.name }));
	};

	// 主要操作按钮：安装、重装、卸载
	const mainActions: React.ReactNode[] = [];
	// 更多操作按钮
	const moreItems: MenuProps["items"] = [];

	if (isInstalled) {
		// 已安装：显示重装和卸载
		mainActions.push(
			<Button
				key="reinstall"
				type="primary"
				size="small"
				icon={<ReloadOutlined />}
				onClick={handleReinstall}
			>
				{t("skills.actions.reinstall")}
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
				{t("skills.actions.uninstall")}
			</Button>,
		);

		// 如果有更新，添加到更多菜单
		if (hasUpdate) {
			moreItems.push({
				key: "update",
				label: t("skills.actions.update"),
				icon: <SyncOutlined />,
				onClick: () => {
					updateSkill(skill.id);
					message.success(t("skills.messages.updated", { name: skill.name }));
				},
			});
		}
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
				{t("skills.actions.install")}
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
								{t("skills.installedVersion")}
								{installedVersion}
							</span>
						)}
				</div>
			}
		>
			<div className="flex flex-col h-32 justify-between">
				<p className="text-gray-500 line-clamp-3 mb-2 flex-grow">
					{skill.description}
				</p>
				<div className="flex justify-between items-center text-xs text-gray-400 mt-2">
					<span>
						{t("skills.by")} {skill.author}
					</span>
					{skill.category && <Tag variant="filled">{skill.category}</Tag>}
				</div>
			</div>
		</Card>
	);
};

const Skills: React.FC = () => {
	const { t } = useTranslation();
	const { installedSkills, marketSkills, marketTotal, fetchMarketSkills, isLoading } =
		useSkillStore();
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
			label: t("skills.tabs.market"),
			children: (
				<div className="h-full flex flex-col pr-2">
					<div className="mb-4 flex gap-2 shrink-0">
						<Input
							prefix={<SearchOutlined className="text-gray-400" />}
							placeholder={t("skills.searchPlaceholder")}
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
							{t("common.search", "搜索")}
						</Button>
					</div>
					<div className="flex-1 overflow-y-auto min-h-0">
						{isLoading ? (
							<div className="flex justify-center items-center py-20">
								<Spin size="large" />
							</div>
						) : marketSkills.length === 0 ? (
							<Empty description={t("skills.noData")} className="py-20" />
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
			label: `${t("skills.tabs.installed")} (${installedSkills.length})`,
			children: (
				<div className="h-full overflow-y-auto pr-2">
					<div className="mb-4 flex gap-2">
						<Input
							prefix={<SearchOutlined className="text-gray-400" />}
							placeholder={t("skills.searchPlaceholder")}
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
							{t("common.search", "搜索")}
						</Button>
					</div>
					{filterInstalledSkills(installedSkills).length === 0 ? (
						<Empty description={t("skills.noInstalled")} className="py-20" />
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
			<div className="flex flex-col h-full">
				<div className="mb-6 flex justify-between items-center shrink-0">
					<h1 className="min-w-[100px] text-2xl font-bold mr-[10px]">{t("skills.title")}</h1>
				</div>

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
