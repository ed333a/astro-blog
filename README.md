## Astro-Glass
一个 Astro 框架搭建的博客, 使用的是毛玻璃透明主题样式。
几乎所有内容都是用 `deepseek v4 pro` 或 `deepseek v4 flash` 对话生成的产物。

## 主题预览
可以前往 [我的博客](https://blog.tyh123.top/blog) 查看

## 配置文件
提供了以下两个配置文件供用户修改配置
- `src/config.yml` (博客的主题配置)
- `src/friendLinks.yml` (友情链接)

## 文档内的嵌入代码
### 展示 git 仓库
语法
- `${github <repo>}` 展示 github 的仓库
- `${gitee <repo>}` 展示 gitee 的仓库

详细介绍: 
- `<repo>` 参数是必填项, 格式为 `用户名/仓库名称`

### 引用站内文章
语法: 
- `${post <ID> [title]}`: 引用站内文章

详细介绍: 
- `<ID>` 是必填项目, 指的是位于文档顶部的 `postID`; 
- ` [title]` 是选填项目，指引用后的链接标题, 若不指定则为文章标题。

### 提示框
语法
- `${note [info|fine|warn|danger] <content>}`

详细介绍: 
- `${note 普通提示}`          → info (灰色, 默认)
- `${note [warn] 注意 ...}`   → warn (黄色)
- `${note [danger] 危险 ...}` → danger (红色)
- `${note [fine] 很好 ...}`   → fine (绿色)

详细介绍: 
- `<content>` 当作正常的 Markdown 解析 (段落 / 列表 / 行内代码 / 代码块 / 链接 … 都能渲染)

## 数学公式

在 `config.yml` 中开启 Latex 表达式渲染的选项后, 可直接使用 Latex 语法来渲染数学公式

