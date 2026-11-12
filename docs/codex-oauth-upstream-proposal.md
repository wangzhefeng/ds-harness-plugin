# Codex OAuth：最小上游接口草案

状态：**设计提案，尚未实施**。基于2026-11-12调查的 DSH 0.2.2-rc.2 / pi-ai 1.3.0。

当前 [入口插件](../plugins/openai-codex-oauth/README.md) 已实现内置流程的按钮与弹窗，并明确保留原生限制。本提案描述的是将来实现严格增强流程所需的上游能力，不是安装入口插件的前置操作，也不代表已经修改 DSH 或 pi-ai。

依据：[门槛报告](./codex-oauth-gate-review.md) 与 [隔离源码探针](../scripts/probe-codex-oauth.mjs)。以下名称均为**建议新增接口**，不是当前 pi-ai / DSH API 文档。

## 目标与非目标

目标：使外部 Host 插件可以复用公共 Codex OAuth 登录协议，在禁止手工粘贴的前提下，可靠区分绑定失败、取消、超时与登录成功，并在 Promise 结束前完成监听资源回收。

不改 OAuth 客户端 ID、授权端点、scope、PKCE、state 或 token 格式；不实现第二个 Provider，不改凭据存储，不替换 DSH 的现有授权 flow。本草案优先只改 pi-ai；DSH 的安装依赖供给与兼容性另审。

## 建议公开契约

向现有 login 的 options 增加可选 browser callback 配置（最终字段名须按上游真实类型核对后决定）：

```ts
// PROPOSED ONLY — not an existing API
interface ProposedBrowserCallbackOptions {
  mode: 'callback-only';
  host: '127.0.0.1' | '::1';
  timeoutMs: number;
}
// Proposed addition to existing login options:
// browserCallback?: ProposedBrowserCallbackOptions
```

- 省略配置保持现有交互兼容；callback-only 模式只允许 browser，遇到 device_code 选择须安全拒绝，不偷偷改变流程。
- callback-only 不调用 manual_code prompt；不要求调用方制造永不结束的 prompt。
- host 在启动前校验，仅允许明确的 loopback 字面地址。此模式不采用 PI_OAUTH_CALLBACK_HOST，不改 process.env。
- timeoutMs 必须为有界正整数；具体默认值/上限由上游定稿。本次建议总登录期限自入口开始计时，覆盖监听、用户授权、token 交换和响应读取；通过组合 signal 实现，不能仅取消 UI 等待。
- 生产端口和 redirect URI 维持 Codex 已有注册约束。不要因为测试需要暴露任意 redirect/端点覆写；单元测试通过内部依赖注入使用假 server，实际 socket 测试仅对通用 helper 使用端口 0。
- 必须在监听成功且再次确认未取消后才发 auth_url。
- auth_url 仍仅交给受信任 Host。前端不会收到完整 URL。浏览器打开器及白名单校验属于插件，不作为通用上游命令执行 API。

建议稳定失败分类（具体类名待上游定稿）：

| 建议 code | 语义 |
| --- | --- |
| CALLBACK_BIND_FAILED | 当前尝试监听失败；不通知 URL，不回退手工输入 |
| LOGIN_CANCELLED | 调用者取消，清理完成后拒绝 |
| LOGIN_TIMEOUT | 总期限届满，清理完成后拒绝 |
| CALLBACK_CONFIG_INVALID | 参数非法或非 loopback，监听前拒绝 |
| AUTHORIZATION_FAILED | 授权拒绝或交换失败；安全文案，不附响应原文 |

state 错误/缺 code 可沿用当前 400 且继续等待正确回调的行为，仍受总期限约束；不要让随机错误回调强制结束合法尝试。错误不能带 token 响应正文、授权 URL、code、state、accountId。可保留非敏感状态码用于 Host 分类，但未知错误不能归类为凭据过期。

## 生命周期要求

建议控制流（语义伪代码，不可直接当现有 API 调用）：

```text
校验参数 / 检查取消
建立总期限及组合 signal
try:
  创建 callback server，并从创建前开始监听 abort
  等待 listen 完成；立即再次检查 abort
  仅在 ready 且未取消时通知 Host 授权地址
  等待合法回调（callback-only 不创建 manual prompt）
  使用同一 signal 交换 token、读取响应
  最后检查取消；返回候选凭据
finally:
  中止待处理工作
  清除计时器、abort listeners
  await callback listener 关闭完成
```

具体实现必须处理：abort 发生在 listen 前、listen pending、listen ready 与注册后之间、通知中、callback 完成与 token 返回之间。绑定失败路径也执行清理。通知同步抛错必须位于 finally 保护范围内。

关闭建议为幂等且可等待的 `close(): Promise<void>`，或新增保持兼容的 `closed` Promise：重复调用共享同一关闭过程；从未绑定、绑定失败、已关闭均安全；应有明确方式终止本次 callback server 的在途/keep-alive 连接，不能因为等待连接永远挂起。不得关闭其他 server 的连接。

成功/失败/取消 Promise 均应在清理后才 settle；`Promise.race` 提前返回而底层仍继续运行不满足契约。上游只返回候选凭据，不负责 DSH 提交；插件后续仍需锁内取消与并发记录比较、不可撤销提交阶段及回读。

## 回归测试要求

以下为未来实施的验收要求，**不是已经通过的测试**。现有六项 characterization probes 会继续记录旧行为；新实现应新增/转换为期望安全行为的断言，不能删失败断言冒充修复。

| 场景 | 必须断言 |
| --- | --- |
| callback-only 成功 | 无 manual_code；仅 ready 后一次 auth_url；正确 state/code；返回前监听关闭 |
| 绑定失败 | 明确 CALLBACK_BIND_FAILED；无 auth_url、无 manual、无 token fetch；资源释放 |
| 绑定竞态 | 模拟在实际 listen 时失败，不采用先检查端口；同上 |
| 监听前/建立期间/ready 后取消 | 均终止；无遗留 listener/timer；取消后不发 URL、不换 token |
| notify 抛错 | 拒绝并 await 关闭，无开放监听器 |
| 超时 | 每个等待阶段可终止；token fetch/读取收到 abort；清理后才报告超时 |
| state 错误、路径错误、缺 code | 拒绝该 callback，不交换 token；后续正确回调仍可成功，或总超时结束 |
| 重复/并发 callback | 仅一次 code exchange；其余请求拒绝；不重复完成 |
| 授权端点拒绝/畸形 token 响应 | 安全错误；不输出合成敏感标记；关闭监听 |
| 取消与 token 返回竞争 | 清理后准确报告取消或成功，契约明确，不在完成之后继续副作用 |
| close 多次/close 与 abort 同时 | 同一可等待关闭结果，无未处理 rejection |
| 环境为非 loopback | 显式安全配置不被环境覆盖；非法显式 host 在创建 listener 前拒绝 |
| 实际 helper socket | 仅隔离 loopback 临时端口；关闭后连接拒绝/可重新绑定；记录 OS 和运行时 |
| 默认兼容模式 | 原有 browser/manual/device 行为不被无意破坏，单独测试 |
| 外部网络保护 | 默认 fetch 拒绝，只有合成 transport；任何未预期网络调用直接使测试失败 |

## 改动范围与接入门槛

预期修改位置：pi-ai 的 Codex OAuth 实现、通用 callback helper、公开 login options 类型与 lazy wrapper 的透传（实际类型源本安装缺失，需要正式源码或可核验发布包）。不复制私有模块长期内嵌到插件，不 monkey-patch 全局 http 或 process.env。

实施前必须另行确认源码取得方式、目标版本/许可证、可维护的依赖供给与审核范围。即使工作区补丁测试通过，也不表示当前 DSH 已更新；不得修改安装包或依靠安装绝对路径 import 来绕过分发。

上游能力可用后，严格增强流程仍需以下门槛：

1. 复核新发布版本与实际运行依赖，重新跑安全行为测试。
2. 在现有入口基础上复核通信、安全、会话模型与存储接口，不把当前全局默认模型当作当前会话模型。
3. 完成提交、锁等待取消、并发刷新和异常流测试。
4. 通过后才替换或增强现有 Host + Client 授权路径；如新增模型验证，无当前 Codex 会话模型时禁用。
5. 在明确授权的隔离环境执行真实 OAuth、模型请求和重启验收。
