/**
 * 订阅源 (RSS / Atom) 共用的正文处理。
 *
 * content layer 里存的 `entry.rendered.html` 还带着 `<img __ASTRO_IMAGE_="...">` 占位符,
 * 只有真正渲染 `<Content />` 时才会换成构建后的图片地址 —— 所以这里用容器 API 把文章渲染一遍,
 * 再整理成适合订阅源的干净 HTML:
 *   ① 代码块还原成纯 <pre><code>: 去掉 shiki 内联配色、行号、工具栏、折叠外壳;
 *   ② div / span 只是布局壳, 拍平后只留里面的内容;
 *   ③ 只保留必要属性, class / style / data-* / aria-* 全部去掉;
 *   ④ 站内相对地址 (/_astro/xxx.webp、/posts/xxx) 补成绝对地址。
 */

import { render, type CollectionEntry } from "astro:content";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { siteOrigin } from "./seo";

/** 订阅源正文里只保留这些属性 (其余都是纯展示用的 CSS 钩子) */
const KEPT_ATTRIBUTES = new Set([
    "href", "src", "alt", "title",
    "width", "height",
    "colspan", "rowspan", "start",
    "datetime", "cite",
    "id", "lang", "dir",
]);

/** 匹配开始标签 (属性值里可能带 ">", 所以按引号成对吃) */
const TAG_PATTERN = /<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;

/** 匹配标签里的属性 (值支持双引号 / 单引号 / 不带引号) */
const ATTRIBUTE_PATTERN = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

/** 从 start 处的 <div ...> 开始, 找到与它配对的 </div> 之后的位置 (按标签计数, 支持嵌套) */
function findDivEnd(html: string, start: number): number {
    const divTag = /<div\b[^>]*>|<\/div>/gi;
    divTag.lastIndex = start;

    let depth = 0;
    let matched: RegExpExecArray | null;
    while ((matched = divTag.exec(html)) !== null) {
        depth += matched[0][1] === "/" ? -1 : 1;
        if (depth === 0) return matched.index + matched[0].length;
    }
    return html.length;
}

/**
 * 代码块 → 纯 <pre><code>。
 *
 * loader 给代码块套了工具栏 / 行号 / 折叠外壳, shiki 又在每个 token 上写了内联配色,
 * 这些在阅读器里只会变成一堆没用的 class / style。这里只保留代码文本:
 *   · 每个 `<span class="line ...">` 就是一行 (开了行号时 loader 把换行符删掉了, 这里补回来);
 *   · 连同外层 `<div class="code-block ...">` 一起替换掉, 工具栏与折叠按钮自然消失。
 */
function normalizeCodeBlocks(html: string): string {
    const preMatches = [...html.matchAll(/<pre\b[^>]*>[\s\S]*?<\/pre>/gi)];
    let result = html;

    // 从后往前替换: 前面的下标不会受后面替换的影响
    for (let index = preMatches.length - 1; index >= 0; index -= 1) {
        const matched = preMatches[index];
        const preStart = matched.index ?? 0;
        const preEnd = preStart + matched[0].length;

        const codeMatch = /<code\b[^>]*>([\s\S]*?)<\/code>/i.exec(matched[0]);
        const rawCode = codeMatch?.[1] ?? matched[0].replace(/^<pre\b[^>]*>|<\/pre>$/gi, "");
        const code = rawCode
            .replace(
                /<span class="line(?=[\s"])[^>]*>/gi,
                // 没开行号时原始换行还在, 不要再补一个
                (open: string, offset: number, whole: string) => (whole[offset - 1] === "\n" ? "" : "\n"),
            )
            .replace(/<[^>]*>/g, "")
            .replace(/^\n+/, "")
            .replace(/\s+$/, "");

        const cleanPre = `<pre><code>${code}</code></pre>`;

        // 外层 <div class="code-block ..."> 的起止位置 (找不到 / 不包住这个 pre 时按孤立 pre 处理)
        const wrapperStart = html.lastIndexOf('<div class="code-block', preStart);
        const wrapperEnd = wrapperStart === -1 ? -1 : findDivEnd(html, wrapperStart);
        const wrapped = wrapperStart !== -1 && wrapperEnd >= preEnd;

        const start = wrapped ? wrapperStart : preStart;
        const end = wrapped ? wrapperEnd : preEnd;
        result = `${result.slice(0, start)}${cleanPre}${result.slice(end)}`;
    }

    return result;
}

/** div / span 只是布局壳; 图标 / 按钮 / 脚本这类装饰性元素直接整块删掉 */
function unwrapLayoutElements(html: string): string {
    return html
        .replace(/<script\b[\s\S]*?<\/script>/gi, "")
        .replace(/<style\b[\s\S]*?<\/style>/gi, "")
        .replace(/<svg\b[\s\S]*?<\/svg>/gi, "")
        .replace(/<button\b[\s\S]*?<\/button>/gi, "")
        .replace(/<\/?(?:div|span)\b[^>]*>/gi, "");
}

/** 逐个开始标签重写: 只保留白名单里的属性, 其余 (class / style / data-* / aria-* …) 全部丢弃 */
function stripAttributes(html: string): string {
    return html.replace(TAG_PATTERN, (raw, tagName: string, attributeText: string) => {
        const attributes: string[] = [];

        let matched: RegExpExecArray | null;
        ATTRIBUTE_PATTERN.lastIndex = 0;
        while ((matched = ATTRIBUTE_PATTERN.exec(attributeText)) !== null) {
            const name = matched[1].toLowerCase();
            const value = (matched[2] ?? matched[3] ?? matched[4] ?? "").replace(/"/g, "&quot;");
            if (value && KEPT_ATTRIBUTES.has(name)) attributes.push(`${name}="${value}"`);
        }

        const suffix = attributes.length > 0 ? ` ${attributes.join(" ")}` : "";
        return `<${tagName}${suffix}>`;
    });
}

/** 把渲染结果整理成订阅源用的干净 HTML */
function cleanFeedHtml(html: string): string {
    const cleaned = stripAttributes(
        unwrapLayoutElements(
            normalizeCodeBlocks(html.replace(/<!--[\s\S]*?-->/g, "")),
        ),
    );

    // 拍平后可能留下空段落
    return cleaned.replace(/<p>\s*<\/p>/gi, "").trim();
}


/** `<a href="/...">` / `<img src="/...">` 这类站内相对地址: 补上站点域名 */
function absolutizeHtmlUrls(html: string): string {
    return html.replace(
        /\b(src|href|poster)=(["'])([^"']*)\2/gi,
        (raw, name: string, quote: string, value: string) => {
            // 已经是绝对地址 / 协议相对地址 / 纯锚点, 保持原样
            if (!value.startsWith("/") || value.startsWith("//")) return raw;
            try {
                // new URL 会保留查询串与锚点 (例如 /go?url=... 中转链接)
                return `${name}=${quote}${new URL(value, `${siteOrigin}/`).href}${quote}`;
            } catch {
                return raw;
            }
        },
    );
}

/** 订阅源正文: 去样式 → 绝对化站内地址 */
export function feedContent(html: string | undefined): string | undefined {
    if (!html) return undefined;
    return absolutizeHtmlUrls(cleanFeedHtml(html));
}

/**
 * 把文章渲染成订阅源用的最终 HTML (图片路径已替换成构建产物)。
 * 返回 Map<entry.id, html>, 两个订阅源端点各调用一次即可 (构建期执行, 不进客户端)。
 */
export async function renderFeedContents(posts: CollectionEntry<"posts">[]): Promise<Map<string, string>> {
    const contents = new Map<string, string>();
    if (posts.length === 0) return contents;

    const container = await AstroContainer.create();
    for (const post of posts) {
        const { Content } = await render(post);
        contents.set(post.id, await container.renderToString(Content));
    }
    return contents;
}
