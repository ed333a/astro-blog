/**
 * Content Collections 定义 (Astro Content Layer)。
 *
 * 内容目录不是 Astro 默认的 src/content, 而是:
 *   · 文章     src/contents/posts   → posts 集合
 *   · 特殊页面 src/contents/pages   → pages 集合 (About 等, 用 frontmatter 的 type: about)
 *
 * 两个集合共用 loaders/markdown.ts 这个自定义 loader: 它负责在 Markdown 解析之前补全
 * postID / 永久链接 / 摘要 / 阅读时长, 并把正文里的 ${post ...} 引用换成链接。
 * 所以下面 schema 里的字段 (path / excerpt / readingMinutes / postID ...) 都是 loader 算好的,
 * 这里只做校验与类型生成 —— 页面里通过 getCollection() 拿到的就是这些字段。
 */

import { defineCollection, z } from "astro:content";
import { markdownLoader, PAGES_DIRECTORY, POSTS_DIRECTORY } from "./loaders/markdown";

const documentSchema = z.object({
    // ── frontmatter 里的字段 (模板见 src/contents/posts/README.md) ──
    title      : z.string(),
    description: z.string().optional(),
    /** 文档类型: post(文章) / about(关于我); 决定渲染在哪个页面模板上 */
    type       : z.enum(["post", "about"]),
    /** 草稿: true 时不参与构建 (也不会成为 ${post ...} 引用的目标) */
    draft      : z.boolean().default(false),
    /** 文章 ID: frontmatter 没写时由 loader 按 title + description 的哈希生成 */
    postID     : z.string(),
    /** 发布日期 (解析失败 / 没写时为 undefined) */
    published   : z.date().optional(),
    /** 展示用日期 (YYYY-MM-DD) */
    dateText   : z.string().optional(),
    category   : z.string().optional(),
    tags       : z.array(z.string()).default([]),

    // ── loader 计算出来的字段 ──
    /** 站内路径 (不含开头的 "/"), 由 siteConfig.postPermalink 解析得到 */
    path          : z.string(),
    /** 摘要: frontmatter 的 description, 没有则是正文前 80 字 */
    excerpt       : z.string(),
    /** 阅读时长 (分钟, 粗估) */
    readingMinutes: z.number(),
    /** 字数 (纯文本字数, 与侧边栏「字数」统计同口径: 不含代码块 / 链接语法) */
    wordCount      : z.number().int().nonnegative(),
});

export const collections = {
    posts: defineCollection({
        loader: markdownLoader({
            directory  : POSTS_DIRECTORY,
            defaultType: "post",
            usePermalink: true,
        }),
        schema: documentSchema,
    }),

    pages: defineCollection({
        loader: markdownLoader({
            directory  : PAGES_DIRECTORY,
            defaultType: "about",
            usePermalink: false,
        }),
        schema: documentSchema,
    }),
};
