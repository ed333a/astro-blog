/**
 * 内容加载器: 把 src/contents/{posts,pages} 里的 Markdown 读进 Content Collections。
 *
 * 这里不用内置的 glob() loader, 而是自己实现, 因为「文章」这件事有几处必须在渲染前完成:
 *   ① frontmatter 里的字段要补全 —— 没有 postID 就按 title + description 算一个哈希;
 *   ② 永久链接要按 config.yml 的 siteConfig.postPermalink 解析 (要用到日期、分类、文件名);
 *   ③ 摘要 (description 或正文前 80 字) 与阅读时长要在构建期算好, 列表页直接取;
 *   ④ 正文里的 `${post <id> [text]}` 引用要换成真正的链接 —— 必须在 Markdown 解析之前,
 *      所以只能在这一层做 (remark 插件里拿不到上面这些已算好的数据);
 *   ⑤ 代码块 (行号 / 折行 / 折叠 / 工具栏) 要在 shiki 出好 HTML 之后再套一层外壳。
 *
 * 数据流: 读文件 → 解析 frontmatter → 算 postID/日期/链接 → 替换引用 → 算摘要 →
 *         context.parseData(按 content.config.ts 的 schema 校验) → context.renderMarkdown → store.set
 */

import { promises as fs, readFileSync } from "node:fs";
import { relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import type { Loader, LoaderContext } from "astro/loaders";

import { codeBlockConfig, siteConfig } from "../objects/config";
import {
    buildPostPath,
    estimateReadingMinutes,
    extractExcerpt,
    generatePostID,
    parsePostDate,
    titlePinyinWarnings,
    toPlainText,
    usesPinyinVariable,
} from "../objects/posts";
import { replacePostReferences, type PostReferenceTarget } from "../objects/postReference";
import { replaceNotes } from "../objects/note";
import { replaceRepositories, type RepoMeta } from "../objects/repo";
import { collectCodeFenceLanguages, decorateCodeBlocks, replaceTabsInCodeBlocks } from "../objects/codeBlock";

/** 文档类型: 决定内容渲染在哪个页面模板上 */
export type DocumentType = "post" | "about";

/** 内容目录 (相对项目根目录) */
export const POSTS_DIRECTORY = "src/contents/posts";
export const PAGES_DIRECTORY = "src/contents/pages";

export interface MarkdownLoaderOptions {
    /** 要加载哪个目录 */
    directory: string;
    /** frontmatter 没写 type 时的默认类型 */
    defaultType: DocumentType;
    /** 是否按 siteConfig.postPermalink 计算永久链接 (只有文章需要) */
    usePermalink: boolean;
}

interface RawDocument {
    /** 集合条目 id: 相对内容目录的路径 (不含扩展名, 用 "/" 分隔) */
    id: string;
    /** 文件名 (含扩展名) */
    fileName: string;
    /** 相对项目根目录的路径 (posix 分隔符), 交给 Content Layer 记录来源 */
    filePath: string;
    fileUrl: URL;
    contents: string;
    data: Record<string, unknown>;
    body: string;
}

interface PreparedDocument extends RawDocument {
    postID: string;
    /** 站内路径 (不含开头的 "/") */
    path: string;
    /** 展示用日期 (YYYY-MM-DD) */
    dateText?: string;
    /** 发布日期 (来自 frontmatter 的 published) */
    published?: Date;
    type: DocumentType;
}

/** frontmatter 里空着的字段 (例如 `published:`) 会被 YAML 解析成 null, 统一当成「没写」 */
function withoutNulls(data: Record<string, unknown>): Record<string, unknown> {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
        if (value !== null && value !== undefined) cleaned[key] = value;
    }
    return cleaned;
}

function splitFrontmatter(contents: string): { data: Record<string, unknown>; body: string } {
    const normalized = contents.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
    const matched = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/.exec(normalized);
    if (!matched) return { data: {}, body: normalized };

    const parsed = parseYaml(matched[1]);
    const data = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    return { data: withoutNulls(data), body: normalized.slice(matched[0].length) };
}

function toPosix(path: string): string {
    return sep === "/" ? path : path.split(sep).join("/");
}

/** 递归列出目录下的全部 .md (不含子目录里的草稿目录约定 —— 本项目就是平铺的, 但顺手支持了嵌套) */
async function listMarkdownFiles(directory: URL): Promise<URL[]> {
    let entries;
    try {
        entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
        return [];
    }

    const files: URL[] = [];
    for (const entry of entries) {
        const child = new URL(`${encodeURI(entry.name)}${entry.isDirectory() ? "/" : ""}`, directory);
        if (entry.isDirectory()) {
            files.push(...await listMarkdownFiles(child));
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
            files.push(child);
        }
    }
    return files;
}

async function readDocuments(directory: URL, rootDirectory: string): Promise<RawDocument[]> {
    const files = await listMarkdownFiles(directory);
    // 内容目录自身的路径 (去掉 URL 编码), 用来把「绝对路径」削成「相对内容目录的路径」
    const basePathname = decodeURIComponent(directory.pathname);

    const documents = await Promise.all(files.map(async (fileUrl) => {
        const contents = await fs.readFile(fileUrl, "utf-8");
        const { data, body } = splitFrontmatter(contents);
        const filePath = toPosix(relative(rootDirectory, fileURLToPath(fileUrl)));
        const relativePath = decodeURIComponent(fileUrl.pathname).slice(basePathname.length);

        return {
            id        : relativePath.replace(/\.[^./\\]+$/, ""),
            fileName  : relativePath.split("/").pop() ?? "",
            filePath,
            fileUrl,
            contents,
            data,
            body,
        } satisfies RawDocument;
    }));

    return documents.sort((a, b) => a.id.localeCompare(b.id));
}

const asString = (value: unknown): string | undefined =>
    typeof value === "string" ? value : typeof value === "number" ? String(value) : undefined;

/** 补全 frontmatter 里没写、但后续到处都要用的字段 (postID / 日期 / 链接) */
function prepareDocument(document: RawDocument, options: MarkdownLoaderOptions): PreparedDocument {
    const title       = asString(document.data.title) ?? document.id;
    const description = asString(document.data.description);
    const category    = asString(document.data.category);
    const declaredType = asString(document.data.type);
    const type: DocumentType = declaredType === "post" || declaredType === "about" ? declaredType : options.defaultType;

    // 没有 postID 就按 title + description 算一个 (长度见 config.yml 的 siteConfig.postIDLehgth)
    const postID = asString(document.data.postID)
        ?? generatePostID(title, description, siteConfig.postIDLehgth);

    const parsedDate = parsePostDate(asString(document.data.published));

    // 文章: 交给 siteConfig.postPermalink; 特殊页面: 直接用文件名 (About.md → about)
    const path = options.usePermalink
        ? buildPostPath({
            template: siteConfig.postPermalink,
            postID,
            date    : parsedDate,
            category,
            title,
            fileName: document.fileName,
        })
        : document.id.toLowerCase();

    if (options.usePermalink && usesPinyinVariable(siteConfig.postPermalink)) {
        const missing = titlePinyinWarnings(title);
        if (missing.length > 0) {
            // 拼音表没收录 -> 链接里会少这几个字, 提示一下免得以为链接生成错了
            console.warn(`[content] 标题 "${title}" 里这些字没有拼音, 链接里的 :title_pinyin 会跳过它们: ${missing.join(" ")}`);
        }
    }

    return {
        ...document,
        postID,
        path,
        type,
        published : parsedDate?.date,
        dateText  : parsedDate?.text,
    };
}

/**
 * 把生成好的 postID 写回文件的 frontmatter (原本没写 postID 时才会调用)。
 * 只在 frontmatter 末尾插一行, 正文原样保留; 行尾风格跟随原文件。
 */
async function writePostIDToFile(fileUrl: URL, postID: string): Promise<void> {
    try {
        const contents = await fs.readFile(fileUrl, "utf-8");
        const match = /^(---[ \t]*\r?\n)([\s\S]*?)(\r?\n---[ \t]*(?:\r?\n|$))/.exec(contents);
        if (!match) return;
        // 已经有 postID 就不再写, 避免重复同步时插两次
        if (/^[ \t]*postID[ \t]*:/m.test(match[2])) return;

        const newline = match[1].endsWith("\r\n") ? "\r\n" : "\n";
        const updated = `${match[1]}${match[2]}${newline}postID: '${postID}'${match[3]}${contents.slice(match[0].length)}`;
        await fs.writeFile(fileUrl, updated, "utf-8");
    } catch (error) {
        console.warn(`[content] 写入 postID 失败 (${fileURLToPath(fileUrl)}): ${String(error)}`);
    }
}

/** 文章 ID → { 标题, 链接 }, 供 `${post <id> [text]}` 引用使用 (草稿不进表, 免得生成死链) */
function buildReferenceMap(documents: PreparedDocument[]): Map<string, PostReferenceTarget> {
    const map = new Map<string, PostReferenceTarget>();
    for (const document of documents) {
        if (document.data.draft === true) continue;
        map.set(document.postID, {
            title: asString(document.data.title) ?? document.id,
            path : document.path,
        });
    }
    return map;
}

function warnOnDuplicatePostIDs(context: LoaderContext, documents: PreparedDocument[]): void {
    const seen = new Map<string, string>();
    for (const document of documents) {
        const previous = seen.get(document.postID);
        if (previous) {
            context.logger.warn(
                `postID "${document.postID}" 被两篇文章同时使用: ${previous} 与 ${document.filePath} —— 它们的链接会互相覆盖`,
            );
        } else {
            seen.set(document.postID, document.filePath);
        }
    }
}

/** 正文处理: 制表符替换 → 引用替换 → 提示框 → 仓库展示 (代码块里的内容都会跳过) */
async function transformBody(
    document: PreparedDocument,
    references: Map<string, PostReferenceTarget>,
    onMissingReference: (id: string) => void,
): Promise<{ body: string; repoMeta: Record<string, RepoMeta | null> }> {
    const withTabsReplaced = replaceTabsInCodeBlocks(
        document.body,
        codeBlockConfig.tabReplace,
        codeBlockConfig.tabSize,
    );
    const withReferences = replacePostReferences(withTabsReplaced, (id) => references.get(id), onMissingReference);
    const withNotes = replaceNotes(withReferences);
    const repos = await replaceRepositories(withNotes);
    return { body: repos.markdown, repoMeta: repos.meta };
}

/** 扫目录 → 补全字段 → 校验 → 渲染 → 存进 Content Layer */
async function sync(context: LoaderContext, options: MarkdownLoaderOptions): Promise<void> {
    const rootUrl = context.config.root;
    const rootDirectory = fileURLToPath(rootUrl);

    // 内容层缓存的是「渲染结果 + 补全后的 data (postID / path 等)」, 而两者不只取决于 Markdown 正文,
    // 还取决于 codeBlock 配置、postPermalink/postIDLehgth 等 siteConfig, 以及下面这些纯函数的实现:
    //   · codeBlock.ts / markdownSegments.ts / postReference.ts  → 代码块外壳与正文里的引用替换
    //   · posts.ts / pinyin.ts                                   → 永久链接、postID 与拼音链接
    // Astro 内容层用 digest 判断条目是否变化: digest 不变时 store.set() 会直接返回 false,
    // 旧数据就一直躺在 .astro/data-store.json 缓存里 (改配置 / 改实现都不生效)。
    // 所以把这些一起算进 digest, 保证任一环节变化后都会真正重新渲染。
    const renderSource = [
        JSON.stringify(codeBlockConfig),
        JSON.stringify(siteConfig),
        readFileSync(new URL("../objects/codeBlock.ts", import.meta.url), "utf-8"),
        readFileSync(new URL("../objects/markdownSegments.ts", import.meta.url), "utf-8"),
        readFileSync(new URL("../objects/postReference.ts", import.meta.url), "utf-8"),
        readFileSync(new URL("../objects/note.ts", import.meta.url), "utf-8"),
        readFileSync(new URL("../objects/repo.ts", import.meta.url), "utf-8"),
        readFileSync(new URL("../objects/posts.ts", import.meta.url), "utf-8"),
        readFileSync(new URL("../objects/pinyin.ts", import.meta.url), "utf-8"),
        // loader 自身的实现也参与渲染结果: 新增 wordCount 这类字段时, 旧缓存必须失效重算
        readFileSync(fileURLToPath(import.meta.url), "utf-8"),
    ].join("\n");

    // ① 先扫文章目录: 引用表 (postID → 标题/链接) 得先有, 才能处理别的文档里的引用
    const postsOptions: MarkdownLoaderOptions = {
        directory: POSTS_DIRECTORY,
        defaultType: "post",
        usePermalink: true,
    };
    const postDocuments = (await readDocuments(new URL(`${POSTS_DIRECTORY}/`, rootUrl), rootDirectory))
        .map((document) => prepareDocument(document, postsOptions));

    // frontmatter 里没写 postID 的文章: 把生成好的 postID 写回文件 (只处理文章集合, 不写特殊页面)
    if (options.usePermalink) {
        await Promise.all(
            postDocuments
                .filter((document) => asString(document.data.postID) === undefined)
                .map((document) => writePostIDToFile(document.fileUrl, document.postID)),
        );
    }

    const references = buildReferenceMap(postDocuments);

    // ② 当前集合要落库的文档
    const documents = options.usePermalink
        ? postDocuments
        : (await readDocuments(new URL(`${options.directory}/`, rootUrl), rootDirectory))
            .map((document) => prepareDocument(document, options));

    if (options.usePermalink) warnOnDuplicatePostIDs(context, documents);

    const presentIDs = new Set<string>();
    const missingReferences = new Set<string>();

    for (const document of documents) {
        const { body, repoMeta } = await transformBody(document, references, (id) => missingReferences.add(id));
        const description = asString(document.data.description);

        const data: Record<string, unknown> = {
            title         : asString(document.data.title) ?? document.id,
            description,
            type          : document.type,
            draft         : document.data.draft === true,
            postID        : document.postID,
            published     : document.published,
            dateText      : document.dateText,
            category      : asString(document.data.category),
            tags          : Array.isArray(document.data.tags) ? document.data.tags.map(String) : [],
            path          : document.path,
            // 摘要: 优先 description, 否则正文前 80 字
            excerpt       : extractExcerpt(body, description),
            readingMinutes: estimateReadingMinutes(body),
            wordCount     : toPlainText(body).length,
        };
        // 没写的字段要删掉, 否则会以 undefined 的形式进 schema
        for (const key of Object.keys(data)) {
            if (data[key] === undefined) delete data[key];
        }

        const parsed = await context.parseData({ id: document.id, data, filePath: document.filePath });

        // Markdown → HTML (shiki 双主题配色由 astro.config.mjs 的 markdown.shikiConfig 决定)
        const rendered = await context.renderMarkdown(body, { fileURL: document.fileUrl });

        // 再套一层代码块外壳: 工具栏 (复制 / 折行 / 折叠) + 行号 + 折叠渐变
        const languages = collectCodeFenceLanguages(body);
        const html = decorateCodeBlocks(rendered.html, {
            showLineNumber      : codeBlockConfig.showLineNumber,
            foldAt              : codeBlockConfig.fold_at,
            wordwrap            : codeBlockConfig.wordwrap,
            wordWrapToggleButton: codeBlockConfig.wordWrapToggleButton,
            copyButton          : codeBlockConfig.copyButton,
            fontSize            : codeBlockConfig.fontSize,
        }, languages);

        context.store.set({
            id          : document.id,
            data        : parsed,
            body,
            filePath    : document.filePath,
            digest      : context.generateDigest(`${document.contents}\n${renderSource}\n${JSON.stringify(repoMeta)}`),
            rendered    : { ...rendered, html },
            assetImports: rendered.metadata?.imagePaths,
        });
        presentIDs.add(document.id);
    }

    // 文件被删掉 / 改名后, 对应的条目也要跟着消失
    for (const id of context.store.keys()) {
        if (!presentIDs.has(id)) context.store.delete(id);
    }

    if (missingReferences.size > 0) {
        context.logger.warn(
            `这些 \${post ...} 引用找不到对应文章 (链接没有生成, 原文保留): ${[...missingReferences].join(", ")}`,
        );
    }
}

/**
 * 内容加载器: 读一个目录下的全部 Markdown。
 * 开发环境下监听目录变化并重新同步 (内容量很小, 全量重扫比增量更新省心)。
 */
export function markdownLoader(options: MarkdownLoaderOptions): Loader {
    let syncTimer: ReturnType<typeof setTimeout> | undefined;

    return {
        name: `glass-markdown-loader:${options.directory}`,

        load: async (context) => {
            await sync(context, options);

            const watcher = context.watcher;
            if (!watcher) return;

            const directory = fileURLToPath(new URL(`${options.directory}/`, context.config.root));
            watcher.add(directory);

            // 文章目录的标题 / postID 会影响到其它文档里的引用, 所以也要一起监听
            if (options.directory !== POSTS_DIRECTORY) {
                watcher.add(fileURLToPath(new URL(`${POSTS_DIRECTORY}/`, context.config.root)));
            }

            // 一次保存常常连发好几个事件, 防抖一下
            const resync = () => {
                clearTimeout(syncTimer);
                syncTimer = setTimeout(() => {
                    sync(context, options).catch((error: unknown) => {
                        context.logger.error(`重新同步内容失败: ${String(error)}`);
                    });
                }, 200);
            };

            watcher.on("change", resync);
            watcher.on("add", resync);
            watcher.on("unlink", resync);
        },
    };
}


