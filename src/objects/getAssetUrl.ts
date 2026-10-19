/**
 * 资源路径解析: 把 config.yml 里的相对路径映射成构建后的真实 URL。
 *
 * 规则 (与 config.yml 注释一致):
 *   · 以 "/" 开头    → 相对于 public 目录, 原样返回
 *   · 以 "http" 开头 → 外链, 原样返回
 *   · 其他           → 相对于 src 目录 (例如 "assets/img/blog_bg/bg8.svg")
 *
 * 参考 temp/getAssetUrl.ts, 这里把 glob 的基准换成当前项目的 src/assets。
 */
const assetModules = import.meta.glob<string>("/src/assets/**", {
    eager : true,
    query : "url",
    import: "default",
}) as Record<string, string>;

export function getAsset(relativePath: string): string {
    if (relativePath.startsWith("/")) return relativePath;
    if (relativePath.startsWith("http")) return relativePath;

    const fullPath = `/src/${relativePath}`;
    const url = assetModules[fullPath];
    if (!url) {
        console.warn(
            `[WARN] 无效的资源路径: ${fullPath}. 请确认路径是否存在, 若资源位于 public 文件夹下, 路径应当以 '/' 开头.`,
        );
        return "";
    }
    return url;
}
