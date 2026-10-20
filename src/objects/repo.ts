/**
 * 仓库展示: 把正文里的 `${github <owner/repo>}` / `${gitee <owner/repo>}` 换成仓库卡片。
 *
 *   ${github lxgw/LxgwWenKaiGB}
 *   ${gitee 用户名/仓库名}
 *
 * 卡片会尽量带上仓库的描述 / stars / forks / license: 构建时请求 GitHub / Gitee 的公开 API,
 * 失败时自动退回「只有 owner/repo 的静态卡片」, 不会让构建挂掉。
 * 可选环境变量: GITHUB_TOKEN / GITEE_TOKEN (提高 API 限额, 不是必须的)。
 * 代码块与行内代码里的内容会被跳过 (方便在文章里写这个语法本身)。
 */

import { transformOutsideCode } from "./markdownSegments";
import { repoConfig } from "./config";

type RepoPlatform = "github" | "gitee";

export interface RepoMeta {
    description?: string;
    stars?      : number;
    forks?      : number;
    license?    : string;
    avatar?     : string;
}

// <repo> 的格式固定为 "用户名/仓库名"
const REPO_PATTERN = /\$\{\s*(github|gitee)\s+([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\s*\}/g;

const GITHUB_ICON = `<svg viewBox="0 0 24 24" fill="currentColor" class="h-6 w-6 shrink-0 text-ink/80" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"></path></svg>`;

// Gitee 没有随处可用的单色图标, 这里用品牌红的圆角方块 + 白色 G
const GITEE_ICON = `<svg viewBox="0 0 24 24" class="h-6 w-6 shrink-0" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#c71d23"></rect><text x="12" y="17" text-anchor="middle" font-size="14" font-weight="700" fill="#ffffff" font-family="Arial, sans-serif">G</text></svg>`;

const STAR_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5 shrink-0" aria-hidden="true"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.9-5.4 2.9 1-6-4.4-4.3 6.1-.9L12 3Z"></path></svg>`;

const FORK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5 shrink-0" aria-hidden="true"><circle cx="6" cy="5" r="2"></circle><circle cx="18" cy="5" r="2"></circle><circle cx="12" cy="19" r="2"></circle><path d="M6 7v3a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V7"></path><path d="M12 14v3"></path></svg>`;

const LICENSE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5 shrink-0" aria-hidden="true"><path d="M12 3v18"></path><path d="M5 7h14"></path><path d="m7 7-3 6a3 3 0 0 0 6 0Z"></path><path d="m17 7-3 6a3 3 0 0 0 6 0Z"></path></svg>`;

const PLATFORMS: Record<RepoPlatform, { host: string; icon: string }> = {
    github: { host: "github.com", icon: GITHUB_ICON },
    gitee : { host: "gitee.com",  icon: GITEE_ICON },
};

// markdown-body 里的 & a 会给链接加下划线, 这里用 !important 去掉; 卡片本身用毛玻璃风格的描边 + 半透明底
const CARD_CLASSES =
    "repo-card flex w-full max-w-full flex-col gap-2.5 rounded-2xl border border-ink/15 bg-black/10 p-4 align-top text-sm no-underline! transition duration-300 ease-out hover:bg-black/15 dark:bg-white/5 dark:hover:bg-white/10";

/** 行内代码 (`...`) 先换成占位符, 处理完再换回来 */
function transformOutsideInlineCode(text: string, transform: (segment: string) => string): string {
    const masked: string[] = [];
    const placeholder = text.replace(/`[^`\n]*`/g, (raw) => {
        masked.push(raw);
        return `\u0000${masked.length - 1}\u0000`;
    });

    return transform(placeholder).replace(/\u0000(\d+)\u0000/g, (_, index: string) => masked[Number(index)] ?? "");
}

/* ── 小工具 ── */

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/** 1500 → 1.5K, 35 → 35 */
function formatCount(value: number): string {
    if (value < 1000) return String(value);
    const k = value / 1000;
    return `${(k >= 100 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, ""))}K`;
}

/* ── 拉取仓库信息 (构建期, 失败自动退回静态卡片) ── */

const metaCache = new Map<string, RepoMeta | null>();

async function fetchRepoMeta(platform: RepoPlatform, repo: string): Promise<RepoMeta | null> {
    // 关闭远程请求时直接返回 null → 使用静态卡片 (不请求、不等待、不报警告)
    if (!repoConfig.fetch) return null;

    const token = platform === "github" ? process.env.GITHUB_TOKEN : process.env.GITEE_TOKEN;
    const url = platform === "github"
        ? `https://api.github.com/repos/${repo}`
        : `https://gitee.com/api/v5/repos/${repo}${token ? `?access_token=${encodeURIComponent(token)}` : ""}`;

    const ATTEMPTS = 2;

    for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
        try {
            const response = await fetch(url, {
                headers: {
                    Accept        : "application/vnd.github+json",
                    "User-Agent": "astro-blog-glass",
                    ...(platform === "github" && token ? { Authorization: `Bearer ${token}` } : {}),
                },
                signal: AbortSignal.timeout(repoConfig.timeout),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const json = await response.json() as Record<string, any>;
            return {
                description: typeof json.description === "string" ? json.description : undefined,
                stars      : typeof json.stargazers_count === "number" ? json.stargazers_count : undefined,
                forks      : typeof json.forks_count === "number" ? json.forks_count : undefined,
                license    : typeof json.license === "string" ? json.license : json.license?.spdx_id ?? json.license?.name,
                avatar     : json.owner?.avatar_url,
            };
        } catch (error) {
            // 首次失败等 500ms 再试一次 (网络抖动/偶发超时)
            if (attempt < ATTEMPTS) {
                await new Promise((resolve) => setTimeout(resolve, 500));
                continue;
            }

            // 打印真实的底层原因 (cause.code 常见: ENOTFOUND / ECONNRESET / ETIMEDOUT / CERT_*)
            const cause = (error as { cause?: { code?: string; message?: string } })?.cause;
            const reason = cause?.code ?? cause?.message;
            console.warn(
                `[repo] 获取 ${platform}:${repo} 信息失败, 使用静态卡片: ${String(error)}${reason ? ` (${reason})` : ""}` +
                ` —— 若构建环境访问不了该 API, 可在 config.yml 的 repo.fetch 设为 false 关闭请求。`,
            );
            return null;
        }
    }

    return null;
}

async function loadRepoMeta(platform: RepoPlatform, repo: string): Promise<RepoMeta | undefined> {
    const key = `${platform}:${repo}`;
    if (!metaCache.has(key)) metaCache.set(key, await fetchRepoMeta(platform, repo));
    return metaCache.get(key) ?? undefined;
}

/* ── 卡片 ── */

function statItem(icon: string, value: string): string {
    return `<span class="inline-flex items-center gap-1">${icon}<span>${value}</span></span>`;
}

function repoCardMarkup(platform: RepoPlatform, repo: string, meta?: RepoMeta): string {
    const { host, icon } = PLATFORMS[platform];
    const url = `https://${host}/${repo}`;
    const [owner, name] = repo.split("/");

    const avatar = meta?.avatar
        ? `<img src="${escapeHtml(meta.avatar)}" alt="" loading="lazy" class="h-8 w-8 shrink-0 rounded-full object-cover my-1" />`
        : `<span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/20 text-xs font-bold text-ink dark:bg-white/15">${escapeHtml(owner.charAt(0).toUpperCase())}</span>`;

    const description = meta?.description
        ? `<span class="block text-sm leading-relaxed text-ink/75">${escapeHtml(meta.description)}</span>`
        : `<span class="block text-sm leading-relaxed text-ink/60">${host}/${repo}</span>`;

    const stats = [
        typeof meta?.stars === "number" ? statItem(STAR_ICON, formatCount(meta.stars)) : "",
        typeof meta?.forks === "number" ? statItem(FORK_ICON, formatCount(meta.forks)) : "",
        meta?.license ? statItem(LICENSE_ICON, escapeHtml(meta.license)) : "",
    ].filter(Boolean).join("");

    const statsRow = stats
        ? `<span class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink/60">${stats}</span>`
        : "";

    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="${CARD_CLASSES}">
                <span class="flex items-center gap-3">
                    ${avatar}
                    <span class="flex flex-1 flex-col gap-0.5">
                        <span class="truncate text-sm font-semibold">
                            <span class="text-ink/60">${escapeHtml(owner)}</span>
                            <span class="mx-0 text-ink/40">/</span>
                            <span class="text-ink">${escapeHtml(name)}</span>
                        </span>
                        ${description}
                    </span>
                ${icon}
                </span>
                ${statsRow}
            </a>`;
}

/* ── 替换 ── */

/** 收集正文里出现的仓库 (跳过代码块 / 行内代码) */
function collectRepoMentions(markdown: string): Map<string, { platform: RepoPlatform; repo: string }> {
    const mentions = new Map<string, { platform: RepoPlatform; repo: string }>();

    transformOutsideCode(markdown, (segment) =>
        transformOutsideInlineCode(segment, (text) => {
            for (const match of text.matchAll(REPO_PATTERN)) {
                const platform = match[1] as RepoPlatform;
                const repo = match[2];
                mentions.set(`${platform}:${repo}`, { platform, repo });
            }
            return text;
        }),
    );

    return mentions;
}

export interface RepoRenderResult {
    markdown: string;
    /** 本次渲染用到的仓库信息 (参与内容层 digest, 数据变化时会重新渲染) */
    meta: Record<string, RepoMeta | null>;
}

/** 替换正文里的 `${github ...}` / `${gitee ...}` 仓库展示 (代码块 / 行内代码里的内容原样保留) */
export async function replaceRepositories(markdown: string): Promise<RepoRenderResult> {
    const mentions = collectRepoMentions(markdown);

    const meta: Record<string, RepoMeta | null> = {};
    await Promise.all([...mentions].map(async ([key, { platform, repo }]) => {
        const info = await loadRepoMeta(platform, repo);
        meta[key] = info ?? null;
    }));

    const replaced = transformOutsideCode(markdown, (segment) =>
        transformOutsideInlineCode(segment, (text) =>
            text.replace(REPO_PATTERN, (_raw, platform: RepoPlatform, repo: string) =>
                // 卡片是块级元素: 前后加空行让它成为独立的 HTML 块, 避免被包进段落 <p> 里 (否则布局会乱)
                `\n\n${repoCardMarkup(platform, repo, meta[`${platform}:${repo}`] ?? undefined)}\n\n`,
            ),
        ),
    );

    return { markdown: replaced, meta };
}
