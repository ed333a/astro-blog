/**
 * Markdown 正文的「分段」小工具: 把正文切成「围栏代码块」与「普通文本」两种片段,
 * 这样改写正文时就能跳过代码块里的内容 (否则「怎么写某段语法」这种文章根本没法写出来)。
 *
 * 引用替换 (objects/postReference.ts) 与制表符替换 (objects/codeBlock.ts) 都用它。
 */

interface MarkdownChunk {
    /** 是否是围栏代码块 (``` / ~~~) 里的内容 */
    code: boolean;
    lines: string[];
}

/** 一段正文: code = true 表示这是围栏代码块 (含开闭围栏那两行) */
export interface MarkdownSegment extends MarkdownChunk {}

/** 按围栏代码块把 Markdown 切段 (开闭围栏本身算在代码段里, 原样保留) */
export function splitMarkdownSegments(markdown: string): MarkdownSegment[] {
    const chunks: MarkdownChunk[] = [];
    let fence: { marker: string; length: number } | undefined;

    for (const line of markdown.split("\n")) {
        const opening = /^\s{0,3}(`{3,}|~{3,})/.exec(line);

        if (!fence && opening) {
            fence = { marker: opening[1][0], length: opening[1].length };
            chunks.push({ code: true, lines: [line] });
            continue;
        }

        if (fence) {
            chunks[chunks.length - 1].lines.push(line);
            const markerChar = fence.marker === "`" ? "`" : "~";
            if (new RegExp(`^\\s{0,3}${markerChar}{${fence.length},}\\s*$`).test(line)) {
                fence = undefined;
            }
            continue;
        }

        // 连续的非代码行合并成同一段: 跨行的语法 (比如多行的 :::note ...:::) 才能被整体匹配。
        const last = chunks[chunks.length - 1];
        if (last && !last.code) last.lines.push(line);
        else chunks.push({ code: false, lines: [line] });
    }

    return chunks;
}

/** 只改写「代码块之外」的内容 (引用替换用) */
export function transformOutsideCode(markdown: string, transform: (segment: string) => string): string {
    return splitMarkdownSegments(markdown)
        .map((chunk) => (chunk.code ? chunk.lines.join("\n") : transform(chunk.lines.join("\n"))))
        .join("\n");
}

/**
 * 只改写「围栏代码块之内」的内容 (制表符替换用)。
 * 开闭围栏那两行会原样保留, 只改代码正文 (没闭合的代码块也不会被改坏)。
 */
export function transformInsideCode(markdown: string, transform: (code: string) => string): string {
    return splitMarkdownSegments(markdown)
        .map((chunk) => {
            if (!chunk.code) return chunk.lines.join("\n");

            const opening = chunk.lines[0];
            const openingFence = /^\s{0,3}(`{3,}|~{3,})/.exec(opening)?.[1] ?? "```";
            const markerChar = openingFence[0] === "~" ? "~" : "`";
            const closingPattern = new RegExp(`^\\s{0,3}${markerChar}{${openingFence.length},}\\s*$`);

            const last = chunk.lines[chunk.lines.length - 1];
            const hasClosing = chunk.lines.length > 1 && closingPattern.test(last);
            const body = hasClosing ? chunk.lines.slice(1, -1) : chunk.lines.slice(1);

            return [
                opening,
                ...(body.length > 0 ? [transform(body.join("\n"))] : []),
                ...(hasClosing ? [last] : []),
            ].join("\n");
        })
        .join("\n");
}
