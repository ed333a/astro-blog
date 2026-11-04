/**
 * Atom 1.0 订阅源: /atom.xml
 *
 * 内容和 /rss.xml 一致 (已发布文章 + 完整正文), 只是换成 Atom 的写法:
 *   · 每条 entry 用 <published> / <updated>, 全文放在 <content type="html">;
 *   · 正文做 XML 转义而不是 CDATA —— 代码里出现 "]]>" 也不会把整个 feed 弄坏;
 *   · <updated> 取 lastModified (内容变更时由 loader 自动写回), 没有就用发布时间。
 * RSS 2.0 请用 /rss.xml, 人类可读的订阅入口在 /rss。
 */
import { authorConfig, siteConfig } from "../objects/config";
import { escapeXml, siteOrigin } from "../objects/seo";
import { feedContent, renderFeedContents } from "../objects/feeds";
import { getSortedPosts } from "@/objects/collections";

export async function GET() {
    // 只订阅已发布文章 (dev 下 getSortedPosts 会带上草稿)
    const posts = (await getSortedPosts()).filter(({ data }) => !data.draft);
    // 正文: 真正渲染一遍 <Content /> (图片占位符才会换成构建产物地址)
    const contents = await renderFeedContents(posts);

    const feedUrl = `${siteOrigin}/atom.xml`;
    const homeUrl = `${siteOrigin}/`;
    // 极端情况 (一篇文章都没有) 的更新时间兜底: 站点建立时间
    const fallbackDate = new Date(siteConfig.startDate);

    const entries = posts.map((post) => {
        const { title, description, excerpt, path, publishedAt, lastModified, category, tags } = post.data;
        const url = `${siteOrigin}/${path.replace(/^\/+/, "")}`;
        // <updated> 是 Atom 的必填项: 最后修改时间 → 发布时间 → 站点建立时间
        const updated = lastModified ?? publishedAt ?? fallbackDate;
        const summary = description?.trim() || excerpt;
        const content = feedContent(contents.get(post.id));
        // 分类 + 标签 (去重), 输出成 <category term="..."/>
        const categories = [...new Set([...(category ? [category] : []), ...tags])];

        return [
            "<entry>",
            `<id>${escapeXml(url)}</id>`,
            `<title>${escapeXml(title)}</title>`,
            `<link href="${escapeXml(url)}" rel="alternate" type="text/html"/>`,
            publishedAt ? `<published>${publishedAt.toISOString()}</published>` : "",
            `<updated>${updated.toISOString()}</updated>`,
            `<summary type="text">${escapeXml(summary)}</summary>`,
            content ? `<content type="html">${escapeXml(content)}</content>` : "",
            ...categories.map((tag) => `<category term="${escapeXml(tag)}"/>`),
            "  </entry>",
        ].filter(Boolean);
    });

    // feed 的 <updated>: 全站最近一次更新 (与 rss 的 lastBuildDate 同一口径)
    const feedUpdated = posts.reduce<Date>((latest, post) => {
        const current = post.data.lastModified ?? post.data.publishedAt;
        return current && current > latest ? current : latest;
    }, fallbackDate);

    const xml = 
        `<?xml version="1.0" encoding="utf-8"?>` + 
        `<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="zh-CN">` +
        `<id>${escapeXml(feedUrl)}</id>` +
        `<subtitle>${escapeXml(siteConfig.description)}</subtitle>` +
        `<link href="${escapeXml(homeUrl)}" rel="alternate" type="text/html"/>` +
        `<link href="${escapeXml(feedUrl)}" rel="self" type="application/atom+xml"/>` +
        `<updated>${feedUpdated.toISOString()}</updated>` +
        `<author>` +
        `<name>${escapeXml(authorConfig.name)}</name>` +
        `<uri>${escapeXml(homeUrl)}</uri>` +
        `</author>` +
        entries +
        `</feed>`;

    return new Response(xml, {
        headers: {
            "Content-Type" : "application/atom+xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
        },
    });
}
