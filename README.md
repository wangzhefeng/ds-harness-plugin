# DeepSeek Harness Plugins

个人 DeepSeek Harness 插件开发仓库：轻量多插件 workspace，各插件独立命名、版本与分发。

## 当前状态

已建立工程配置、检查器、自动化测试和 CI 配置，**尚无插件实现**。没有安装到 DSH，也没有实现 OAuth 功能。当前调查基线为 DSH **0.2.2-rc.2**，不代表已完成插件兼容性测试。

## 快速开始

使用 Node.js 24 与 pnpm 11.28.5：

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm validate
```

- `pnpm check`：仓库约定与各插件检查。
- `pnpm test`：检查器测试与各插件测试。
- `pnpm build`：各插件构建；无插件时不产生构建产物。

没有运行时依赖，不需要全局安装 DSH SDK。实际插件的语言、构建工具与依赖按需要引入。

## 目录

```text
plugins/             # 独立插件包；目前只有接入说明
scripts/             # 仓库检查器及其测试
docs/                # 开发流程与安全约定
.github/workflows/   # 仅验证，不安装、不发布的 CI
```

- [插件接入清单](plugins/README.md)
- [开发与验证流程](docs/development.md)
- [安全约定](docs/security.md)
- [Agent 协作约定](AGENTS.md)
- [工程配置](package.json) · [workspace 配置](pnpm-workspace.yaml)

## 开发原则

先核实当前 DSH 文档和运行时 API，再实现。每个插件维护自己的用途、权限、兼容版本和真实测试记录。优先在独立测试 profile 中验证，不修改应用安装包或日常配置。

根包和新插件默认 private；暂不选择开源许可证或启用发布。安装、提交、推送与发布须单独确认。凭据、备份和运行时数据不得入库；忽略规则不能替代提交前审查。
