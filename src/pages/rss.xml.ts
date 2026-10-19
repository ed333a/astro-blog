/**
 * RSS 2.0 订阅源: /rss.xml
 *
 * 这里手写 XML (不额外引依赖), 输出标准的 RSS 2.0:
 *   · 只包含已发布文章 (草稿不进入订阅源);
 *   · 每篇文章带 title / link / guid / pubDate / description / category;
 *   · 带 atom:link self, 方便阅读器识别订阅地址。
 * 美化版本的订阅页面在 /rss (见 pages/rss.astro), 两者互不影响。
 */
import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { siteConfig } from "../objects/config";
import { absoluteUrl, sortPostsDescending } from "../objects/posts";

/** XML 特殊字符转义 */
function escapeXml(value: string): string {
    return value.replace(/[<>&'"]/g, (char) => {
        switch (char) {
            case "<": return "&lt;";
            case ">": return "&gt;";
            case "&": return "&amp;";
            case "'": return "&apos;";
            case '"': return "&quot;";
            default : return char;
        }
    });
}

export const GET: APIRoute = async () => {
    const posts = sortPostsDescending(await getCollection("posts", ({ data }) => !data.draft));

    const siteUrl = siteConfig.siteUrl.replace(/\/+$/, "");
    const feedUrl = `${siteUrl}/rss.xml`;
    const lastBuildDate = (posts[0]?.data.date ?? new Date()).toUTCString();

    const items = posts.map((post) => {
        const link = absoluteUrl(post.data.path);
        const pubDate = post.data.date?.toUTCString() ?? new Date().toUTCString();
        const categories = [...new Set([
            ...(post.data.category ? [post.data.category] : []),
            ...post.data.tags,
        ])]
            .map((category) => `      <category>${escapeXml(category)}</category>`)
            .join("\n");

        return [
            "    <item>",
            `      <title>${escapeXml(post.data.title)}</title>`,
            `      <link>${escapeXml(link)}</link>`,
            `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
            `      <pubDate>${pubDate}</pubDate>`,
            `      <description>${escapeXml(post.data.excerpt)}</description>`,
            categories,
            "    </item>",
        ].filter(Boolean).join("\n");
    }).join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(siteConfig.title)}</title>
    <link>${escapeXml(siteUrl)}</link>
    <description>${escapeXml(siteConfig.description)}</description>
    <language>zh-CN</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

    return new Response(xml, {
        headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control" : "public, max-age=3600",
        },
    });
};
