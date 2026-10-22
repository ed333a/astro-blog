/**
 * robots.txt: 允许收录全站, 并指向 sitemap.xml。
 *
 * 用端点而不是 public/robots.txt, 是为了让站点地址只来自 config.yml (不会和 sitemap 的域名对不上)。
 * /search.json 是站内搜索用的索引, 对搜索引擎没有价值, 直接排除。
 */
import type { APIRoute } from "astro";
import { absoluteSiteUrl } from "../objects/seo";

export const GET: APIRoute = () => {
    const body = [
        "User-agent: *",
        "Allow: /",
        "",
        "# 站内搜索索引, 不需要收录",
        "Disallow: /search.json",
        "",
        `Sitemap: ${absoluteSiteUrl("sitemap.xml")}`,
        "",
    ].join("\n");

    return new Response(body, {
        headers: {
            "Content-Type" : "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
        },
    });
};
