/**
 * 标签相关的纯函数: 标签哈希 (URL 片段)。
 *
 * 标签原文可能是中文 / 带符号, 直接塞进 URL 既难看又要处理编码, 所以给每个标签算一个
 * 稳定的短哈希 (同一标签每次构建结果一致), 标签页的链接就用它: /tags/<hash>。
 */

import { createHash } from "node:crypto";
import { siteConfig } from "./config";

/** 标签 → 稳定的短哈希 (URL 片段) */
export function tagHash(tag: string, length = siteConfig.hashLength): string {
    return createHash("sha256").update(tag).digest("hex").slice(0, length);
}