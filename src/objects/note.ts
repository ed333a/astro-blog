/**
 * 提示框: 把正文里的 `${note [warn|info|danger|fine] <content>}` 换成带颜色的提示框。
 *
 *   ${note 普通提示}            → info (灰色, 默认)
 *   ${note [warn] 注意 ...}     → warn (黄色)
 *   ${note [danger] 危险 ...}   → danger (红色)
 *   ${note [fine] 很好 ...}     → fine (绿色)
 *
 * 输出的是块级 HTML <div>, 并在 content 前后各留一个空行 —— 这样主 Markdown 渲染管线会把
 * content 当作正常的 Markdown 解析 (段落 / 列表 / 行内代码 / 代码块 / 链接 … 都能渲染), 再被这个 <div> 包起来。
 * 代码块与行内代码里的 `${note ...}` 会被跳过 (方便在文章里写这个语法本身);
 * 反过来, 提示框的 content 里也可以包含代码块。
 */

import { splitMarkdownSegments } from "./markdownSegments";

export type NoteType = "info" | "warn" | "danger" | "fine";

// 第二段 [warn|info|danger|fine] 可选; 不写时默认 info
const NOTE_PATTERN = /\$\{\s*note\b\s*(?:\[\s*(warn|info|danger|fine)\s*\])?\s*([\s\S]*?)\s*\}/g;

/** 提示框的基础样式 (四种类型共用) */
const NOTE_BASE =
    "block max-w-full rounded-xl border-l-4 px-4 py-3 text-sm leading-relaxed text-ink";

/** 四种强调色: 左边框用实色, 背景用同色系的半透明底 */
const NOTE_STYLES: Record<NoteType, string> = {
    info  : "border-gray-400/80 bg-gray-500/15",
    warn  : "border-yellow-400 bg-yellow-400/15",
    danger: "border-red-500 bg-red-500/15",
    fine  : "border-green-500 bg-green-500/15",
};

/** 把内容包成块级提示框; 内容前后留空行, 让外层 Markdown 把 content 当作块级 Markdown 解析 */
function buildNote(rawType: string | undefined, content: string): string {
    const type: NoteType = (rawType as NoteType | undefined) ?? "info";
    return `\n\n<div class="note ${NOTE_BASE} ${NOTE_STYLES[type]}">\n\n${content.trim()}\n\n</div>\n\n`;
}

/**
 * 替换正文里的 `${note ...}` 提示框。
 *
 * 分三步, 让「content 里可以写代码块 / 行内代码」和「代码块里可以写 ${note ...} 本身」同时成立:
 *   ① 围栏代码块 → 占位符 (提示框内部可以包含代码块, 代码示例里的语法也不会被误替换);
 *   ② 行内代码 → 占位符 (避免 content 里的 `}` 提前结束匹配);
 *   ③ 匹配并替换提示框, 最后把占位符按原样还原。
 */
export function replaceNotes(markdown: string): string {
    // ① 围栏代码块 → 占位符
    const codeBlocks: string[] = [];
    const withoutCodeBlocks = splitMarkdownSegments(markdown)
        .map((segment) => {
            if (!segment.code) return segment.lines.join("\n");
            const index = codeBlocks.push(segment.lines.join("\n")) - 1;
            return `\u0001C${index}\u0001`;
        })
        .join("\n");

    // ② 行内代码 → 占位符
    const inlineCodes: string[] = [];
    const withoutInlineCodes = withoutCodeBlocks.replace(/`[^`\n]*`/g, (raw) => {
        const index = inlineCodes.push(raw) - 1;
        return `\u0002I${index}\u0002`;
    });

    // ③ 替换提示框, 再还原占位符
    const replaced = withoutInlineCodes.replace(NOTE_PATTERN, (_raw, rawType: string | undefined, content: string) =>
        buildNote(rawType, content),
    );

    return replaced
        .replace(/\u0002I(\d+)\u0002/g, (_, index: string) => inlineCodes[Number(index)] ?? "")
        .replace(/\u0001C(\d+)\u0001/g, (_, index: string) => codeBlocks[Number(index)] ?? "");
}
