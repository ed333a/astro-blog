import { devConfig } from "@/ts/data/config";

const imageModules = import.meta.glob<string>(
	"../../assets/**",
	{ eager: true, query: "url", import: "default" },
) as Record<string, string>;

if (devConfig.level === "TRACE") {
	console.log("Loaded assets:", imageModules);
}

// 将资源的 (相对) 路径映射到真实路径
export function getAsset(relativePath: string): string {
	// 如果已经是绝对路径 (在 public 文件夹下, 以 / 开头, 或为网络链接), 直接返回
	if (relativePath.startsWith("/")) return relativePath;
	if (relativePath.startsWith("http")) return relativePath;

	// 否则认为路径是相对于 src/assets 目录下的，构建完整 glob 匹配路径
	const fullPath = `../../${relativePath}`;
	const url = imageModules[fullPath];
	if (!url) {
		console.warn(`[WARN] 无效的资源路径: ${fullPath}. 请确认路径是否存在, 若资源位于 public 文件夹下, 路径应当以 '/' 开头.`);
		return "";
	}
	return url;
}
