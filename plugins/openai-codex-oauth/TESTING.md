# 测试与审查记录

记录日期：2026-11-12。当前源码：**0.1.3**。目标：**DSH 0.2.2-rc.2 / 内置 pi-ai 1.3.0**；真实 UI 环境为本机 macOS Desktop。下表区分当前源码自动化结果和历史版本真实观察，不将构建成功当作集成成功。

## 当前验证矩阵

| 范围 | 证据与结果 | 边界 / 未验证项 |
| --- | --- | --- |
| 静态契约 | 已核对 Host authorization、credentials、llm、settings、connection、webServer 及 Client keyed provider-card、owner props、locale、主题与 ModuleLoader 契约 | 源码和 Inspect 不证明运行时交互成功 |
| 自动化与构建（0.1.3） | `pnpm validate` 通过：插件 **35/35**、仓库 **6/6**；Client artifact 构建及语法检查通过 | 合成数据/mock，不调用真实 OAuth 或模型；没有真实 React DOM 组件测试 |
| HTTP 模拟集成 | 临时 loopback HTTP 测试通过，覆盖同源 Web 和 Desktop 缺省头形态、no-store 响应及拒绝分支 | admission 和 controller 为 mock；系统分配临时端口，不使用 1455，结束后关闭 server/连接；不证明真实 Web GUI 接入 |
| 官方安装及移除/重装（0.1.1） | 管理器均报告 `application=applied`，重装版本为 0.1.1 | 不代表进行中授权可安全移除，或凭据可恢复 |
| Desktop 入口（0.1.1） | 刷新状态后显示启用的“重新授权”“刷新状态”及“已有凭据记录，尚未验证是否有效”；截图与 AX 确认 | 仅验证状态描述读取和按钮显示，未点击授权；无记录时登录标签只有自动化证据 |
| 紧凑浅色 UI（0.1.2） | 已安装的本地目录链接重建 Client artifact、刷新 Desktop 后，真实看到 12px 灰字与 28 CSS px 高按钮，按钮高度匹配宿主 | 未实测暗色主题、授权弹窗或焦点行为 |
| 默认折叠 UI（0.1.3） | 原生 details/summary 默认无 open 属性，收起仅“授权设置”一行；artifact 断言和代码审查通过 | 构建后未刷新 Desktop；实际展开/收起、键盘行为及高度**未验证** |
| 真实 OAuth | **未执行**；授权按钮从未点击 | 系统浏览器授权、自动/手工回调、真实凭据保存均未验证 |
| 模型与持久化 | **未执行** | 新凭据被 Provider 使用、应用内生成、重启持久化、其他 Provider/记录/模型配置保持不变均未验证 |
| 生命周期与竞争 | mock 覆盖取消、租约/超时、并发尝试互斥等 | 真实断连、授权进行中卸载、原生端口释放及保存竞争未验证；取消不保证底层立即退出或不再保存，并发保存沿用原生限制 |

自动化覆盖控制器状态、互斥、取消、租约/超时、通知失败、回调白名单及 state、API key 覆盖、错误投影；Client transport 的双击、临时输入、串行取消、失联与轮询；路由的 trust/peer/Origin/格式/大小/超时。authorization、credentials、settings 与 browser opener 均为合成或 mock，禁止真实 OAuth fetch。

## 必要版本历史

- **0.1.0**：官方安装报告 applied，但 provider-card 入口未挂载，未计为 UI 成功。初始自动化为插件 30 项、仓库 6 项。修复了轮询禁用回调输入、输入校验失败停止心跳等问题。
- **0.1.1**：修复 Desktop 官方转发删除 Origin/Host/Cookie/Sec-Fetch-Site、注入 Host cookie 后，被插件原强制 Origin 检查误拒绝的问题。回归测试先复现 `403 != 200`，修复后通过。仅允许正确同源组合或 Origin 与 Sec-Fetch-Site 同时缺省，保留其余认证检查；空值、字符串 null 及矛盾 Fetch Metadata 仍拒绝。另将启动明确失败与结果未知分开，未知状态禁止重复启动但允许刷新/取消。插件测试增至 35 项。更新遇到 `already-installed`，依管理器提示移除后重装；实际 Desktop 状态读取及按钮显示成功，无需额外重启。
- **0.1.2**：仅收紧插件作用域样式，正文 12px、secondary 灰色、按钮高 28px、圆角 8px、内边距 4px/10px；保留 alert/status 语义与 focus-visible，授权逻辑不变。本地链接重建并刷新后真实浅色 UI 已确认。
- **0.1.3**：增加默认折叠的原生 details/summary，收起仅保留 20px 行高的“授权设置”，去掉插件容器上下 padding；不声称与无插件高度完全一致。没有 onToggle 业务调用、不条件卸载 Panel，弹窗是 details 外的兄弟节点；折叠不主动发起登录或取消。自动化与构建通过，但真实折叠交互尚未验证。

内置流程使用 `models.login` 保存，未走 `session.commit`；authorization 取消可能早于底层退出。本插件保留这一取消/保存语义，不宣称修复并发覆盖或提供取消后绝不保存的保证。

## 复现命令

使用 Node.js 24、pnpm 11.28.5，在仓库根目录执行：

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm validate
# 单包检查、测试与构建
pnpm --filter @wangzf/dsh-openai-codex-oauth check
pnpm --filter @wangzf/dsh-openai-codex-oauth test
pnpm --filter @wangzf/dsh-openai-codex-oauth build
# 文档和源码空白检查
git diff --check
```

[Client artifact](<dist/client.js>) 被 Git 忽略，安装或打包前必须构建。上述命令不安装 DSH 插件、不启动真实 OAuth，也不验证模型可用性。

本地打包审查（不发布、不安装），仍在仓库根目录执行：

```sh
pnpm --filter @wangzf/dsh-openai-codex-oauth pack --pack-destination "$PWD/tmp/codex-package-review"
tar -tzf tmp/codex-package-review/wangzf-dsh-openai-codex-oauth-0.1.3.tgz
```

已有打包审查清单为 21 个普通文件，包含 Host/Client 源码、Client artifact、构建/检查脚本、4 个测试文件、manifest/patch、双语 locale、原创 SVG、README/TESTING；不包含 node_modules、缓存、个人凭据、运行日志或调查源码副本。显式 files 白名单保留开发测试源码，使包内 check/test/build 可用。后续变更需重新审核 tarball，不能仅依赖忽略规则。

自动检查 Client artifact 不含 Host token/accountId 字段、完整 OAuth 授权 URL、文件/命令执行代码、浏览器存储或日志调用。测试敏感标记均为 synthetic 合成值；Host 固定 OAuth public client ID 不是账号凭据。构建与运行不依赖安装包绝对路径。

## 真实验收步骤（待执行）

1. 准备隔离 `DSH_HOME`/profile、测试账号及允许的外部请求范围，确认 keyed 插槽无冲突。安装通过官方管理器；不读取或导入其他工具凭据。
2. 构建并刷新页面，确认 0.1.3 默认收起、展开/收起、键盘操作和布局；分别检查浅色/暗色主题及无记录/有记录标签。
3. 本人点击授权，检查弹窗焦点、Escape、关闭与焦点恢复；分别验证浏览器自动回调和手工完整回调。不要记录 token、授权码、完整回调或可用授权链接。
4. 分开记录“内置流程报告保存”“Provider 实际使用新凭据”“真实生成完成”，不得互相替代。插件本身没有模型验证按钮。
5. 检查取消、断连、进行中移除、端口释放及保存竞争；明确原生限制而非预设取消必然阻止保存。
6. 重启检查持久化及其他配置不变，并验证移除/恢复边界。同真实账号即使本地隔离，也不保证服务端授权相互独立。
