# Alexandrie 主题与图标调整

本次调整围绕「内容优先、安静的导航、统一的线性图标」。浅色界面使用暖白纸面与浅石色侧栏，深色界面使用石墨背景与略亮的内容卡片，鸢尾紫只用于主要操作和当前选中项。

## 研究参考

- [Linear：How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui)：降低侧边栏、页头和面板的视觉噪声，统一对齐与信息层级；用相同的表面、文字、边框语义维护浅色和深色模式。
- [Lucide 图标库](https://lucide.dev/icons/) 与 [全局样式说明](https://lucide.dev/guide/lucide/advanced/global-styling)：统一 viewBox、描边颜色、尺寸和笔画粗细。本项目选择 1.75px 描边，配合较密集的笔记导航。
- [Lucide 许可证](../frontend/public/app-icons/LUCIDE-LICENSE)：139 个 SVG 随应用本地打包，保留版权与许可，无新增运行时依赖。

## 视觉规范

| 用途 | 浅色 | 深色 |
| --- | --- | --- |
| 内容背景 | `#fffefa` | `#1c1b22` |
| 侧边栏 | `#f4f3ef` | `#18171d` |
| 卡片 | `#ffffff` | `#25242d` |
| 主文字 | `#25232d` | `#f0edf5` |
| 次要文字 | `#706c7a` | `#a49ead` |
| 强调色 | `#6254c7` | `#b4a5f5` |
| 边框 | `#e4e1da` | `#37343f` |

主题继续沿用已有的 CSS 变量及外观设置，支持用户选择强调色和玻璃效果。`--surface-sidebar`、`--surface-card` 和 `--on-primary` 分别描述导航背景、卡片背景和主要按钮的文字颜色。

界面统一使用 Inter 和系统字体，并补充苹方、微软雅黑回退；新用户的文档默认 Inter、1.75 倍行高，已有用户保存的字体偏好仍然生效。

## 主要变化

- 139 个界面图标替换为同一套 Lucide 线性 SVG，保留原文件名与笔记中的图标选择。品牌标识保持原样。
- 修复全局颜色类强制填充 SVG 的问题，图标使用 `currentColor` 描边；数字图标尺寸正确转换为像素。
- 侧栏默认宽度由 390px 调整为 308px；优化搜索框、账号区域、树形导航的间距、截断、展开按钮和选中状态。
- 首页优化标题、搜索、按钮、卡片、分组标题与窄屏网格；主要按钮的加号由真实图标呈现，八种语言的文案去掉重复加号。
- 编辑器的选区、行号栏、面板、光标与差异颜色使用主题变量，避免深色界面出现硬编码的浅色区域。
- 增加键盘焦点提示和减少动态效果支持；主题切换时同步浏览器主题色。

## 验证和预览

运行前端的 `bun run typecheck`、变更文件的 ESLint / Stylelint 和 `bun run build`。浏览器预览采用临时拦截的示例用户和笔记响应，不连接真实后端，也不向真实笔记写入数据。

预览文件位于 [theme-refresh](./assets/theme-refresh/)：

- [浅色桌面](./assets/theme-refresh/light.png)
- [深色桌面](./assets/theme-refresh/dark.png)
- [深色编辑器](./assets/theme-refresh/editor-dark.png)
- [移动端](./assets/theme-refresh/mobile.png)
- [移动端侧栏](./assets/theme-refresh/mobile-sidebar.png)
- [浏览器检查结果](./assets/theme-refresh/checks.json)

浏览器检查覆盖首页搜索与清空、深色切换、编辑器主题、图标引用，以及 320px、390px、768px 下的页面溢出。
