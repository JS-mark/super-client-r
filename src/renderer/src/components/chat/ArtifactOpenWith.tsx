import { Button, Dropdown } from "antd";
import type { MenuProps } from "antd";
import { useTranslation } from "react-i18next";
import type { FileOpenTarget } from "../../types/electron";

export interface ArtifactOpenWithProps {
	openTargets: FileOpenTarget[];
	onOpenWith: (targetId: string) => void;
}

/**
 * Renders a "打开方式" (Open with…) dropdown listing the resolved
 * {@link ArtifactOpenWithProps.openTargets} for an artifact-origin
 * ArtifactLibraryItem. Selecting a target invokes
 * {@link ArtifactOpenWithProps.onOpenWith} with the target id; the parent is
 * responsible for calling `fileActionService.openWith`. Unavailable targets
 * are rendered disabled. Rendering is local-only; target metadata never
 * leaves the renderer.
 */
export function ArtifactOpenWith({
	openTargets,
	onOpenWith,
}: ArtifactOpenWithProps) {
	const { t } = useTranslation("chat");

	const menu: MenuProps = {
		items: openTargets.map((target) => ({
			key: target.id,
			label: target.label,
			disabled: !target.available,
		})),
		onClick: ({ key }: { key: string }) => {
			onOpenWith(key);
		},
	};

	return (
		<Dropdown
			menu={menu}
			trigger={["click"]}
			overlayClassName="artifact-open-with"
		>
			<Button
				type="link"
				size="small"
				style={{ padding: 0, fontSize: 12 }}
				data-testid="artifact-open-with-trigger"
			>
				{t("artifacts.openWith", "打开方式")}
			</Button>
		</Dropdown>
	);
}

export default ArtifactOpenWith;
