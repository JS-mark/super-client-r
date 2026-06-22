/**
 * C-1 useProjectStore tests.
 * Renderer test (jsdom env, default for vitest); mocks window.electron.projects
 * with vi.fn returning the IPC envelope shape.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@super-client/shared-types/project";
import { useProjectStore } from "../projectStore";

const fresh = () => useProjectStore.getState();

const mockProject = (overrides?: Partial<Project>): Project => ({
	id: overrides?.id ?? "id-1",
	cwd: overrides?.cwd ?? "/a/b",
	name: overrides?.name ?? "Test",
	createdAt: 1,
	updatedAt: 1,
	lastSeenAt: 1,
	...overrides,
});

const setupElectronMock = () => {
	const list = vi.fn();
	const add = vi.fn();
	const rename = vi.fn();
	const pin = vi.fn();
	const remove = vi.fn();
	(window as any).electron = {
		...(window as any).electron,
		projects: { list, add, rename, pin, remove },
	};
	return { list, add, rename, pin, remove };
};

beforeEach(() => {
	useProjectStore.setState({
		projects: [],
		currentProjectId: null,
		loaded: false,
	});
});

describe("load", () => {
	it("populates projects from IPC", async () => {
		const { list } = setupElectronMock();
		const p1 = mockProject({ id: "p1" });
		const p2 = mockProject({ id: "p2", cwd: "/c/d" });
		list.mockResolvedValueOnce({ success: true, data: [p1, p2] });

		await fresh().load();

		expect(fresh().projects).toEqual([p1, p2]);
		expect(fresh().loaded).toBe(true);
	});

	it("sets loaded=true even when IPC fails", async () => {
		const { list } = setupElectronMock();
		list.mockRejectedValueOnce(new Error("boom"));

		await fresh().load();

		expect(fresh().loaded).toBe(true);
		expect(fresh().projects).toEqual([]);
	});
});

describe("add", () => {
	it("upserts the returned project", async () => {
		const { add } = setupElectronMock();
		const p = mockProject({ id: "new-id", cwd: "/x" });
		add.mockResolvedValueOnce({ success: true, data: p });

		const result = await fresh().add("/x", "Custom");

		expect(add).toHaveBeenCalledWith("/x", "Custom");
		expect(result).toEqual(p);
		expect(fresh().projects).toEqual([p]);
	});

	it("idempotent add updates the existing entry", async () => {
		const { add } = setupElectronMock();
		const initial = mockProject({ id: "p1", name: "Old" });
		useProjectStore.setState({ projects: [initial] });
		const updated = mockProject({ id: "p1", name: "Renamed" });
		add.mockResolvedValueOnce({ success: true, data: updated });

		await fresh().add("/a/b", "Renamed");

		expect(fresh().projects).toEqual([updated]);
	});
});

describe("rename / pin", () => {
	it("rename updates entry in place", async () => {
		const { rename } = setupElectronMock();
		const before = mockProject({ id: "p1", name: "Old" });
		useProjectStore.setState({ projects: [before] });
		const after = { ...before, name: "New" };
		rename.mockResolvedValueOnce({ success: true, data: after });

		await fresh().rename("p1", "New");

		expect(fresh().projects[0].name).toBe("New");
	});

	it("pin updates entry in place", async () => {
		const { pin } = setupElectronMock();
		const before = mockProject({ id: "p1", pinned: false });
		useProjectStore.setState({ projects: [before] });
		const after = { ...before, pinned: true };
		pin.mockResolvedValueOnce({ success: true, data: after });

		await fresh().pin("p1", true);

		expect(fresh().projects[0].pinned).toBe(true);
	});
});

describe("remove", () => {
	it("removes the project from local state on success", async () => {
		const { remove } = setupElectronMock();
		useProjectStore.setState({
			projects: [mockProject({ id: "p1" }), mockProject({ id: "p2" })],
		});
		remove.mockResolvedValueOnce({
			success: true,
			data: { removed: true, orphan: false },
		});

		await fresh().remove("p1");

		expect(fresh().projects.map((p) => p.id)).toEqual(["p2"]);
	});

	it("clears currentProjectId when removed project was current", async () => {
		const { remove } = setupElectronMock();
		useProjectStore.setState({
			projects: [mockProject({ id: "p1" })],
			currentProjectId: "p1",
		});
		remove.mockResolvedValueOnce({
			success: true,
			data: { removed: true, orphan: false },
		});

		await fresh().remove("p1");

		expect(fresh().currentProjectId).toBeNull();
	});
});

describe("selectors", () => {
	it("getCurrent returns null when no currentProjectId", () => {
		useProjectStore.setState({ projects: [mockProject({ id: "p1" })] });
		expect(fresh().getCurrent()).toBeNull();
	});

	it("getCurrent returns project when matched", () => {
		const p = mockProject({ id: "p1" });
		useProjectStore.setState({
			projects: [p],
			currentProjectId: "p1",
		});
		expect(fresh().getCurrent()).toEqual(p);
	});

	it("getById returns matching project", () => {
		const p = mockProject({ id: "p1" });
		useProjectStore.setState({ projects: [p] });
		expect(fresh().getById("p1")).toEqual(p);
		expect(fresh().getById("missing")).toBeUndefined();
	});
});
