/**
 * 站内搜索索引: /search.json
 *
 * 这是个静态站点, 没有后端, 所以搜索索引必须在构建期生成好:
 *   · 由 components/SearchBox.astro 在第一次聚焦搜索框时请求一次, 之后缓存在内存里;
 *   · 只收录当前构建会渲染的文章 (dev 含草稿, build 不含, 与 getSortedPosts 的口径一致);
 *   · content 是正文的纯文本 (取前 2000 字即可覆盖绝大多数搜索需求, 顺便控制索引体积),
 *     标题 / 摘要 / 标签 / 分类则原样给出, 由前端按权重排序;
 *   · pinyin 是同一批字段的拼音音节串 (见 objects/pinyinSearch.ts), 前端据此支持
 *     「全拼 / 首字母」搜索; 正文只转开头一段, 拼音比汉字长, 全转会让索引明显变大。
 */
import type { APIRoute } from "astro";
import { getSortedPosts } from "../objects/collections";
import { buildSearchPinyin } from "../objects/pinyinSearch";
import { toPlainText } from "../objects/posts";

/** 正文最多收录多少个字符 (纯文本) */
const CONTENT_LIMIT = 2000;

export const GET: APIRoute = async () => {
    const posts = await getSortedPosts();

    const index = posts.map((post) => {
        const content = toPlainText(post.body ?? "").slice(0, CONTENT_LIMIT);

        return {
            title   : post.data.title,
            excerpt : post.data.excerpt,
            category: post.data.category ?? "",
            tags    : post.data.tags,
            dateText: post.data.dateText ?? "",
            // 站内路径 (不含开头的 "/"), 前端拼成 href
            path    : post.data.path,
            content,
            // 拼音索引: 前端拼出「全拼连写 / 首字母」两种形态再匹配 (objects/searchQuery.ts)
            pinyin  : buildSearchPinyin({
                title   : post.data.title,
                excerpt : post.data.excerpt,
                category: post.data.category,
                tags    : post.data.tags,
                content,
            }),
        };
    });

    return new Response(JSON.stringify(index), {
        headers: {
            "Content-Type" : "application/json; charset=utf-8",
            // 索引跟着构建走, 给浏览器一点缓存, 但别让它长期停留在旧内容上
            "Cache-Control": "public, max-age=3600",
        },
    });
};
