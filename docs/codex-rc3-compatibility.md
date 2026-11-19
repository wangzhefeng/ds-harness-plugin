# DSH rc.3 兼容修复记录

日期：2026-11-16。原版本：DSH 0.2.2-rc.2；目标版本：0.2.2-rc.3。修复从插件0.1.4起生效，当前UI迭代为0.1.6。

## 根因与修复

应用 plist 和 CLI manifest 均为0.2.2-rc.3。管理器报告已安装的0.1.3因 `engines.dsh: 0.2.2-rc.2` 被判定 `incompatible-version`，没有加载插件行；此时 provider-card 插槽存在但没有插件占用。

复核接口后，兼容声明改为 **`0.2.2-rc.2 || 0.2.2-rc.3`**。不使用版本豁免、通配范围或核心补丁；未来rc.4及正式版仍须单独核对。安装内 semver 实测：rc.2/rc.3通过，rc.1/rc.4/0.2.2正式版/0.3.0拒绝。新增回归测试在修复前失败、修复后通过。

## 契约复核

- Host Inspect：authorization 的 begin/describe、credentials.describeRecord、settings.describe、connection.requestRejection/admit/browserPeer、webServer.register/getOrigin 仍符合调用方式。
- 当前 llm 源码的 listConfigurableProviders 仍返回带 provider/settingsNs/settingsPath 的目录条目。
- Client Inspect：provider-card 仍按 settingsNs keyed 分派，footer、locale 与所用主题颜色契约可用。
- 内置 `dsh-llm-pi-ai/src/login.ts` 仍注册原生OAuth flow，并通过 models.login 保存；未改变其取消和提交语义。
- Desktop `forwardWebRequest` 仍移除 Origin/Fetch-Metadata 并注入已认证 Host cookie；0.1.1的双形态安全检查仍适用。
- pi-ai 仍为1.3.0；Codex OAuth及callback helper的SHA-256与[最初调查](codex-oauth-gate-review.md)一致。隔离源码探针6/6通过，说明原有行为及限制未变，不等于真实授权验收。

## 升级指南

当前安装索引没有单独的rc.2/rc.3章节。检查了最新的 `v0.2.2-rc.1` 摘要：

- 阅读 `window-drag-regions`：按要求在本插件自定义dialog的可见矩形上增加 `data-window-drag-exclude`，并加构建断言；真实授权弹窗拖拽尚未验证。
- 阅读 `plugin-update-method`：插件没有调用 BundleInfo.updatable/update 或实现管理器UI，无需迁移业务代码；官方插件管理工具接口未变。
- 账号通知、Forge、worktree、会话日志、终端、CUA与Web搜索条目不涉及本插件运行面，未据此修改无关功能。

## 验证与生效

- 当前插件测试36/36、仓库测试6/6、构建与空白检查通过；全部使用合成数据，未由测试发起真实OAuth或模型请求。
- PATH中的pnpm包装器尝试写工作区外Corepack缓存，被沙箱拒绝。没有重试该缓存访问或安装全局依赖；改用已存在的DSH Node 24.21.0/pnpm 11.28.5，通过忽略目录中的临时命令桥接运行相同validate脚本。
- 经明确授权，仅对本插件使用官方管理器移除/重装，0.1.4结果为applied。未更改应用安装包、模型、代理或版本豁免。
- rc.3真实Desktop观察到插件插槽active、入口恢复；0.1.6本地链接重建后验证同行展开/收起，登录按钮与宿主编辑按钮具有相同可见尺寸。未自动点击登录。
- 期间曾被动观察到页面进入授权等待弹窗；没有操作该流程、刷新或关闭它，也不能据此判定授权完成或凭据有效。真实OAuth端到端、模型请求及重启持久化仍未验收。

当前布局和详细测试矩阵见[插件文档](../plugins/openai-codex-oauth/README.md)与[测试记录](../plugins/openai-codex-oauth/TESTING.md)。
