// 顶部导航的链接: 桌面端排在导航栏里, 移动端搬进侧边栏 (components/NavSidebar.astro)。
// 两处共用这一份, 免得加一个页面时改了一处漏了另一处。

export interface NavLink {
    href: string;
    label: string;
}

export const navLinks: NavLink[] = [
    { href: "/", label: "主页" },
    { href: "/blog", label: "文章" },
    { href: "/tags", label: "标签" },
    { href: "/categories", label: "分类" },
    { href: "/archives", label: "归档" },
    { href: "/friends", label: "友链" },
    { href: "/about", label: "关于我" },
];