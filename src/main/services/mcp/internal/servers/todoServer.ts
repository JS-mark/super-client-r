/**
 * @scp/todo — 内置 TODO 管理工具
 *
 * 使用文件系统存储 TODO 数据 (`{storageDir}/todos.json`)。
 *
 * 历史命名：曾叫 `@scp/task`，文件叫 `tasks.json`，工具叫 create_task / ...
 * 现统一改为 todo，避免和 ClaudeCodeAgentRuntime 内置的 `Task` facade（子
 * agent 调度）撞名。`readTodos()` 会在首次访问时自动把旧的 `tasks.json`
 * 重命名为 `todos.json`，已有数据无须手工迁移。
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { InternalMcpServer, InternalToolHandler } from "../types";
import { textResult } from "./shared";

interface Todo {
	id: string;
	title: string;
	description?: string;
	status: "pending" | "in_progress" | "completed" | "blocked" | "cancelled";
	priority: "low" | "medium" | "high" | "critical";
	tags?: string[];
	createdAt: string;
	updatedAt: string;
	completedAt?: string;
}

const TODOS_FILENAME = "todos.json";
const LEGACY_FILENAME = "tasks.json";

function getTodosPath(storageDir: string): string {
	return path.join(storageDir, TODOS_FILENAME);
}

/**
 * One-shot migration: if `tasks.json` exists and `todos.json` does not,
 * rename it in place. Idempotent (a second call is a no-op).
 */
async function migrateLegacyFile(storageDir: string): Promise<void> {
	const legacyPath = path.join(storageDir, LEGACY_FILENAME);
	const newPath = getTodosPath(storageDir);
	try {
		await fs.access(legacyPath);
	} catch {
		return; // no legacy file
	}
	try {
		await fs.access(newPath);
		return; // new file already exists — leave legacy alone
	} catch {
		// new file does not exist → rename
	}
	try {
		await fs.rename(legacyPath, newPath);
	} catch {
		// best-effort; readTodos() will fall back to empty list
	}
}

async function readTodos(storageDir: string): Promise<Todo[]> {
	await migrateLegacyFile(storageDir);
	try {
		const data = await fs.readFile(getTodosPath(storageDir), "utf-8");
		return JSON.parse(data) as Todo[];
	} catch {
		return [];
	}
}

async function writeTodos(storageDir: string, todos: Todo[]): Promise<void> {
	await fs.mkdir(storageDir, { recursive: true });
	await fs.writeFile(
		getTodosPath(storageDir),
		JSON.stringify(todos, null, 2),
		"utf-8",
	);
}

const createTodoHandler: InternalToolHandler = async (args) => {
	const storageDir = args._storageDir as string;
	if (!storageDir) {
		return textResult(
			"Error: no storage directory available. Please start a conversation first.",
			true,
		);
	}

	const title = args.title as string;
	if (!title) return textResult("Error: title is required", true);

	const description = (args.description as string) || undefined;
	const priority = (args.priority as Todo["priority"]) || "medium";
	const tags = (args.tags as string[]) || undefined;

	const todos = await readTodos(storageDir);

	const todo: Todo = {
		id: randomUUID(),
		title,
		description,
		status: "pending",
		priority,
		tags,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};

	todos.push(todo);
	await writeTodos(storageDir, todos);
	return textResult(JSON.stringify(todo, null, 2));
};

const updateTodoHandler: InternalToolHandler = async (args) => {
	const storageDir = args._storageDir as string;
	if (!storageDir) {
		return textResult(
			"Error: no storage directory available. Please start a conversation first.",
			true,
		);
	}

	const id = args.id as string;
	if (!id) return textResult("Error: id is required", true);

	const todos = await readTodos(storageDir);
	const todo = todos.find((t) => t.id === id);
	if (!todo) {
		return textResult(`Error: todo with id "${id}" not found`, true);
	}

	if (args.status !== undefined) todo.status = args.status as Todo["status"];
	if (args.priority !== undefined)
		todo.priority = args.priority as Todo["priority"];
	if (args.description !== undefined)
		todo.description = args.description as string;
	if (args.tags !== undefined) todo.tags = args.tags as string[];

	todo.updatedAt = new Date().toISOString();

	if (todo.status === "completed" && !todo.completedAt) {
		todo.completedAt = new Date().toISOString();
	}

	await writeTodos(storageDir, todos);
	return textResult(JSON.stringify(todo, null, 2));
};

const listTodosHandler: InternalToolHandler = async (args) => {
	const storageDir = args._storageDir as string;
	if (!storageDir) {
		return textResult(
			"Error: no storage directory available. Please start a conversation first.",
			true,
		);
	}

	let todos = await readTodos(storageDir);

	const status = args.status as string | undefined;
	const priority = args.priority as string | undefined;
	const tag = args.tag as string | undefined;

	if (status) todos = todos.filter((t) => t.status === status);
	if (priority) todos = todos.filter((t) => t.priority === priority);
	if (tag) todos = todos.filter((t) => t.tags?.includes(tag));

	if (todos.length === 0) {
		return textResult("No todos found matching the criteria.");
	}

	return textResult(JSON.stringify(todos, null, 2));
};

const deleteTodoHandler: InternalToolHandler = async (args) => {
	const storageDir = args._storageDir as string;
	if (!storageDir) {
		return textResult(
			"Error: no storage directory available. Please start a conversation first.",
			true,
		);
	}

	const id = args.id as string;
	if (!id) return textResult("Error: id is required", true);

	const todos = await readTodos(storageDir);
	const index = todos.findIndex((t) => t.id === id);
	if (index === -1) {
		return textResult(`Error: todo with id "${id}" not found`, true);
	}

	const removed = todos.splice(index, 1)[0];
	await writeTodos(storageDir, todos);
	return textResult(`Todo deleted: ${removed.title}`);
};

export function createTodoServer(): InternalMcpServer {
	const handlers = new Map<string, InternalToolHandler>();
	handlers.set("create_todo", createTodoHandler);
	handlers.set("update_todo", updateTodoHandler);
	handlers.set("list_todos", listTodosHandler);
	handlers.set("delete_todo", deleteTodoHandler);

	return {
		id: "@scp/todo",
		name: "@scp/todo",
		description:
			"Create and manage TODOs with priorities, statuses, and tags. Supports creating, updating, listing with filters, and deleting TODOs.",
		version: "1.0.0",
		tools: [
			{
				name: "create_todo",
				description:
					"Create a new TODO with a title, optional description, priority, and tags.",
				inputSchema: {
					type: "object",
					properties: {
						title: {
							type: "string",
							description: "TODO title",
						},
						description: {
							type: "string",
							description: "Detailed TODO description",
						},
						priority: {
							type: "string",
							enum: ["low", "medium", "high", "critical"],
							description: "TODO priority (default: medium)",
						},
						tags: {
							type: "array",
							items: { type: "string" },
							description: "Tags for categorization",
						},
					},
					required: ["title"],
				},
			},
			{
				name: "update_todo",
				description:
					"Update an existing TODO's status, priority, description, or tags. Automatically sets completedAt when status changes to 'completed'.",
				inputSchema: {
					type: "object",
					properties: {
						id: {
							type: "string",
							description: "TODO ID to update",
						},
						status: {
							type: "string",
							enum: [
								"pending",
								"in_progress",
								"completed",
								"blocked",
								"cancelled",
							],
							description: "New TODO status",
						},
						priority: {
							type: "string",
							enum: ["low", "medium", "high", "critical"],
							description: "New TODO priority",
						},
						description: {
							type: "string",
							description: "Updated description",
						},
						tags: {
							type: "array",
							items: { type: "string" },
							description: "Updated tags",
						},
					},
					required: ["id"],
				},
			},
			{
				name: "list_todos",
				description:
					"List TODOs with optional filtering by status, priority, or tag. Returns all TODOs if no filters are provided.",
				inputSchema: {
					type: "object",
					properties: {
						status: {
							type: "string",
							enum: [
								"pending",
								"in_progress",
								"completed",
								"blocked",
								"cancelled",
							],
							description: "Filter by status",
						},
						priority: {
							type: "string",
							enum: ["low", "medium", "high", "critical"],
							description: "Filter by priority",
						},
						tag: {
							type: "string",
							description: "Filter by tag",
						},
					},
				},
			},
			{
				name: "delete_todo",
				description: "Delete a TODO by its ID.",
				inputSchema: {
					type: "object",
					properties: {
						id: {
							type: "string",
							description: "TODO ID to delete",
						},
					},
					required: ["id"],
				},
			},
		],
		handlers,
	};
}
