/**
 * 聊天钩子注册表
 * 管理插件注册的聊天管道钩子
 */

import { logger } from "../../../utils/logger";
import type {
  PostResponseHook,
  PostResponseHookContext,
  PostStreamHook,
  PostStreamHookContext,
  PreSendHook,
  PreSendHookContext,
  SystemPromptHook,
  SystemPromptHookContext,
} from "../types";

const log = logger.withContext("ChatHooks");

type HookType = "preSend" | "systemPrompt" | "postStream" | "postResponse";
type AnyHook =
  | PreSendHook
  | SystemPromptHook
  | PostStreamHook
  | PostResponseHook;

interface HookRegistration {
  pluginId: string;
  type: HookType;
  handler: AnyHook;
}

export class ChatHookRegistry {
  private hooks: HookRegistration[] = [];

  /**
   * 注册钩子
   */
  register(
    pluginId: string,
    type: HookType,
    handler: AnyHook,
  ): { dispose(): void } {
    const registration: HookRegistration = { pluginId, type, handler };
    this.hooks.push(registration);
    log.info("Hook registered", { pluginId, type });
    return {
      dispose: () => {
        const idx = this.hooks.indexOf(registration);
        if (idx >= 0) {
          this.hooks.splice(idx, 1);
          log.info("Hook disposed", { pluginId, type });
        }
      },
    };
  }

  /**
   * 注销指定插件的所有钩子
   */
  unregisterAll(pluginId: string): void {
    const before = this.hooks.length;
    this.hooks = this.hooks.filter((h) => h.pluginId !== pluginId);
    const removed = before - this.hooks.length;
    if (removed > 0) {
      log.info("Hooks unregistered", { pluginId, count: removed });
    }
  }

  /**
   * 执行 preSend 钩子链
   */
  async runPreSendHooks(ctx: PreSendHookContext): Promise<void> {
    for (const hook of this.hooks) {
      if (hook.type !== "preSend") continue;
      try {
        await (hook.handler as PreSendHook)(ctx);
        if (ctx.cancelled) break;
      } catch (error) {
        log.warn("preSend hook error, skipping", {
          pluginId: hook.pluginId,
          error: String(error),
        });
      }
    }
  }

  /**
   * 执行 systemPrompt 钩子链
   */
  async runSystemPromptHooks(ctx: SystemPromptHookContext): Promise<void> {
    for (const hook of this.hooks) {
      if (hook.type !== "systemPrompt") continue;
      try {
        await (hook.handler as SystemPromptHook)(ctx);
      } catch (error) {
        log.warn("systemPrompt hook error, skipping", {
          pluginId: hook.pluginId,
          error: String(error),
        });
      }
    }
  }

  /**
   * 执行 postStream 钩子链
   */
  async runPostStreamHooks(ctx: PostStreamHookContext): Promise<void> {
    for (const hook of this.hooks) {
      if (hook.type !== "postStream") continue;
      try {
        await (hook.handler as PostStreamHook)(ctx);
      } catch (error) {
        log.warn("postStream hook error, skipping", {
          pluginId: hook.pluginId,
          error: String(error),
        });
      }
    }
  }

  /**
   * 执行 postResponse 钩子链
   */
  async runPostResponseHooks(ctx: PostResponseHookContext): Promise<void> {
    for (const hook of this.hooks) {
      if (hook.type !== "postResponse") continue;
      try {
        await (hook.handler as PostResponseHook)(ctx);
      } catch (error) {
        log.warn("postResponse hook error, skipping", {
          pluginId: hook.pluginId,
          error: String(error),
        });
      }
    }
  }

  /**
   * 检查是否有特定类型的钩子注册
   */
  hasHooks(type: HookType): boolean {
    return this.hooks.some((h) => h.type === type);
  }
}
