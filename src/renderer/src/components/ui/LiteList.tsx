import {
	type CSSProperties,
	type HTMLAttributes,
	type ReactNode,
	createContext,
	useContext,
	useEffect,
	useState,
} from "react";
import { Spin, theme } from "antd";
import { cn } from "@/lib/utils";

type ListSize = "small" | "default" | "large";

interface ListGridConfig {
	gutter?: number;
	column?: number;
	xs?: number;
	sm?: number;
	md?: number;
	lg?: number;
	xl?: number;
	xxl?: number;
}

interface LiteListProps<T> extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
	dataSource?: readonly T[];
	renderItem: (item: T, index: number) => ReactNode;
	bordered?: boolean;
	split?: boolean;
	size?: ListSize;
	loading?: boolean;
	grid?: ListGridConfig;
	rowKey?: keyof T | ((item: T, index: number) => string | number);
	header?: ReactNode;
	footer?: ReactNode;
	emptyText?: ReactNode;
}

// Breakpoints follow antd's defaults so the grid behaviour matches.
const BREAKPOINTS: Array<{ key: keyof ListGridConfig; min: number }> = [
	{ key: "xxl", min: 1600 },
	{ key: "xl", min: 1200 },
	{ key: "lg", min: 992 },
	{ key: "md", min: 768 },
	{ key: "sm", min: 576 },
	{ key: "xs", min: 0 },
];

function useGridColumns(grid: ListGridConfig | undefined): number | undefined {
	const [width, setWidth] = useState(() =>
		typeof window === "undefined" ? 0 : window.innerWidth,
	);

	useEffect(() => {
		if (!grid) return;
		const handler = () => setWidth(window.innerWidth);
		window.addEventListener("resize", handler);
		return () => window.removeEventListener("resize", handler);
	}, [grid]);

	if (!grid) return undefined;
	for (const { key, min } of BREAKPOINTS) {
		if (width >= min && grid[key]) return grid[key];
	}
	return grid.column;
}

function resolveRowKey<T>(
	item: T,
	index: number,
	rowKey: LiteListProps<T>["rowKey"],
): string | number {
	if (typeof rowKey === "function") return rowKey(item, index);
	if (typeof rowKey === "string" && item && typeof item === "object") {
		const value = (item as Record<string, unknown>)[rowKey];
		if (typeof value === "string" || typeof value === "number") return value;
	}
	return index;
}

function LiteListInner<T>({
	dataSource = [],
	renderItem,
	bordered = false,
	split = true,
	size = "default",
	loading = false,
	grid,
	rowKey,
	header,
	footer,
	emptyText,
	className,
	style,
	...rest
}: LiteListProps<T>) {
	const { token } = theme.useToken();
	const columns = useGridColumns(grid);

	const isGrid = Boolean(grid);
	const itemPadding =
		size === "small"
			? "8px 12px"
			: size === "large"
				? "16px 24px"
				: "12px 16px";

	const containerStyle: CSSProperties = {
		...(bordered
			? {
					border: `1px solid ${token.colorBorderSecondary}`,
					borderRadius: token.borderRadiusLG,
					overflow: "hidden",
				}
			: null),
		...style,
	};

	const bodyStyle: CSSProperties = isGrid
		? {
				display: "grid",
				gap: grid?.gutter ?? 0,
				gridTemplateColumns: `repeat(${columns ?? 1}, minmax(0, 1fr))`,
			}
		: {
				display: "flex",
				flexDirection: "column",
			};

	const isEmpty = !dataSource || dataSource.length === 0;

	return (
		<div
			role="list"
			className={cn("lite-list", className)}
			style={containerStyle}
			data-size={size}
			data-bordered={bordered ? "true" : undefined}
			data-split={split ? "true" : "false"}
			{...rest}
		>
			{header ? (
				<div
					className="lite-list-header"
					style={{
						padding: itemPadding,
						borderBottom: bordered
							? `1px solid ${token.colorSplit}`
							: undefined,
					}}
				>
					{header}
				</div>
			) : null}

			{loading ? (
				<div className="flex items-center justify-center" style={{ padding: 24 }}>
					<Spin />
				</div>
			) : isEmpty ? (
				<div
					className="lite-list-empty"
					style={{
						padding: itemPadding,
						color: token.colorTextDescription,
					}}
				>
					{emptyText ?? null}
				</div>
			) : (
				<div className="lite-list-items" style={bodyStyle}>
					{dataSource.map((item, index) => {
						const key = resolveRowKey(item, index, rowKey);
						const rendered = renderItem(item, index);
						const showDivider = split && !isGrid && index < dataSource.length - 1;
						return (
							<LiteListRowContext.Provider
								key={key}
								value={{
									size,
									itemPadding,
									showDivider,
									splitColor: token.colorSplit,
								}}
							>
								{rendered}
							</LiteListRowContext.Provider>
						);
					})}
				</div>
			)}

			{footer ? (
				<div
					className="lite-list-footer"
					style={{
						padding: itemPadding,
						borderTop: bordered
							? `1px solid ${token.colorSplit}`
							: undefined,
					}}
				>
					{footer}
				</div>
			) : null}
		</div>
	);
}

// ------------------------- Row context -------------------------

interface LiteListRowContextValue {
	size: ListSize;
	itemPadding: string;
	showDivider: boolean;
	splitColor: string;
}

const LiteListRowContext = createContext<LiteListRowContextValue>({
	size: "default",
	itemPadding: "12px 16px",
	showDivider: false,
	splitColor: "transparent",
});

// ------------------------- Item -------------------------

interface LiteListItemProps extends HTMLAttributes<HTMLDivElement> {
	actions?: ReactNode[];
	extra?: ReactNode;
	children?: ReactNode;
}

function LiteListItem({
	actions,
	extra,
	children,
	className,
	style,
	...rest
}: LiteListItemProps) {
	const { itemPadding, showDivider, splitColor } = useContext(LiteListRowContext);

	const mergedStyle: CSSProperties = {
		padding: itemPadding,
		borderBottom: showDivider ? `1px solid ${splitColor}` : undefined,
		...style,
	};

	return (
		<div
			role="listitem"
			className={cn(
				"lite-list-item flex items-center gap-3 min-w-0",
				className,
			)}
			style={mergedStyle}
			{...rest}
		>
			{children}
			{actions && actions.length > 0 ? (
				<ul className="lite-list-item-actions ml-auto flex shrink-0 items-center gap-3 list-none m-0 p-0">
					{actions.map((action, index) => (
						<li
							key={index}
							className="lite-list-item-action flex items-center"
						>
							{action}
							{index < actions.length - 1 ? (
								<em
									aria-hidden
									className="lite-list-item-action-split inline-block ml-3"
									style={{
										width: 1,
										height: 14,
										background: splitColor,
									}}
								/>
							) : null}
						</li>
					))}
				</ul>
			) : null}
			{extra ? <div className="lite-list-item-extra ml-2 shrink-0">{extra}</div> : null}
		</div>
	);
}

// ------------------------- Item.Meta -------------------------

interface LiteListItemMetaProps {
	avatar?: ReactNode;
	title?: ReactNode;
	description?: ReactNode;
	className?: string;
	style?: CSSProperties;
}

function LiteListItemMeta({
	avatar,
	title,
	description,
	className,
	style,
}: LiteListItemMetaProps) {
	const { token } = theme.useToken();
	return (
		<div
			className={cn(
				"lite-list-item-meta flex items-start gap-3 flex-1 min-w-0",
				className,
			)}
			style={style}
		>
			{avatar ? (
				<div className="lite-list-item-meta-avatar shrink-0">{avatar}</div>
			) : null}
			<div className="lite-list-item-meta-content flex-1 min-w-0">
				{title ? (
					<div
						className="lite-list-item-meta-title"
						style={{ color: token.colorText, marginBottom: 4 }}
					>
						{title}
					</div>
				) : null}
				{description ? (
					<div
						className="lite-list-item-meta-description text-xs"
						style={{ color: token.colorTextDescription }}
					>
						{description}
					</div>
				) : null}
			</div>
		</div>
	);
}

// ------------------------- Public API -------------------------

type LiteListItemComponent = typeof LiteListItem & {
	Meta: typeof LiteListItemMeta;
};

(LiteListItem as LiteListItemComponent).Meta = LiteListItemMeta;

type LiteListComponent = (<T>(props: LiteListProps<T>) => ReactNode) & {
	Item: LiteListItemComponent;
};

export const LiteList = LiteListInner as LiteListComponent;
LiteList.Item = LiteListItem as LiteListItemComponent;

export type {
	LiteListProps,
	LiteListItemProps,
	LiteListItemMetaProps,
	ListGridConfig,
};
