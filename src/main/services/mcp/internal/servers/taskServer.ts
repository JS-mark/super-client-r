/**
 * @scp/task — 内置任务管理工具
 * 使用文件系统存储任务数据
 */

import * as fs from "fs/promises";
import * as path from "path";
import { randomUUID } from "crypto";
import type { InternalMcpServer, InternalToolHandler } from "../types";
import { textResult } from "./shared";

interface Task {
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

function getTasksPath(storageDir: string): string {
	return path.join(storageDir, "tasks.json");
}

async function readTasks(storageDir: string): Promise<Task[]> {
	try {
		const data = await fs.readFile(getTasksPath(storageDir), "utf-8");
		return JSON.parse(data) as Task[];
	} catch {
		return [];
	}
}

async function writeTasks(storageDir: string, tasks: Task[]): Promise<void> {
	await fs.mkdir(storageDir, { recursive: true });
	await fs.writeFile(
		getTasksPath(storageDir),
		JSON.stringify(tasks, null, 2),
		"utf-8",
	);
}

const createTaskHandler: InternalToolHandler = async (args) => {
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
	const priority = (args.priority as Task["priority"]) || "medium";
	const tags = (args.tags as string[]) || undefined;

	const tasks = await readTasks(storageDir);

	const task: Task = {
		id: randomUUID(),
		title,
		description,
		status: "pending",
		priority,
		tags,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};

	tasks.push(task);
	await writeTasks(storageDir, tasks);
	return textResult(JSON.stringify(task, null, 2));
};

const updateTaskHandler: InternalToolHandler = async (args) => {
	const storageDir = args._storageDir as string;
	if (!storageDir) {
		return textResult(
			"Error: no storage directory available. Please start a conversation first.",
			true,
		);
	}

	const id = args.id as string;
	if (!id) return textResult("Error: id is required", true);

	const tasks = await readTasks(storageDir);
	const task = tasks.find((t) => t.id === id);
	if (!task) {
		return textResult(`Error: task with id "${id}" not found`, true);
	}

	if (args.status !== undefined) task.status = args.status as Task["status"];
	if (args.priority !== undefined)
		task.priority = args.priority as Task["priority"];
	if (args.description !== undefined)
		task.description = args.description as string;
	if (args.tags !== undefined) task.tags = args.tags as string[];

	task.updatedAt = new Date().toISOString();

	if (task.status === "completed" && !task.completedAt) {
		task.completedAt = new Date().toISOString();
	}

	await writeTasks(storageDir, tasks);
	return textResult(JSON.stringify(task, null, 2));
};

const listTasksHandler: InternalToolHandler = async (args) => {
	const storageDir = args._storageDir as string;
	if (!storageDir) {
		return textResult(
			"Error: no storage directory available. Please start a conversation first.",
			true,
		);
	}

	let tasks = await readTasks(storageDir);

	const status = args.status as string | undefined;
	const priority = args.priority as string | undefined;
	const tag = args.tag as string | undefined;

	if (status) tasks = tasks.filter((t) => t.status === status);
	if (priority) tasks = tasks.filter((t) => t.priority === priority);
	if (tag) tasks = tasks.filter((t) => t.tags?.includes(tag));

	if (tasks.length === 0) {
		return textResult("No tasks found matching the criteria.");
	}

	return textResult(JSON.stringify(tasks, null, 2));
};

const deleteTaskHandler: InternalToolHandler = async (args) => {
	const storageDir = args._storageDir as string;
	if (!storageDir) {
		return textResult(
			"Error: no storage directory available. Please start a conversation first.",
			true,
		);
	}

	const id = args.id as string;
	if (!id) return textResult("Error: id is required", true);

	const tasks = await readTasks(storageDir);
	const index = tasks.findIndex((t) => t.id === id);
	if (index === -1) {
		return textResult(`Error: task with id "${id}" not found`, true);
	}

	const removed = tasks.splice(index, 1)[0];
	await writeTasks(storageDir, tasks);
	return textResult(`Task deleted: ${removed.title}`);
};

export function createTaskServer(): InternalMcpServer {
	const handlers = new Map<string, InternalToolHandler>();
	handlers.set("create_task", createTaskHandler);
	handlers.set("update_task", updateTaskHandler);
	handlers.set("list_tasks", listTasksHandler);
	handlers.set("delete_task", deleteTaskHandler);

	return {
		id: "@scp/task",
		name: "@scp/task",
		description:
			"Create and manage tasks with priorities, statuses, and tags. Supports creating, updating, listing with filters, and deleting tasks.",
		version: "1.0.0",
		tools: [
			{
				name: "create_task",
				description:
					"Create a new task with a title, optional description, priority, and tags.",
				inputSchema: {
					type: "object",
					properties: {
						title: {
							type: "string",
							description: "Task title",
						},
						description: {
							type: "string",
							description: "Detailed task description",
						},
						priority: {
							type: "string",
							enum: ["low", "medium", "high", "critical"],
							description: "Task priority (default: medium)",
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
				name: "update_task",
				description:
					"Update an existing task's status, priority, description, or tags. Automatically sets completedAt when status changes to 'completed'.",
				inputSchema: {
					type: "object",
					properties: {
						id: {
							type: "string",
							description: "Task ID to update",
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
							description: "New task status",
						},
						priority: {
							type: "string",
							enum: ["low", "medium", "high", "critical"],
							description: "New task priority",
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
				name: "list_tasks",
				description:
					"List tasks with optional filtering by status, priority, or tag. Returns all tasks if no filters are provided.",
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
				name: "delete_task",
				description: "Delete a task by its ID.",
				inputSchema: {
					type: "object",
					properties: {
						id: {
							type: "string",
							description: "Task ID to delete",
						},
					},
					required: ["id"],
				},
			},
		],
		handlers,
	};
}
