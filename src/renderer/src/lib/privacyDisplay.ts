const ABSOLUTE_PATH_RE = /^(?:\/|[A-Za-z]:[\\/])/;

export function toRedactedPathLabel(path: string | null | undefined): string {
	if (!path) return "";
	const normalized = path.replace(/\\/g, "/");
	const parts = normalized.split("/").filter(Boolean);
	const last = parts.at(-1) ?? normalized;
	const parent = parts.length > 1 ? parts.at(-2) : undefined;

	if (normalized.includes("/Library/Application Support/")) {
		const exportsIndex = parts.findIndex((part) => part === "exports");
		if (exportsIndex >= 0) {
			return ["<app-data>", ...parts.slice(exportsIndex)].join("/");
		}
		return `<app-data>/.../${last}`;
	}

	if (normalized.startsWith("/Users/")) {
		return parent ? `~/.../${parent}/${last}` : `~/.../${last}`;
	}

	if (ABSOLUTE_PATH_RE.test(normalized)) {
		return parent ? `<path>/.../${parent}/${last}` : `<path>/.../${last}`;
	}

	return normalized;
}
