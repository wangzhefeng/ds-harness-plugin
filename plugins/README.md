# 插件目录

每个直接子目录是一个独立的 DSH bundle 包，独立命名、版本和分发。
目前没有插件实现；本目录说明不是可安装的插件。

## 添加首个插件的清单

1. 明确用途及显示位置，读取目标版本 DSH 文档，通过运行时 Inspect 核实所需 API；Inspect 查询本身不是业务 Service。
2. 创建独立包，初始设为 `private: true`，使用唯一包名和插件行 ID。
3. 按实际实现声明 `dsh.bundle.patch`、模块入口、`exports`、`files` 及 `engines.dsh`。兼容范围只能覆盖有依据的版本，不能把文档版本当作已测试兼容性。
4. 添加 patch、运行时文件、中英文 locale、合法授权的图标及插件 README。Client 插件需要额外核对 Client manifest、Slot 和打包规则。
5. 提供 `check`、`test`、`build` 三个脚本。无转译的 JS 包可将 build 用于语法和资源校验，说明没有编译产物；不要用空成功脚本冒充检查。
6. README 记录用途、权限、配置、开发命令、兼容性、安装步骤、卸载/恢复方式和测试证据。
7. 审核实际打包文件清单，检查源码及生成物均不含凭据；在用户批准的独立测试 profile 中验证。

根目录检查器只检查基础仓库约定，不解析完整 DSH patch、不验证图标/exports 资源，也不能证明运行时接口可用。完整清单需由插件自己的检查和真实验收覆盖。

参见 [开发流程](../docs/development.md) 与 [安全约定](../docs/security.md)。
