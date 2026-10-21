---
title: '[blog-MT-06] - 将 TTF 字体压缩至几百 KB 的 woff2 字体, 一套网页字体轻量化的完整解决方案'
published: 2026-06-06 21:26:18
draft: false
description: 'TTF 格式的字体文件通常有十几 MB, 直接用在网站上会严重拖慢加载速度。本文记录了一套完整的字体优化流程: 从原始 TTF 字体出发, 通过子集化 (subsetting) 与 woff2 压缩, 最终输出体积仅为几百 KB 的网页字体。'
postID: '7a651a2' # 自动生成, 不要修改这个项目的值
tags:
  - umami
  - 经验分享
  - web
category: 博客维护日记
---

${note [fine] 
这篇解决方案适用于任何以 `Node.js` 构建的站点，是一篇通用教程。
}

## 前言

今天我为博客更换了主要字体: 一款开源字体 [霞鹜文楷 GB](https://github.com/lxgw/LxgwWenKaiGB)。  
${github lxgw/LxgwWenKaiGB}


然而下载下来的完整字体文件接近 25 MB。如果直接原封不动地用于博客, 加载速度会极其缓慢。于是我开始探索字体文件大小的优化方法。

(图为原始 ttf 字体文件的大小)
![raw-ttf](/img/posts/blog/06/raw-ttf.png)

## 优化方法
起初, 我尝试了最直接的方式: 利用在线工具将 TTF 格式转换为更适合网页的 woff2 格式。  
25 MB 的 TTF 转换后仍接近 10 MB。虽然体积已经减少了大约 60%, 但对一个网页来说, 10 MB 的字体资源依然过于庞大。

(图为转换为 woff2 格式后的文件大小)
![ttf-to-woff2-size](/img/posts/blog/06/ttf-to-woff2-size.png) 

随后, 借助 AI 工具检索资料后发现: **字体文件中只有一小部分字符是网站实际会用到的**。因此, 我们可以先收集所有页面中用到的字符, 形成一个字符集合, 然后基于这个集合从原字体中生成一个「子集」 (subset) 。  
这样一来, 原本 10 MB 左右的 woff2 字体还能进一步压缩 (当然也可以直接从 TTF 生成子集) 。

## 字体子集化过程

### Step.1 安装 Node 工具

使用以下命令安装字体子集化所需的依赖: 

```bash
$ npm install -D subset-font glob jsdom
```
- **subset-font**: 字体子集化的主要工具
- **glob**: 用于遍历构建后生成的 HTML 文件
- **jsdom**: 从 HTML 页面中提取纯文本内容

### Step2. 存放完整字体文件

将原始 TTF 字体放在任意位置, 只要后续脚本能够加载到即可。

${note [warn]
- 如果你存放到了 `public` 文件夹下, 并且在意构建后 `dist` 文件夹的体积, 则需要额外的代码对完整字体进行清理。
- 如果你存放到了 `src/assets` 文件夹下, 并且在意构建后 `dist` 文件夹的体积, 那么推荐你将其移动到其它路径。 因为 Astro 在构建时会为 `src/assets` 路径下所有文件添加哈希值, 它可能是动态变化的, 而我目前不知道这个哈希值如何获取。因此不推荐放在 `src/assets` 这个路径下。
}

我的存放位置是 `public/fonts` 文件夹下, 目录结构如下所示
```txt
public/
    fonts/
        jetbrains-mono/
            *.ttf
        lxgw-wenkai-gb/
            *.ttf
```

### Step3. 创建构建后脚本
该脚本会从构建好的页面 (即 `dist` 文件夹中的所有 HTML) 收集所有字符, 然后根据原始完整字体生成对应的字体子集, 并输出为 `woff2` 格式。
将脚本保存到项目根目录的 `scripts` 文件夹中, 文件后缀为 `.mjs`。
```js
// scripts/subset-font.mjs
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { glob } from 'glob';
import { JSDOM } from 'jsdom';
import subsetFont from 'subset-font';

// 字体存放的根目录
const fontRoot = "public/fonts";
// 构建后 dist 文件夹内的 fonts 目录, 用于额外清理
const distFontRoot = "dist/fonts"
// 字体子集的输出目录
const outputDir = "dist/_astro/fonts";
// 字体类型配置, in: 字体的输入格式, out: 字体的输出格式
const fontTypeConfig = {in: "ttf", out: "woff2"};

// font lists
const fontConfigs = [
    // family: font-family, 
    // file: 完整字体的文件地址, 相对于 fontRoot, 不要添加后缀名, 
    // weight: 字体的字重, 控制字体粗细, 
    // style: normal, 正常, italic, 斜体
    { family: 'Yozai'                   , file: 'yozai/Yozai-Regular'                            , weight: 400, style: "normal", },
    { family: 'LXGWWenKaiMonoGB'        , file: 'lxgw-wenkai-gb/LXGWWenKaiMonoGB-Regular'        , weight: 400, style: "normal", },
    { family: 'JetBrainsMono'           , file: 'jetbrains-mono/JetBrainsMono-Regular'           , weight: 400, style: "normal", },
    { family: 'JetBrainsMono-Italic'    , file: 'jetbrains-mono/JetBrainsMono-Italic'            , weight: 400, style: "italic", },
];

// 收集 html 中的所有文本字符。
async function collectChars(dir) {
    const htmlFiles = await glob(`${dir}/**/*.html`);
    const charSet = new Set();
    for (const file of htmlFiles) {
        const html = fs.readFileSync(file, 'utf-8');
        const dom = new JSDOM(html);
        const text = dom.window.document.body?.textContent || '';
        for (const c of text) charSet.add(c);
    }
    return [...charSet].join('');
}

// 计算最终字体子集的哈希值, 并保留前 16 位结果。
function contentHash(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
}

// 主处理流程
async function run() {
    console.log('🔍 Collecting characters...');
    const chars = await collectChars('dist');
    if (!chars) {
        console.warn('⚠ An empty result is returned, skipping.');
        return;
    }
    console.log(`✅ Collected ${chars.length} characters.`);

    // 确保输出路径存在
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const hashMap = {}; // family -> hash

    for (const { family, file } of fontConfigs) {
        const inputPath = `${fontRoot}/${file}.${fontTypeConfig.in}`;
        if (!fs.existsSync(inputPath)) {
            console.error(`❌ Full font file is not exists: ${inputPath}`);
            process.exit(1);
        }
        const fontBuffer = fs.readFileSync(inputPath);

        console.log(`⏳ Generating subset font for '${family}' ...`);
        const subsetBuffer = await subsetFont(fontBuffer, chars, {
            targetFormat: `${fontTypeConfig.out}`,
            preserveNameTable: true,
        });

        const hash = contentHash(subsetBuffer);
        const outFile = path.join(outputDir, `${hash}.${fontTypeConfig.out}`);
        fs.writeFileSync(outFile, subsetBuffer);
        console.log(`   → ${hash}.${fontTypeConfig.out} (${(subsetBuffer.length / 1024).toFixed(1)} KB)`);

        hashMap[family] = hash;
    }

    // 替换 css 中的占位符
    console.log('🔄 Replacing placeholders in css...');
    const cssFiles = await glob('dist/**/*.css');
    for (const cssFile of cssFiles) {
        let content = fs.readFileSync(cssFile, 'utf-8');
        let replaced = false;
        for (const [family, hash] of Object.entries(hashMap)) {
            const placeholder = `__FONT_HASH_${family}__`;
            if (content.includes(placeholder)) {
                content = content.replaceAll(placeholder, `/_astro/fonts/${hash}.${fontTypeConfig.out}`);
                replaced = true;
            }
        }
        if (replaced) {
            fs.writeFileSync(cssFile, content);
            console.log(`   ✔ Updated: ${cssFile}`);
        }
    }

    // 额外操作: 清理 dist/fonts 文件夹
    if (distFontRoot && fs.existsSync('dist/fonts')) {
        fs.rmSync('dist/fonts', { recursive: true, force: true });
        console.log('🗑 cleaned dist font');
    }

    console.log('✨ Font subsets generated done!');
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
```

### Step4. 修改 `package.json` 构建命令
修改后 `scripts` 字段内容如下所示
```json
{
    "scripts": {
        "build": "astro build && node scripts/subset-font.mjs && pagefind --site dist",
    },
}
```
其中 `node scripts/subset-font.mjs` 为新增命令, 其余两条命令为 astro 构建命令 和 Fuwari 主题中的原有命令

命令运行顺序: `astro build -> node scripts/subset-font.mjs -> pagefind --site dist`
 
### Step5. 在 Astro 布局中动态切换字体路径
在 dev 模式下预览页面时需要使用完整字体来显示页面, 保证新输入的字符不会缺少字体。在这里使用端点 css 文件来实现这个功能, 这份 css 端点文件用于生成站点中所有用到的字体, 注意文件名格式必须是 `*.css.ts` 格式。

```ts
// pages/fonts.css.ts
export async function GET() {
    const isDev = import.meta.env.DEV 

    // 完整字体和子集字体的格式
    const fullFontType = "ttf";
    const subSetType = "woff2";

    // 字体配置, 可直接从脚本中复制过来
    const fontWeights = [
        { family: 'Yozai'                   , file: 'yozai/Yozai-Regular'                            , weight: 400, style: "normal", },
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
    line-height: 1.5rem
}
`;

    return new Response(css, {
        headers: { 'Content-Type': 'text/css' },
    });
}
```

### Step6. 功能验证
- **开发环境**: 运行 `npm run dev`, 浏览器会加载完整的字体文件, 在这时可以自由输入汉字, 不会存在某一字符字体缺失的情况。
- **生产环境**: 
    - 运行 `npm run build`, 脚本会自动扫描 dist 文件夹中所有 HTML 文档, 生成仅包含所需字符的字体子集。配合 woff2 压缩, 最终字体文件大小可以控制在 100–300 KB。
    - 相比于未子集化的 woff2 字体，体积优化了约 46 倍；相比于原始 TTF 字体，优化了约 116 倍。最终文件的输出路径可由 `scripts/subset-font.mjs` 脚本中 `outputDir` 这个参数设置。

图为生成好的子集字体文件, 可以看到文件大小来到了 203KB 和 235KB, 由于脚本中对文件进行了取哈希值操作, 所以文件名为 16 位哈希结果。
![generated-subset-font](/img/posts/blog/06/generated-subset-font.png)

### Step7. 应用 CSS 样式
在 `<head>...</head>` 标签中, 引用端点 css, 使网站能够使用定义的 `font-family`。

```html
<link rel="stylesheet" href="/fonts.css" />
```

## 补充说明
${note [info]
关于优化后的体积倍数计算: 
- 原始 ttf 体积取 25MB
- **在线工具转换后的 woff2 体积**: 取 10MB, 10/25*100%=40%, 即转换后 woff2 格式的字体文件相比于原始 ttf 压缩了将近 60%, 文件体积变为原始 ttf 文件体积的 40%。
- **子集化 + woff2 最终体积**: 按截图取 203 KB 和 235 KB, 取中间值约 220 KB, 即 0.215 MB. 25MB/0.215MB ≈ 116 倍。
}
