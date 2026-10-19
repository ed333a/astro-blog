// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import swup from '@swup/astro';

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
    ],
    vite: {
        // Tailwind CSS v4 (样式入口: src/styles/global.css)
        plugins: [tailwindcss()],
    },
    markdown: {
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

