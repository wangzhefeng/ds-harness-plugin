# DSH rc.5 兼容修复记录

日期：2026-11-19。原版本：DSH 0.2.2-rc.3；目标版本：0.2.2-rc.5。修复从插件 0.1.7 起生效。

以下为首次恢复 rc.5 加载时的历史记录。后续采用的[有限范围及回归矩阵](../plugins/openai-codex-oauth/TESTING.md#升级后三步检查)不改变当时的实测结论。

## 根因与修复

用户升级后无法连接 Codex：插件 0.1.6 的 `engines.dsh` 只声明 `0.2.2-rc.2 || 0.2.2-rc.3`，管理器在 rc.5 上判为 `incompatible-version`，插件行不加载、rows 为空，模型设置里没有授权入口。provider 与内置 OAuth 流程本身仍在。

复核接口后，兼容声明改为 **`0.2.2-rc.2 || 0.2.2-rc.3 || 0.2.2-rc.5`**，不使用版本豁免、通配范围或核心补丁；rc.4 与未来 rc.6、正式版仍须分别核对。安装内 semver 实测：rc.2/rc.3/rc.5 通过，rc.4/rc.6/0.2.2 正式版/0.3.0 拒绝。回归测试与 `scripts/check.mjs` 同步断言该精确列表，修复前该测试失败。

## 契约复核（rc.5）

- Host Inspect：`authorization`（registerFlow/list/describe/cancel/begin，`AuthorizationEntry{key,label,methods,inFlight}`）、`credentials.describeRecord`、`settings.describe`、`llm.listConfigurableProviders`、`connection.requestRejection/admit/browserPeer`、`webServer.register/getOrigin` 的签名与调用方式均未变化。
- Client Inspect：`settings.models.provider-card` 仍为 keyed、owner props 为 `ProviderCardExtrasOwnerProps{provider,configured,keyConfigured}`；`settings.models.footer` 仍为 list；`slots.register/inject` 与 `locale.register/bind` 契约不变。0.1.6 已改用新槽位名，无需改动。
- Client 加载：rc.5 仍通过 `window.__ModuleLoader__.load({id, factory})` 注册 bundle，`dsh.client` 清单字段（platform/inject/immediately）未变，现有 dist 产物可直接使用。
- 内置流程：`dsh-llm-pi-ai/src/login.ts` 仍用 `credentialKey('llm-pi-ai','openai-codex')` 注册 oauth flow；pi-ai 仍为 1.3.0，`openai-codex` OAuth 的 select 选项、`auth_url` 通知、回调占位符 `http://localhost:1455/auth/callback` 与插件处理一致。

## 验证与生效

- `pnpm validate` 等价检查：仓库约定 1 个插件通过，插件检查通过，插件测试 **36/36**。
- 管理器读取到 0.1.7 且无 `error`；通过 `set_bundle` 触发一次已启用 bundle 的 HMR 重应用，结果 `application: applied`。
- 生效证据：Host 配置目录出现 `include:wangzf-openai-codex-oauth`；未认证请求 `POST /api/wangzf/codex-oauth` 返回 401 `{"error":"FORBIDDEN"}`（路由已注册且拒绝未认证来源）；Client 插槽中 `settings.models.provider-card`（key `llm-pi-ai`）与 `settings.models.footer`（id `wangzf-codex-entry-connection`，order 90）都有 active 占用。
- 未验证：真实 OAuth 端到端、真实模型请求、重启持久化，以及 rc.5 下弹窗拖拽/暗色等 UI 细节。未使用版本豁免，未修改应用安装包。
