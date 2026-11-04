/**
 * 站点地图: /sitemap.xml
 *
 * 和 rss.xml.ts 一样手写 XML (不额外引依赖), 收录当前构建会真实生成的全部页面:
 *   · 首页 / 文章列表 (含分页) / 归档 / 分类 / 标签云 / 友链 / RSS 入口;
 *   · 每个标签的详情页 (/tags/<hash>, 与 pages/tags/[hash].astro 一一对应);
 *   · 全部已发布文章 (草稿不进入站点地图) 与特殊页面 (关于我)。
 *
 * lastmod 只写有真实日期的条目 (文章发布时间 / 全站最新文章时间), 避免给爬虫假信号。
 */
import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { siteConfig } from "../objects/config";
import { absoluteSiteUrl, escapeXml } from "../objects/seo";
import { sortPostsDescending } from "../objects/posts";
import { tagHash } from "../objects/tags";

type ChangeFreq = "daily" | "weekly" | "monthly";

interface SitemapEntry {
    path: string;
    lastmod?: Date;
    changefreq: ChangeFreq;
    priority: number;
}

export const GET: APIRoute = async () => {
    const posts = sortPostsDescending(await getCollection("posts", ({ data }) => !data.draft));
    const pages = (await getCollection("pages", ({ data }) => !data.draft))
        .sort((left, right) => left.data.title.localeCompare(right.data.title, "zh-CN"));

    // 全站最近一次更新: 用作首页 / 列表页这类聚合页面的 lastmod
    // 取「最后修改时间」(内容变更后由 loader 写回), 缺失时退回发布时间
    const lastUpdated = posts.reduce<Date | undefined>((latest, post) => {
        const current = post.data.lastModified ?? post.data.publishedAt;
        if (!current) return latest;
        return !latest || current > latest ? current : latest;
    }, undefined);

    const entries: SitemapEntry[] = [];
    const add = (entry: SitemapEntry) => entries.push(entry);

    // ── 固定页面 ──
    add({ path: "/", lastmod: lastUpdated, changefreq: "daily", priority: 1.0 });
    add({ path: "/blog", lastmod: lastUpdated, changefreq: "weekly", priority: 0.8 });
    add({ path: "/archives", lastmod: lastUpdated, changefreq: "weekly", priority: 0.6 });
    add({ path: "/categories", lastmod: lastUpdated, changefreq: "weekly", priority: 0.6 });
    add({ path: "/tags", lastmod: lastUpdated, changefreq: "weekly", priority: 0.6 });
    add({ path: "/friends", lastmod: lastUpdated, changefreq: "monthly", priority: 0.5 });
    add({ path: "/rss", lastmod: lastUpdated, changefreq: "monthly", priority: 0.4 });

    // ── 特殊页面 (About.md → /about) ──
    for (const page of pages) {
        add({ path: page.data.path, lastmod: lastUpdated, changefreq: "monthly", priority: 0.6 });
    }

    // ── 文章列表分页 (/blog/2, /blog/3 ...) ──
    const perPage = siteConfig.postsPerPage;
    const totalPages = Math.max(1, Math.ceil(posts.length / perPage));
    for (let page = 2; page <= totalPages; page += 1) {
        add({ path: `/blog/${page}`, lastmod: lastUpdated, changefreq: "weekly", priority: 0.7 });
    }

    // ── 文章详情 ──
    for (const post of posts) {
        add({
            path : post.data.path,
            // 内容改过就是最后修改时间, 没改过则和发布时间一致
            lastmod: post.data.lastModified ?? post.data.publishedAt,
            changefreq: "monthly",
            priority: 0.9,
        });
    }

    // ── 标签详情 (与 tags/[hash].astro 的 getStaticPaths 保持一致) ──
    const tagLatest = new Map<string, Date | undefined>();
    for (const post of posts) {
        const updated = post.data.lastModified ?? post.data.publishedAt;
        for (const tag of post.data.tags) {
            const current = tagLatest.get(tag);
            if (!current || (updated && updated > current)) {
                tagLatest.set(tag, updated);
            }
        }
    }
    for (const [tag, lastmod] of tagLatest) {
        add({
            path      : `/tags/${tagHash(tag)}`,
            lastmod,
            changefreq: "weekly",
            priority  : 0.5,
        });
    }

    const urls = entries.map((entry) => {
        const loc = escapeXml(absoluteSiteUrl(entry.path));
        // toISOString() 是带时区的完整时间, 比只有日期更精确
        const lastmod = entry.lastmod ? `\n    <lastmod>${entry.lastmod.toISOString()}</lastmod>` : "";
        return [
            "  <url>",
            `    <loc>${loc}</loc>${lastmod}`,
            `    <changefreq>${entry.changefreq}</changefreq>`,
            `    <priority>${entry.priority.toFixed(1)}</priority>`,
            "  </url>",
        ].join("\n");
    }).join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

    return new Response(xml, {
        headers: {
            "Content-Type" : "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
        },
    });
};
