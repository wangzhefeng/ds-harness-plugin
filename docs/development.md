# 开发流程

## 工具与初始化

使用 Node.js 24 和根 package.json 固定的 pnpm 11.28.5。Node 版本约束是本仓库的开发工具约定，不代表 DSH 插件运行时要求。不需要全局安装插件依赖。

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm validate
```

若 pnpm 不可用，先配置已有工具或请求授权，不自动安装全局依赖。`--ignore-scripts` 避免安装阶段执行生命周期脚本；它不阻止之后显式运行的构建/测试脚本。新增依赖前审查来源、许可证及构建脚本需求。

## 命令

- `pnpm check`：仓库结构和插件基础清单检查，再执行插件各自的 check。
- `pnpm test`：仓库检查器的自动化测试，再执行插件各自的 test。
- `pnpm build`：执行各插件自己的 build；当前 Codex 入口插件会生成 Client module artifact。
- `pnpm validate`：按顺序执行以上三个命令。
- 单包操作：`pnpm --filter <包名> run test`（其他命令同理）。

根包始终 private，不发布；每个插件初始也 private。先采用独立手工版本，不引入批量发布工具。新增依赖时更新并提交 pnpm-lock.yaml；CI 使用冻结锁文件。将来采用 TypeScript 或增加共享代码时，再引入实际需要的编译器和 workspace 包。

## 当前已核对的 DSH 基线

2026-11-12 只读检查本机安装包：

- `/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/package.json`：runtime 和 `@deepseek-ai/dsh` 版本均为 **0.2.2-rc.2**。
- 内置 dsh-doc 的 `references/plugin-development.md` 与 `references/host-plugin.md`：bundle 使用 package.json 的 `dsh.bundle.patch` 声明 YAML patch；Host-only 包可不引入构建工具或额外依赖。
- 安装应使用 DSH 的插件管理机制，或界面的 Plugins → Add plugin 选择本地目录，不手动改写 profile 清单。
- 文档区分新 bundle 的热应用和已安装包更新的重启需求；每次以安装结果的 application/warnings 和真实行为为准，不承诺一律免重启。

这些安装包路径仅是调查来源，不是项目的运行或构建依赖。后续 Codex 入口已完成部分 Desktop 安装/UI 验证，具体范围与仍未验证的 OAuth/模型功能见 [插件测试矩阵](../plugins/openai-codex-oauth/TESTING.md)。新增插件或升级目标版本前重新核对版本，并使用 cordis_inspect_list/query 或实际类型与源码验证所需接口。

## 构建、安装与单包审查

Client artifact 位于插件的 `dist/`，被 Git 忽略；克隆后必须先构建，不能直接将缺产物的目录交给 Harness。安装使用官方插件管理器，来源为构建完成的本地插件目录。它影响目标 profile 的所有会话，不承诺所有更新都可免重启。

当前插件打包示例（从仓库根目录执行，使用绝对目标目录避免 `--filter` 的工作目录歧义）：

```sh
pnpm --filter @wangzf/dsh-openai-codex-oauth build
pnpm --filter @wangzf/dsh-openai-codex-oauth pack --pack-destination "$PWD/tmp/codex-package-review"
tar -tzf tmp/codex-package-review/wangzf-dsh-openai-codex-oauth-0.1.3.tgz
```

打包文件仅作本地审查，不应提交 Git，也不等于发布。检查 manifest 中的 files/exports、构建产物、文档、locale、图标和测试源码是否齐全；不得混入真实数据。

当前包无新增依赖。pnpm 可能为新 workspace 包补充一个空 importer；冻结安装可通过，不表示增加了第三方依赖。本次锁文件保持原有内容，新增实际依赖时仍须更新锁文件并审核。

## 本地集成测试

1. 完成静态检查、单元测试、构建和打包清单审核。
2. 由用户确认独立测试 profile、测试账号和允许产生的外部请求；profile 的创建/启动命令按届时 DSH 文档核实，不猜测参数。
3. 明确授权后再安装；不能默认把当前日常 profile 当作测试环境。
4. 区分“安装成功”“运行时注册成功”和“用户操作实际成功”。UI 插件须观察真实按钮与交互；热更新须单独验证。
5. 记录重启后的持久化行为、清理情况及其他配置是否保持不变。

## 测试证据与发布

每个插件维护测试记录，至少包含：版本/提交、DSH 版本、环境、测试类别（自动化/模拟/用户参与的真实测试）、步骤、预期、实际结果和未验证项。不记录账号、凭据或完整授权链接。

CI 只进行自动化检查，不安装 DSH、不读取个人 profile、不调用真实模型、不发布包。当前插件使用合成数据及隔离 loopback 模拟测试，绿色 CI 不代表 Harness 集成成功。

发布前单独审核：许可证、私有标记、版本与兼容范围、变更说明、打包内容、安全检查及真实测试证据。提交、推送、发布和安装需要各自明确授权。
