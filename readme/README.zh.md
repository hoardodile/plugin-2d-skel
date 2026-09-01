# 2D骨骼

hoardodile 内容插件：Live2D、Spine 与 DragonBones 动画查看器，用同一查看器从单个资源渲染这三种格式的动画角色：

- **Live2D** — 官方 Cubism `*.model3.json` 模型与 Live2DViewerEX 配置（`model0.json` + `.moc3`/`.moc`，多变体）：动作组、表情、EX 对话/选项菜单、声音、命中区与模型变体。
- **Spine** — 直接 `.json`/`.skel` + `.atlas` 导出与 Live2DViewerEX `type: 9` 配置（`model0.json` + `skeleton_N` + `atlases_*`）：动画/皮肤/覆盖层选择、EX 命中检测、对话、声音、模型变体。
- **DragonBones** — 直接 `*_ske.json`/`*_dbbin` + `*_tex.json` 图集导出与 Live2DViewerEX `type: 10` 配置：动画、骨架、皮肤选择与模型变体。

查看器通过类型安全适配器按场景的 `engine` 分发；共享界面（场景选择器、播放控制、对话、状态）只写一次，各引擎的专属控件位于各引擎组件之后。

## 功能

- 识别 Cubism + Live2DViewerEX、Spine（直接 + EX）与 DragonBones（直接 + EX）；各引擎的动作组、表情、EX 对话/选项菜单、声音、命中区与模型变体。
- 透明/棋盘背景、循环、互动、截图、全屏。
- 专有 Live2D 运行时**不随插件分发**——首次打开 Live2D 模型时通过一次批量的用户许可下载获取（sha256 固定，存放在插件自己的 vault 中）。Spine 与 DragonBones 使用内置运行时。
- 可在内容库搜索过滤器中按模型家族（Cubism / 标准 / EX / 龙骨）筛选资源。

## 要求

- hoardodile ≥ 0.1.9（详见仓库 README）。
- 安装前请确认信任该仓库——插件代码在受限沙箱中作为服务端代码运行。
