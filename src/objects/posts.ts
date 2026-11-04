/**
 * 文章相关的纯函数: 日期解析 / 文章 ID / 永久链接 / 摘要 / 阅读时长 / 排序。
 *
 * 这些函数只在构建期使用 (由 loaders/markdown.ts 在渲染前调用), 所以可以放心用 node 内置模块。
 * config.yml 里 siteConfig.postPermalink 支持的全部变量都在 buildPostPath() 里实现。
 */

import { createHash } from "node:crypto";
import { siteConfig } from "./config";
import { toPinyin, unknownHanChars } from "./pinyin";

/** 日期各字段 (全部为补零后的字符串, 直接拼进永久链接) */
export interface PostDateParts {
    year  : string;
    month : string;
    day   : string;
    hour  : string;
    minute: string;
    second: string;
}

export interface ParsedPostDate {
    date : Date;
    parts: PostDateParts;
    /** 展示用的日期 (YYYY-MM-DD) */
    text : string;
}

/** 支持 "YYYY-MM-DD HH:mm:ss" / "YYYY-MM-DD HH:mm" / "YYYY-MM-DD" / "YYYY/MM/DD" */
const DATE_PATTERN = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/;

const pad = (value: number, length = 2) => String(value).padStart(length, "0");

/**
 * 解析 frontmatter 里的日期。
 * 空值 / 非法值一律返回 undefined (关于页这类没有日期的文档是合法的)。
 */
export function parsePostDate(raw?: string | null): ParsedPostDate | undefined {
    const trimmed = (raw ?? "").trim();
    if (!trimmed) return undefined;

    const matched = DATE_PATTERN.exec(trimmed);
    if (!matched) return undefined;

    const year   = Number(matched[1]);
    const month  = Number(matched[2]);
    const day    = Number(matched[3]);
    const hour   = Number(matched[4] ?? 0);
    const minute = Number(matched[5] ?? 0);
    const second = Number(matched[6] ?? 0);

    const date = new Date(year, month - 1, day, hour, minute, second);

    // 过滤掉 "2026-02-31" 这种会被 Date 自动进位的非法日期
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
        return undefined;
    }
    if (hour > 23 || minute > 59 || second > 59) {
        return undefined;
    }

    return {
        date,
        parts: {
            year  : pad(year, 4),
            month : pad(month),
            day   : pad(day),
            hour  : pad(hour),
            minute: pad(minute),
            second: pad(second),
        },
        text: `${pad(year, 4)}-${pad(month)}-${pad(day)}`,
    };
}

/**
 * Date → frontmatter 里用的日期文本 (YYYY-MM-DD HH:mm:ss, 本地时区)。
 * 与 parsePostDate() 互逆: 写回 lastModified 时用它, 保持和文章里手写的日期同一个格式。
 */
export function formatPostDate(date: Date): string {
    return [
        `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
        `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
    ].join(" ");
}

/**
 * 生成文章 ID: title + description 的哈希, 取 config.yml 里 siteConfig.hashLength 位。
 * 模板注释里提到 ID 要用引号包起来 (防止被当成数字), 所以这里也保证结果里至少有一个字母 ——
 * 否则像 "0123456789abcdef" 那样纯数字的片段容易被 YAML/JSON 解析成 number。
 */
export function generatePostID(title: string, description: string | undefined, length: number): string {
    const digest = createHash("sha256").update(`${title}\n${description ?? ""}`).digest("hex");

    for (let start = 0; start + length <= digest.length; start += 1) {
        const candidate = digest.slice(start, start + length);
        if (/[a-f]/.test(candidate)) return candidate;
    }
    return `a${digest.slice(0, Math.max(0, length - 1))}`;
}

/** 把一串文本收拾成适合放进 URL 片段的样子 (汉字保留, 空白与标点并成连字符) */
function slugify(value: string): string {
    return value
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[\s_]+/g, "-")
        .replace(/[^\p{L}\p{N}.-]+/gu, "-")
        .replace(/-{2,}/g, "-")
        .replace(/^[-.]+|[-.]+$/g, "");
}

export interface PostPathInput {
    /** config.yml 的 siteConfig.postPermalink */
    template  : string;
    postID    : string;
    date?     : ParsedPostDate;
    category? : string;
    title     : string;
    /** 文件名 (含扩展名) */
    fileName  : string;
}

/**
 * 按 siteConfig.postPermalink 生成文章路径 (不含开头的 "/")。
 * 变量表与 config.yml 里的注释一一对应; 认不出来的变量原样保留, 方便一眼看出配置写错了。
 */
export function buildPostPath(input: PostPathInput): string {
    const { template, postID, date, category, title, fileName } = input;
    const parts = date?.parts;

    const variables: Record<string, string> = {
        postID,
        // 发布时间
        date        : parts ? `${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}${parts.second}` : "",
        date_tamp   : date ? String(Math.floor(date.date.getTime() / 1000)) : "", // Unix 时间戳 (秒)
        category    : slugify(category ?? ""),
        year        : parts?.year ?? "",
        month       : parts?.month ?? "",
        day         : parts?.day ?? "",
        hour        : parts?.hour ?? "",
        minute      : parts?.minute ?? "",
        second      : parts?.second ?? "",
        // 同样的字段, 不含前导 0
        year_i      : parts ? String(Number(parts.year)) : "",
        month_i     : parts ? String(Number(parts.month)) : "",
        day_i       : parts ? String(Number(parts.day)) : "",
        hour_i      : parts ? String(Number(parts.hour)) : "",
        minute_i    : parts ? String(Number(parts.minute)) : "",
        second_i    : parts ? String(Number(parts.second)) : "",
        // 标题相关
        title       : slugify(title),
        title_pinyin: slugify(toPinyin(title)),
        file_name   : slugify(fileName.replace(/\.[^./\\]+$/, "")),
    };

    const replaced = template.replace(/:([A-Za-z_]+)/g, (raw, name: string) =>
        name in variables ? variables[name] : raw,
    );

    // 收拾路径: 去掉空片段与首尾斜杠 (变量取不到值时容易留下 "//" 或结尾的 "/")
    const path = replaced
        .split("/")
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0)
        .join("/");

    // 一个字段都没取到时至少还能落到文章 ID 上, 保证链接可用
    return path || postID;
}

/** 标题里出现但拼音表没收录的字 (构建时提示用) */
export function titlePinyinWarnings(title: string): string[] {
    return unknownHanChars(title);
}

/** 是否用到了 :title_pinyin (只有用到时才需要提示缺字) */
export function usesPinyinVariable(template: string): boolean {
    return template.includes(":title_pinyin");
}

/** Markdown → 纯文本 (摘要 / 阅读时长估算 / 侧边栏字数统计用) */
export function toPlainText(markdown: string): string {
    return markdown
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/~~~[\s\S]*?~~~/g, " ")
        .replace(/`[^`\n]*`/g, " ")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/^\s{0,3}(?:#{1,6})\s*/gm, "")
        .replace(/^\s{0,3}>\s?/gm, "")
        .replace(/^\s{0,3}(?:[-*+]|\d+\.)\s+/gm, "")
        .replace(/^\s{0,3}(?:[-*_]\s*){3,}$/gm, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/[*_~]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

/** hashPostContent 的入参: 参与内容指纹的字段 (只挑「改了对读者有影响」的, 日期类不参与) */
export interface PostContentInput {
    body        : string;
    title?      : string;
    description?: string;
    category?   : string;
    tags?       : string[];
}

/**
 * 文章内容指纹 (16 位十六进制)。
 *
 * loader 把上一次的指纹写在 frontmatter 里 lastModified 那一行的注释中:
 *     lastModified: 2026-11-04 12:34:56 # content:3f2a9c1d8e7b0a12
 * 下次同步时对比指纹就能判断「正文 / 标题 / 描述 / 分类 / 标签」有没有改过:
 *   · 改过   → lastModified 更新为本次时间, 并重写指纹;
 *   · 没改过 → lastModified 保持原值 (只补指纹, 不改日期)。
 *
 * 日期字段不参与计算, 所以「写回 lastModified」本身不会改变指纹 ——
 * dev 下 watcher 被自己的写入触发时不会无限循环。
 */
export function hashPostContent({ body, title, description, category, tags }: PostContentInput): string {
    const payload = JSON.stringify([
        title ?? "",
        description ?? "",
        category ?? "",
        tags ?? [],
        // 统一换行 / 去掉首尾空白: 只是编辑器换行风格变化时不该算作内容更新
        body.replace(/\r\n/g, "\n").trim(),
    ]);
    return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

/**
 * 文章摘要: 优先取 frontmatter 的 description, 没有就从正文里截前 maxLength 个字。
 */
export function extractExcerpt(body: string, description: string | undefined, maxLength = 80): string {
    const fromFrontmatter = (description ?? "").trim();
    if (fromFrontmatter) return fromFrontmatter;

    const plain = toPlainText(body);
    if (plain.length <= maxLength) return plain;
    return `${plain.slice(0, maxLength)}…`;
}

/** 阅读时长 (分钟): 按纯文本字数粗估, 中文正文按每分钟 400 字算 */
export function estimateReadingMinutes(body: string): number {
    const plain = toPlainText(body);
    if (!plain) return 1;
    return Math.max(1, Math.round(plain.length / 400));
}

/** 把站内路径拼成完整的绝对地址 (版权声明里展示用) */
export function absoluteUrl(path: string): string {
    const base = siteConfig.siteUrl.replace(/\/+$/, "");
    return `${base}/${path.replace(/^\/+/, "")}`;
}

interface SortablePost {
    data: {
        publishedAt?: Date;
        title       : string;
        draft       : boolean;
    };
}

/** 新文章在前; 没有日期的排在最后 (按标题兜底, 保证每次构建顺序一致) */
export function sortPostsDescending<T extends SortablePost>(entries: T[]): T[] {
    return [...entries].sort((a, b) => {
        const left  = a.data.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
        const right = b.data.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
        if (left !== right) return right - left;
        return a.data.title.localeCompare(b.data.title, "zh-CN");
    });
}
