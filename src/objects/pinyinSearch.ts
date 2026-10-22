/**
 * 站内搜索用的拼音字段 (构建期生成, 由 pages/search.json.ts 写进索引)。
 *
 * 与 objects/pinyin.ts 的区别:
 *   · pinyin.ts 是给永久链接用的内置轻量表, 不引入依赖, 表里没有的字直接丢掉;
 *   · 这里用 pinyin-pro: 它带词库, 能按词判断多音字 (重庆 → chong qing, 银行 → yin hang),
 *     并且支持把 ü 写成 v (lv / nv), 和用户实际敲的拼音一致。
 *
 * 输出统一成「空格分隔的音节串」(如 "yi tai wang"), 前端 (objects/searchQuery.ts)
 * 再据此现算「全拼连写 yitaiwang」和「首字母 ytw」两种形态 —— 索引里只存一份, 不重复占体积。
 */
import { pinyin } from "pinyin-pro";
import type { PinyinFields } from "./searchQuery";

/**
 * 各字段最多给多少个字做转换。
 * 拼音比汉字长好几倍, 正文全转会让 search.json 明显膨胀, 所以只取开头一段;
 * 标题 / 标签 / 分类 / 摘要本来就很短, 基本不会被截断。
 */
const TITLE_LIMIT   = 80;
const EXCERPT_LIMIT = 120;
const CONTENT_LIMIT = 300;

/** 拼音串里只保留字母和数字, 其余 (标点 / 空白 / 未收录字符) 一律丢掉, 音节之间用空格隔开 */
const PINYIN_UNSAFE = /[^a-z0-9]/g;
/** 是否含有汉字: 纯英文/数字的字段不用出拼音 (原文搜索本来就能命中) */
const HAN_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff]/;

/**
 * 把一段文本转成空格分隔的拼音音节串 (无音调)。
 * 表里的汉字以外的字符 (标点 / 空格 / 数字) 会被 pinyin-pro 原样带出来, 这里清洗掉;
 * 清洗后为空的音节直接丢弃, 于是 "以太网, PHY" → "yi tai wang phy"。
 */
export function toPinyinSyllables(text: string, limit: number): string {
    const slice = Array.from(text ?? "").slice(0, limit).join("").trim();
    if (!slice || !HAN_PATTERN.test(slice)) return "";

    return pinyin(slice, { toneType: "none", type: "array", nonZh: "consecutive", v: true })
        .map((syllable) => syllable
            .toLowerCase()
            // pinyin-pro 走词库的路径偶尔漏掉 v 转换 (旅行 → lü), 这里兜一下, 保证能搜 "lv"
            .replace(/ü/g, "v")
            .replace(PINYIN_UNSAFE, ""))
        .filter(Boolean)
        .join(" ");
}

/** 一条搜索记录需要的全部拼音字段 */
export function buildSearchPinyin(post: {
    title   : string;
    excerpt : string;
    category?: string;
    tags    : string[];
    /** 已截断的正文纯文本 (与 search.json 里的 content 同一份) */
    content : string;
}): Required<PinyinFields> {
    return {
        title   : toPinyinSyllables(post.title, TITLE_LIMIT),
        tags    : toPinyinSyllables(post.tags.join(" "), TITLE_LIMIT),
        category: toPinyinSyllables(post.category ?? "", TITLE_LIMIT),
        excerpt : toPinyinSyllables(post.excerpt, EXCERPT_LIMIT),
        content : toPinyinSyllables(post.content, CONTENT_LIMIT),
    };
}
