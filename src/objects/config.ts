import z from "zod"
import { parse } from "yaml"
import yamlRaw from "../config.yml?raw"

const rawConfig = parse(yamlRaw);

// 毛玻璃的参数: 名字就是 global.css 的 frosted-glass / Layout 里 --glass-* 变量对应的那一项,
// 上下界只是防止手滑写出无效样式 (比如负的模糊半径)。由 Layout 渲染成 --glass-* / --radius-* 变量。

// 颜色 / 阴影这类值原样塞进 CSS 变量, 所以只校验「是非空字符串」
const toneSchema = z.object({ light: z.string(), dark: z.string() });

const frostedGlassStyleSchema = z.object({
    // 1 背景模糊 (backdrop-filter)
    blur            : z.number().min(0).max(60),
    saturate        : z.number().min(0).max(3),
    brightnessLight : z.number().min(0).max(2),
    brightnessDark  : z.number().min(0).max(2),

    // 2 背景颜色与阴影
    background      : toneSchema,
    border          : toneSchema,
    shadow          : toneSchema,
    page            : toneSchema,

    // 3 圆角: 导航栏 / 页脚 / 卡片各一个, 互不影响
    radius          : z.object({
        navbar : z.number().min(0).max(999),
        footer : z.number().min(0).max(999),
        card   : z.number().min(0).max(999),
        codeBlock: z.number().min(0).max(999),
    }),
});

const themeConfigSchema = z.object({
    style: z.enum(["Light", "Dark", "Auto"])
});

// 卡片光斑 (鼠标悬停时跟随指针的那圈描边): 数值同样原样塞进 CSS 变量, 由 global.css 的 spotlight-border 消费
const cardSpotlightSchema = z.object({
    // 光斑半径 (px): 越大, 高亮在描边上铺得越长
    radius: z.number().min(1).max(1000),
    // 光斑颜色: 日/夜各一份
    color : toneSchema,
});

// 站点信息: 标题 / 副标题 / 描述, 文章永久链接格式与分页, 版权信息 (见 config.yml 的 siteConfig)
const siteConfigSchema = z.object({
    title      : z.string(),
    subtitle   : z.string(),
    description: z.string(),

    // 博客建立时间 (ISO 8601, 带时区): 页脚「运行时间」的起点。
    // 给默认值是为了兼容还没有这一项的旧配置。
    startDate  : z.string().min(1).default("2026-04-13T12:00:00+08:00"),

    // 文章链接格式, 可用的变量见 config.yml 里的注释 (解析逻辑在 objects/posts.ts)
    postPermalink: z.string().min(1),

    // 文章列表每页展示的文章数量 (0 以上)
    postsPerPage: z.number().int().min(1),

    // 自动生成的文章 ID 长度.
    // 注意: 键名沿用 config.yml 里的原始拼写 (postIDLehgth), 不是笔误 —— 改名会让老配置直接失效
    postIDLehgth: z.number().int().min(1).max(64),

    // 站点地址, 拼接文章链接用于版权声明
    siteUrl: z.string().min(1),

    // 版权信息 (文章底部 / 页脚)
    license: z.object({
        enable: z.boolean(),
        name  : z.string(),
        url   : z.string(),
    }),
});

// 代码块 (见 config.yml 的 codeBlock, 由 loaders/markdown.ts 在渲染前消费)
const codeBlockSchema = z.object({
    showLineNumber      : z.boolean(),          // 是否显示行号
    tabReplace          : z.string(),           // tab 的替换内容, 空字符串 = 不替换
    tabSize             : z.number().int().min(0),
    fold_at             : z.number().int(),     // 超过多少行折叠, <= 0 表示不折叠
    wordwrap            : z.boolean(),          // 初始是否自动换行
    wordWrapToggleButton: z.boolean(),          // 是否显示 换行 开关
    copyButton          : z.boolean(),          // 是否显示复制按钮
    fontSize            : z.number().int().min(8).max(40),  // 代码字体大小 (px)
});

// 作者信息与侧边栏统计 (见 config.yml 的 author / sidebar): 侧边栏展示用,
// 其中评论 / 总访问量 / 访客数来自 API, 接入前先用配置里的静态占位。
const authorSchema = z.object({
    name       : z.string(),      // 作者名称
    avatar     : z.string(),      // 头像路径 (public 下以 / 开头; 留空显示首字母)
    bio        : z.string(),      // 一句话介绍
    socialLinks: z.array(z.object({
        name: z.string(),
        url : z.string(),
    })),
});

const sidebarSchema = z.object({
    comments   : z.number().int().min(0),   // 评论数量
    totalVisits: z.number().int().min(0),   // 总访问量
    visitors   : z.number().int().min(0),   // 访客数量
});

// 仓库卡片 (${github owner/repo} / ${gitee owner/repo}): 是否在构建期请求 API 以及超时
const repoSchema = z.object({
    fetch  : z.boolean().default(true),                          // 是否在构建期请求 GitHub / Gitee API
    timeout: z.number().int().min(500).max(60000).default(6000), // 请求超时 (ms)
});

// 背景图片 / 背景色 (见 config.yml 的 background, 由 components/BodyBackground.astro 消费)
const backgroundImageSchema = z.object({
    enable    : z.boolean(),
    url       : z.string(),
    svgColor  : z.string().optional(),
    "repeat-x": z.boolean(),
    "repeat-y": z.boolean(),
    fill      : z.boolean(),
    // 背景图片缩放 (%): 对应 background-size / mask-size 的百分比; 不写则用图片默认尺寸
    scale     : z.number().min(1).max(1000).optional(),
});

const backgroundColorSchema = z.object({
    enable       : z.boolean(),
    linear       : z.boolean(),
    deg          : z.number().int().min(0).max(360),
    colors       : z.array(z.string()).max(3),
    "colors-dark": z.array(z.string()).max(3),
});

const backgroundSchema = z.object({
    image: backgroundImageSchema,
    color: backgroundColorSchema,
    // 背景颜色层的模糊强度 (px), 不写就是 0 (不模糊)
    blur : z.number().min(0).optional().default(0),
});

const statisticsSchema = z.object({
    umami: z.string(),
    artalk: z.string(),
});

const commentsSchema = z.object({
    enable: z.boolean(),
    enableInDev: z.boolean(),
    use: z.enum(["Artalk"]),
    artalk: z.object({
        server: z.string(),
        serverDev: z.string(),
        site: z.string(),
    })
});

const configSchema = z.object({
    siteConfig: siteConfigSchema,
    background: backgroundSchema,
    codeBlock: codeBlockSchema,
    frostedGlassStyle: frostedGlassStyleSchema,
    cardSpotlight: cardSpotlightSchema,
    theme: themeConfigSchema,
    author: authorSchema,
    sidebar: sidebarSchema,
    repo: repoSchema.default({ fetch: true, timeout: 6000 }),
    statistics: statisticsSchema,
    comments: commentsSchema,
});

type Config              = z.infer<typeof configSchema>
type BackgroundConfig    = z.infer<typeof backgroundSchema>
type FrostedGlassConfig  = z.infer<typeof frostedGlassStyleSchema>
type CardSpotlightConfig = z.infer<typeof cardSpotlightSchema>
type ThemeConfig         = z.infer<typeof themeConfigSchema>
type SiteConfig          = z.infer<typeof siteConfigSchema>
type CodeBlockConfig     = z.infer<typeof codeBlockSchema>
type AuthorConfig        = z.infer<typeof authorSchema>
type SidebarConfig       = z.infer<typeof sidebarSchema>
type RepoConfig          = z.infer<typeof repoSchema>
type StatisticsConfig    = z.infer<typeof statisticsSchema>
type CommentsConfig      = z.infer<typeof commentsSchema>

// export const val
export const config               : Config              = configSchema.parse(rawConfig);
export const siteConfig           : SiteConfig          = config.siteConfig;
export const backgroundConfig     : BackgroundConfig    = config.background;
export const codeBlockConfig      : CodeBlockConfig     = config.codeBlock;
export const frostedGlassConfig   : FrostedGlassConfig  = config.frostedGlassStyle;
export const cardSpotlightConfig  : CardSpotlightConfig = config.cardSpotlight;
export const themeConfig          : ThemeConfig         = config.theme;
export const authorConfig         : AuthorConfig        = config.author;
export const sidebarConfig        : SidebarConfig       = config.sidebar;
export const repoConfig           : RepoConfig          = config.repo;
export const statisticsConfig     : StatisticsConfig    = config.statistics;
export const commentsConfig       : CommentsConfig      = config.comments;
