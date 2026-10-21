/**
 * 代码块 (见 config.yml 的 codeBlock) 的渲染前处理。
 *
 * 渲染流程: Markdown → Astro/satteri 交给 shiki 高亮, 得到 <pre class="astro-code ..."> (双主题配色)
 *          → 本文件给它套上工具栏 / 行号 / 折叠外壳。
 * 之所以在构建期就生成标记 (而不是等脚本跑起来再补), 是为了首帧就是完整的代码块, 不会闪一下；
 * 复制 / 折行 / 折叠的交互由 components/CodeBlockTools.astro 用事件委托接管。
 *
 * 用到的配置:
 *   showLineNumber       行号 (Tailwind 的计数器工具类: counter-increment + content-[counter(...)])
 *   fold_at              超过多少行折叠, <= 0 不折叠 (max-height + 底部渐变遮罩)
 *   wordwrap             初始折行状态 (状态写在容器的 data-wrap 上, 由 group-data-[wrap=on] 驱动)
 *   wordWrapToggleButton 是否显示折行开关
 *   copyButton           是否显示复制按钮
 *   tabReplace / tabSize 制表符替换 (留空 = 不替换)
 */

import { splitMarkdownSegments, transformInsideCode } from "./markdownSegments";

export interface CodeBlockOptions {
    showLineNumber      : boolean;
    foldAt              : number;
    wordwrap            : boolean;
    wordWrapToggleButton: boolean;
    copyButton          : boolean;
    fontSize            : number;
}

/** 正文里各代码块的 info string (按出现顺序), 用来在工具栏上标出语言 */
export function collectCodeFenceLanguages(body: string): string[] {
    return splitMarkdownSegments(body)
        .filter((segment) => segment.code)
        .map((segment) => /^\s{0,3}(?:`{3,}|~{3,})\s*([^\s`~]*)/.exec(segment.lines[0])?.[1] || "text");
}

/** 把代码块里的制表符换成配置指定的内容 (tabReplace 为空 = 保持原样) */
export function replaceTabsInCodeBlocks(body: string, tabReplace: string, tabSize: number): string {
    if (!tabReplace) return body;

    // 「tab 替换长度」= 一个制表符最终占多少字符宽, 不够就重复填充
    const repeats = Math.max(1, Math.ceil(tabSize / tabReplace.length));
    const replacement = tabReplace.repeat(repeats);

    return transformInsideCode(body, (code) => code.replace(/\t/g, replacement));
}

function escapeAttribute(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ── 图标: 与项目其它图标同一套写法 (24 视窗 + currentColor 描边) ── */
const ICON_ATTRIBUTES = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

const ICON_PATH = {
    copy    : '<path d="M9 9V5.5A1.5 1.5 0 0 1 10.5 4h8A1.5 1.5 0 0 1 20 5.5v8a1.5 1.5 0 0 1-1.5 1.5H15"></path><rect x="4" y="9" width="11" height="11" rx="2"></rect>',
    check   : '<path d="m5 13 4.5 4.5L19 7"></path>',
    wrapOff : '<path d="M4 6h16M4 12h16M4 18h16"></path>',
    wrapOn  : '<path d="M4 6h16M4 12h11.5a3 3 0 0 1 0 6H11"></path><path d="m14 15-3 3 3 3"></path>',
    foldDown: '<path d="m6 9 6 6 6-6"></path>',
    foldUp  : '<path d="m6 15 6-6 6 6"></path>',
} as const;

/* ── 工具栏控件: 状态全部读容器上的 data-* (group-data-[...] 变体), 视觉切换用 transition, 不需要脚本参与 ── */
const BUTTON_CLASSES = [
    "flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold",
    "text-black/55 transition duration-300 ease-out hover:bg-black/10 hover:text-black/85",
    "dark:text-white/55 dark:hover:bg-white/10 dark:hover:text-white/85",
].join(" ");

const ICON_SLOT_CLASSES = "relative inline-flex h-3.5 w-3.5 items-center justify-center";
const ICON_VISIBLE       = "h-3.5 w-3.5 transition duration-300 ease-out";
const ICON_HIDDEN        = "absolute inset-0 h-3.5 w-3.5 scale-0 opacity-0 transition duration-300 ease-out";

/** 复制按钮: 成功后换成对勾 + 绿色底, 并跑一次 tool-pop 动画 (keyframes 在 global.css 的 @theme 里) */
function copyButtonMarkup(): string {
    return `<button type="button" data-code-copy data-label-idle="复制" data-label-done="成功" data-label-error="失败" aria-label="复制代码"
            class="${BUTTON_CLASSES} group/copy data-[copied=ok]:animate-tool-pop data-[copied=ok]:bg-emerald-500/15 data-[copied=ok]:text-emerald-700 data-[copied=error]:bg-rose-500/15 data-[copied=error]:text-rose-700 dark:data-[copied=ok]:bg-emerald-400/15 dark:data-[copied=ok]:text-emerald-300 dark:data-[copied=error]:bg-rose-400/15 dark:data-[copied=error]:text-rose-300">
            <span class="${ICON_SLOT_CLASSES}">
                <svg ${ICON_ATTRIBUTES} class="${ICON_VISIBLE} group-data-[copied=ok]/copy:scale-0 group-data-[copied=ok]/copy:opacity-0">${ICON_PATH.copy}</svg>
                <svg ${ICON_ATTRIBUTES} class="${ICON_HIDDEN} ease-pop group-data-[copied=ok]/copy:scale-100 group-data-[copied=ok]/copy:opacity-100">${ICON_PATH.check}</svg>
            </span>
            <span data-code-label>复制</span>
        </button>`;
}

/** 折行开关: 状态写在容器的 data-wrap 上 (aria-pressed 同步维护), 图标交叉淡入淡出 */
function wrapButtonMarkup(pressed: boolean): string {
    return `<button type="button" data-code-wrap aria-pressed="${pressed}" aria-label="切换代码自动换行" data-label-on="换行: 开" data-label-off="换行: 关"
            class="${BUTTON_CLASSES} group-data-[wrap=on]:bg-black/10 group-data-[wrap=on]:text-black/85 dark:group-data-[wrap=on]:bg-white/10 dark:group-data-[wrap=on]:text-white/85">
            <span class="${ICON_SLOT_CLASSES}">
                <svg ${ICON_ATTRIBUTES} class="${ICON_VISIBLE} group-data-[wrap=on]:scale-0 group-data-[wrap=on]:opacity-0">${ICON_PATH.wrapOff}</svg>
                <svg ${ICON_ATTRIBUTES} class="${ICON_HIDDEN} ease-pop group-data-[wrap=on]:scale-100 group-data-[wrap=on]:opacity-100">${ICON_PATH.wrapOn}</svg>
            </span>
            <span data-code-label>${pressed ? "换行: 开" : "换行: 关"}</span>
        </button>`;
}

/** 折叠开关: 状态写在容器的 data-folded 上 */
function foldButtonMarkup(folded: boolean): string {
    return `<button type="button" data-code-fold aria-expanded="${!folded}" aria-label="展开或收起代码块" data-label-folded="展开" data-label-expanded="收起"
            class="${BUTTON_CLASSES}">
            <span class="${ICON_SLOT_CLASSES}">
                <svg ${ICON_ATTRIBUTES} class="${ICON_VISIBLE} group-data-[folded=true]:scale-0 group-data-[folded=true]:opacity-0">${ICON_PATH.foldDown}</svg>
                <svg ${ICON_ATTRIBUTES} class="${ICON_HIDDEN} ease-pop group-data-[folded=true]:scale-100 group-data-[folded=true]:opacity-100">${ICON_PATH.foldUp}</svg>
            </span>
            <span data-code-label>${folded ? "展开" : "收起"}</span>
        </button>`;
}

/** 折叠后的底部展开按钮: 和顶部折叠按钮一样认 data-code-fold, 只是固定在代码块底部, 折叠时才显示 */
function bottomExpandButtonMarkup(): string {
    return `<button type="button" data-code-fold aria-expanded="false" aria-label="展开代码块" data-label-folded="展开" data-label-expanded="收起"
            class="absolute inset-x-0 bottom-3 z-10 mx-auto hidden w-fit cursor-pointer items-center gap-1.5 rounded-full border border-black/10 bg-black/5 px-3 py-1.5 text-[12px] font-semibold text-black/65 shadow-sm transition duration-300 ease-out hover:bg-black/10 hover:text-black/85 dark:border-white/10 dark:bg-white/5 dark:text-white/65 dark:hover:bg-white/10 dark:hover:text-white/85 group-data-[folded=true]:flex">
            <svg ${ICON_ATTRIBUTES} class="h-3.5 w-3.5">${ICON_PATH.foldDown}</svg>
            <span data-code-label>展开</span>
        </button>`;
}

const PRE_PATTERN = /<pre\b([^>]*)>([\s\S]*?)<\/pre>/g;

/**
 * 把每一行 (shiki 的 <span class="line">…</span>) 的正文包进 <span class="line-content">。
 * 这样行号与正文可以排成两个 flex 列: 行号吸在左边, 正文在自己的列里折行。
 * shiki 的输出只用 <span>, 所以按 <span> / </span> 数深度就能找到每行的闭合标签。
 */
function wrapLineContents(html: string): string {
    const lineOpen = '<span class="line">';
    const contentOpen = '<span class="line-content flex-auto min-w-0">';
    let result = "";
    let cursor = 0;

    while (true) {
        const openIndex = html.indexOf(lineOpen, cursor);
        if (openIndex < 0) {
            result += html.slice(cursor);
            break;
        }

        const contentStart = openIndex + lineOpen.length;
        let depth = 1;
        let i = contentStart;

        while (i < html.length && depth > 0) {
            const nextOpen = html.indexOf("<span", i);
            const nextClose = html.indexOf("</span>", i);
            if (nextClose < 0) {
                i = html.length;
                break;
            }
            if (nextOpen >= 0 && nextOpen < nextClose) {
                depth += 1;
                i = nextOpen + "<span".length;
            } else {
                depth -= 1;
                i = nextClose + "</span>".length;
            }
        }

        if (depth !== 0) {
            // 没找到闭合 (不应该发生), 原样保留剩下的内容
            result += html.slice(cursor);
            break;
        }

        const closeStart = i - "</span>".length;
        result += html.slice(cursor, contentStart) + contentOpen + html.slice(contentStart, closeStart) + "</span>" + html.slice(closeStart, i);
        cursor = i;
    }

    return result;
}

/**
 * 给每个 <pre> 套上代码块外壳 (工具栏 + 行号 + 折叠渐变)。
 * 语言按「正文里代码块的出现顺序」对齐 —— 两者来自同一份 Markdown, 顺序天然一致。
 */
export function decorateCodeBlocks(html: string, options: CodeBlockOptions, languages: string[]): string {
    let index = 0;

    return html.replace(PRE_PATTERN, (_raw, attributes: string, inner: string) => {
        // 语言优先读 Astro 写在 <pre> 上的 data-language; 没有时退回「正文里代码块的出现顺序」
        const declaredLanguage = /\bdata-language="([^"]*)"/.exec(attributes)?.[1];
        const language = declaredLanguage || languages[index] || "text";
        index += 1;

        const styleAttribute = /style="([^"]*)"/.exec(attributes)?.[1] ?? "";
        const lightBackground = (/background-color\s*:\s*([^;"]+)/.exec(styleAttribute)?.[1] ?? "#ffffff").trim();
        const darkBackground  = (/--shiki-dark-bg\s*:\s*([^;"]+)/.exec(styleAttribute)?.[1] ?? "#24292e").trim();

        const lineSpans = inner.match(/class="line"/g)?.length ?? 0;
        const lineCount = lineSpans > 0 ? lineSpans : Math.max(1, inner.split("\n").length);
        const folding   = options.foldAt > 0 && lineCount > options.foldAt;
        const wrapOn    = options.wordwrap;

        // 行号做成每行的一个 flex 列:
        //   · .line 是 flex 容器; 行号是它的第一个 flex 项 (::before), 固定宽度, align-self: stretch
        //     让行号底色铺满整行高度 (换行时也一样), 代码放在第二个 flex 项 .line-content 里;
        //   · 行号 sticky 在左边, 关闭换行时 <pre> 横向滚动, 行号保持不动;
        //   · 行号从代码块最左边开始并带底色, 横向滚动时代码不会从行号左侧 / 后面透出来。
        const lineClasses = options.showLineNumber
            ? ' flex [counter-increment:code-line] before:flex-none before:w-14 before:shrink-0 before:pr-3 before:text-right before:text-black/35 before:select-none before:content-[counter(code-line)] dark:before:text-white/35 before:sticky before:left-0 before:z-10 before:self-stretch before:bg-[var(--code-bg)] dark:before:bg-[var(--code-bg-dark)]'
            : "";

        // <code> 让宽度随内容撑开 (w-max), 这样 sticky 行号的包含块才有足够的横向空间;
        // 开启换行时回到 auto, 让文字正常折行。
        const codeClasses = options.showLineNumber
            ? 'block w-max min-w-full group-data-[wrap=on]:w-auto'
            : "";

        // 行号模式下给每行正文套一个 .line-content: 行号与正文 = 两个 flex 列, 正文在自己的列里折行。
        let decoratedInner = (options.showLineNumber ? wrapLineContents(inner) : inner)
            .replace(/<code\b([^>]*)>/, (_match, attributes: string) => {
                if (!codeClasses) return `<code${attributes}>`;
                return /\bclass="/.test(attributes)
                    ? `<code${attributes.replace(/\bclass="([^"]*)"/, (_current, current: string) => `class="${current} ${codeClasses}"`)}>`
                    : `<code${attributes} class="${codeClasses}">`;
            })
            .replace(/class="line"/g, `class="line${lineClasses}"`);

        if (options.showLineNumber) {
            // .line 变成块级 flex 后, shiki 用来分行的换行符会变成空白行, 去掉它们
            decoratedInner = decoratedInner
                .replace(/\n(?=<span class="line)/g, "")
                .replace(/\n(?=<\/code>)/g, "");
        }

        // <pre> 自己: 保留 shiki 的行内配色 (日间 github-light + --shiki-dark-* 变量), 只补排版与夜间配色工具类。
        // 行号模式下左侧不留 padding, 让行号槽从代码块最左边开始 (横向滚动时行号始终贴着左边)。
        const preClasses = [
            options.showLineNumber
                ? "m-0 overflow-x-auto py-3 pr-4 font-mono leading-[1.7] tab-4"
                : "m-0 overflow-x-auto px-4 py-3 font-mono leading-[1.7] tab-4",
            "group-data-[wrap=on]:whitespace-pre-wrap group-data-[wrap=on]:break-words",
            // shiki-theme: 夜间把行内的 github-light 配色换成 --shiki-dark-* (行内样式只能用 !important 盖)
            "shiki-theme",
        ].join(" ");
        const decoratedAttributes = /\bclass="/.test(attributes)
            ? attributes.replace(/\bclass="([^"]*)"/, (_matched, current: string) => `class="${current} ${preClasses}"`)
            : `${attributes} class="${preClasses}"`;

        const bodyClasses = [
            "relative overflow-hidden leading-[1.7] [counter-reset:code-line]",
            folding
                // 折叠: 用 max-height 收起来; 展开时给一个「够用」的高度而不是 none —— none 没法做过渡
                ? "max-h-[var(--code-fold-full)] transition-[max-height] duration-500 ease-out group-data-[folded=true]:max-h-[var(--code-fold-h)]"
                : "",
        ].filter(Boolean).join(" ");

        const styleVariables = [
            `--code-bg:${lightBackground}`,
            `--code-bg-dark:${darkBackground}`,
            `font-size:${options.fontSize}px`,
            // 折叠高度 = 行数 × 行高 + <pre> 顶部内边距 (0.75rem 即 py-3)
            folding ? `--code-fold-h:calc(${options.foldAt}lh + 0.75rem)` : "",
            folding ? `--code-fold-full:calc(${lineCount}lh + 1.75rem)` : "",
        ].filter(Boolean).join(";");

        const buttons = [
            options.wordWrapToggleButton ? wrapButtonMarkup(wrapOn) : "",
            options.copyButton ? copyButtonMarkup() : "",
            folding ? foldButtonMarkup(folding) : "",
        ].filter(Boolean).join("");

        return `<div class="code-block group relative my-6 overflow-hidden rounded-[var(--radius-code-block)] border border-black/10 bg-[var(--code-bg)] dark:border-white/10 dark:bg-[var(--code-bg-dark)]"
            data-code-block data-language="${escapeAttribute(language)}" data-wrap="${wrapOn ? "on" : "off"}" data-folded="${folding}" style="${styleVariables}">
            <div class="flex items-center justify-between gap-3 border-b border-black/10 bg-black/5 px-3 py-1 dark:border-white/10 dark:bg-white/5">
                <span class="truncate font-mono text-[11px] font-semibold tracking-[0.14em] text-black/45 uppercase dark:text-white/45">${escapeAttribute(language)}</span>
                <div class="flex shrink-0 items-center gap-1">${buttons}</div>
            </div>
            <div class="${bodyClasses}">
                <pre ${decoratedAttributes}>${decoratedInner}</pre>
                <div class="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[var(--code-bg)] to-transparent opacity-0 transition-opacity duration-300 ease-out group-data-[folded=true]:opacity-100 dark:from-[var(--code-bg-dark)]" aria-hidden="true"></div>
            </div>
            ${folding ? bottomExpandButtonMarkup() : ""}
        </div>`;
    });
}

