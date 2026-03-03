/**
 * 危险命令检测
 * 在远程终端执行命令前检查是否为危险操作，需要用户确认
 */

export interface DangerousCommandMatch {
  category: string;
  description: string;
  level: "warning" | "danger";
}

interface DangerousPattern {
  pattern: RegExp;
  category: string;
  description: string;
  level: "warning" | "danger";
}

const DANGEROUS_PATTERNS: DangerousPattern[] = [
  // ======== 权限提升 ========
  {
    pattern: /\bsudo\s+/,
    category: "权限提升",
    description: "以 root 权限执行命令",
    level: "warning",
  },
  {
    pattern: /\bsu\b(?:\s+-|\s*$)/,
    category: "权限提升",
    description: "切换到 root 用户",
    level: "danger",
  },

  // ======== 文件删除 ========
  {
    pattern: /\brm\s+.*-[^\s]*[rf]/,
    category: "文件删除",
    description: "递归或强制删除文件",
    level: "danger",
  },
  {
    pattern: /\bshred\b/,
    category: "文件删除",
    description: "安全擦除文件（不可恢复）",
    level: "danger",
  },

  // ======== 磁盘/文件系统 ========
  {
    pattern: /\bmkfs\b/,
    category: "磁盘操作",
    description: "格式化磁盘",
    level: "danger",
  },
  {
    pattern: /\bdd\s+if=/,
    category: "磁盘操作",
    description: "低级磁盘读写",
    level: "danger",
  },
  {
    pattern: /\bfdisk\b|\bparted\b|\bgdisk\b/,
    category: "磁盘操作",
    description: "磁盘分区操作",
    level: "danger",
  },

  // ======== 系统控制 ========
  {
    pattern: /\bshutdown\b|\breboot\b|\bpoweroff\b|\bhalt\b/,
    category: "系统控制",
    description: "关机或重启系统",
    level: "danger",
  },
  {
    pattern: /\binit\s+[06]/,
    category: "系统控制",
    description: "切换系统运行级别",
    level: "danger",
  },

  // ======== 服务管理 ========
  {
    pattern: /\bsystemctl\s+(stop|restart|disable)\s+/,
    category: "服务管理",
    description: "停止/重启/禁用系统服务",
    level: "warning",
  },
  {
    pattern: /\bservice\s+\S+\s+(stop|restart)/,
    category: "服务管理",
    description: "停止/重启系统服务",
    level: "warning",
  },

  // ======== 进程管理 ========
  {
    pattern: /\bkill\s+-9\b|\bkill\s+-KILL\b/,
    category: "进程管理",
    description: "强制终止进程",
    level: "warning",
  },
  {
    pattern: /\bkillall\b|\bpkill\b/,
    category: "进程管理",
    description: "批量终止进程",
    level: "warning",
  },

  // ======== 权限修改 ========
  {
    pattern: /\bchmod\s+777\b|\bchmod\s+.*-R\b/,
    category: "权限修改",
    description: "修改文件权限（递归或全开放）",
    level: "warning",
  },
  {
    pattern: /\bchown\s+.*-R\b/,
    category: "权限修改",
    description: "递归修改文件所有者",
    level: "warning",
  },

  // ======== 网络/防火墙 ========
  {
    pattern: /\biptables\s+.*-F|\biptables\s+.*-X/,
    category: "网络安全",
    description: "清空防火墙规则",
    level: "danger",
  },
  {
    pattern: /\bip\s+link\s+set\s+\S+\s+down|\bifconfig\s+\S+\s+down/,
    category: "网络安全",
    description: "关闭网络接口",
    level: "danger",
  },

  // ======== 包管理 ========
  {
    pattern: /\bapt(?:-get)?\s+(remove|purge)\b/,
    category: "包管理",
    description: "卸载软件包",
    level: "warning",
  },
  {
    pattern: /\byum\s+remove\b|\bdnf\s+remove\b/,
    category: "包管理",
    description: "卸载软件包",
    level: "warning",
  },

  // ======== 危险重定向/操作 ========
  {
    pattern: />\s*\/dev\/[sh]d/,
    category: "危险重定向",
    description: "覆写磁盘设备",
    level: "danger",
  },
  {
    pattern: /\bmv\s+\/\*|\bcp\s+.*-[^\s]*r.*\s+\/\s/,
    category: "危险操作",
    description: "移动/覆盖根目录内容",
    level: "danger",
  },
];

/**
 * 检查命令是否为危险命令
 * 返回第一个匹配的危险模式，或 null
 */
export function checkDangerousCommand(
  command: string,
): DangerousCommandMatch | null {
  for (const { pattern, category, description, level } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return { category, description, level };
    }
  }
  return null;
}
