---
title: 从零搭一个毛玻璃风格的 Astro 博客
description: 从背景图、玻璃面板到主题切换, 把「视觉」拆成能被配置驱动的参数 —— 顺便说说为什么参数最好都写在一个 config.yml 里。
type: post

draft: false

# 这篇故意不写 postID: 构建时会按 title + description 的哈希自动生成一个,
# 永久链接里出现的就是那个哈希值 (post/<自动生成的 ID>)
# postID: ''

date: 2026-08-12 19:20:00

category: Astro

tags:
- Astro
- 毛玻璃
- 设计
postID: '3568c7ea6d3a'
---

一个博客的「视觉」其实可以拆成三个可配置的部分: **背景**、**玻璃面板**、**主题**。
只要这三块能被参数驱动, 换风格就等于改配置, 不用去翻组件代码。

## ① 背景: 玻璃的前提

毛玻璃的本质是「把身后的东西糊掉」, 所以面板背后必须有东西可糊。做法就是一张铺满视口的固定背景图:

```astro
<img
  src={bgDark.src}
  alt=""
  aria-hidden="true"
  class="pointer-events-none fixed inset-0 -z-10 h-screen w-screen object-cover"
/>
```

`fixed` 而不是 `absolute` 是刻意的: 长文章滚起来的时候, 背景不该跟着一起滚动 —— 否则
「同一块玻璃在不同位置糊出不同东西」, 观感会很碎。

## ② 玻璃面板: 一个类名搞定

面板的参数 (模糊强度、底色、描边、投影、圆角) 全部来自配置文件, 由布局组件写成 `<html>` 上的
CSS 变量, 组件只负责挂一个类名:

```astro
<Tag class:list={[className, "frosted-glass"]} {...rest}>
  <slot />
</Tag>
```

好处是「调效果」和「写组件」彻底分开: 想让导航栏更透一点, 改配置文件里的一个数字就行。

```yaml
frostedGlassStyle:
  blur: 5            # 背景模糊强度 (px)
  background:        # 玻璃底色, 日/夜各一份
    light: 'rgba(255, 0, 0, 0.05)'
    dark: 'rgba(18, 18, 24, 0.42)'
  radius:
    navbar: 999      # 导航栏是胶囊
    card: 32         # 卡片是圆角矩形
```

## ③ 主题: 变量层面切换

主题切换最省事的做法不是给每个元素写 `dark:` 变体, 而是**覆盖同名变量**:

- `<html>` 上加一个类 (比如 `Dark`);
- 在 `.Dark` 下重新赋值 `--color-*` / `--glass-*`;
- 所有工具类引用的都是变量, 于是整站自动跟着换。

再加上一条「只过渡颜色类属性」的全局过渡, 切换时就顺滑了:

```css
html, html * {
  transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease;
}
```

## 小结

- 视觉参数集中到一个配置文件, 组件只消费变量;
- 背景用 `fixed` + 背景图是玻璃感的地基;
- 主题切换在变量层面完成, 不要在组件里到处写 `dark:`。

后面再想加东西 (代码块工具栏、文章卡片的光斑描边、移动端侧边栏), 都只是「再加一条变量」而已。
