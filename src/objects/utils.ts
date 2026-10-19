export enum BlogTheme { Dark = "Dark", Light = "Light", Auto = "Auto" }

export function theme(theme: BlogTheme | void): BlogTheme | undefined | void {
    // 如果没有传递 theme 参数, 代表为获取当前颜色主题
    if (typeof(theme) === "undefined") {
        return localStorage.getItem("theme") as BlogTheme || undefined;
    }

    localStorage.setItem("theme", theme);
    
    // 应用主题到元素中
    switch (theme) {
        case BlogTheme.Light:
			document.documentElement.classList.remove(BlogTheme.Dark);
			break;
		case BlogTheme.Dark:
			document.documentElement.classList.add(BlogTheme.Dark);
			break;
		case BlogTheme.Auto:
			if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
				document.documentElement.classList.add(BlogTheme.Dark);
			} else {
				document.documentElement.classList.remove(BlogTheme.Dark);
			}
			break;
    }
    console.log(`Applied ${theme} theme.`)
}
