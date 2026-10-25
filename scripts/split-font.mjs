// scripts/split-font.mjs
// 中文大字体: 用 cn-font-split 按 unicode-range 分片, 而不是「按构建期收集到的字符」子集化。
// 这样页面加载后由前端再渲染的动态文本 (比如 Artalk 评论) 也能被浏览器按需补加载对应的分片,
// 不会因为子集缺字而回退到系统默认字体。
// 注意: cn-font-split 的 FFI 二进制 (libffi-*.dll/.so) 不随 npm 包分发, 安装时 postinstall 会从
// GitHub 下载。国内直连 GitHub 极慢, 下载可能被截断 (DLL 只剩约 1.9MB, 运行时加载报 win32=193)。
// 若遇到 DLL 加载失败, 用镜像重新下载一次即可:
//   Windows:      set CN_FONT_SPLIT_GH_HOST=https://ik.imagekit.io/github
//   然后执行:     npx cn-font-split i default
import fs from 'fs';
import path from 'path';
import { fontSplit } from 'cn-font-split';

// 需要分片的中文字体 (拉丁字体体积小, 继续走 scripts/subset-font.mjs 的内容子集即可)。
const cjkFonts = [
    {
        family: 'LXGWWenKaiMonoGB',                                          // 与 fonts.css.ts / 全局 font-family 保持一致
        file: 'public/fonts/lxgw-wenkai-gb/LXGWWenKaiMonoGB-Regular.ttf',
    },
];

// 分片产物目录: dist/_astro/fonts/<family>/ 下会生成一堆 woff2 + 一个 CSS (含 unicode-range)
const distRoot = 'dist/_astro/fonts';

async function run() {
    for (const { family, file } of cjkFonts) {
        if (!fs.existsSync(file)) {
            console.error(`❌ 字体文件不存在: ${file}`);
            process.exit(1);
        }

        const outDir = path.join(distRoot, family);
        const input = new Uint8Array(fs.readFileSync(file).buffer);

        console.log(`⏳ 分片字体 '${family}' -> ${outDir} ...`);
        await fontSplit({
            input,
            outDir,
            css: {
                fontFamily: family,                 // 生成的 @font-face 的 font-family
                fontWeight: '400',
                fontStyle: 'normal',
                fontDisplay: 'swap',
                localFamily: ['LXGW WenKai Mono GB'], // 本机已装此字体时不再发请求
            },
            chunkSize: 70 * 1024,                   // 单个分片目标大小 (~70KB)
            testHtml: false,                        // 不生成测试 HTML
            reporter: false,                        // 不生成 reporter.bin
            silent: true,
        });

        // 清理 cn-font-split 生成的辅助文件 (index.proto 等), 只保留分片 woff2 和 result.css。
        for (const name of fs.readdirSync(outDir)) {
            if (!name.endsWith('.woff2') && name !== 'result.css') {
                fs.rmSync(path.join(outDir, name), { force: true });
            }
        }

        console.log(`✅ 分片完成: ${family}`);
    }
}

run()
    .then(() => process.exit(0))   // 显式退出: 规避 cn-font-split Rust DLL 卸载时的访问冲突 (0xC0000005)
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
