---
title: 用 Content Collections 管理 Markdown 文章
type: post

draft: false

postID: '2c8e5b7a91f4'

date: 2026-09-20 10:30:00

category: Astro

tags:
- Astro
- Markdown
---

Content Collections 把「一堆散落的 Markdown」变成了有类型的集合: schema 定义一次, 页面里拿到就是校验过的数据, 拼错字段名会在构建时报错, 而不是悄悄渲染出一片空白。

## 为什么不用自己 glob 一堆文件

自己 `import.meta.glob` 当然也能用, 但会立刻遇到三个问题:

- **类型**: frontmatter 是 `any`, 想自动补全只能手写 interface;
- **校验**: `date` 写错格式、`tags` 写成字符串, 都要等你打开页面才发现;
- **生态**: 分页、引用、图片处理这些官方 API 都建立在 collection 之上。

## 定义一个集合

```ts
import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

export const collections = {
  posts: defineCollection({
    // 内容目录可以随便放, 不一定要叫 src/content
    loader: glob({ pattern: "**/*.md", base: "./src/contents/posts" }),
    schema: z.object({
      title: z.string(),
      description: z.string().optional(),
      date: z.date().optional(),
      tags: z.array(z.string()).default([]),
    }),
  }),
};
```

`schema` 里的 `.default()` / `.optional()` 很有用: 模板里可以留空, 页面里拿到的永远是可以直接用的值。

## 渲染正文

集合条目本身只带数据, 正文要用 `render()`:

```astro
---
import { getCollection, render } from "astro:content";

const posts = await getCollection("posts", ({ data }) => !data.draft);
const { Content, headings } = await render(posts[0]);
---

<article>
  <h1>{posts[0].data.title}</h1>
  <Content />
</article>
```

`headings` 是正文里的标题列表, 想加目录的话直接拿它渲染就行。

## 自定义 loader

内置的 `glob()` 够用, 但有些事必须在 Markdown 解析**之前**做: 补全缺失的字段、按模板算永久链接、
把 `${post ...}` 这类引用语法换成真正的链接。这时写一个自定义 loader 反而更省事:

```ts
export function myLoader(): Loader {
  return {
    name: "my-loader",
    load: async (context) => {
      const files = await listMarkdownFiles();
      for (const file of files) {
        const body = transform(file.body);
        const data = await context.parseData({ id: file.id, data: file.data });
        const rendered = await context.renderMarkdown(body, { fileURL: file.url });
        context.store.set({ id: file.id, data, body, rendered, filePath: file.path });
      }
    },
  };
}
```

`context.parseData()` 会用集合的 schema 校验并补全默认值, `context.renderMarkdown()` 则复用 Astro
自己的 Markdown 管线 (包括代码高亮), 所以自定义 loader 出来的东西和内置 loader 完全一致。

## 小结

- 内容目录可以不在 `src/content`, 只要 loader 指对;
- schema 是防线, 默认值让模板可以更简单;
- 需要改正文本身时, 自定义 loader 比 remark 插件更直接 —— 它拿得到集合里其它条目的数据。
