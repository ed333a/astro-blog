/**
 * RSS 2.0 订阅源: /rss.xml
 *
 * 用 @astrojs/rss 生成标准 RSS 2.0 (链接、guid、pubDate、转义都由它处理):
 *   · 只包含已发布文章 (草稿不进入订阅源);
 *   · 每篇文章带 title / link / guid / pubDate / description / category;
 *   · content 输出文章完整正文 (loader 渲染好的 HTML, 由 @astrojs/rss 写成 content:encoded);
 *   · 额外用 atom:updated 标注「最后修改时间」(frontmatter 的 lastModified, 由 loader 自动维护);
 *   · 带 atom:link self, 方便阅读器识别订阅地址。
 * 美化版本的订阅页面在 /rss (见 pages/rss.astro), 两者互不影响。
 */
import type { APIContext } from "astro";
import rss, { type RSSFeedItem } from "@astrojs/rss";
import { siteConfig } from "../objects/config";
import { absoluteUrl } from "../objects/posts";
import { feedContent, renderFeedContents } from "../objects/feeds";
import { getSortedPosts } from "@/objects/collections";

/** atom 命名空间: atom:link (self) 与 atom:updated 都要用它 */
const ATOM_NAMESPACE = "http://www.w3.org/2005/Atom";

export async function GET(context: APIContext) {
    // 获取内容集合, 过滤草稿 (dev 下 getSortedPosts 会带上草稿, 订阅源里不要)
    const posts = (await getSortedPosts()).filter(({ data }) => !data.draft);
    // 正文: 真正渲染一遍 <Content /> (图片占位符才会换成构建产物地址)
    const contents = await renderFeedContents(posts);

    // 全站最后一次更新: 取所有文章「最后修改时间 / 发布时间」里最新的那个
    const lastUpdated = posts.reduce<Date | undefined>((latest, post) => {
        const current = post.data.lastModified ?? post.data.publishedAt;
        if (!current) return latest;
        return !latest || current > latest ? current : latest;
    }, undefined);

    const items: RSSFeedItem[] = posts.map((post) => {
        const { title, description, excerpt, path, publishedAt, lastModified, category, tags } = post.data;
        // 最后修改时间缺失时退回发布时间, 保证 atom:updated 总是有值
        const updated = lastModified ?? publishedAt;

        return {
            title,
            // description 为空时用摘要 (正文前 80 字), 避免订阅列表里出现空白条目
            description: description?.trim() || excerpt,
            link        : `/${path}`,
            pubDate     : publishedAt,
            // 分类 + 标签 (去重: 分类有时会和某个标签同名)
            categories  : [...new Set([...(category ? [category] : []), ...tags])],
            // 正文: 渲染好的 HTML (站内地址已绝对化, 代码块按钮已去掉)
            content     : feedContent(contents.get(post.id)),
            customData  : updated ? `<atom:updated>${updated.toISOString()}</atom:updated>` : undefined,
        };
    });

    return rss({
        title      : siteConfig.title,
        description: siteConfig.description,
        // astro.config.mjs 里配置了 site, 这里回退到 siteConfig.siteUrl 只是兜底
        site       : context.site ?? siteConfig.siteUrl,
        items,
        xmlns      : { atom: ATOM_NAMESPACE },
        // 文章路径是 /posts/xxx 这种无扩展名路径, 不需要再补结尾斜杠
        trailingSlash: false,
        customData : [
            "<language>zh-CN</language>",
            lastUpdated ? `<lastBuildDate>${lastUpdated.toUTCString()}</lastBuildDate>` : "",
            `<atom:link href="${absoluteUrl("rss.xml")}" rel="self" type="application/rss+xml"/>`,
        ].filter(Boolean).join(""),
    });
}

