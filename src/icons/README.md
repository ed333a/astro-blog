本地图标目录 (astro-icon 的 iconDir 默认值)。
把 .svg 文件放进来, 就能用 <Icon name="文件名" /> 引用 (不带集合前缀);
需要 Font Awesome 7 之类的现成图标集, 直接写 fa7-solid:xxx 即可, 不用往这里加文件。
这个占位文件只是让目录存在, 免得 astro-icon 构建时提示 "Failed to load icons from src/icons"。

Font Awesome 7 图标库地址: https://icon-sets.iconify.design/fa7-solid/
