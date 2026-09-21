# 瓦片与地形功能实施清单

更新日期：2026-09-20

## 实施检查点

功能实现与自动化回归已完成，正在收口发布环境审计。此前“功能实现清单已完成”的判断过早；本清单现在仅保留真实 Windows 原生烟测及仍需扩大覆盖的交互矩阵，目标范围不变。

- 严格项目格式已经升级为 `.pixio v5`；网格、Terrain 规则与 TerrainMap 随项目保存，拒绝旧版本。
- 等距底面尺寸、视觉高度、图像锚点、六边形方向/边长/偏移均已接入 UI、前端/Go 持久化与严格校验。
- 画布已接入单元格轮廓和 Tile/Stamp 图像预览；Terrain 预览与实际重算共用 Blob/循环边界的受影响格集合。自由笔划与直线已改为原始坐标插值后逐点 wrap；多格印章、跨副本矩形和 Terrain 笔刷半径共用文档空间映射。三网格/四种 hex offset 的模块矩阵完整，交互矩阵仍见下方发布验收项。
- 单元格框选、拖动和剪贴板已接入；文档六边形 90° 已开放，并转换 pointy/flat 方向；非方形图块旋转实际 RGBA/index 并交换宽高。Tilemap 内容缩放已保留逻辑 cells/Terrain 并缩放共享资源。共享不同尺寸 Cel 在旋转后可用 Tilemap 局部 hex offset 表达各自奇偶布局，不增加 Tileset、不补空行，也不改变 Terrain wrap 范围。
- Terrain 具有三态单元格、规则矩阵、诊断和局部重算；规则面板已接入六类实际图块场景预览，使用当前规则和真实网格渲染，三网格/双语言/双主题浏览器验收已完成。
- PNG 与 sidecar 已有精确 Tile ID 矩形及成对导入入口；桌面导出重命名已修复并有 Go 测试，颜色规范化、共享引用预检及导入事务已接入。所有预检、Terrain 重算和缓存渲染在克隆文档上完成，成功后才替换当前文档。
- strict v5 会重算并验证 Terrain→Tilemap、Tilemap→RGBA/index 和 indexed index→RGBA 缓存，拒绝陈旧或损坏资源。
- 最新前端验证点：82 个 Vitest 文件、950 项单元/集成测试及 5 项系统 Chrome Playwright E2E 通过，TypeScript 与 Vite 构建通过；Go 全仓 race、vet 和 Windows/amd64 Wails 交叉构建通过。Vite 仍有单包大于 500 kB 警告。
- 最新浏览器检查覆盖无文档启动、中文/英文 × 亮色/暗色，并在正交、等距、pointy/flat 六边形之间切换方向图和六类 Terrain 场景预览。
- Windows/amd64 Wails 交叉构建已于 2026-09-20 19:43 CST 重新生成 `build/bin/Pixtorio.exe`（16,580,096 bytes，SHA-256 `fb38acd351b48141f5b3a008627070a7e04703f7279827dbe2b11cb58765a693`），包含事务 bundle 导入、Terrain 选区权威变换及最终前端门禁状态；尚未在 Windows 启动与执行原生烟测。macOS 构建此前被未接受的 Xcode 许可阻止。

### 审计后待办

- [x] 文档/选区/Stamp 变换完整保留 Terrain，包括规则 mask、flags、随机变体、边界语义和严格保存后的结果一致性；Terrain-managed 单元格选区直接变换 Terrain ID，不再解除 Terrain。
- [x] Tilemap 内容缩放与非正交方向旋转完整工作流：三颜色模式、六种布局、带像素 Terrain、共享/linked Cel、strict v5、Undo/Redo、动画合成和导出管线均有回归；文档六边形 90° 会同步 pointy/flat 和 offset。
- [x] 六边形不同奇偶行列数量的图像边界：前端/Go 使用最多 16 个奇偶边界候选，覆盖四种布局、1/2/3/5 尺寸和 512×512，避免中间行列裁切及全量 spread 栈溢出。
- [x] 不同尺寸 Cel 共享 Tileset 时的变换一致性：Tilemap 可保存严格校验的局部 hex offset，资源仍共享且逻辑行列/Terrain 边界不变。
- [x] 图层复制隔离原层 Terrain 缓冲、保留复制层内部 linked aliases；链接/解链同步 Terrain，复制撤销/重做有回归覆盖。
- [x] 空白 Cel 的 TerrainMap 延迟到有效写入时创建；拾取不创建数据，首次绘制/撤销/重做为一条结构历史，后续普通绘制保留稀疏历史。
- [x] Terrain/手工 Tile 数据来源切换同步完整 linked Cel 组，保留各 Cel 偏移/opacity/zIndex；三网格与三种颜色模式的严格往返、撤销/重做有回归覆盖。
- [x] 非空手工瓦片切入 Terrain、Terrain 切回手工编辑的确认接受/取消流程：系统 Chrome E2E 真实 pointer 手势分别验证取消不修改、接受同步 linked authority、模态手势立即收尾和一次 Undo 恢复。
- [x] MCP `set_tile_cells` 默认拒绝实际改写 Terrain-managed Cel；显式 `detachTerrain: true` 解除 linked 组，空操作不解除，非法批次原子拒绝。
- [x] Auto Tileset 清理保留 Terrain-only 引用，去重同步重映射候选 Tile ID/flags/weight。
- [x] 桌面 PNG/sidecar 导出按最终选择路径更新 `tilesetImage.file`，不注入未知 `image` 字段；磁盘写出及无效描述预检有 Go 测试。
- [x] PNG/sidecar 的 RGBA、grayscale、indexed 导入共用颜色规范化，indexed 先生成索引再生成 canonical RGBA；非零透明索引、调色板 alpha、离板颜色与 strict v5 往返有测试。
- [x] sidecar 共享引用预检排除将被替换的整个 linked 组，接受显式空地形；其他 Terrain-managed Cel 检查逻辑地形引用，不把待重算的 Tile 缓存当作权威数据。
- [x] 完整 PNG/sidecar 成对回导、共享布局变更的端到端测试；覆盖精确 Tile ID rectangle、三颜色模式、四类网格、局部 hex offset、linked/non-target Cel、strict v5、Undo/Redo、2048 上限和所有失败原子不变。
- [x] Tile/Terrain 笔刷、线、矩形、印章、填充共用逻辑单元中心的像素选区裁剪；高等距按底面菱形中心判定，不按图像锚点。填充把未选中单元作为扩散屏障，六边形使用真实六邻接。
- [x] Tile 铅笔、Terrain 笔刷、Tile 像素笔划保留未取模指针轨迹，插值后逐样本 wrap，并处理 pointerup 末段；跨副本直线也走同一路径。浏览器已验证正交 Terrain/Tile 铅笔/Tile 直线只写边界两格。
- [x] Terrain Blob 对角和 wrap 受影响集合提供 dimensions-only API，预览与实际重算共用，四种 hex offset 的逆向边界依赖有测试。
- [x] 跨副本矩形/多格印章、三网格 tiled 与工具裁剪的完整 UI 回归：系统 Chrome E2E 覆盖正交、等距、pointy、flat 的跨右边界铅笔与矩形、两格选区生成 Stamp、边缘裁剪、引用计数和一次 Undo。
- [x] 多格 Tile/Terrain 印章以单元中心经过文档空间 wrap 后映射目标格，写入、轮廓和 Tile 图像预览共用映射；支持 partial/偏移 Cel、显式空 Terrain、skip 和大印章末次覆盖。正交 Tile 印章已验证跨右边界写入和一次撤销，其余交互矩阵仍待验收。
- [x] Tile/Terrain 矩形在未 wrap 的起止格之间生成 outline/filled，再统一映射目标格；Terrain 笔刷半径与其悬停轮廓也走此映射。正交 Tile 3×3 跨右边界矩形浏览器验证为 outline 8 格、filled 9 格。
- [x] 标准 Blob/47-tile 模板：仅保留被两侧 cardinal 支撑的 diagonal，前后端规则解析和严格保存一致，模板生成及缺失诊断仅枚举 47 种。
- [x] 实际 Terrain 分类场景预览完整 UI 验收：六类预览已接入并通过渲染测试；最新页面在正交、等距、pointy/flat 六边形及中文/英文 × 亮色/暗色中均显示孤岛、边缘、外转角、内转角、通道和封闭区域。
- [x] 六类预览数据及渲染模块：5×5 孤岛、边缘、外转角、内转角、通道、封闭区域使用当前 Terrain/seed/boundary/规则、真实 Tilemap 几何和 renderer；只读输入、资源预检、palette/indexed 与灰度有测试。
- [ ] 真实 Windows 环境启动最新 `Pixtorio.exe`，执行原生保存、导出和 MCP 烟测。本机没有 Wine/QEMU/Windows runner，macOS Docker 不能执行 Windows GUI 二进制；双语言/双主题浏览器交互已完成。

### 验证记录

- 共享 Tileset 的不同尺寸六边形 Cel：TilemapData 新增可选局部 `gridOffset`，省略时继承 Tileset；仅 hex 可用且 pointy/flat 严格限制 r/q 轴。文档旋转以首个结果作为共享 Tileset 布局，其余 Cel 仅在必要时保存 override；不复制 Tileset、不填充行列。回归动态选取两个旋转后要求不同 offset 的尺寸，验证顺时针、两种有效布局、渲染缓存、strict v5 往返、逆时针完整还原。几何、选区、tiled stamp、剪贴板、Terrain 重算、JSON/sidecar 和 MCP 读取均使用有效 offset；Go ZIP manifest 使用 `tilemapGridOffset`，覆盖原生往返和非法类型/方向拒绝。
- 规则方向图改用现有 `cellNeighbors` / `cellPolygon` 生成真实几何：等距逻辑 N/E/S/W 位于右上/右下/左下/左上，pointy 与 flat 六边形分别使用正确的物理方向标签，六角连接状态由相邻两边推导，不新增角位数据。10 项几何测试核对唯一位序、包围盒、对边对称、共享边和六角顶点；组件新增 3 项方向/角状态/键盘事件测试。中文亮色浏览器验证等距 N→mask 1、pointy E+NE→mask 3 和连接角、flat 图形与方向；全新页面验证 flat 顶部 N 的 Enter 0→4 / Space 4→0，不误触全局播放。最新页面又完成正交、等距、pointy/flat 与双语言/双主题预览矩阵。
- Tileset 引用明细：新增只读收集器和可折叠列表，按图层/帧顺序列出真实 Cel、保留 linked 实例、包含无 Cel 的引用层，显示 Terrain ID/规则数/候选数；帧号遵循时间轴偏好。6 项测试覆盖过滤、顺序、缺失资源、输入不变、双语/帧编号和单实例 link ID 不误标。全新浏览器标签验证共享层数量更新、图层/Cel/Terrain 点击定位、Terrain 撤销 1→0 / 重做 0→1；四种语言/主题组合检查并修复暗色默认按钮对比度问题。该列表不修改项目内容，无新增持久化字段。
- 最新预览验证：`check`、77 个文件 / 918 项测试、Vite `build` 通过；4 个新增 preview/panel 文件已加入 Git。面板双语言 SSR 验证六个有界画布、错误隔离；算法测试覆盖六场景差异、规则及随机种子更新、正交/高等距/四种 hex offset、索引色/灰度与输入不变。超限检查先于 TerrainMap/Tilemap/RGBA 分配，折叠面板不生成场景。
- 全新中文亮色浏览器标签中通过实际像素绘制得到实色 8×8 图块，再创建 Terrain；已看到孤岛和半平面边缘的真实缩略图，面板可折叠/展开。检查剩余场景时测试标签从浏览器会话中消失（列表为空）；未将剩余截图或主题组合记为完成。
- Blob47：TS 枚举所有 256 种原始邻域，逐个验证归一化、规则命中和 47 种结果；Go 覆盖相同位序、孤立角、canonical 计数、strict ZIP 往返、非法规则读取拒绝和陈旧缓存拒绝。前端完整 47-rule 项目也有 strict 往返/拒绝测试。4-edge 与 Blob 模式的 UI 切换保留 cardinal 方向，折叠规则合并候选；点击角位补齐支撑边，关闭边移除失去支撑的角位。全新中文亮色标签验证 NE→mask 7、模板生成 1/47→47/47、一次 Undo→1/47。
- Tilemap 内容缩放不再拒绝，也不再调用会删除 Terrain 的像素重建路径：保留逻辑地图及 Terrain 三态、规则顺序/权重/seed，缩放共享 tileset RGBA/index/等距 grid/anchor，更新偏移与缓存。尺寸四舍五入到整数且至少 1 像素；因此非整数倍率不是对整幅合成图的无条件逐像素等价缩放。带 flags 的引用先按实际方向采样为复用变体，避免非方形图块留下非法 diagonal，也避免非整数缩放先缩放后翻转的取样差异。
- 缩放测试覆盖全部八种 flags、非整数/非等比/缩小、三颜色模式与六种布局、Terrain、不同尺寸共享 Tileset、linked 缓冲、偏移/opacity/zIndex、strict v5、Undo/Redo；超限预检不修改原文档。全新中文亮色标签验证空白 Tilemap 文档 64×64→128×32、图块 8×8→16×4，一次撤销同时恢复；新增显示/导出管线测试覆盖实际像素 Terrain。
- 通用 tiled cell 映射与印章合计 26 项测试，包含三网格/四种 hex offset、outline/filled 跨左/右/双轴、partial/offcanvas、重复目标和半径笔刷。全新标签验证正交 Tile 矩形跨右边界：3×3 outline 引用数 0→8，Undo 后 filled 同轨迹为 9。
- Blob47 验证点门禁：`check`、75 个文件 / 906 项测试、Vite `build`、Go `test -race ./...` 与 `vet ./...`、Wails Windows/amd64 交叉构建全部通过；大 chunk 警告保留。Windows 原生发布烟测未执行。
- 文档六边形顺/逆时针旋转：四种 offset、1/2/3/4 行列组合逐格核对实际中心坐标的物理 90° 变换；完整 64-mask Terrain 方向检查扩展至 cw/ccw。非方形图块像素/index 与四种合法 flip 组合逐像素验证，flags 规范为无符号数。三种颜色模式、正交/等距/四种 hex 布局验证文档旋转 strict v5 往返，正交另有完整 Cel 像素旋转比对。
- 多格印章新增 12 项映射测试。全新中文亮色浏览器标签验证：64×64 文档、8×8 正交 Tile、水平平铺，2×1 印章从右端落笔使 Tile 引用 2→4，左端拾取为 Tile 1，相邻格为空，一次 Undo 回到 2；非正交/Terrain 印章 UI 尚未完整验收。
- 本轮在全新浏览器标签验证当前版本（英文亮色）：Terrain 跨右边界短笔划的 Tile 引用数 0→2，一次 Undo 回到 0 且移除初建 TerrainMap；Tile 铅笔同样 0→2，另一行 Tile 直线仅增加 2 格。指针轨迹记录显示原始 X 连续经过 61..68，未在输入端提前 wrap；临时日志已移除。
- 发现 `App.tsx` 的 `EditorDocumentStateCommand` 导出使 Vite Fast Refresh 失效，旧标签可能继续运行旧事件处理函数。热更新后旧标签的验证不作为最新代码证据；后续 UI 验收必须全新加载或确认硬刷新生效。
- 首次 Terrain 与手工切换的模块回归覆盖 RGBA/grayscale/indexed × orthogonal/isometric/hexagonal、linked 共享、稀疏后续历史、strict v5 保存读取；Auto 像素编辑后的规则引用保留也有 strict 往返测试。
- 较早英文亮色标签曾显示首次绘制 Undo/Redo 和解除地形确认，但该标签经历过失败的 Fast Refresh，因此不作为最新 UI 证据。当前版本的首次绘制与 Undo 已在上述全新标签重验；确认接受/取消与即时手势收尾仍需完整验收。
- Tilemap 填充改为一次复制输出缓冲后原位写入，不再每个单元复制全图；256×256 填充以及选区屏障/六边形边邻接均有回归。

- Terrain 文档变换后按目标坐标与规则重算 Tile ID 缓存，修复带权重随机变体/稀疏 fallback 规则导致 strict v5 保存失败。覆盖三网格、六边形四种偏移、奇偶尺寸和 wrap 边界的 encode/decode 往返；这不代表变换前后的随机图块外观完全保持。
- 六边形 Terrain mask 使用轴向方向向量变换，不再依赖固定 7×7 探测地图。108 种布局/尺寸/翻转组合逐格比对完整 64-mask 规则结果。
- `npm --prefix frontend run benchmark -- --run` 最新单独运行通过：正交 256×256 全量均值 12.9543ms，等距 256×256 全量 13.5116ms，pointy hex 512×512 全量 77.9318ms，局部 0.0167ms。受影响集合先收集直接变化格，避免全图编辑时反复枚举已知目标的邻居。Vitest 提示模块 getter 有额外开销；这些数值仅为本机算法基准，不是生产 UI 帧率或 Windows 性能保证。
- PNG/sidecar 成对回导新增事务模块：图片名/尺寸/像素、rectangle、共享引用、局部 offset、Cel 上限、Terrain 和缓存全部在克隆文档上验证并重建，任意错误保持原文档深相等。12 种网格/颜色组合及 linked/non-target 共享布局、strict v5、Undo/Redo 通过。
- Terrain 单元格选区翻转/旋转现在直接变换三态 Terrain 数据并全量重算 linked 组，不再切换到手工 Tile authority。document 级测试覆盖 wrap boundary、固定 seed、加权随机候选、indexed cache、strict v5 和 Undo/Redo；Terrain 印章也可直接从单元格选区创建。
- Tilemap 显示/导出管线新增跨正交、等距、pointy/flat 六边形 × RGBA/grayscale/indexed 的集成测试，核对 Terrain 动画帧、洋葱皮、缩略图输入、Sprite Sheet、Packed Atlas 和 strict v5。
- 新增 Playwright 系统 Chrome E2E 门禁（5 项）：双向手工 Tile/Terrain authority 确认覆盖取消、接受、linked 同步与 Undo；正交、等距、pointy、flat 分别执行跨边界铅笔、跨边界矩形、多格选区 Stamp、边缘裁剪及 Undo。`npm --prefix frontend run test:e2e` 全量通过。

## 目标

在现有 Tilemap 基础上，完成可用于游戏地图制作的瓦片集管理、地图编辑、自动地形、导入导出和 MCP 能力。

首版架构必须同时支持以下网格：

- 正交网格（Orthogonal）
- 等距网格（Isometric）
- 六边形网格（Hexagonal）

三种网格应共享 Tileset、历史、序列化和 Terrain 规则基础设施，但坐标换算、邻接关系、命中测试、绘制顺序和规则模板必须分别实现，不能通过正交网格的视觉偏移进行模拟。

## 当前基础

项目目前已经具备：

- Tileset、TilemapData 和 Tilemap 图层模型。
- 图块 ID，以及水平、垂直和对角翻转位。
- 新建 Tilemap 图层和将图像图层转换为 Tilemap。
- 图块绘制和图块内像素绘制。
- Manual、Auto、Stack 三种像素同步模式。
- 图块去重、未引用图块清理和删除引用修复。
- RGBA、grayscale、indexed 图块缓存。
- sparse、partial、linked Cel 支持。
- Tilemap 合成、动画、剪贴板、文档变换和 MCP 操作。
- strict `.pixio v4` Tileset 与 Tilemap 持久化。

现有模型只持久化图块像素、图块 ID、Tilemap 单元格和翻转位，没有网格布局参数、Terrain 定义、Terrain 规则或逻辑地形数据。

## 格式决策

- [x] 决定网格布局和 Terrain 元数据是否必须随项目保存。
- [x] 如果需要随项目保存，明确批准新的严格项目格式版本：`.pixio v5`。
- [x] 不在 strict `.pixio v4` 中悄悄加入可选兼容字段。
- [x] 不增加 v1-v4 迁移器或兼容读取器。
- [x] 新格式继续使用严格校验，拒绝缺失字段、未知引用和非法规则。
- [x] 在格式决策前，可以先实现不改变项目格式的纯算法、UI 原型和本地测试夹具。

建议将以下数据作为项目权威数据：

- Tileset 网格类型和布局参数。
- Terrain 定义与 Terrain 规则。
- Tile 与 Terrain 规则的关联。
- 每个 Terrain Tilemap Cel 的逻辑 Terrain 单元格。
- 随机变体的固定 seed。

渲染后的 Tile ID 和 RGBA 像素继续作为可重建缓存。

## P0：统一网格模型

- [x] 定义 `TileGridKind`：`orthogonal | isometric | hexagonal`。
- [x] 定义统一的 `TileGridLayout`，存储图块尺寸、原点和布局参数。
- [x] 等距网格支持菱形宽高、原点以及绘制顺序。
- [x] 六边形网格支持 pointy-top 和 flat-top。
- [x] 六边形网格支持 odd/even row 或 odd/even column 偏移布局。
- [x] 明确六边形边长、单元格边界框和行列间距的关系。
- [x] 为三种网格实现 `cellToDocument`。
- [x] 为三种网格实现 `documentToCell`。
- [x] 为三种网格实现精确命中测试，不能只检测边界框。
- [x] 为三种网格实现单元格多边形。
- [x] 为三种网格实现网格线生成。
- [x] 为三种网格实现可见单元格范围计算。
- [x] 为三种网格实现邻居枚举。
- [x] 为三种网格实现区域边界扩展。
- [x] 将坐标与邻接逻辑放入独立模块，避免散落在 `App.tsx` 和 `PixelCanvas.tsx`。

建议模块：

```text
frontend/src/editor/tileGrid.ts
frontend/src/editor/tileGridOrthogonal.ts
frontend/src/editor/tileGridIsometric.ts
frontend/src/editor/tileGridHexagonal.ts
frontend/src/editor/tileGrid.test.ts
```

## P0：Tileset 管理

- [x] 增加独立 Tileset 管理面板。
- [x] 支持新建、重命名、复制和删除 Tileset。
- [x] 支持 Tilemap 图层选择并共享已有 Tileset。
- [x] 显示 Tileset 被哪些图层、Cel 和 Terrain 引用；可折叠明细支持点击定位，Cel 帧号遵循偏好并保留 linked 实例。
- [x] 从 PNG 或 Sprite Sheet 导入 Tileset。
- [x] 导入时配置图块尺寸、偏移、间距和透明色。
- [x] 为等距图块配置底面尺寸和视觉高度。
- [x] 为高于单元格的等距图块配置绘制锚点。
- [x] 为六边形图块配置方向、边长和偏移布局。
- [x] 支持图块多选、框选、复制、粘贴和复制为新图块。
- [x] 支持图块重新排序，同时保持稳定 Tile ID。
- [x] 显示 Tile ID、Terrain 归属和引用次数。
- [x] 删除图块前显示受影响的 Terrain 规则和单元格数量。
- [x] 增加 Tileset 缩放、搜索和 Terrain 筛选。

## P0：基础 Tilemap 编辑

- [x] 增加 Tile Picker，从画布读取 Tile ID 和变换状态。
- [x] 增加 Tile Fill。
- [x] 增加 Tile Line。
- [x] 增加 Tile Rectangle。
- [x] 增加 Tile Stamp。
- [x] 增加区域擦除。
- [x] 支持从 Tilemap 单元格选区创建 Stamp。
- [x] Stamp 保留 Tile ID、翻转状态和空单元格。
- [x] 增加单元格选区、移动、复制、剪切和粘贴。
- [x] 增加水平翻转、垂直翻转和旋转命令。
- [x] 明确各网格允许使用的 Tile 变换组合。
- [x] 非方形图块禁止非法对角翻转。
- [x] 等距和六边形旋转按网格方向更新，六边形 90° 同步 pointy/flat、offset、Terrain mask 和 Tile 图像。
- [x] 画布显示当前网格的单元格边界。
- [x] 悬停时显示真实单元格轮廓。
- [x] 绘制前显示笔刷或 Stamp 预览。
- [x] 支持选区裁剪和文档平铺写入，三种网格使用逻辑单元中心与文档空间 wrap。

## P1：Terrain 数据模型

- [x] 新建独立 `terrain.ts`，不要继续扩大 `tilemap.ts`。
- [x] 定义 `TerrainDefinition`：ID、名称、颜色、网格类型和邻域模式。
- [x] 定义 `TerrainRule`：邻接模式、候选 Tile、变换和权重。
- [x] 定义 `TerrainMapData`，保存每个单元格的逻辑 Terrain ID。
- [x] 定义单元格未指定、空白和具体 Terrain 的区别。
- [x] 定义 Terrain 规则缺失时的确定性回退。
- [x] 定义地图边界行为：空白、同地形或循环。
- [x] 定义固定随机 seed 和稳定坐标哈希。
- [x] Terrain 计算结果不得依赖遍历顺序。
- [x] Tile ID 和 RGBA 缓存必须可由 TerrainMapData 与规则重建。
- [x] 修改 Terrain 后只重算受影响单元格及其邻域。
- [x] 区域编辑时去重待重算单元格。
- [x] 清空 Terrain 时重新计算周围边缘。

## P1：各网格 Terrain 规则

### 正交网格

- [x] 首先实现 4 邻域 16-mask。
- [x] 增加 8 邻域 Blob/47-tile 规则。
- [x] 支持内角、外角、孤岛、直线和封闭区域。
- [x] 支持候选图块的加权随机变体。

### 等距网格

- [x] 基于逻辑菱形网格计算邻接，不使用屏幕方向计算。
- [x] 支持 4 邻域 16-mask。
- [x] 将 north/east/south/west 与屏幕菱形边正确映射。
- [x] 支持等距悬崖或高图块的视觉覆盖排序。
- [x] 明确高图块是否影响 Terrain 邻接：不影响。
- [x] 为等距内角和外角提供专用规则预览。

### 六边形网格

- [x] 使用 axial 或 cube 坐标作为规则计算坐标。
- [x] 提供 offset 坐标与 axial/cube 坐标互转。
- [x] 实现 6 邻域规则，邻接 mask 共 64 种组合。
- [x] pointy-top 和 flat-top 使用一致的逻辑方向编号。
- [x] odd/even 偏移不能改变规则语义。
- [x] 实现六边形环、直线和范围枚举，供笔刷与重算使用。
- [x] 为六条边和六个角提供规则编辑预览；角状态由相邻两条边推导，遵循现有 edge6 权威位序。
- [x] 明确是否支持角连接：首版只使用六条共享边。

## P1：Terrain 规则编辑器

- [x] Terrain 列表支持新增、重命名、复制、删除和颜色标识。
- [x] 根据网格类型显示不同的规则矩阵。
- [x] 正交规则编辑器显示 4 邻域或 8 邻域模板。
- [x] 等距规则编辑器使用真实邻接位置的菱形方向图。
- [x] 六边形规则编辑器使用 pointy/flat 对应的六边形方向图。
- [x] 将图块拖放或指定到规则槽位。
- [x] 每条规则允许多个带权重的候选图块。
- [x] 候选图块可配置允许的旋转和翻转。
- [x] 支持从标准模板自动生成规则（edge4 16、Blob47 47、edge6 64；所选图块作为初始候选）。
- [x] 提供孤岛、边缘、转角、通道和封闭区域实时预览。
- [x] 提供规则诊断：缺失 mask、重复规则、未知 Tile ID 和非法变换。
- [x] 规则编辑的每次提交必须可撤销。

## P1：Terrain 编辑工具

- [x] Terrain Brush。
- [x] Terrain Eraser。
- [x] Terrain Picker。
- [x] Terrain Fill。
- [x] Terrain Line。
- [x] Terrain Rectangle。
- [x] Terrain Stamp。
- [x] Terrain 随机散布。
- [x] 支持笔刷半径和形状。
- [x] 六边形笔刷半径使用 hex distance。
- [x] 等距笔刷范围基于逻辑单元格，而不是屏幕像素。
- [x] 支持“重新计算选区”。
- [x] 支持“重新计算当前 Cel”。
- [x] 支持“重新计算使用该 Tileset 的所有 Cel”。
- [x] Terrain 编辑期间显示将被连带更新的邻居，预览与实际重算共用受影响集合。

## 历史与性能

- [x] 新增稀疏 `TilemapCellsCommand`。
- [x] 新增稀疏 `TerrainCellsCommand`。
- [x] 新增 Tileset 和 Terrain 结构命令。
- [x] 一次指针手势只生成一条历史命令。
- [x] Undo/Redo 同时恢复 Terrain、Tile ID、flags、indexes 和 RGBA 缓存。
- [x] 不为每次 Terrain 手势克隆完整 Document。
- [x] 脏区由受影响单元格的文档包围盒计算。
- [x] 等距高图块的脏区包含其视觉溢出范围。
- [x] 六边形脏区使用实际多边形包围盒。
- [x] 大面积编辑使用批量规则计算和一次性缓存刷新。
- [x] 缓存 Terrain 规则的 mask 查询表。
- [x] 为 256×256 和 512×512 单元地图增加性能基准。
- [x] 分别测试正交、等距和六边形地图性能。

## 合成与显示

- [x] 正交图块保持现有行列绘制行为。
- [x] 等距图块按逻辑深度稳定排序。
- [x] 高等距图块允许越过单元格边界显示。
- [x] 六边形图块按行列布局稳定排序。
- [x] 图层 opacity、blend mode、Cel opacity 和 z-index 继续生效。
- [x] onion skin、动画预览和缩略图使用相同布局规则。
- [x] nearest-neighbor 缩放下网格线与图块保持对齐。
- [x] tiled preview 支持三种网格的边界映射。
- [x] reference 图层继续从导出中排除。

## 持久化与严格校验

- [x] 前端与 Go 使用一致的网格枚举和布局校验。
- [x] 校验网格尺寸、六边形方向、偏移模式和等距锚点。
- [x] 校验 Terrain ID 唯一且引用存在。
- [x] 校验 TerrainMapData 尺寸与 TilemapData 一致。
- [x] 校验规则候选 Tile ID、flags 和权重。
- [x] 校验 Terrain 规则与 Tileset 网格类型一致。
- [x] 校验 Terrain 渲染结果与 Tilemap/RGBA 缓存一致。
- [x] 保证 RGBA、grayscale、indexed 项目往返。
- [x] 保证 sparse、partial、linked Cel 项目往返。
- [x] 保证 Tileset、TerrainMapData 和缓存共享关系一致；linked 组共享权威缓冲，局部 hex offset 也必须一致。
- [x] 严格拒绝旧格式、未知字段策略所禁止的输入和损坏资源。

## 导入导出

- [x] Tileset PNG 导入支持三种网格布局。
- [x] Tilemap JSON 导出包含网格类型和布局参数。
- [x] CSV 导出仅用于能无损表达的单层 Tile ID 数据。
- [x] 导出 Tile ID、flags、Terrain ID 和固定 seed。
- [x] 导出 Tileset PNG 与 `pixtorio-tilemap-v1` 元数据。
- [x] 等距导出包含锚点和视觉高度。
- [x] 六边形导出包含方向、图块边界尺寸和共享/局部偏移布局。
- [x] 普通 PNG、GIF、Sprite Sheet 和 Atlas 继续导出最终合成像素。
- [x] 导入失败不得部分修改当前文档。
- [x] 导入和导出操作提供明确的尺寸与规则错误信息。

## MCP

- [x] 读取网格类型和布局参数。
- [x] 创建正交、等距和六边形 Tilemap 图层。
- [x] 读取和修改 Terrain 定义。
- [x] 读取和修改 Terrain 规则。
- [x] 读取和修改 Terrain 单元格区域。
- [x] 请求重算选区、Cel 或 Tileset。
- [x] Terrain 编辑批次保持原子性。
- [x] MCP 编辑后刷新 Tilemap 与 RGBA/index 缓存。
- [x] MCP 错误返回未知 Terrain、非法 mask 和非法布局的具体原因。

## 测试清单

- [x] 三种网格的 cell/document 坐标往返测试。
- [x] 单元格边界和角点命中测试。
- [x] 可见范围和负坐标测试。
- [x] 正交 4/8 邻域测试。
- [x] 等距逻辑方向与屏幕方向映射测试。
- [x] 六边形六方向、距离、环和范围测试。
- [x] Terrain mask 完整覆盖测试。
- [x] 固定 seed 随机变体稳定性测试。
- [x] 局部重算与完整重算结果一致性测试。
- [x] Undo/Redo 和非线性历史跳转测试。
- [x] linked Cel 与 shared Tileset 测试。
- [x] indexed palette 和透明索引测试。
- [x] partial Cel、画布边缘和 tiled preview 的模块测试覆盖三网格、四种 hex offset、裁剪及跨边界映射；完整 UI 矩阵仍见审计待办。
- [x] 序列化 round trip 与损坏输入拒绝测试。
- [x] 合成、动画、缩略图和各类导出测试。
- [x] 中英文、亮色/暗色和无文档启动状态检查。

## 推荐实施顺序

1. 统一网格模型与三种坐标系统。
2. Tileset 管理、导入和共享。
3. Tile Picker、Fill、Stamp、选区和变换工具。
4. Terrain 权威数据模型与格式决策。
5. 正交 4 邻域 Terrain 引擎。
6. 等距 4 邻域 Terrain 引擎和深度排序。
7. 六边形 6 邻域 Terrain 引擎。
8. Terrain 规则编辑器和三种网格预览。
9. 稀疏历史、脏区刷新和性能优化。
10. 严格持久化、导入导出和 MCP。
11. 正交 8 邻域 Blob、复杂变体和多 Terrain 过渡。

## 每阶段完成标准

每个阶段必须同时满足：

- 用户可以从 UI 完成对应工作流。
- 所有编辑均可撤销和重做。
- applicable 的项目数据能够严格序列化和恢复。
- 合成、缩略图、动画和导出结果一致。
- RGBA、grayscale 和 indexed 行为一致。
- sparse、partial 和 linked Cel 行为一致。
- 中英文和亮色/暗色界面可用。
- 单元测试、集成测试和构建检查通过。

不得只完成规则算法或界面原型就将功能标记为完成。
