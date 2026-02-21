/**
 * 用户配置请求工具指南（request_user_config）
 *
 * 当其他 MCP 工具返回“需配置”类错误码时，引导模型调用 request_user_config，
 * 由主进程弹出配置/登录 UI，等待用户操作（5 分钟超时）。
 */

export const USER_CONFIG_INSTRUCTIONS = `
# User configuration request

When a tool returns an error that indicates missing or invalid configuration (for example EXCHANGE_EMAIL_CONFIG_ERROR or similar codes that ask the user to set up or sign in), call the \`request_user_config\` tool with that \`errorCode\` (and optionally \`serverId\` and \`toolName\` from the failing tool). The user will be prompted to configure or authenticate; the tool returns \`{ configured: true }\`, \`{ cancelled: true }\`, or \`{ timeout: true }\`.

**Important:** If you retry the original tool after \`{ configured: true }\` and it still returns the same error code (e.g. credentials were wrong), you MUST call \`request_user_config\` again with that \`errorCode\` so the user can reconfigure. Repeat this until the original tool succeeds, or the user cancels, or the request times out. Do not only output text asking the user to reconfigure—you must call \`request_user_config\` again to show the configuration UI.
`.trim();
