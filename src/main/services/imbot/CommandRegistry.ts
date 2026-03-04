import type { IMCommand, CommandHandler, CommandContext } from "./types";

/**
 * 命令注册和路由系统
 *
 * 支持:
 * - 命令注册
 * - 子命令支持
 * - 命令执行
 */
export class CommandRegistry {
	// 存储: command -> subcommand -> handler
	private commands: Map<string, Map<string | null, CommandHandler>> = new Map();

	/**
	 * 注册命令
	 *
	 * @param command 命令名
	 * @param subcommand 子命令名(null 表示匹配所有子命令)
	 * @param handler 处理函数
	 */
	register(
		command: string,
		subcommand: string | null,
		handler: CommandHandler,
	): void {
		if (!this.commands.has(command)) {
			this.commands.set(command, new Map());
		}

		const subcommands = this.commands.get(command)!;
		subcommands.set(subcommand, handler);

		console.log(
			`[CommandRegistry] Registered: /${command}${subcommand ? ` ${subcommand}` : ""}`,
		);
	}

	/**
	 * 执行命令
	 *
	 * @param command 命令对象
	 * @param context 命令上下文
	 * @returns 命令执行结果(字符串)
	 */
	async execute(command: IMCommand, context: CommandContext): Promise<string> {
		const subcommands = this.commands.get(command.command);
		if (!subcommands) {
			return `❌ 未知命令: /${command.command}\n使用 /help 查看可用命令`;
		}

		// 优先匹配子命令
		let handler: CommandHandler | undefined;
		if (command.subcommand) {
			handler = subcommands.get(command.subcommand);
		}

		// 如果没有子命令或子命令未注册,尝试匹配通配符处理器
		if (!handler) {
			handler = subcommands.get(null);
		}

		if (!handler) {
			const availableSubcommands = Array.from(subcommands.keys())
				.filter((k) => k !== null)
				.join(", ");
			return `❌ 未知子命令: /${command.command} ${command.subcommand}\n可用子命令: ${availableSubcommands}`;
		}

		try {
			return await handler(command, context);
		} catch (error) {
			console.error("[CommandRegistry] Command execution error:", error);
			return `❌ 执行失败: ${error instanceof Error ? error.message : String(error)}`;
		}
	}

	/**
	 * 列出所有已注册的命令
	 */
	listCommands(): string[] {
		const commands: string[] = [];
		for (const [command, subcommands] of this.commands.entries()) {
			for (const subcommand of subcommands.keys()) {
				commands.push(`/${command}${subcommand ? ` ${subcommand}` : ""}`);
			}
		}
		return commands;
	}

	/**
	 * 清空所有命令
	 */
	clear(): void {
		this.commands.clear();
	}
}
