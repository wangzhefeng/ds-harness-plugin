# DeepSeek Harness Plugins

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的轻量多插件 pnpm workspace。每个插件独立版本、独立打包，根包不发布。

## 插件

| 插件 | 版本 | 用途 |
| --- | --- | --- |
| [Codex 授权入口](plugins/openai-codex-oauth/README.md) | 0.1.3 | 在模型设置中直接发起 ChatGPT / OpenAI Codex OAuth，无需先使用另一个模型会话 |

### Codex 授权入口

为 **设置 → 模型 → openai-codex** 卡片补充授权操作：

- **默认折叠**：收起只保留一行“授权设置”，展开后显示状态和操作按钮。
- **登录 / 重新授权**：调用 Harness 内置授权流程，由后端打开系统浏览器；不新增或替换 Provider。
- **手工回调兜底**：仅接受来源正确且 state 匹配的完整回调地址；输入临时传给后端，不写入聊天或日志。
- **准确状态**：区分“已有记录”“内置流程报告已保存”和“连接已验证”。本版没有模型验证请求，不把记录存在当作有效登录。
- **紧凑界面**：12px 主题灰色文字、28px 高按钮，保留原页面的编辑和删除操作。

**适用范围：本机 macOS；目标 DSH 版本为 `0.2.2-rc.2`。** 其他版本、远程访问及反向代理部署未验证。

**重要限制：** 插件沿用内置 OAuth 的取消和保存语义。取消、超时或断连只请求停止，不能保证底层已完全退出或不会继续保存，也不提供额外的并发覆盖保护。OAuth 授权可能过期，插件不保证永久免维护。

### 验证状态

| 层级 | 已有证据 |
| --- | --- |
| 自动化 | 35 项插件测试、6 项仓库测试通过；包括状态机、认证边界、回调校验、脱敏与构建检查 |
| 模拟集成 | 合成授权服务和隔离 loopback HTTP 测试通过；未占用日常 OAuth 端口 |
| 实际 UI | 0.1.1 的 Desktop 按钮显示、0.1.2 的紧凑灰色样式已确认 |
| 尚未验证 | 0.1.3 的真实折叠交互、真实 OAuth、实际模型生成、授权重启持久化及其他配置不变 |

完整说明见 [插件文档](plugins/openai-codex-oauth/README.md) 与 [测试记录](plugins/openai-codex-oauth/TESTING.md)。绿色测试不等于 Harness 端到端登录成功。

## 开发与本地安装

开发环境：**Node.js 24、pnpm 11.28.5**。当前插件没有新增第三方依赖，不需要全局 DSH SDK；React 由 Harness 提供。

```sh
git clone https://github.com/wangzhefeng/ds-harness-plugin.git
cd ds-harness-plugin
pnpm install --frozen-lockfile --ignore-scripts
pnpm validate
```

`validate` 会检查、测试并构建插件。Client 构建产物不纳入 Git，**首次从源码安装前必须完成构建**。

构建完成后，通过 Harness **Plugins → Add plugin** 选择本地目录：

```text
plugins/openai-codex-oauth
```

安装会影响目标 profile 的所有会话，建议先使用独立测试环境。它不会自动发起 OAuth 或模型请求。不要手动修改 profile 清单或应用安装包；是否需要刷新或重启，以管理器结果和实际页面为准。详细安装、卸载及权限说明见 [插件文档](plugins/openai-codex-oauth/README.md)。

## 常用命令

```sh
pnpm check       # 仓库约定与插件检查
pnpm test        # 自动化与模拟测试
pnpm build       # 构建 Client artifact
pnpm validate    # 顺序执行以上三项

pnpm --filter @wangzf/dsh-openai-codex-oauth test
```

## 项目结构

```text
plugins/             # 独立插件包与接入说明
scripts/             # 仓库检查器与可选源码探针
docs/                # 开发、安全及设计调查记录
.github/workflows/   # 仅验证，不安装到 Harness、不发布
```

- [插件接入清单](plugins/README.md)
- [开发与验证流程](docs/development.md)
- [安全约定](docs/security.md)
- [最初严格方案的门槛调查](docs/codex-oauth-gate-review.md)
- [尚未实施的上游接口提案](docs/codex-oauth-upstream-proposal.md)
- [Agent 协作约定](AGENTS.md)

## 仓库可见性与许可

当前 GitHub 仓库保持私有；公开前需审查历史内容及作者邮箱等身份信息。

GitHub 仓库可见性、npm 发布与许可证是三件不同的事。本项目的根包和插件均保持 `private: true`，未发布 npm 包；`UNLICENSED` 表示**未授予开源使用许可**，并非已选择某个开源许可证。

不提交个人凭据、备份、运行时数据、日志或截图。安装、发布、commit、push 和仓库可见性变更均需维护者明确授权；自动化不会代替这些决定。
