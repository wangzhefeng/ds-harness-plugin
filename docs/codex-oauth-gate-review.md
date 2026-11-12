# Codex OAuth 严格方案门槛调查

调查日期：2026-11-12；基线：DSH **0.2.2-rc.2**、安装内 pi-ai **1.3.0**。

> 本文是最初“严格增强版 OAuth”方案的历史调查，不是当前开发状态。现有 [Codex 授权入口插件](../plugins/openai-codex-oauth/README.md) 已实现 Host + Client，采用**复用内置流程并明确披露其限制**的方案。下面的底层限制没有被入口插件修复；当前验证范围见 [测试记录](../plugins/openai-codex-oauth/TESTING.md)。

## 为什么没有实现独立严格流程

最初要求包括 callback-only、可靠报告回调端口绑定失败、取消后完成资源清理，以及锁内取消/并发更新保护。

所检查的 Codex 公共登录路径没有向调用者提供可靠的绑定结果：绑定成功与失败都会通知授权地址并请求 `manual_code`。拒绝手工 prompt 也会取消成功建立的回调；保持 prompt pending 则不能辨别绑定失败。端口预检查仍存在竞态，最终超时也不等于明确的绑定失败。

因此没有通过端口预检查、私有模块内嵌或修改安装包来绕过门槛。当前入口插件使用 `authorization.begin`，允许受校验的手工回调，并明确不承诺严格取消/保存隔离。

## 源码与 Inspect 依据

以下是**所调查安装版本的包内路径**，不是本项目构建依赖，也不假设其他版本相同。DSH Desktop 的安装源码位于其 `app.asar/dsh`，不能用普通文件系统工具直接遍历归档。

| 所属包与路径 | 调查结论 |
| --- | --- |
| `@earendil-works/pi-ai/package.json` | 版本1.3.0；公开 `./providers/*` import 导出；不导出 `./package.json` |
| `@earendil-works/pi-ai/dist/providers/openai-codex.js:6–20` | 公开 Provider 通过 lazy OAuth 复用现有实现 |
| `@earendil-works/pi-ai/dist/oauth.js` | 空导出，不能假设从该入口导入 Codex OAuth |
| `@earendil-works/pi-ai/dist/auth/oauth/openai-codex.js:275–313` | 吞掉绑定失败，无条件通知地址，不传 callback timeout；notify 在 finally 保护范围之外 |
| `@earendil-works/pi-ai/dist/auth/oauth/callback-server.js:81–109` | listen 完成后才添加 abort listener；未再次检查 aborted；close 不提供可等待完成结果 |
| 同文件 `117–144` | manual prompt 拒绝会取消 callback |
| `@deepseek-ai/dsh-llm-pi-ai/src/login.ts:149–168` | 内置 flow 转调 models.login 保存，不走 session.commit |
| Host Inspect：`Service.listService({service: 'authorization'})` | begin/cancel/describe 存在，请求无 callback-only 参数 |
| Client Inspect：`Slots.listSubTree({root: 'settings.models.provider-card'})` | keyed/root slot；按 settingsNs 分派，同 key 会替换；keyConfigured 仅表示 API key 配置 |

安装包中未找到 manifest 所指的部分 pi-ai dist 类型文件，因此没有把未核对的类型当作可用契约。模型验证的当前会话定位也不能用全局默认模型代替；现有入口插件不实现模型验证功能。

## 隔离源码探针

[源码探针](../scripts/probe-codex-oauth.mjs) 从显式传入目录读取两个模块并放入 VM。HTTP server、timer、PKCE、crypto 等依赖全部替换为合成实现；未知 import / fetch 失败。没有真实监听器、凭据存储、浏览器或外部 OAuth 请求，没有第三方源码副本入库。

普通文件系统中的已核对 pi-ai 源码可运行：

```sh
node --experimental-vm-modules scripts/probe-codex-oauth.mjs /path/to/pi-ai/dist
```

若输入位于 Desktop ASAR 内，需使用已核对的 ASAR-aware Electron runtime，而不是普通 Node。仅在 Harness 已提供该环境变量时：

```sh
ELECTRON_RUN_AS_NODE=1 "$DSH_NODE_EXECUTABLE" --experimental-vm-modules \
  scripts/probe-codex-oauth.mjs /path/to/app.asar/dsh/node_modules/@earendil-works/pi-ai/dist
```

此探针是**可选调查工具**，不参与默认 CI/插件构建。2026-11-12 针对上述基线实际运行结果为 **6/6，exit 0**。通过表示刻画出当前行为，不表示严格要求通过。

| 场景 | 模拟结果 |
| --- | --- |
| 合成 EADDRINUSE | 仍通知 auth_url 并请求 manual_code，绑定错误未透出 |
| 拒绝 manual_code | 即使成功绑定，也使 login 失败并关闭 callback |
| listen 建立期间 abort | 取消被错过，wait 未结束；显式 close 后结束 |
| auth_url notify 抛错 | 发生在 finally 保护外，模拟 listener 保持打开 |
| state 错误 / 缺 code / 合法 callback | 400 / 400 / 200；合法 callback 返回合成 code |
| helper timeout | wait 拒绝，listener 仍需调用方 close |

所测源码 SHA-256：

- callback-server：`2dda468f4937edcf7bb5e8528de4bf7753efbe5b48610a3f9ea47ff2c4908ede`
- openai-codex：`0b94a219ddb5982f0ee543ef03138ed0254ce6ee0a57c9d89d39c242e2eaf6f6`

**证据限制：** VM 结果不证明真实 macOS 内核竞态、端口释放或存储锁取消问题已经复现。notify 抛错可由插件避免，但这不会补齐绑定结果接口。本调查没有访问日常 OAuth 1455 端口，也没有将 token 失效归因为这些源码风险。

## 后续方向

[最小上游接口提案](codex-oauth-upstream-proposal.md) 建议 callback-only、稳定安全错误、每次调用的 loopback/timeout 配置以及可等待的关闭语义。该提案**尚未实施**，不属于当前入口插件已交付功能。

入口插件的通信、插槽、状态机、构建和模拟测试已继续完成；严格流程的存储竞争保证、真实 OAuth、模型请求、持久化和跨配置保护仍不能用绿色单元测试替代。
