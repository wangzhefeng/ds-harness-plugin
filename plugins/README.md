# 插件目录

每个直接子目录是一个独立的 DSH bundle 包，独立命名、版本和分发。
本目录说明本身不是可安装的插件。

## 当前插件

| 插件 | 用途 | 状态 |
| --- | --- | --- |
| [Codex 授权入口](<openai-codex-oauth/README.md>) | 为内置 Codex OAuth 提供无需模型会话的按钮与弹窗 | 源码 0.1.3，目标 DSH 0.2.2-rc.2。0.1.1 官方安装/移除重装及 Desktop 按钮、0.1.2 紧凑浅色 UI 已验证；0.1.3 默认折叠仅通过自动化，实际折叠交互未验证。真实 OAuth、模型请求与持久化未验证。 |

克隆后先在仓库根目录运行 `pnpm build`，再通过 DSH 官方插件管理机制安装具体插件目录；Client 产物被 Git 忽略，不随源码克隆提供。依赖初始化、安装限制及完整验证矩阵见插件文档。

公开 GitHub 仓库不等于 npm 发布或开源授权。当前包保持 `private: true`、`UNLICENSED`。

## 添加插件的清单

1. 明确用途及显示位置，读取目标版本 DSH 文档，通过运行时 Inspect 核实所需 API；Inspect 查询本身不是业务 Service。
2. 创建独立包，初始设为 `private: true`，使用唯一包名和插件行 ID。
3. 按实际实现声明 `dsh.bundle.patch`、模块入口、`exports`、`files` 及 `engines.dsh`。兼容范围只能覆盖有依据的版本，不能把文档版本当作已测试兼容性。
4. 添加 patch、运行时文件、中英文 locale、合法授权的图标及插件 README。Client 插件需要额外核对 Client manifest、Slot 和打包规则。
5. 提供 `check`、`test`、`build` 三个脚本。无转译的 JS 包可将 build 用于语法和资源校验，说明没有编译产物；不要用空成功脚本冒充检查。
6. README 记录用途、权限、配置、开发命令、兼容性、安装步骤、卸载/恢复方式和测试证据。
7. 审核实际打包文件清单，检查源码及生成物均不含凭据；在用户批准的独立测试 profile 中验证。

根目录检查器只检查基础仓库约定，不解析完整 DSH patch、不验证图标/exports 资源，也不能证明运行时接口可用。完整清单需由插件自己的检查和真实验收覆盖。

参见[开发流程](<../docs/development.md>)与[安全约定](<../docs/security.md>)。
