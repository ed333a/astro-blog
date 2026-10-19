/**
 * 文章集合的统一入口。
 *
 * 草稿策略:
 *   · dev (astro dev)   → 包含草稿, 方便在本地预览;
 *   · build (astro build) → 排除草稿, 草稿不参与构建。
 * import.meta.env.DEV 由 Vite 在构建期替换成常量, 所以两种模式下 getStaticPaths 的行为也会跟着变。
 */
import { getCollection } from "astro:content";
import { sortPostsDescending } from "./posts";

/** 是否把草稿文章纳入渲染 (dev 为 true, build 为 false) */
export const includeDrafts: boolean = import.meta.env.DEV;

/** 取文章集合 (按发布时间倒序); dev 下含草稿, build 时只含已发布文章。 */
export async function getSortedPosts() {
    const posts = await getCollection("posts");
    const visible = includeDrafts ? posts : posts.filter(({ data }) => !data.draft);
    return sortPostsDescending(visible);
}
