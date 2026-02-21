import { defineConfig } from "vitepress";

export default defineConfig({
  ignoreDeadLinks: true,
  title: "Super Client R",
  description: "基于 Electron 的 AI 桌面客户端 - 超级客户端",
  lang: "zh-CN",
  base: "/super-client-r/",
  head: [
    ["link", { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }],
    ["meta", { name: "theme-color", content: "#3b82f6" }],
    ["meta", { name: "og:type", content: "website" }],
    ["meta", { name: "og:locale", content: "zh-CN" }],
    ["meta", { name: "og:site_name", content: "Super Client R" }],
  ],
  themeConfig: {
    logo: "/logo.svg",
    nav: [
      { text: "首页", link: "/" },
      { text: "指南", link: "/guide/getting-started" },
      { text: "API", link: "/api/" },
      { text: "开发", link: "/development/" },
      {
        text: "更多",
        items: [
          { text: "插件开发", link: "/PLUGIN_DEVELOPMENT" },
          { text: "产品需求", link: "/PRD" },
          { text: "功能路线图", link: "/FEATURE_ROADMAP" },
          { text: "设计规范", link: "/DESIGN" },
          { text: "贡献指南", link: "/CONTRIBUTING" },
        ],
      },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "开始",
          items: [
            { text: "介绍", link: "/guide/introduction" },
            { text: "快速开始", link: "/guide/getting-started" },
            { text: "安装", link: "/guide/installation" },
          ],
        },
        {
          text: "功能",
          items: [
            { text: "AI 聊天", link: "/guide/features/chat" },
            { text: "模型管理", link: "/guide/features/models" },
            { text: "MCP 服务器", link: "/guide/features/mcp" },
            { text: "联网搜索", link: "/guide/features/search" },
            { text: "技能系统", link: "/guide/features/skills" },
            { text: "插件系统", link: "/guide/features/plugins" },
            { text: "工作区", link: "/guide/features/workspaces" },
            { text: "收藏功能", link: "/guide/features/bookmarks" },
            { text: "文件附件", link: "/guide/features/attachments" },
            { text: "悬浮窗", link: "/guide/features/float-widget" },
            { text: "快捷键", link: "/guide/features/shortcuts" },
            { text: "日志查看器", link: "/guide/features/log-viewer" },
            { text: "自动更新", link: "/guide/features/auto-update" },
            { text: "HTTP API", link: "/guide/features/api" },
          ],
        },
        {
          text: "高级",
          items: [
            { text: "配置", link: "/guide/advanced/configuration" },
            { text: "国际化", link: "/guide/advanced/i18n" },
            { text: "主题", link: "/guide/advanced/theming" },
          ],
        },
      ],
      "/development/": [
        {
          text: "开发指南",
          items: [
            { text: "概述", link: "/development/" },
            { text: "环境搭建", link: "/development/setup" },
            { text: "项目结构", link: "/development/structure" },
            { text: "代码规范", link: "/development/coding-standards" },
          ],
        },
        {
          text: "架构",
          items: [
            { text: "系统架构", link: "/development/architecture" },
            { text: "IPC 通信", link: "/development/ipc" },
            { text: "状态管理", link: "/development/state" },
          ],
        },
        {
          text: "扩展开发",
          items: [
            { text: "插件开发", link: "/PLUGIN_DEVELOPMENT" },
            { text: "OAuth 配置", link: "/OAUTH_SETUP" },
          ],
        },
        {
          text: "贡献",
          items: [{ text: "贡献指南", link: "/development/contributing" }],
        },
      ],
      "/api/": [
        {
          text: "API 文档",
          items: [
            { text: "概述", link: "/api/" },
            { text: "HTTP API", link: "/api/http" },
            { text: "IPC 接口", link: "/api/ipc" },
            { text: "类型定义", link: "/api/types" },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/js-mark/super-client-r" },
    ],
    footer: {
      message: "基于 MIT 许可发布",
      copyright: "Copyright © 2026 Super Client R 团队",
    },
    editLink: {
      pattern: "https://github.com/js-mark/super-client-r/edit/main/docs/:path",
      text: "在 GitHub 上编辑此页",
    },
    lastUpdated: {
      text: "最后更新于",
      formatOptions: {
        dateStyle: "short",
        timeStyle: "medium",
      },
    },
    search: {
      provider: "local",
      options: {
        translations: {
          button: {
            buttonText: "搜索文档",
            buttonAriaLabel: "搜索文档",
          },
          modal: {
            noResultsText: "无法找到相关结果",
            resetButtonTitle: "清除查询条件",
            footer: {
              selectText: "选择",
              navigateText: "切换",
              closeText: "关闭",
            },
          },
        },
      },
    },
  },
});
