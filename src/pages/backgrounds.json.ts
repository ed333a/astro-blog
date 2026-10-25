/**
 * 背景图随机列表: /backgrounds.json
 *
 * 当 config.yml 里 background.image.src 指向一个文件夹 (且 random 为 true) 时,
 * 前端从这份数组里随机挑一张当背景。数组在构建期生成 (静态站点没有后端):
 *   · 每一项都是构建后的真实 URL (src 下的资源带 hash, public 下的资源原样);
 *   · 顺序经过排序, 保证每次构建结果稳定。
 *
 * 消费方见 components/BodyBackground.astro。
 */
import type { APIRoute } from "astro";
import { backgroundConfig } from "../objects/config";
import { getAssetsInFolder } from "../objects/getAssetUrl";

export const GET: APIRoute = () => {
    const images = backgroundConfig.image.enable
        ? getAssetsInFolder(backgroundConfig.image.src)
        : [];

    return new Response(JSON.stringify(images), {
        headers: {
            "Content-Type" : "application/json; charset=utf-8",
            // 列表跟着构建走, 给浏览器一点缓存, 但别让它长期停留在旧内容上
            "Cache-Control": "public, max-age=3600",
        },
    });
};