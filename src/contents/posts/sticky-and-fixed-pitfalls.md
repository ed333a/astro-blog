---
title: sticky 与 fixed 的十个坑
description: 祖先元素有 overflow, sticky 就失效了? 给 fixed 元素加 hover 动画为什么会让它跑偏? 一次踩坑记录, 附带每个坑的最小复现。
type: post

draft: false

postID: 'd9b3f82a6c17'

date: 2026-09-05 09:15:00

category: 前端

tags:
- CSS
- 布局
---

`position: sticky` 和 `fixed` 都很「便宜」, 便宜到大家总是先试它们, 出问题再回头改结构。
下面这些坑我基本都踩过一遍, 记下来省点时间。

## sticky: 能不能粘住取决于祖先

1. **祖先有 `overflow: hidden/auto/scroll`** —— sticky 的参照物就变成了那个滚动容器。
   最典型的是给外层套了个 `overflow-x: hidden` 来防横向滚动, 顺手把 sticky 废掉;
2. **没有指定 `top/bottom`** —— 只写 `position: sticky` 等于没写;
3. **粘性范围 = 父元素** —— 父元素高度等于元素自身高度时, 它「没有地方可粘」;
4. **表格里** —— `th` 上的 sticky 需要 `border-collapse: separate`, 否则粘住的边框会消失;
5. **`z-index` 不够** —— 粘住的元素下面还有别的定位元素时, 会被压住。

```css
.header {
  position: sticky;
  top: 0;
  /* 祖先链上不要出现 overflow, 或者把 sticky 放到那一层外面 */
}
```

## fixed: 定位基准是「包含块」而不是视口

6. **祖先有 `transform` / `filter` / `perspective` / `contain`** —— 这些属性会创建包含块,
   fixed 就变成相对那个祖先定位了。给 fixed 元素加 hover 动画时特别容易撞上这条;
7. **祖先有 `will-change: transform`** —— 效果和上一条一样, 但更难发现;
8. **`inset-x-0` + `mx-auto` 比 `left: 50%` + `translateX(-50%)` 稳** —— 后者又引入了 transform,
   挖了第 6 条那个坑。

## 两者都会遇到的

9. **过渡属性别选 `all`** —— 布局属性被过渡时会出现一整帧的抖动;
10. **`backdrop-filter` 与 fixed 组合** —— 模糊的取样范围跟着包含块走, 所以毛玻璃面板后面
    最好放一层固定不动、可预测的背景 (比如固定在全屏的背景图)。

```ts
// 稳妥一点的做法: 只在需要的时候才写入行内样式, 而不是一直挂着 transform
const panel = document.querySelector<HTMLElement>("[data-panel]");
panel?.style.setProperty("--panel-offset", "12px");
```

一句总结: **出现「明明写了 position 却不生效」时, 先往上翻三代祖先**, 十有八九是某个
`overflow` / `transform` / `filter` 在那儿等着你。
