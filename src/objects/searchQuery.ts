/**
 * 站内搜索的前端打分逻辑 (纯函数, 不碰 DOM / 不依赖 node)。
 *
 * 由 components/SearchBox.astro 的内联 <script> 引入并打包到浏览器;
 * 数据来自构建期生成的 /search.json (见 pages/search.json.ts)。
 *
 * 命中规则: 查询按空格分词, 每个词都必须命中。原文优先, 原文完全没命中时才看拼音:
 *   · 全拼连写  yi tai wang → yitaiwang  (输入 yitaiwang / taiwang)
 *   · 首字母    yi tai wang → ytw        (输入 ytw, 2 个字母以上才参与)
 * 拼音音节串由构建期写入索引 (见 objects/pinyinSearch.ts), 这里算到 SearchEntry 上缓存一次,
 * 每次输入就不再重复计算。
 */

/** 拼音字段: 构建期生成; 设成可选是为了兼容浏览器里尚未过期的旧索引 (/search.json 有 1 小时缓存) */
export interface PinyinFields {
    title   ?: string;
    tags    ?: string;
    category?: string;
    excerpt ?: string;
    content ?: string;
}

/** /search.json 里的一条记录 */
export interface SearchItem {
    title   : string;
    excerpt : string;
    category: string;
    tags    : string[];
    dateText: string;
    /** 站内路径 (不含开头的 "/") */
    path    : string;
    /** 正文纯文本 (构建期截断) */
    content : string;
    pinyin ?: PinyinFields;
}

/** 一个字段的拼音形态 */
export interface PinyinForms {
    /** 全拼连写: "yi tai wang" → "yitaiwang" */
    compact : string;
    /** 首字母: "yi tai wang" → "ytw" */
    initials: string;
}

/** 索引条目 + 预先算好的拼音形态 (只在加载索引时算一次) */
export interface SearchEntry {
    item  : SearchItem;
    pinyin: {
        title   : PinyinForms;
        tags    : PinyinForms;
        category: PinyinForms;
        excerpt : PinyinForms;
        content : PinyinForms;
    };
}

const EMPTY_FORMS: PinyinForms = { compact: "", initials: "" };

/** 拼音只由字母和数字组成, 带别的字符的查询词没必要去试拼音 */
const PINYIN_TERM = /^[a-z0-9]+$/;

/** 拼音权重: 比原文低一档, 保证「中文原文命中」总排在「拼音命中」前面 */
const PINYIN_WEIGHT = {
    title   : 95,
    tags    : 34,
    category: 24,
    excerpt : 12,
    content : 4,
} as const;

const normalize = (value: string) => value.toLocaleLowerCase("zh-CN");

/** 音节串 → 连写 / 首字母两种形态; 没有拼音 (纯英文文章等) 时返回空形态 */
const toForms = (syllables?: string): PinyinForms => {
    const value = (syllables ?? "").trim();
    if (!value) return EMPTY_FORMS;

    const list = value.split(/\s+/).filter(Boolean);
    return {
        compact : list.join(""),
        initials: list.map((syllable) => syllable.slice(0, 1)).join(""),
    };
};

/** 给索引补上拼音形态 (一次性, 之后 findMatches 直接用) */
export function buildSearchEntries(items: SearchItem[]): SearchEntry[] {
    return items.map((item) => ({
        item,
        pinyin: {
            title   : toForms(item.pinyin?.title),
            tags    : toForms(item.pinyin?.tags),
            category: toForms(item.pinyin?.category),
            excerpt : toForms(item.pinyin?.excerpt),
            content : toForms(item.pinyin?.content),
        },
    }));
}

/**
 * 单个字段的拼音命中分:
 *   连写前缀 (yitaiwang) > 首字母前缀 (ytw) > 连写包含 > 首字母包含, 逐级降权。
 * 单字母的首字母匹配太容易误伤 (几乎每个标题都含), 只对 2 个字母以上生效。
 */
const scorePinyinForms = (forms: PinyinForms, term: string, weight: number): number => {
    if (!forms.compact) return 0;

    if (forms.compact.startsWith(term)) return weight;
    if (term.length > 1 && forms.initials.startsWith(term)) return Math.round(weight * 0.9);
    if (forms.compact.includes(term)) return Math.round(weight * 0.8);
    if (term.length > 1 && forms.initials.includes(term)) return Math.round(weight * 0.45);
    return 0;
};

/** 一个查询词在整条记录上的拼音命中分 (各字段相加, 与原文打分的口径一致) */
const scorePinyin = (entry: SearchEntry, term: string): number => {
    if (!PINYIN_TERM.test(term)) return 0;

    const { pinyin: forms } = entry;
    return scorePinyinForms(forms.title, term, PINYIN_WEIGHT.title)
        + scorePinyinForms(forms.tags, term, PINYIN_WEIGHT.tags)
        + scorePinyinForms(forms.category, term, PINYIN_WEIGHT.category)
        + scorePinyinForms(forms.excerpt, term, PINYIN_WEIGHT.excerpt)
        + scorePinyinForms(forms.content, term, PINYIN_WEIGHT.content);
};

/** 每个词都要命中 (空格分隔), 按命中位置加权: 标题 > 标签 > 分类 > 摘要 > 正文; 都没命中再看拼音 */
const scoreEntry = (entry: SearchEntry, terms: string[]): number => {
    const { item } = entry;
    const title    = normalize(item.title);
    const tags     = normalize(item.tags.join(" "));
    const category = normalize(item.category);
    const excerpt  = normalize(item.excerpt);
    const content  = normalize(item.content);

    let total = 0;
    for (const term of terms) {
        let score = 0;
        if (title.includes(term)) score += title.startsWith(term) ? 120 : 100;
        if (tags.includes(term)) score += 40;
        if (category.includes(term)) score += 30;
        if (excerpt.includes(term)) score += 15;
        if (content.includes(term)) score += 5;

        // 原文命中过就不再叠拼音分, 免得同一个词被算两次、把排名带偏
        if (score === 0) score = scorePinyin(entry, term);

        // 有一个词完全没命中就不算结果
        if (score === 0) return 0;
        total += score;
    }
    return total;
};

/**
 * 搜索: 返回分数最高的 limit 条记录。
 * 同分按日期倒序 (新文章优先), 与原文搜索的既有行为一致。
 */
export function findMatches(entries: SearchEntry[], query: string, limit: number): SearchItem[] {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];

    return entries
        .map((entry) => ({ entry, score: scoreEntry(entry, terms) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score || b.entry.item.dateText.localeCompare(a.entry.item.dateText))
        .slice(0, limit)
        .map(({ entry }) => entry.item);
}
