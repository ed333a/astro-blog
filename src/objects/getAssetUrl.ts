import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

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

/** 背景图片支持的扩展名 (文件夹里的 README.md / 子目录等一律跳过) */
const IMAGE_EXTENSIONS = [".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".bmp", ".ico"];

function isImage(filePath: string): boolean {
    const lower = filePath.toLowerCase();
    return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * 列出某个「文件夹」下的所有文件地址 URL (排序后返回, 保证每次构建顺序稳定)。
 *
 * 与 getAsset 的路径规则一致:
 *   · 以 "/" 开头 → 相对于 public 目录, 直接读 public/<path> 下的图片, 返回 "/" 开头的 URL;
 *   · 其他        → 相对于 src 目录, 通过 import.meta.glob 拿到构建后的 hash URL。
 *
 * 用在背景图「随机展示」场景: 构建期把所有候选图写进 /backgrounds.json,
 * 前端 fetch 后随机取一张 (见 src/pages/backgrounds.json.ts 与 components/BodyBackground.astro)。
 */
export function getAssetsInFolder(relativeFolderPath: string): string[] {
    // public 目录: 资源不经过 hash, 按原路径直接暴露
    if (relativeFolderPath.startsWith("/")) {
        const folder = relativeFolderPath.replace(/\/+$/, "");
        const dir = path.join(process.cwd(), "public", folder);
        if (!existsSync(dir)) return [];

        return readdirSync(dir, { recursive: true, encoding: "utf8" })
            .filter((file) => isImage(file))
            .map((file) => `${folder}/${file.split(path.sep).join("/")}`)
            .sort();
    }

    // src 目录: 复用 assetModules 的 glob 结果
    const prefix = `/src/${relativeFolderPath.replace(/\/+$/, "")}/`;
    return Object.keys(assetModules)
        .filter((key) => key.startsWith(prefix) && isImage(key))
        .sort()
        .map((key) => assetModules[key]);
}
