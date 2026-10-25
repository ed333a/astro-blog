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
    // 中文大字体 LXGWWenKaiMonoGB 改由 scripts/split-font.mjs 按 unicode-range 分片, 不在这里子集化。
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
