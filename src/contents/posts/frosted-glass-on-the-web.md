---
title: '在网页上实现毛玻璃: backdrop-filter 的边缘与性能'
description: 一行 backdrop-filter 就能做出毛玻璃, 但真正难的是「糊了却看不清文字」。记录模糊强度、玻璃底色与描边之间的平衡, 以及两个容易踩到的兼容性坑。
type: post

draft: false

# 手动指定文章 ID (永久链接 post/<postID>); 不写的话会按 title + description 自动生成
postID: '7f3a91c2b4d8'

date: 2026-09-27 20:15:16

category: CSS

tags:
- CSS
- 毛玻璃
- 前端
---

毛玻璃几乎是「有质感」这三个字最偷懒的实现方式: 一行 `backdrop-filter` 就能让面板后面的照片糊掉。
但真正上手会发现, 难点从来不是「怎么糊」, 而是「糊完之后文字还看得清吗」。

## 三件套: 模糊、底色、描边

一块像样的玻璃面板至少要三样东西:

1. **背景模糊** —— `backdrop-filter: blur()`, 把面板身后的画面糊掉;
2. **半透明底色** —— 太实就不通透, 太透就糊不住文字;
3. **描边与投影** —— 顶部那一道内高光才是「厚度」的来源。

```css
.glass {
	background-color: rgb(255 255 255 / 0.08);
	border: 1px solid rgb(255 255 255 / 0.3);
	box-shadow: 0 10px 30px -14px rgb(0 0 0 / 0.3), inset 0 1px 0 rgb(255 255 255 / 0.3);
	-webkit-backdrop-filter: blur(5px) saturate(1.4);
	backdrop-filter: blur(5px) saturate(1.4);
}
```

三样里最容易失控的是**底色**。同一个 `rgb(255 255 255 / 0.08)`, 放在浅色照片上几乎看不见,
放在深色照片上又会变成一块白雾 —— 所以底色最好跟着主题走, 日间和夜间各一份。

## 文字对比度: 阴影比底色更管用

面板背后的画面是不可控的 (用户往下滚一屏, 背后可能从白色变成深蓝)。
指望用底色把对比度稳下来, 结果是玻璃越来越实; 更划算的做法是给文字加一层淡淡的 `text-shadow`:

```css
body {
	/* text-shadow 是继承属性, 写一次就能覆盖全站 */
	text-shadow: 0 1px 2px rgb(0 0 0 / 0.6), 0 0 12px rgb(0 0 0 / 0.4);
}
```

浅色文字 + 深色阴影, 放在任何照片上都能「抠」出来, 而且完全不影响玻璃的通透感。

## 两个兼容性坑

- **前缀**: Safari 18 之前只认 `-webkit-backdrop-filter`。构建工具按浏览器目标优化时,
  很容易把带前缀的那条声明当成冗余删掉 —— 所以它得单独待在一个 `@supports` 块里;
- **完全不支持时**: 面板会退化成「背景图原样透出来 + 文字糊成一团」。用
  `@supports not (backdrop-filter: blur(1px))` 兜一块实色底, 直接放弃模糊, 但保证可读。

## 性能: 别给模糊加过渡

模糊半径越大、面板越大, 合成层重绘就越贵。手机上尤其明显, 所以:

- 过渡里**不要**包含 `backdrop-filter`, 颜色和位移可以动, 模糊一动就得整块重算;
- 定位尽量别用 `transform` (它会创建新的包含块, 让取样范围变得不好预测);
- 面板数量控制在「一屏能看到几个」的量级, 别把每个列表项都做成玻璃。

下面这段是「主题管理器」的简化版, 可以参考这种「只过渡颜色类属性」的写法 (代码块超过 30 行会自动折叠,
底部的渐变就是折叠的提示 —— 点击右上角可以展开):

```ts
// 只过渡颜色类属性: transform / backdrop-filter 都故意排除在外
const TRANSITION_PROPERTIES = [
	"background-color",
	"border-color",
	"color",
	"box-shadow",
	"text-shadow",
] as const;

export enum BlogTheme {
	Light = "Light",
	Dark = "Dark",
	Auto = "Auto",
}

export function transitionStyle(): string {
	return TRANSITION_PROPERTIES.map((property) => `${property} 0.3s ease`).join(", ");
}

/** 当前主题「模式」: 存在 localStorage 里, 首帧之前由内联脚本写到 <html data-theme> 上 */
export function currentTheme(): BlogTheme {
	return (localStorage.getItem("theme") as BlogTheme) || BlogTheme.Auto;
}

/** 应用主题: 只改 <html> 上的类与属性 —— 颜色变量会自己跟着换 */
export function applyTheme(mode: BlogTheme): void {
	const root = document.documentElement;

	switch (mode) {
		case BlogTheme.Light:
			root.classList.remove(BlogTheme.Dark);
			break;
		case BlogTheme.Dark:
			root.classList.add(BlogTheme.Dark);
			break;
		case BlogTheme.Auto:
			root.classList.toggle("Dark", window.matchMedia("(prefers-color-scheme: dark)").matches);
			break;
	}

	localStorage.setItem("theme", mode);
	root.dataset.theme = mode;
}

/** 亮色 → 暗色 → 自动 → 亮色 */
export function nextTheme(): BlogTheme {
	const order = [BlogTheme.Light, BlogTheme.Dark, BlogTheme.Auto];
	return order[(order.indexOf(currentTheme()) + 1) % order.length];
}

// 系统深浅色变化时, 只有 Auto 模式需要跟着动
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
	if (currentTheme() === BlogTheme.Auto) applyTheme(BlogTheme.Auto);
});
```

## 延伸阅读

毛玻璃只是「表面的功夫」, 真正决定一个博客好不好用的是内容结构:

- ${post 2c8e5b7a91f4 [用 Content Collections 管理 Markdown 文章]}
- ${post a4d17e6c3b52}
