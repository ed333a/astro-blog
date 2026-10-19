/**
 * 汉字 → 拼音 (无音调), 给文章永久链接里的 `:title_pinyin` 用。
 *
 * 这里内置的是一张「够用就好」的轻量表 (常用字 + 本站文章标题里出现过的字), 目的是把
 * 中文标题变成可读的 URL 片段, 而不是做完整的拼音标注:
 *   · 表里没有的字会被丢掉 (当成分隔符), 因此 URL 会短一截, 但不会出现乱码;
 *   · 多音字只取最常见的那一个读音。
 * 如果确实需要完整/准确的中文转拼音, 把下面的 toPinyin() 换成 pinyin-pro 之类的库即可,
 * 上层 (objects/posts.ts) 不关心它是怎么算出来的。
 */

// 打包成一段文本 (每项 = 汉字 + 拼音), 比写成对象字面量紧凑, 也不会踩到「重复键」的坑
const PINYIN_TABLE = `
一yi 二er 三san 四si 五wu 六liu 七qi 八ba 九jiu 十shi 百bai 千qian 万wan 零ling
年nian 月yue 日ri 时shi 分fen 秒miao 上shang 下xia 中zhong 前qian 后hou 早zao 晚wan 春chun 夏xia 秋qiu 冬dong
的de 了le 是shi 在zai 有you 和he 与yu 及ji 或huo 不bu 无wu 好hao 坏huai 多duo 少shao 新xin 旧jiu 老lao
大da 小xiao 高gao 低di 长chang 短duan 宽kuan 深shen 浅qian 快kuai 慢man 明ming 暗an 亮liang 黑hei 白bai
红hong 绿lv 蓝lan 黄huang 色se 光guang 影ying 我wo 你ni 他ta 她ta 它ta 们men 谁shui 什shen 么me
如ru 何he 怎zen 样yang 为wei 也ye 就jiu 都dou 会hui 行xing 能neng 要yao 想xiang 说shuo 让rang 把ba 被bei
网wang 页ye 站zhan 客ke 博bo 记ji 录lu 文wen 章zhang 字zi 词ci 句ju 段duan 读du 写xie 看kan 听ting 做zuo 作zuo
用yong 法fa 式shi 子zi 实shi 现xian 成cheng 完wan 工gong 项xiang 目mu 计ji 划hua 设she 图tu 片pian 视shi 频pin
音yin 乐le 部bu 全quan 局ju 内nei 容rong 外wai 量liang 数shu 据ju 库ku 表biao 单dan 双shuang 层ceng 级ji
版ban 本ben 软ruan 件jian 硬ying 系xi 统tong 平ping 台tai 移yi 动dong 端duan 手shou 机ji 电dian 脑nao 屏ping
幕mu 键jian 盘pan 输shu 入ru 出chu 存cun 取qu 加jia 载zai 速su 度du 性xing 优you 化hua 编bian 译yi 程cheng 序xu
码ma 代dai 错cuo 误wu 调diao 试shi 测ce 修xiu 复fu 重zhong 构gou 架jia 模mo 块kuai 组zu 接jie 口kou 类lei 型xing
对dui 象xiang 函han 变bian 常chang 值zhi 参can 引yin 指zhi 针zhen 标biao 准zhun 规gui 则ze 约yue 定ding
样yang 毛mao 玻bo 璃li 风feng 格ge 主zhu 题ti 令ling 牌pai 岛dao 屿yu 搭da 建jian 从cong 提ti 升sheng
效xiao 果guo 画hua 转zhuan 换huan 过guo 渡du 淡dan 圆yuan 角jiao 边bian 框kuang 线xian 背bei 景jing 布bu
局ju 响xiang 应ying 适shi 配pei 兼jian 关guan 于yu 些xie 个ge 很hen 最zui 更geng 再zai 又you 而er 且qie
笔bi 术shu 技ji 流liu 学xue 习xi 思si 考kao 总zong 结jie 经jing 验yan 问wen 题ti 难nan 点dian 收shou 获huo
感gan 悟wu 阅yue 清qing 半ban 季ji 周zhou 天tian 待dai 里li 外wai 中zhong 心xin 话hua 事shi 情qing 理li 由you
`;

const PINYIN_MAP: Map<string, string> = (() => {
    const map = new Map<string, string>();
    for (const token of PINYIN_TABLE.split(/\s+/)) {
        if (!token) continue;
        const chars = Array.from(token);
        map.set(chars[0], chars.slice(1).join(""));
    }
    return map;
})();

/** 表里没有收录的汉字 (用于构建时给出提示, 免得永久链接悄悄少了一截) */
export function unknownHanChars(text: string): string[] {
    const unknown = new Set<string>();
    for (const ch of text) {
        if (isHan(ch) && !PINYIN_MAP.has(ch)) unknown.add(ch);
    }
    return [...unknown];
}

function isHan(ch: string): boolean {
    const code = ch.codePointAt(0) ?? 0;
    return (code >= 0x3400 && code <= 0x4dbf) || (code >= 0x4e00 && code <= 0x9fff);
}

/**
 * 汉字转拼音 (无音调):
 *   · 汉字   → 拼音, 每个字之间用空格隔开 (交给上层的 slugify 决定分隔符);
 *   · 拉丁字母/数字 → 原样保留 (转小写);
 *   · 其它字符 (标点 / 表里没有的汉字) → 空格 (相当于分隔符)。
 */
export function toPinyin(text: string): string {
    let result = "";
    for (const ch of text) {
        const pinyin = PINYIN_MAP.get(ch);
        if (pinyin) {
            result += `${pinyin} `;
        } else if (/[A-Za-z0-9]/.test(ch)) {
            result += ch.toLowerCase();
        } else {
            result += " ";
        }
    }
    return result;
}
