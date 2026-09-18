<p align="center">
  <img src="artifacts/logo-draft/pixtorio-pixel-p.png" width="96" alt="Pixtorio logo">
</p>

<h1 align="center">Pixtorio</h1>

<p align="center">面向像素艺术与逐帧动画创作的本地桌面编辑器。</p>

<p align="center">
  <a href="https://github.com/MiguelValentine/pixtorio/releases">下载</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#功能一览">功能</a> ·
  <a href="#构建">构建</a> ·
  <a href="#贡献">贡献</a> ·
  <a href="README.md">English</a>
</p>

![Pixtorio 浅色界面预览](artifacts/final-light.png)

Pixtorio 是一个受 Aseprite 工作流启发的像素画与帧动画编辑器。桌面端使用 Wails 和 Go，编辑器界面使用 React、TypeScript、Vite 与 Canvas 2D 渲染；同一前端也可在浏览器中运行，完成本地导入和导出。

默认界面为中文和浅色主题，可在偏好设置中切换语言与主题。项目以 Windows 为主要桌面平台，同时可在 macOS Apple Silicon 上本机构建。

## 功能一览

- **像素创作**：铅笔、橡皮、吸管、填充、渐变、喷枪、轮廓、替换颜色、形状、曲线、多行文字，以及像素级缩放、平移、网格、参考线、对称和无缝平铺预览。
- **画笔与颜色**：多种画笔形状、位图与图案画笔、笔刷预设、压感/速度动态、RGBA/HSLA 编辑、调色板管理、索引色模式、色相环和明暗色选择器。
- **图层与动画**：分组图层、19 种 Aseprite 栅格混合模式、背景/参考图层、透明度与 Z-index、时间轴、多帧动画格、链接动画格、标签、洋葱皮和独立动画预览。
- **选择与变换**：矩形、椭圆、套索、多边形、魔棒、颜色和不透明内容选择；支持布尔运算、羽化、扩张/收缩、复制粘贴，以及选择、动画格和文档变换。
- **效果与资源**：亮度/对比度、HSL、曲线、卷积、描边和阴影；图块地图、切片、ICC 色彩配置、像素长宽比、历史记录、自动恢复和快捷键自定义。
- **导入导出**：PNG、GIF、精灵图、打包图集、图像序列、GPL/JASC-PAL 调色板；支持帧范围、方向、标签和图层拆分导出。

## 快速开始

### 前置条件

- Go `1.27` 或更高版本
- Node.js `24` 或更高版本
- Wails CLI `v2.15.0`
- Windows 桌面构建需要 WebView2 Runtime
- macOS 本地构建需要 Xcode Command Line Tools

安装 Wails CLI 与前端依赖：

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@v2.15.0
npm --prefix frontend install
```

启动桌面开发模式：

```bash
wails dev
```

仅启动浏览器前端：

```bash
npm --prefix frontend run dev -- --host 127.0.0.1
```

浏览器模式支持本地项目、PNG、调色板、精灵图与图像序列的导入，以及 `.pixio`、PNG、GIF、精灵图和图像序列下载导出。原生文件对话框、最近项目、原子保存和 MCP 仅在桌面应用中可用。

## 构建

运行完整检查：

```bash
npm --prefix frontend run check
npm --prefix frontend test
npm --prefix frontend run build
go test ./...
```

构建当前平台的生产应用：

```bash
wails build
```

Windows 产物位于 `build/bin/Pixtorio.exe`。在 Apple Silicon Mac 上可构建应用包：

```bash
wails build -platform darwin/arm64
```

macOS 产物位于 `build/bin/Pixtorio.app`。自行构建的应用需要使用自己的 Apple Developer ID 进行签名和公证后，才能作为面向终端用户的正式发行包。

## 项目文件

`.pixio` 是 Pixtorio 唯一的可编辑项目格式。当前版本为严格的 `.pixio v4` ZIP 容器，保存画布、图层、帧、动画格、调色板、图块集、图块地图、切片、参考线、色彩配置、设置和缩略图等数据。

v4 有意不兼容旧版本：v1-v3 项目会被拒绝，不提供迁移、降级或兼容读取。PNG、GIF、精灵图、图集和图像序列是交换格式，不是项目格式。

## 项目状态

Pixtorio 已具备较完整的像素编辑、动画、合成、导入导出、历史记录与 MCP 基础能力，但尚未宣称达到 Aseprite 全量功能对等。功能清单和验证检查点以 [AGENTS.md](AGENTS.md) 为准。

以下能力不在项目范围内：自动化/CLI、脚本与插件 API、云同步、安装包维护，以及 `.aseprite` 兼容。

## MCP

桌面应用支持通过 `Pixtorio.exe --mcp` 启动的本地 MCP 集成。它可访问活动编辑器中的文档、图层、帧、像素、调色板、图块地图、预览和导出能力，并与 UI 共用撤销/重做历史。

完整的协议、限制与安全说明见 [MCP.md](MCP.md)。MCP 是本地桌面集成接口，不是远程服务或通用脚本执行环境。

## 贡献

欢迎提交 issue 和 pull request。提交前请：

1. 保持变更范围清晰，遵循现有 TypeScript、React 与 Go 代码风格。
2. 为行为变化补充有针对性的测试。
3. 运行本 README 中的完整检查命令。
4. 不要为 `.pixio v1-v3` 添加迁移、兼容读取或兼容测试。

更完整的工程约束和发布验证要求见 [AGENTS.md](AGENTS.md) 与 [RELEASE.md](RELEASE.md)。

## 许可证

仓库当前未包含许可证文件。在添加明确许可证前，默认不授予第三方复制、修改或分发本项目的权限。
