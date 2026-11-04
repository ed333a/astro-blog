/**
 * SEO 相关的纯函数: 站点绝对地址、canonical 路径、meta 描述裁剪。
 *
 * 站点地址统一取 config.yml 的 siteConfig.siteUrl, 所以 sitemap / robots.txt / canonical
 * 不会出现两套域名。这里只依赖 config, 不引入 node: 模块, 方便 Layout 等组件直接使用。
 */

import { siteConfig } from "./config";

/** 站点根地址 (去掉结尾的 "/", 方便后面拼路径) */
export const siteOrigin = siteConfig.siteUrl.replace(/\/+$/, "");

/**
 * 把任意站内路径规整成 "/a/b" 的形式:
 *   · 去掉查询串 / 哈希;
 *   · 去掉 index.html 之类的构建产物后缀;
 *   · 去掉首尾多余的 "/", 根路径保留为 "/"。
 */
export function normalizeSitePath(pathname: string): string {
    const withoutQuery = pathname.split(/[?#]/, 1)[0] ?? "";
    const withoutIndex = withoutQuery.replace(/\/index\.html?$/i, "/");
    const trimmed = withoutIndex.replace(/^\/+/, "").replace(/\/+$/, "");
    return trimmed ? `/${trimmed}` : "/";
}

/** 站内路径 → 完整绝对地址 (已经是 http(s) 的地址原样返回) */
export function absoluteSiteUrl(pathOrUrl: string): string {
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    return `${siteOrigin}${normalizeSitePath(pathOrUrl)}`;
}

/**
 * XML 特殊字符转义 (sitemap / atom 这类手写 XML 的端点共用)。
 * 已经用于属性值时也能直接套: `&` 会先被转义, 不会跑出第二个 `&amp;` 的问题。
 */
export function escapeXml(value: string): string {
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

/**
 * 裁剪 meta description: 折叠空白、去掉空串, 超长时按字符截断。
 * 没写描述时回落到站点描述, 保证每个页面都有 description。
 */
export function metaDescription(text: string | undefined, fallback: string, maxLength = 160): string {
    const value = (text ?? "").replace(/\s+/g, " ").trim() || fallback;
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

/** 页面级 SEO 参数: 由 PageShell 透传给 Layout */
export interface SeoOptions {
    /** 当前页面在站内的路径 (不含开头的 "/"), 用于 canonical / og:url; 不传则取 Astro.url.pathname */
    path?: string;
    /** 页面类型: 普通页面 website, 文章 article (决定 Open Graph 与结构化数据) */
    type?: "website" | "article";
    /** 分享封面图 (站内路径或完整地址) */
    image?: string;
    /** 页面关键词 (通常由分类 + 标签组成) */
    keywords?: string[];
    /** 文章发布时间 */
    publishedTime?: Date;
    /** 文章最后修改时间 (没传则用发布时间) */
    modifiedTime?: Date;
    /** 文章分类, 输出成 article:section */
    section?: string;
    /** 是否禁止收录 (404 等页面) */
    noindex?: boolean;
    /** 分页的上一页 / 下一页, 输出 link rel="prev" / next */
    prevPath?: string;
    nextPath?: string;
}
