/**
 * 顶部导航的链接: 桌面端排在导航栏里, 移动端搬进侧边栏 (components/NavSidebar.astro)。
 * 两处共用这一份, 免得加一个页面时改了一处漏了另一处。
 *
 * 内容来自 config.yml 的 navBar.links; 图标用 Iconify 的 id (本站装的是 Font Awesome 7: fa7-solid:xxx),
 * 由 components/NavBar.astro / NavSidebar.astro 里的 <Icon> 在构建期内联成 SVG。
 */
import { navBarConfig } from "./config";

export interface NavLink {
    href : string;
    label: string;
    /** 图标 id (Font Awesome 7: fa7-solid:xxx); 没配就不显示图标 */
    icon?: string;
    /** 外部链接: 新标签页打开, 配置里没写图标时默认用「外链」图标 */
    external: boolean;
}

/** 带协议 (http: / mailto: …) 或以 // 开头的, 都算站外链接 (站内用的是 /xxx 这种相对路径) */
const EXTERNAL_PATTERN = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;

/** 外部链接的兜底图标: config.yml 里没写 icon 时用它 */
const EXTERNAL_ICON = "fa7-solid:arrow-up-right-from-square";

export const navLinks: NavLink[] = navBarConfig.links.map(({ src, title, icon }) => {
    const external = EXTERNAL_PATTERN.test(src);

    return {
        href    : src,
        label   : title,
        icon    : icon ?? (external ? EXTERNAL_ICON : undefined),
        external,
    };
});
