# Codex 授权入口

为 DeepSeek Harness 的 Models → openai-codex 卡片补充登录/重新授权按钮和进度弹窗，**无需另一个模型会话**。插件调用 Harness 内置 `authorization.begin` browser 流程，由系统浏览器完成登录、内置流程保存凭据；不是独立 Provider，也不是增强版 OAuth 实现。

当前源码 **0.1.3**：原生 `details/summary` 默认折叠，收起仅显示“授权设置”一行；展开后使用 12px 灰字和 28px 高按钮。0.1.1 的 Desktop 安装及按钮显示、0.1.2 的真实紧凑浅色 UI 已验证；**0.1.3 实际折叠交互、真实 OAuth、模型请求及重启持久化尚未验证**。详见[测试矩阵](<TESTING.md>)。

## 安装与移除

开发工具要求 Node.js 24、pnpm 11.28.5。在仓库根目录执行：

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
pnpm validate
```

**必须先构建再安装。** [Client 构建产物](<dist/client.js>) 被 Git 忽略，克隆仓库不会得到它；Host 直接使用 JavaScript 源码。无新增依赖、安装脚本或全局 SDK 需求，React 由 Harness 提供。

1. 优先选择隔离的测试环境；隔离时同时隔离 `DSH_HOME`，而不只是更换 profile 名。真实账号的服务端授权仍可能共享。
2. 使用 DSH 官方插件管理器，或 Plugins → Add plugin 选择本地 `plugins/openai-codex-oauth` 目录。不要手动改写 profile 或应用安装包。
3. 按管理器返回的提示处理刷新或重启，再在模型设置检查入口。已安装包的更新不保证自动生效；若返回 `already-installed`，按其 `nextStep` 操作，不将重复安装当作更新成功。
4. 安装前确认目标 provider-card 的 keyed 插槽未被其他插件占用；同 key 注册可能相互替换。

移除也使用官方插件管理器。移除会撤下入口和业务路由，并请求取消本插件发起的尝试；**不会删除已保存凭据、撤销服务端授权或自动恢复旧凭据**。内置流程可能仍在退出或提交。0.1.1 的移除/重装已验证，但授权进行中移除的清理行为未验证。

本包保持 `private: true` 和 `UNLICENSED`；公开 GitHub 源码不等于 npm 发布，也不代表授予开源许可证。

## 使用

1. 在模型设置的 openai-codex 卡片展开“授权设置”。无凭据记录显示登录入口，有记录显示“重新授权”；**记录存在不代表有效**。折叠本身不启动或取消授权。
2. 点击授权按钮，在系统浏览器中本人完成登录。
3. 若自动回调尚未完成，可在弹窗粘贴完整、匹配 state 的 localhost 回调 URL。不接受裸 code；输入掩码显示，提交或关闭时清空。不要将回调粘贴进聊天、日志或问题报告。
4. 内置流程报告成功后仅显示“已保存，尚未验证”。插件不提供模型验证按钮、不调用模型、不改变当前或默认模型，也没有账号切换、删除凭据、定时验证或自动重试功能。
5. 取消按钮、关闭弹窗、Escape、切走卡片或卸载会请求取消。失联约 45 秒、整次尝试 10 分钟也会请求取消；后台标签页计时节流可能触发失联取消。

若配置了 `apiKeyEnv`，界面提示其优先于 OAuth，不自动修改配置。无法确定时显示未知，不保证 Provider 会使用新授权。

## 权限与限制

### 沿用内置流程的限制

本插件保留 Harness 原生取消、超时及保存语义：**取消不等于授权撤销，不保证底层立即退出、端口立即释放或取消后绝不保存；不保证拒绝覆盖并发凭据更新。** 插件的尝试互斥不能解决底层存储竞争。这些是本版明确保留的边界，不是已修复项。

### 凭据和请求边界

- Host 注入 authorization、credentials、llm、settings、connection、webServer，不注册新 flow 或 Provider，也不暴露 Agent 工具。
- credentials 仅调用目标记录的 `describeRecord`，不调用 `readRecord`；不读取 token、不直接写凭据文件、不导入其他工具凭据。settings 仅以 `redactSecrets: true` 读取描述，向 Client 返回 API key 覆盖判断而非原始配置。
- token、accountId 和完整授权 URL 不传 Client。手工回调仅临时经弹窗传给 Host，不进入聊天、日志或浏览器存储。
- 固定 POST 路由 `/api/wangzf/codex-oauth` 仅接受 status/start/answer/cancel。先做官方认证，再检查 browser owner peer、TCP loopback、Origin/Fetch-Metadata、自定义头及 JSON，并限制 body 大小和读取时间。不开放跨站预检或任意文件、命令、Provider、URL 操作。
- 每次尝试使用 Client 内存中的 256-bit 随机 owner 能力标记，经 JSON body 传输，不放入 URL；其他页面不能读取或取消该尝试。同源恶意脚本/XSS 不在此标记的防御范围内。
- 只接受内置返回的 `https://auth.openai.com/oauth/authorize`，校验 redirect/state/PKCE 等字段，通过固定 `/usr/bin/open` 与 argv 打开，无 shell。系统浏览器及操作系统命令参数仍会接触授权 URL。
- 非 loopback 的 `PI_OAUTH_CALLBACK_HOST` 会拒绝启动，不修改环境，不预先占用 OAuth 1455 端口。未知交互失败关闭；原始 notice、prompt、异常不传前端或写日志，只返回白名单状态及错误码。

## 兼容范围

- 精确目标为 **DSH 0.2.2-rc.2**，已核对源码及 Inspect 契约，安装内 pi-ai 为 1.3.0；不表示完整兼容性验收，也不承诺其他 DSH 版本。
- 运行范围为本机 macOS 的 Desktop 或原始同源 Web GUI。真实 UI 证据来自 Desktop；普通 Web GUI 尚未真实验收。
- Web 请求 Origin 必须匹配服务端报告值；另允许 Origin 和 Sec-Fetch-Site 均缺省的官方 Desktop 转发形态。两者都必须通过其余认证检查。缺省头不证明 Desktop 身份，持有效 browser cookie 的本地非浏览器客户端也可能通过。
- 不支持远程或反向代理部署；loopback 检查不能排除本机代理，也不能识别代理背后的真实客户端。
- 通过 `llm.listConfigurableProviders()` 获取 settingsNs，在 keyed `settings.models.provider-card` 注册并按 owner props 筛选 Codex。同 adapter 的其他卡片不显示入口。namespace 获取失败时仅在 Models 页脚提供连接失败/刷新入口。
- 已有浅色主题实测；暗色主题、授权弹窗和焦点/键盘行为仍待验证。图标为本项目原创“进入”箭头，不使用 OpenAI 商标；提供中英文元数据。

## 开发

在仓库根目录执行：

```sh
pnpm --filter @wangzf/dsh-openai-codex-oauth check
pnpm --filter @wangzf/dsh-openai-codex-oauth test
pnpm --filter @wangzf/dsh-openai-codex-oauth build
pnpm validate
```

[构建脚本](<scripts/build.mjs>) 将三个自包含浏览器函数与双语字典组装为官方 ModuleLoader factory，不使用第三方 bundler 或私有 Harness Client 包，也不依赖安装包绝对路径。

变更 API 前重新核对目标 DSH 契约；自动化使用合成数据和 mock，不触碰真实凭据。打包复现与未验证项见[测试说明](<TESTING.md>)，通用要求见[开发流程](<../../docs/development.md>)与[安全约定](<../../docs/security.md>)。
