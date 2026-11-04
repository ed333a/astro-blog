export enum BlogTheme { Dark = "Dark", Light = "Light", Auto = "Auto" }

export function theme(theme: BlogTheme | void): BlogTheme | undefined | void {
    // 如果没有传递 theme 参数, 代表为获取当前颜色主题
    if (typeof(theme) === "undefined") {
        return localStorage.getItem("theme") as BlogTheme || undefined;
    }

    localStorage.setItem("theme", theme);

	// artalk 日间/夜间模式适配
	const artalkEle = document.getElementById("comments");
    
    // 应用主题到元素中
    switch (theme) {
        case BlogTheme.Light:
			document.documentElement.classList.remove(BlogTheme.Dark);
			if (artalkEle) artalkEle.classList.remove("atk-dark-mode");
			break;
		case BlogTheme.Dark:
			document.documentElement.classList.add(BlogTheme.Dark);
			if (artalkEle) artalkEle.classList.add("atk-dark-mode");
			break;
		case BlogTheme.Auto:
			if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
				document.documentElement.classList.add(BlogTheme.Dark);
				if (artalkEle) artalkEle.classList.add("atk-dark-mode");
			} else {
				document.documentElement.classList.remove(BlogTheme.Dark);
				if (artalkEle) artalkEle.classList.remove("atk-dark-mode");
			}
			break;
    }
    console.log(`Applied ${theme} theme.`)
}

const pad = (value: number, length = 2) => String(value).padStart(length, "0");
export function formatDateYYYYMMDD(date: Date): string {
    return [
        `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    ].join(" ");
}
