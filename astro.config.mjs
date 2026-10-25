// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import swup from '@swup/astro';
import icon from 'astro-icon';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { unified } from '@astrojs/markdown-remark';

// LaTeX 数学公式: 是否开启来自 config.yml 的 siteConfig.latex.enable。
// 开启时用 remark-math 解析 $...$ / $$...$$, 再用 rehype-katex 渲染成 HTML (样式见 layouts/Layout.astro)。
const rawConfig = parse(readFileSync(new URL('./src/config.yml', import.meta.url), 'utf-8'));
const latexEnabled = rawConfig?.siteConfig?.latex?.enable ?? true;

// https://astro.build/config
export default defineConfig({
    integrations: [
        // 页面过渡 (参考 fuwari 模板): Swup 只替换 #swup-container 的内容,
        // 导航栏 / 背景 / 返回顶部都在容器外, 所以背景完全不动。
        // 淡出淡入动画见 src/styles/global.css 的 .transition-swup-fade。
        swup({
            theme: false,
            animationClass: "transition-swup-",
            containers: ["#swup-container"],
            // 传对象给 SwupScrollPlugin: offset = 导航栏高度, 让锚点(目录)滚动后停在导航栏下方。
            // 类型声明里 smoothScrolling 只写了 boolean, 但实现会把这个对象原样传给插件。
            smoothScrolling: /** @type {any} */ ({ offset: 96 }),
            cache: true,
            preload: true,
            accessibility: true,
            updateHead: true,
            updateBodyClass: false,
            globalInstance: true,
        }),
        // 图标: 用 Iconify 的图标 id (config.yml 里写 fa7-solid:xxx), 构建期就内联成 SVG,
        // 没有运行时脚本 / 字体文件, 也不会先闪一下再出图标。
        // 本站装的图标集是 Font Awesome 7 (@iconify-json/fa7-solid)。
        // 不写 include 时 astro-icon 会把已安装的整套图标读进构建进程 (只在构建期, 不进页面体积);
        // 想缩短构建时间可以改成 include: { "fa7-solid": ["house", "file-lines", ...] }。
        icon(),
    ],
    vite: {
        // Tailwind CSS v4 (样式入口: src/styles/global.css)
        plugins: [tailwindcss()],
    },
    markdown: {
        // 行内 $...$ / 块级 $$...$$ 数学公式: 用 @astrojs/markdown-remark 的 unified 处理器
        // (Astro 7 默认的 Sätteri 处理器不支持 remark/rehype 插件, 需要用 unified 才能跑 remark-math / rehype-katex)
        ...(latexEnabled
            ? {
                processor: unified({
                    remarkPlugins: [remarkMath],
                    rehypePlugins: [rehypeKatex],
                }),
            }
            : {}),
        // 代码块配色 (见 config.yml 的 codeBlock): 日间 github-light, 夜间 github-dark。
        // 双主题下 shiki 会把两套颜色都写进每个 token 的行内样式里 —— 行内是日间配色,
        // 夜间那份放在 --shiki-dark-* 变量里, 由 styles/global.css 的 shiki-theme 工具类
        // 在 <html class="Dark"> 时用 !important 换成变量里的值 (纯 CSS 切主题, 不需要脚本)。
        shikiConfig: {
            themes: { light: 'github-light', dark: 'github-dark' },
            defaultColor: 'light',
            // 折行交给代码块工具栏上的开关 (config.yml 的 codeBlock.wordwrap) 控制, 这里不锁死
            wrap: false,
        },
    },
});

