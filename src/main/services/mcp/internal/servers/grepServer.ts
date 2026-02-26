/**
 * @scp/grep — 内置内容搜索工具
 * 优先使用 ripgrep (rg)，回退到 Node.js fs 实现
 */

import { execFile } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import * as readline from "readline";
import { createReadStream } from "fs";
import type { InternalMcpServer, InternalToolHandler } from "../types";
import { isBlockedPath, textResult } from "./shared";
import { logger } from "../../../../utils/logger";

const log = logger.withContext("InternalMCP:Grep");

const MAX_OUTPUT_SIZE = 512 * 1024; // 512KB
const DEFAULT_MAX_RESULTS = 200;
const ABSOLUTE_MAX_RESULTS = 1000;
const MAX_CONTEXT_LINES = 5;

let hasRipgrep: boolean | null = null;

async function detectRipgrep(): Promise<boolean> {
	if (hasRipgrep !== null) return hasRipgrep;
	return new Promise((resolve) => {
		execFile("rg", ["--version"], { timeout: 5_000 }, (err) => {
			hasRipgrep = !err;
			if (hasRipgrep) {
				log.info("ripgrep detected, using rg for grep operations");
			} else {
				log.info("ripgrep not found, using Node.js fallback for grep");
			}
			resolve(hasRipgrep);
		});
	});
}

function truncateOutput(text: string): string {
	if (text.length <= MAX_OUTPUT_SIZE) return text;
	return (
		text.slice(0, MAX_OUTPUT_SIZE) +
		`\n\n[Output truncated, showing first 512KB of ${(text.length / 1024).toFixed(0)}KB]`
	);
}

async function grepWithRipgrep(
	pattern: string,
	searchPath: string,
	include: string | undefined,
	ignoreCase: boolean,
	maxResults: number,
	contextLines: number,
	filesOnly: boolean,
): Promise<string> {
	const args: string[] = [
		pattern,
		searchPath,
		"--line-number",
		"--no-heading",
		"--color=never",
	];

	if (include) args.push("--glob", include);
	if (ignoreCase) args.push("-i");
	if (filesOnly) args.push("-l");
	if (contextLines > 0) args.push("-C", String(contextLines));
	args.push("--max-count", String(Math.min(maxResults, 100)));

	return new Promise((resolve, reject) => {
		execFile(
			"rg",
			args,
			{ timeout: 30_000, maxBuffer: MAX_OUTPUT_SIZE * 2 },
			(error, stdout, stderr) => {
				if (error) {
					// Timeout
					if (error.killed || error.signal === "SIGTERM") {
						reject(new Error("Search timed out after 30s"));
						return;
					}
					// maxBuffer exceeded — return what we have
					if (
						typeof error.code === "string" &&
						error.code.includes("MAXBUFFER")
					) {
						resolve(stdout || "");
						return;
					}
					// Exit code 1 means no matches (not an error)
					if (error.code === 1) {
						resolve("");
						return;
					}
					// Exit code 2 means actual error
					if (error.code === 2) {
						reject(new Error(stderr || error.message));
						return;
					}
					// Other unknown errors
					reject(new Error(stderr || error.message));
					return;
				}
				resolve(stdout || "");
			},
		);
	});
}

async function grepWithNodejs(
	pattern: string,
	searchPath: string,
	include: string | undefined,
	ignoreCase: boolean,
	maxResults: number,
	contextLines: number,
	filesOnly: boolean,
): Promise<string> {
	let regex: RegExp;
	try {
		regex = new RegExp(pattern, ignoreCase ? "i" : undefined);
	} catch {
		throw new Error(`Invalid regex pattern: ${pattern}`);
	}
	const includeRegex = include
		? new RegExp(
				include.replace(/\./g, "\\.").replace(/\*/g, ".*").replace(/\?/g, "."),
			)
		: null;

	const results: string[] = [];
	let matchCount = 0;
	let fileCount = 0;
	const matchedFiles = new Set<string>();

	async function searchFile(filePath: string): Promise<void> {
		if (matchCount >= maxResults) return;

		return new Promise((resolve) => {
			const lines: string[] = [];
			const matchedLineIndices: number[] = [];

			const rl = readline.createInterface({
				input: createReadStream(filePath, { encoding: "utf-8" }),
				crlfDelay: Infinity,
			});

			let lineNumber = 0;

			rl.on("line", (line) => {
				lineNumber++;
				lines.push(line);
				if (regex.test(line)) {
					matchedLineIndices.push(lineNumber - 1);
				}
			});

			rl.on("close", () => {
				if (matchedLineIndices.length === 0) {
					resolve();
					return;
				}

				matchedFiles.add(filePath);

				if (filesOnly) {
					results.push(filePath);
					matchCount++;
					resolve();
					return;
				}

				for (const idx of matchedLineIndices) {
					if (matchCount >= maxResults) break;
					const startLine = Math.max(0, idx - contextLines);
					const endLine = Math.min(lines.length - 1, idx + contextLines);
					for (let i = startLine; i <= endLine; i++) {
						const prefix = i === idx ? "" : " ";
						results.push(`${filePath}:${i + 1}:${prefix}${lines[i]}`);
					}
					if (contextLines > 0) results.push("--");
					matchCount++;
				}
				resolve();
			});

			rl.on("error", () => {
				resolve(); // Skip files that can't be read
			});
		});
	}

	async function walkDir(dirPath: string): Promise<void> {
		if (matchCount >= maxResults) return;

		let entries;
		try {
			entries = await fs.readdir(dirPath, { withFileTypes: true });
		} catch {
			return; // Skip directories that can't be read
		}

		for (const entry of entries) {
			if (matchCount >= maxResults) break;

			const fullPath = path.join(dirPath, entry.name);

			// Skip hidden dirs and common large dirs
			if (
				entry.isDirectory() &&
				(entry.name.startsWith(".") || entry.name === "node_modules")
			) {
				continue;
			}

			if (entry.isDirectory()) {
				await walkDir(fullPath);
			} else if (entry.isFile()) {
				if (includeRegex && !includeRegex.test(entry.name)) continue;
				await searchFile(fullPath);
			}
		}
	}

	// Check if path is a file or directory
	const stat = await fs.stat(searchPath);
	if (stat.isFile()) {
		await searchFile(searchPath);
	} else {
		await walkDir(searchPath);
	}

	fileCount = matchedFiles.size;
	if (filesOnly) {
		return results.length > 0
			? `Found matches in ${fileCount} files:\n${results.join("\n")}`
			: "";
	}
	return results.length > 0
		? `Found ${matchCount} matches in ${fileCount} files:\n${results.join("\n")}`
		: "";
}

const grepHandler: InternalToolHandler = async (args) => {
	const pattern = args.pattern as string;
	const searchPath = args.path as string;

	if (!pattern) return textResult("Error: pattern is required", true);
	if (!searchPath) return textResult("Error: path is required", true);
	if (isBlockedPath(searchPath))
		return textResult("Error: access to system directory is not allowed", true);

	const include = (args.include as string) || undefined;
	const ignoreCase = (args.ignoreCase as boolean) || false;
	const maxResults = Math.min(
		Math.max((args.maxResults as number) || DEFAULT_MAX_RESULTS, 1),
		ABSOLUTE_MAX_RESULTS,
	);
	const contextLines = Math.min(
		Math.max((args.contextLines as number) || 0, 0),
		MAX_CONTEXT_LINES,
	);
	const filesOnly = (args.filesOnly as boolean) || false;

	try {
		const useRg = await detectRipgrep();

		let output: string;
		if (useRg) {
			output = await grepWithRipgrep(
				pattern,
				searchPath,
				include,
				ignoreCase,
				maxResults,
				contextLines,
				filesOnly,
			);
		} else {
			output = await grepWithNodejs(
				pattern,
				searchPath,
				include,
				ignoreCase,
				maxResults,
				contextLines,
				filesOnly,
			);
		}

		if (!output) {
			return textResult("No matches found.");
		}

		// Truncate lines to maxResults
		const lines = output.split("\n");
		let truncated: string;
		if (lines.length > maxResults) {
			truncated =
				lines.slice(0, maxResults).join("\n") +
				`\n\n[Results truncated to ${maxResults} lines]`;
		} else {
			truncated = output;
		}

		return textResult(truncateOutput(truncated));
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return textResult(`Error: ${msg}`, true);
	}
};

export function createGrepServer(): InternalMcpServer {
	const handlers = new Map<string, InternalToolHandler>();
	handlers.set("grep", grepHandler);

	return {
		id: "@scp/grep",
		name: "@scp/grep",
		description:
			"Search file contents using regex patterns. Uses ripgrep (rg) when available, falls back to Node.js implementation.",
		version: "1.0.0",
		initialize: async () => {
			await detectRipgrep();
		},
		tools: [
			{
				name: "grep",
				description:
					"Search file contents using regex patterns. Returns matching lines with file paths and line numbers. Supports glob filtering, case-insensitive search, context lines, and file-only mode. Uses ripgrep when available for fast searching.",
				inputSchema: {
					type: "object",
					properties: {
						pattern: {
							type: "string",
							description: "Regex pattern to search for",
						},
						path: {
							type: "string",
							description: "File or directory path to search in",
						},
						include: {
							type: "string",
							description:
								"Glob filter for file names (e.g., '*.ts', '*.{js,jsx}')",
						},
						ignoreCase: {
							type: "boolean",
							description: "Case-insensitive search (default: false)",
						},
						maxResults: {
							type: "number",
							description:
								"Maximum number of matching lines to return (default: 200, max: 1000)",
						},
						contextLines: {
							type: "number",
							description:
								"Number of context lines to show before and after each match (default: 0, max: 5)",
						},
						filesOnly: {
							type: "boolean",
							description:
								"Only return file paths that contain matches, not the matching lines (default: false)",
						},
					},
					required: ["pattern", "path"],
				},
			},
		],
		handlers,
	};
}
