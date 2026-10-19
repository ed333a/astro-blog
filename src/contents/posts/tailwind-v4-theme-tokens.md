---
title: Tailwind v4 的主题变量与设计令牌
description: 用 @theme 定义颜色、圆角与字体, 设计令牌就直接变成工具类; 再配合 @utility 写自己的工具类, 样式入口里几乎不用写"传统 CSS"。
type: post

draft: false

postID: 'a4d17e6c3b52'

date: 2026-09-12 21:00:00

category: CSS

tags:
- CSS
- Tailwind
---

Tailwind v4 最大的变化是「配置回到 CSS 里」: 不再有 `tailwind.config.js`, 设计令牌写成 `@theme` 里的
CSS 变量, 而这些变量会自动长出一整套工具类。

## @theme: 变量即工具类

```css
@import "tailwindcss";

@theme {
  /* --color-*  →  bg-* / text-* / border-* ... */
  --color-ink: #f8f8fb;
  --color-page: #1b1b20;

  /* 自定义缓动也能变成工具类: ease-pop */
  --ease-pop: cubic-bezier(0.34, 1.56, 0.64, 1);

  /* 动画: 名字里的 --animate-* 会生成 animate-* 工具类 */
  --animate-tool-pop: tool-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);

  @keyframes tool-pop {
    0% { transform: scale(0.6); opacity: 0.4; }
    60% { transform: scale(1.12); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
  }
}
```

定义完这些, 页面里就能直接写 `bg-page text-ink ease-pop animate-tool-pop`。把 `@keyframes` 写在
`@theme` 里面, Tailwind 才会把它一起打包 —— 只写在外面的动画, 有可能会被当成未使用的样式丢掉。

## 覆盖令牌: 主题切换不用改类名

令牌就是 CSS 变量, 所以「换主题」这件事可以在变量层面完成:

```css
:root {
  --color-page: #e8e8ee;
}

html.Dark {
  color-scheme: dark;
  --color-page: #0b0b0f;
}
```

工具类里引用的是 `var(--color-page)`, 于是整站的颜色跟着 `<html class="Dark">` 一起换,
组件模板里一个 `dark:` 变体都不用加。

## 自定义变体: 把状态交给 HTML 属性

不同主题「模式」(Light/Dark/Auto)、抽屉开合这类状态, 用 `@custom-variant` 声明一次:

```css
/* 深浅色外观: 跟着 .Dark 类走, 覆盖 Tailwind 默认的 prefers-color-scheme 策略 */
@custom-variant dark (&:where(.Dark, .Dark *));

/* 主题「模式」: 三态都要能分别命中 */
@custom-variant theme-light (&:where(html[data-theme="Light"], html[data-theme="Light"] *));

/* 抽屉开合: 只认 <html data-nav="open">, 按钮 / 遮罩 / 抽屉各自认这个状态 */
@custom-variant nav-open (&:where(html[data-nav="open"], html[data-nav="open"] *));
```

写完之后 `nav-open:translate-x-0` 这样的类名就能用了, 而且状态只有一个来源 ——
脚本只负责改属性, 谁都行不用引用谁。

## @utility: 需要嵌套选择器的场合

卡片的「跟随鼠标的高光描边」要靠径向渐变 + mask 才能画出来, 这种没法用单个工具类表达,
就封装成 `@utility`:

```css
@utility spotlight-border {
  position: relative;

  &::before {
    content: "";
    position: absolute;
    inset: -1px;
    border-radius: inherit;
    padding: 1px;
    background: radial-gradient(circle 220px at var(--spotlight-x, 50%) var(--spotlight-y, 50%), white, transparent);
    mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    mask-composite: exclude;
    opacity: 0;
    transition: opacity 0.3s ease-out;
  }
}
```

脚本只负责把鼠标坐标写进 `--spotlight-x/y`, 剩下的美术工作全在 CSS 里 —— 这就是 `@utility`
最有价值的场景: 把「一段只属于某个组件的复杂样式」变成一个可复用的类名。

> 一个小心得: `@utility` 里尽量别写死颜色, 用 `@theme` 的变量或配置生成的 CSS 变量,
> 这样切主题时它们会自动跟着变。
