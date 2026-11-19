# 测试与审查记录

更新日期：2026-11-19。当前源码：**0.1.7**。兼容声明：**`0.2.2-rc.2 || 0.2.2-rc.3 || >=0.2.2-rc.5 <0.2.2`**；内置 pi-ai 1.3.0。当前真实 UI 环境为 macOS Desktop rc.5。

授权状态标记：合成测试覆盖 grant、API key、无记录、未知类型及查询失败。未在日常 profile 重载并目视复验新标记。

## 当前验证矩阵

| 范围 | 证据与结果 | 边界 / 未验证项 |
| --- | --- | --- |
| 静态契约 | 复核 authorization、credentials、llm、settings、connection、webServer、Client插槽、locale及所需主题样式 | 不代表真实授权成功 |
| 自动化与构建 | `pnpm validate`：插件 **40/40**、仓库 **6/6**；语法、双语、版本声明和artifact断言通过 | 合成服务/数据；没有真实React DOM组件测试 |
| 源码探针 | rc.3内置Codex OAuth/callback源码哈希与原调查一致，隔离VM探针 **6/6** 通过 | 刻画现有限制，不证明真实端口竞态已修复；不触碰1455 |
| HTTP模拟集成 | 同源Web及Desktop缺省头、认证/归属/格式/上限/超时拒绝分支通过 | admission和controller为mock；只绑定临时loopback端口并关闭，不代表真实Web GUI验收 |
| rc.3安装恢复 | 0.1.3曾因版本不匹配拒载；获准后由管理器移除/重装0.1.4，applied，插槽active | 未使用版本豁免，未修改应用安装包；真实授权进行中移除未验证 |
| rc.5恢复加载（0.1.7） | 0.1.6因`engines.dsh`不含rc.5被判incompatible、rows为空；复核六项Host服务、Client插槽、模块加载与pi-ai流程后按精确列表加入rc.5。管理器读到0.1.7无error，`set_bundle` HMR重应用返回applied；未认证POST返回401 FORBIDDEN，两个Client插槽占用active | 未使用版本豁免；未在rc.5真实页面点击入口或发起登录 |
| 当前UI（0.1.6） | 本地链接重建后，真实页面默认只显示“授权 ›”；点击后同行显示“登录”，再次点击后隐藏。前后卡片高度及宿主控件位置保持不变 | 只点击折叠开关，不点击登录；暗色/键盘完整交互未验证 |
| 按钮匹配 | 按宿主rowActions/secondaryButton样式：12px主文本色、28 CSS px高、0.5px边框、0/10px内边距。实际截图中登录和编辑都是71×44像素 | 截图像素随窗口缩放变化，不将其当作CSS尺寸 |
| OAuth端到端 | 未自动发起真实OAuth验收；期间曾被动观察到授权等待弹窗，未操作或打断 | 不能据此认定授权完成、保存或有效；真实回调和完整弹窗流程未验证 |
| 模型与持久化 | 未执行真实模型验收 | 新凭据实际使用、生成完成、重启持久化和其他配置不变仍未验证 |
| 生命周期与竞争 | mock覆盖取消、租约/超时、双击与不同尝试互斥 | 原生取消不保证底层立即退出或不再保存；真实存储并发保护未增加 |

测试中的授权、存储、配置和浏览器打开器均为mock或合成实现。当前源码探针独立运行，不纳入默认CI。真实UI验证仅反映上述实际观察。

## 升级后三步检查

1. 在 Plugins 中确认插件已启用、有插件行、无 `incompatible-version` 或启动错误；不要启用版本豁免。
2. 打开设置 → 模型 → openai-codex，确认卡片有“授权 ›”，不点击登录。Inspect 的 `settings.models.provider-card` 应有对应 settingsNs 的 active 占用；仅有 footer 不算卡片挂载成功。
3. 向当前本地 GUI 地址发送无 cookie、无 Authorization 的只读状态请求：`curl -q --noproxy '*' -i -X POST "$ORIGIN/api/wangzf/codex-oauth" -H 'Content-Type: application/json' -d '{"action":"status"}'`（先把 `ORIGIN` 设为实际本地 origin）。rc.5 基线是 HTTP 401、`{"error":"FORBIDDEN"}`；404 不能证明认证有效，2xx 应停止使用并调查。无需 OAuth 或模型请求。

本轮在 rc.5 工作区运行 `pnpm validate`。门禁测试使用与管理器一致的 semver 7.8.6 和 `includePrerelease: true`：rc.2 / rc.3 / rc.5 / rc.6 / rc.10 通过，rc.4 / 正式版 / 0.2.3-rc.1 拒绝。rc.6、rc.10 是合成版本号，不是实际安装测试。Host 回归模拟缺服务/方法、缺 OAuth 方法、只读存储、未知提示或通知；断言不开启尝试或中止本次尝试。既有来源、归属、回调及脱敏测试继续执行。

历史证据：rc.5 用户报告登录后修复出网即可使用模型；本轮未读取凭据正文或复测 OAuth/模型。日常 profile 未主动重载/重装；如需操作，先确认无进行中的授权，再单独征得同意。

## 必要版本历史

- **0.1.0**：初始入口，插件30项/仓库6项测试；安装后发现Desktop转发兼容问题，未将安装成功当作按钮成功。
- **0.1.1**：修复Desktop删除Origin后的误拒绝；保持认证、peer、loopback、JSON与自定义头检查。区分启动明确失败和未知结果，插件测试增至35项。官方移除重装后Desktop按钮显示确认。
- **0.1.2**：缩小字体和按钮，灰色紧凑UI实测通过。
- **0.1.3**：原生details默认折叠，真实折叠在该版本未验收。
- **0.1.4**：增加精确rc.3支持，保留rc.2；版本回归先失败后通过。添加dialog的data-window-drag-exclude及断言；源码探针和加载/按钮恢复确认。详见[rc.3兼容记录](../../docs/codex-rc3-compatibility.md)。
- **0.1.5**：试用右对齐单登录按钮，信息移入弹窗；现已由下一版本替代。
- **0.1.6**：恢复原扩展区左侧，改为固定高度的同行折叠。只切换hidden属性，不卸载Panel、不触发登录或取消；原生button具有aria-expanded/aria-controls与可见焦点。登录按钮按宿主编辑样式呈现；说明和安全状态留在弹窗。实际展开/收起及按钮匹配已确认。
- **0.1.7**：DSH升级到rc.5后插件因`engines.dsh`只含rc.2/rc.3被判incompatible、入口消失。复核Host六项服务、Client插槽与注入、模块加载格式及pi-ai 1.3.0的Codex OAuth交互后，按精确列表加入rc.5（不含rc.4，不用豁免）；无代码改动。管理器读到0.1.7无error并applied，未认证路由返回401，两个插槽占用active。详见[rc.5兼容记录](../../docs/codex-rc5-compatibility.md)。

## UI/UX复核

本轮按源码和实际页面自审：折叠按钮具备可访问名称、展开状态、关联区域；隐藏登录按钮不会占据视觉布局；授权弹窗不位于隐藏区域内；再次登录在活跃尝试期间仅打开进度，不重复发起；未移动宿主DOM或覆盖编辑/删除。没有用自制React/DOM渲染器冒充真实界面。

同行展开保持高度，不等于与完全没有插件时卡片高度相同；公开插槽仍位于宿主标题操作行下方。授权弹窗的键盘、焦点恢复、防拖拽及暗色模式仍待专门验收。

## 复现命令

使用Node.js 24、pnpm 11.28.5，在仓库根目录执行：

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm validate
git diff --check
pnpm --filter @wangzf/dsh-openai-codex-oauth pack --pack-destination "$PWD/tmp/codex-package-review"
tar -tzf tmp/codex-package-review/wangzf-dsh-openai-codex-oauth-0.1.7.tgz
```

[Client artifact](dist/client.js) 被Git忽略，克隆后需先构建。当前验证使用已有的DSH Node/pnpm；PATH中的Corepack曾因工作区外缓存写入被拒绝，没有重试该缓存操作或安装全局依赖。临时命令桥接只在被忽略的工作区目录中使用，不是构建依赖。

当前包包含22个普通文件：Host/Client源码、Client artifact、构建/检查脚本、5个测试文件、manifest/patch、双语locale、原创SVG、README/TESTING。没有个人数据、日志、截图、缓存或调查源码副本。固定OAuth public client ID和synthetic测试值不是账号凭据。后续版本需重新核对实际tarball。

## 后续真实验收

在明确授权的隔离DSH_HOME/profile中，由本人完成OAuth，再分别验证内置保存结果、实际Provider使用、生成完成与重启持久化。不要记录token、授权码、完整回调或可用授权链接。需要补测暗色/键盘交互、无记录标签、授权中取消/断连/卸载、端口释放与其他记录保护。仅更换profile名或使用同一真实账号不能保证凭据与服务端授权相互独立。
