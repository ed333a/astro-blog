/**
 * 站外链接代理: 把博客里的外部链接统一转到 /go 中转页, 提醒访客即将离开本站。
 *
 * 全部在「构建 / 渲染阶段」完成 (不靠前端拦截点击): 链接在输出 HTML 之前就被改写成
 * /go?url=<encoded>。只有 Artalk 评论里的外链是第三方在客户端渲染的, 渲染阶段够不着,
 * 由 components/ArtalkComment.astro 里的前端事件委托兜底。
 */
import { externalLinksConfig, siteConfig } from "./config";

function hostnameOf(url: string): string | null {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return null;
    }
}

/** 站点自身的域名 (自动视为受信任, 站内绝对地址不走代理) */
const siteHost = hostnameOf(siteConfig.siteUrl);

/** 中转页路径 (固定 /go) */
export const proxyPath = "/go";

/** 是否是 http(s) 外链 (站内相对路径 / 其它协议都不算) */
export function isExternalUrl(url: string): boolean {
    return /^https?:\/\//i.test(url);
}

/**
 * 域名是否命中受信任列表:
 *   · 精确匹配 example.com;
 *   · *.example.com / .example.com 匹配该域本身及其所有子域。
 * 站点自身域名始终受信任。
 */
export function isTrustedHost(host: string): boolean {
    const target = host.toLowerCase();
    if (!target) return false;
    if (siteHost && target === siteHost) return true;

    return externalLinksConfig.trustedDomains.some((pattern) => {
        const p = pattern.trim().toLowerCase();
        if (!p) return false;
        if (p === target) return true;
        if (p.startsWith("*.") || p.startsWith(".")) {
            const base = p.replace(/^\*\./, "");
            return target === base || target.endsWith("." + base);
        }
        return false;
    });
}

/** URL 是否受信任 (直接跳转, 不走代理) */
export function isTrustedUrl(url: string): boolean {
    const host = hostnameOf(url);
    return host !== null && isTrustedHost(host);
}

/** 生成中转链接 /go?url=<encoded> */
export function proxyUrl(url: string): string {
    return `${proxyPath}?url=${encodeURIComponent(url)}`;
}

/**
 * 把一条链接按规则改写:
 *   功能关闭 / 非 http(s) / 受信任 → 原样返回; 否则返回 /go 中转链接。
 */
export function rewriteExternalUrl(url: string): string {
    if (!externalLinksConfig.enable) return url;
    if (!isExternalUrl(url)) return url;
    if (isTrustedUrl(url)) return url;
    return proxyUrl(url);
}

/**
 * 改写一段 HTML 里所有 <a href> (用于 Markdown 渲染结果、以及正文里注入的原始 HTML)。
 * 只改 http(s) 且非受信任的链接; 代码块里的 HTML 已被 shiki 转义 (尖括号变成 &lt;),
 * 所以不会误伤。改写后顺手去掉 target / rel, 让中转页在当前标签页打开。
 */
export function rewriteExternalLinksInHtml(html: string): string {
    if (!externalLinksConfig.enable) return html;
    return html.replace(/<a\b[^>]*>/gi, (tag) => {
        const hrefMatch = /href="([^"]*)"/i.exec(tag);
        if (!hrefMatch) return tag;

        const original = hrefMatch[1];
        const rewritten = rewriteExternalUrl(original);
        if (rewritten === original) return tag;

        return tag
            .replace(/href="[^"]*"/i, `href="${rewritten}"`)
            .replace(/\s+target="[^"]*"/i, "")
            .replace(/\s+rel="[^"]*"/i, "");
    });
}
