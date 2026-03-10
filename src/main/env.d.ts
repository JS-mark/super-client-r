/// <reference types="vite/client" />

/**
 * 主进程环境变量类型声明
 * electron-vite 使用 MAIN_VITE_ 前缀暴露环境变量到主进程
 */
interface ImportMetaEnv {
  /** App Config API 基础地址 */
  readonly MAIN_VITE_CONFIG_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
