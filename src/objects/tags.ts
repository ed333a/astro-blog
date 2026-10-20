/**
 * 标签相关的纯函数: 标签哈希 (URL 片段)。
 *
 * 标签原文可能是中文 / 带符号, 直接塞进 URL 既难看又要处理编码, 所以给每个标签算一个
 * 稳定的短哈希 (同一标签每次构建结果一致), 标签页的链接就用它: /tags/<hash>。
 */

import { createHash } from "node:crypto";

/** 标签在 URL 里的哈希长度 (十六进制字符数) */
const TAG_HASH_LENGTH = 12;

/** 标签 → 稳定的短哈希 (URL 片段) */
export function tagHash(tag: string, length = TAG_HASH_LENGTH): string {
    return createHash("sha256").update(tag).digest("hex").slice(0, length);
}