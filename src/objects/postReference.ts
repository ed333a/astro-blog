/**
 * 文章之间的引用: 把正文里的 `${post <id> [text]}` 换成指向另一篇文章的 Markdown 链接。
 *
 *   ${post 5f2a1c9d3b7e}               → 链接文本 = 被引用文章的标题
 *   ${post 5f2a1c9d3b7e [相关阅读]}     → 链接文本 = 方括号里的内容
 *
 * 注意: 代码块 (``` / ~~~) 与行内代码 (`...`) 里的内容会被跳过 —— 否则「怎么写这个引用语法」
 * 这类文章根本没法写出来。
 */

import { transformOutsideCode } from "./markdownSegments";

const REFERENCE_PATTERN = /\$\{\s*post\s+([^\s[\]}]+)\s*(?:\[([^\]]*)\])?\s*\}/g;

export interface PostReferenceTarget {
    title: string;
    /** 站内路径 (不含开头的 "/") */
    path : string;
}

export type PostReferenceResolver = (id: string) => PostReferenceTarget | undefined;

/** 行内代码 (`...`) 先换成占位符, 处理完再换回来 */
function replaceOutsideInlineCode(text: string, transform: (segment: string) => string): string {
    const masked: string[] = [];
    const placeholder = text.replace(/`[^`\n]*`/g, (raw) => {
        masked.push(raw);
        return `\u0000${masked.length - 1}\u0000`;
    });

    return transform(placeholder).replace(/\u0000(\d+)\u0000/g, (_, index: string) => masked[Number(index)] ?? "");
}

/**
 * 替换正文里的 `${post ...}` 引用。
 * 找不到对应文章时保留原文, 并通过 onMissing 汇报 (构建时会打印警告)。
 */
export function replacePostReferences(
    markdown: string,
    resolve: PostReferenceResolver,
    onMissing?: (id: string) => void,
): string {
    return transformOutsideCode(markdown, (segment) =>
        replaceOutsideInlineCode(segment, (text) =>
            text.replace(REFERENCE_PATTERN, (raw, id: string, label?: string) => {
                const target = resolve(id);
                if (!target) {
                    onMissing?.(id);
                    return raw;
                }

                const text = (label ?? "").trim() || target.title;
                // 方括号会破坏 Markdown 链接语法, 顺手清掉
                const safeText = text.replace(/[[\]]/g, "");
                return `[${safeText}](/${target.path.replace(/^\/+/, "")})`;
            }),
        ),
    );
}
