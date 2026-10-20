// pages/fonts.css.ts
export async function GET() {
    const isDev = import.meta.env.DEV 
    // 完整字体和子集字体的格式
    const fullFontType = "ttf";
    const subSetType = "woff2";
    // 字体配置, 可直接从脚本中复制过来
    const fontWeights = [
        { family: 'LXGWWenKaiMonoGB'        , file: 'lxgw-wenkai-gb/LXGWWenKaiMonoGB-Regular'        , weight: 400, style: "normal", },
        { family: 'JetBrainsMono'           , file: 'jetbrains-mono/JetBrainsMono-Regular'           , weight: 400, style: "normal", },
        { family: 'JetBrainsMono-Italic'    , file: 'jetbrains-mono/JetBrainsMono-Italic'            , weight: 400, style: "italic", },
    ];
    const fontFaces = fontWeights.map(({ family, file, weight, style }) => {
        const url = isDev
            ? `/fonts/${file}.${fullFontType}`
            : `__FONT_HASH_${family}__`;
        return `@font-face {
    font-family: '${family}';
    src: url('${url}') format('${subSetType}');
    font-weight: ${weight};
    font-style: ${style};
    font-display: swap;
}`;
    }).join('\n');
    const css = `/* 自动生成的全局字体声明 */
${fontFaces}
/* (保留内容) 可以继续添加 css 样式 */
/* 应用全局字体 */
* {
    font-family: 'JetBrainsMono', 'JetBrainsMono-Italic', 'LXGWWenKaiMonoGB';
}
`;
    return new Response(css, {
        headers: { 'Content-Type': 'text/css' },
    });
}
