/**
 * @scp/plan — 内置计划管理工具
 * 使用文件系统存储计划数据
 */

import * as fs from "fs/promises";
import * as path from "path";
import { randomUUID } from "crypto";
import type { InternalMcpServer, InternalToolHandler } from "../types";
import { textResult } from "./shared";

interface PlanStep {
	id: string;
	content: string;
	status: "pending" | "in_progress" | "completed" | "skipped";
	notes?: string;
}

interface Plan {
	id: string;
	title: string;
	description: string;
	steps: PlanStep[];
	status: "draft" | "active" | "completed" | "archived";
	createdAt: string;
	updatedAt: string;
}

function getPlanPath(storageDir: string): string {
	return path.join(storageDir, "plan.json");
}

async function readPlan(storageDir: string): Promise<Plan | null> {
	try {
		const data = await fs.readFile(getPlanPath(storageDir), "utf-8");
		return JSON.parse(data) as Plan;
	} catch {
		return null;
	}
}

async function writePlan(storageDir: string, plan: Plan): Promise<void> {
	await fs.mkdir(storageDir, { recursive: true });
	await fs.writeFile(
		getPlanPath(storageDir),
		JSON.stringify(plan, null, 2),
		"utf-8",
	);
}

const createPlanHandler: InternalToolHandler = async (args) => {
	const storageDir = args._storageDir as string;
	if (!storageDir) {
		return textResult(
			"Error: no storage directory available. Please start a conversation first.",
			true,
		);
	}

	const title = args.title as string;
	const description = (args.description as string) || "";
	const steps = args.steps as string[];

	if (!title) return textResult("Error: title is required", true);
	if (!Array.isArray(steps) || steps.length === 0) {
		return textResult(
			"Error: steps must be a non-empty array of strings",
			true,
		);
	}

	// Archive existing plan
	const existing = await readPlan(storageDir);
	if (existing) {
		const archivePath = path.join(storageDir, `plan.${Date.now()}.json`);
		await fs.writeFile(archivePath, JSON.stringify(existing, null, 2), "utf-8");
	}

	const plan: Plan = {
		id: randomUUID(),
		title,
		description,
		steps: steps.map((content) => ({
			id: randomUUID(),
			content,
			status: "pending",
		})),
		status: "draft",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};

	await writePlan(storageDir, plan);
	return textResult(JSON.stringify(plan, null, 2));
};

const updatePlanHandler: InternalToolHandler = async (args) => {
	const storageDir = args._storageDir as string;
	if (!storageDir) {
		return textResult(
			"Error: no storage directory available. Please start a conversation first.",
			true,
		);
	}

	const plan = await readPlan(storageDir);
	if (!plan) {
		return textResult("Error: no plan found. Create a plan first.", true);
	}

	const stepId = args.stepId as string | undefined;
	const stepStatus = args.stepStatus as PlanStep["status"] | undefined;
	const stepNotes = args.stepNotes as string | undefined;
	const planStatus = args.planStatus as Plan["status"] | undefined;

	if (stepId) {
		const step = plan.steps.find((s) => s.id === stepId);
		if (!step) {
			return textResult(`Error: step with id "${stepId}" not found`, true);
		}
		if (stepStatus) step.status = stepStatus;
		if (stepNotes !== undefined) step.notes = stepNotes;
	}

	if (planStatus) {
		plan.status = planStatus;
	}

	plan.updatedAt = new Date().toISOString();
	await writePlan(storageDir, plan);
	return textResult(JSON.stringify(plan, null, 2));
};

const getPlanHandler: InternalToolHandler = async (args) => {
	const storageDir = args._storageDir as string;
	if (!storageDir) {
		return textResult(
			"Error: no storage directory available. Please start a conversation first.",
			true,
		);
	}

	const plan = await readPlan(storageDir);
	if (!plan) {
		return textResult("No plan found. Use create_plan to create one.");
	}

	return textResult(JSON.stringify(plan, null, 2));
};

export function createPlanServer(): InternalMcpServer {
	const handlers = new Map<string, InternalToolHandler>();
	handlers.set("create_plan", createPlanHandler);
	handlers.set("update_plan", updatePlanHandler);
	handlers.set("get_plan", getPlanHandler);

	return {
		id: "@scp/plan",
		name: "@scp/plan",
		description:
			"Create and manage step-by-step plans for complex tasks. Supports creating plans with steps, updating step status, and retrieving the current plan.",
		version: "1.0.0",
		tools: [
			{
				name: "create_plan",
				description:
					"Create a new plan with a title and steps. If a plan already exists, it will be archived and a new one created. Use this to break down complex tasks into manageable steps.",
				inputSchema: {
					type: "object",
					properties: {
						title: {
							type: "string",
							description: "Plan title",
						},
						description: {
							type: "string",
							description: "Plan description (optional)",
						},
						steps: {
							type: "array",
							items: { type: "string" },
							description: "List of step descriptions in order",
						},
					},
					required: ["title", "steps"],
				},
			},
			{
				name: "update_plan",
				description:
					"Update a plan's step status/notes or overall plan status. Provide stepId to update a specific step, or planStatus to update the overall plan.",
				inputSchema: {
					type: "object",
					properties: {
						stepId: {
							type: "string",
							description: "ID of the step to update",
						},
						stepStatus: {
							type: "string",
							enum: ["pending", "in_progress", "completed", "skipped"],
							description: "New status for the step",
						},
						stepNotes: {
							type: "string",
							description: "Notes to add to the step",
						},
						planStatus: {
							type: "string",
							enum: ["draft", "active", "completed", "archived"],
							description: "New status for the overall plan",
						},
					},
				},
			},
			{
				name: "get_plan",
				description:
					"Get the current plan with all steps and their statuses. Returns the full plan JSON or a message if no plan exists.",
				inputSchema: {
					type: "object",
					properties: {},
				},
			},
		],
		handlers,
	};
}
