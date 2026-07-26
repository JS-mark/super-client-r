# 双端打包发布流水线（内测版）

> 负责人：CI/CD 工程师 · 关联任务 SUP-20 · 状态：内测（未签名）

Super Client R 通过 GitHub Actions 完成 Windows + macOS 双端 electron-builder 打包，
并把产物发布到 GitHub Release，Release 同时作为 `electron-updater` 的更新 feed（https）。

工作流文件：`.github/workflows/release.yml`

---

## 一、如何触发构建

### 方式 1：推 tag（构建 + 发布 Release，正式发布路径）

```bash
# 内测预发布 tag 约定：v<version>-beta.<N>
git tag v0.0.1-beta.1
git push origin v0.0.1-beta.1
```

- 触发条件：任何 `v*` 开头的 tag。
- 含 `-` 的 tag（如 `-beta.1`）自动标记为 **prerelease**。
- 三个 job 依次跑：`build-mac` → `build-windows` →（两者完成后）`release`。

### 方式 2：手动 workflow_dispatch

在仓库 **Actions → Build & Release → Run workflow**：

| 输入 | 说明 |
|------|------|
| `mode` | Vite 构建模式（如 `production`），留空用默认 |
| `tag`  | 填则构建后创建同名 Release；**留空则只构建产物、不发布** |

> 只想验证能否打出包、不想动 Release 时，dispatch 且 `tag` 留空即可。

---

## 二、产物在哪

### 构建产物（Actions artifacts，每次运行都有）

Actions 运行页底部 **Artifacts**：

- `mac`：`.dmg` + `.zip`（x64 & arm64）+ `latest-mac.yml` + `*.blockmap`
- `win`：`.exe`（NSIS，x64 & arm64）+ `latest.yml` + `*.blockmap`

QA 真机回归直接下 `mac` 的 `.dmg` 和 `win` 的 `.exe`。

### 发布产物（GitHub Release，仅 tag / 指定 tag 时）

`https://github.com/JS-mark/super-client-r/releases`

Release 附件包含全部安装包 **+ 更新元数据**（`latest*.yml`、`.blockmap`）。

---

## 三、更新 feed

- provider：GitHub Releases（`package.json` → `build.publish`，owner `js-mark` / repo `super-client-r`）。
- feed 协议：**https**（GitHub Release 下载天然 https，与安全基线 SUP-8 一致）；
  代码侧 `updateService.ts` 的 `enforceHttpsFeed()` 作为回归护栏，非 https 源会被拒。
- feed URL：由 electron-updater 依据 provider 自动解析，指向对应 Release 的
  `latest.yml`（win）/ `latest-mac.yml`（mac）。
- 通道结论（REG-08）：mac 走 zip 增量、win 走 nsis；未签名下首启需手动放行（见下）。

### ⚠️ 关键设计：为什么 mac/win 各在单 runner 上一次构建全架构

`electron-updater` 每平台只读一份 `latest*.yml`。若用 matrix 按架构拆成多个 runner，
每个 runner 各生成一份只含单架构的 `latest*.yml`，合并上传时互相覆盖，
自动更新只会识别其中一个架构 → 另一架构用户收不到更新。

因此本流水线 mac / win 各自 **一次 `electron-builder --x64 --arm64`**，
产出同时覆盖两架构的单份元数据。改动此处务必保持该约束。

---

## 四、签名 / 公证（内测暂缓，正式版接入）

内测阶段 **不签名**：

- macOS 首启被 Gatekeeper 拦截、Windows 被 SmartScreen 提示——**已知限制**，
  UI 已给绕过指引（E6 / QA 已对齐）。
- workflow 用 `CSC_IDENTITY_AUTO_DISCOVERY: false` 关闭证书自动发现，
  避免 CI 误用钥匙串证书或缺证书报错。

正式版接入点（workflow 中已留注释 hook）：

| 平台 | 需配置的 GitHub Secrets | electron-builder 注入变量 |
|------|--------------------------|--------------------------|
| macOS 签名 | `MAC_CSC_LINK`(base64 .p12)、`MAC_CSC_KEY_PASSWORD` | `CSC_LINK` / `CSC_KEY_PASSWORD` |
| macOS 公证 | `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID` | 同名 env + `@electron/notarize` |
| Windows Authenticode | `WIN_CSC_LINK`(base64 .pfx)、`WIN_CSC_KEY_PASSWORD` | `CSC_LINK` / `CSC_KEY_PASSWORD` |

接入步骤：
1. 仓库 **Settings → Secrets and variables → Actions** 配置上述密钥。
2. 移除 workflow 顶层 `env.CSC_IDENTITY_AUTO_DISCOVERY`，改为在对应 Package 步骤
   的 `env:` 注入密钥（注释里已给出示例，取消注释即可）。
3. macOS 还需在 `package.json` → `build.mac` 增加 `hardenedRuntime` / `entitlements` /
   `notarize` 配置。

> **密钥安全铁律**：所有证书、token 仅经 GitHub Actions Secrets 注入，
> 绝不写入仓库、日志或硬编码。

---

## 五、待接入 / 需上报确认项

- [ ] **正式 Release / tag 删除**属不可逆动作，由 CI/CD 工程师给建议、统筹产品负责人确认后执行，
      CI 不擅自发正式版。
- [ ] 签名证书采购（Apple Developer 账号 / Windows EV or OV 证书）→ 采购决策上报。
- [ ] 正式版启用签名后，需 QA 复测首启无拦截 + 自动更新链路。
