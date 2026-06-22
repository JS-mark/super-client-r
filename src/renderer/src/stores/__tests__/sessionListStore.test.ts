/**
 * C-2 useSessionListStore tests.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionMeta } from "@super-client/shared-types/project";
import { useSessionListStore } from "../sessionListStore";

const fresh = () => useSessionListStore.getState();

const mockMeta = (overrides: Partial<SessionMeta>): SessionMeta => ({
	id: "s-?",
	projectId: null,
	chatMode: "chat",
	createdAt: 1,
	updatedAt: 1,
	messageCount: 0,
	...overrides,
});

const setupElectronMock = () => {
	const list = vi.fn();
	const create = vi.fn();
	const del = vi.fn();
	const rename = vi.fn();
	const updateMeta = vi.fn();
	(window as any).electron = {
		...(window as any).electron,
		sessions: { list, create, delete: del, rename, updateMeta },
	};
	return { list, create, delete: del, rename, updateMeta };
};

beforeEach(() => {
	useSessionListStore.setState({
		casual: [],
		byProject: {},
		currentSessionId: null,
		loaded: false,
	});
});

describe("loadCasual / loadProject", () => {
	it("loadCasual populates casual bucket", async () => {
		const { list } = setupElectronMock();
		const m = mockMeta({ id: "c1", projectId: null });
		list.mockResolvedValueOnce({ success: true, data: [m] });

		await fresh().loadCasual();

		expect(list).toHaveBeenCalledWith(null);
		expect(fresh().casual).toEqual([m]);
		expect(fresh().loaded).toBe(true);
	});

	it("loadProject populates per-project bucket", async () => {
		const { list } = setupElectronMock();
		const m = mockMeta({ id: "p1-s1", projectId: "p1" });
		list.mockResolvedValueOnce({ success: true, data: [m] });

		await fresh().loadProject("p1");

		expect(list).toHaveBeenCalledWith("p1");
		expect(fresh().byProject.p1).toEqual([m]);
	});

	it("loadCasual sets loaded=true even on IPC failure", async () => {
		const { list } = setupElectronMock();
		list.mockRejectedValueOnce(new Error("boom"));

		await fresh().loadCasual();

		expect(fresh().loaded).toBe(true);
		expect(fresh().casual).toEqual([]);
	});
});

describe("create", () => {
	it("creates a casual session and sets it as current", async () => {
		const { create } = setupElectronMock();
		const m = mockMeta({ id: "new-c", projectId: null });
		create.mockResolvedValueOnce({ success: true, data: m });

		const result = await fresh().create({ projectId: null });

		expect(result).toEqual(m);
		expect(fresh().casual).toEqual([m]);
		expect(fresh().currentSessionId).toBe("new-c");
	});

	it("creates a project session in the right bucket", async () => {
		const { create } = setupElectronMock();
		const m = mockMeta({ id: "new-p", projectId: "p1" });
		create.mockResolvedValueOnce({ success: true, data: m });

		await fresh().create({ projectId: "p1" });

		expect(fresh().byProject.p1).toEqual([m]);
		expect(fresh().casual).toEqual([]);
	});
});

describe("delete", () => {
	it("removes a casual session from local state", async () => {
		const { delete: del } = setupElectronMock();
		const m = mockMeta({ id: "c1", projectId: null });
		useSessionListStore.setState({ casual: [m], currentSessionId: "c1" });
		del.mockResolvedValueOnce({ success: true });

		await fresh().delete("c1");

		expect(fresh().casual).toEqual([]);
		expect(fresh().currentSessionId).toBeNull();
	});

	it("removes a project session from byProject bucket", async () => {
		const { delete: del } = setupElectronMock();
		const m = mockMeta({ id: "p1-s", projectId: "p1" });
		useSessionListStore.setState({ byProject: { p1: [m] } });
		del.mockResolvedValueOnce({ success: true });

		await fresh().delete("p1-s");

		expect(fresh().byProject.p1).toEqual([]);
	});

	it("no-ops if session id not in any bucket", async () => {
		const { delete: del } = setupElectronMock();
		await fresh().delete("does-not-exist");
		expect(del).not.toHaveBeenCalled();
	});
});

describe("rename / updateMeta", () => {
	it("rename updates entry in place", async () => {
		const { rename } = setupElectronMock();
		const before = mockMeta({ id: "c1", projectId: null, name: "Old" });
		useSessionListStore.setState({ casual: [before] });
		const after = { ...before, name: "New" };
		rename.mockResolvedValueOnce({ success: true, data: after });

		await fresh().rename("c1", "New");

		expect(fresh().casual[0].name).toBe("New");
	});

	it("updateMeta applies returned shape (server-merged)", async () => {
		const { updateMeta } = setupElectronMock();
		const before = mockMeta({ id: "c1", projectId: null });
		useSessionListStore.setState({ casual: [before] });
		const merged = { ...before, flags: { pinned: true } };
		updateMeta.mockResolvedValueOnce({ success: true, data: merged });

		await fresh().updateMeta("c1", { flags: { pinned: true } });

		expect(fresh().casual[0].flags?.pinned).toBe(true);
	});
});

describe("selectors", () => {
	it("getById finds session in casual or byProject", () => {
		useSessionListStore.setState({
			casual: [mockMeta({ id: "c1" })],
			byProject: { p1: [mockMeta({ id: "p-s", projectId: "p1" })] },
		});
		expect(fresh().getById("c1")?.id).toBe("c1");
		expect(fresh().getById("p-s")?.id).toBe("p-s");
		expect(fresh().getById("missing")).toBeUndefined();
	});

	it("getForBucket(null) returns casual; getForBucket(id) returns project list", () => {
		const c = mockMeta({ id: "c1" });
		const p = mockMeta({ id: "p-s", projectId: "p1" });
		useSessionListStore.setState({
			casual: [c],
			byProject: { p1: [p] },
		});
		expect(fresh().getForBucket(null)).toEqual([c]);
		expect(fresh().getForBucket("p1")).toEqual([p]);
		expect(fresh().getForBucket("never")).toEqual([]);
	});

	it("getCurrent returns null when no currentSessionId", () => {
		expect(fresh().getCurrent()).toBeNull();
	});

	it("getCurrent returns the session matching currentSessionId", () => {
		const c = mockMeta({ id: "c1" });
		useSessionListStore.setState({
			casual: [c],
			currentSessionId: "c1",
		});
		expect(fresh().getCurrent()).toEqual(c);
	});
});
