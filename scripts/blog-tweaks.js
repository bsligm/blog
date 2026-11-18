'use strict';

/**
 * 站点构建期微调：
 * 1. 正文图片补 loading="lazy" 与 decoding="async"，降低首屏并发（文章图片均为 OSS 直链）
 * 2. target="_blank" 外链补 rel="noopener"，避免被打开页反向控制窗口引用
 * 仅处理渲染结果，不改写 source 下任何文章正文。
 */

const LAZY_SKIP = /(logo|avatar|favicon)\./i;

/**
 * 主题（matery）首页卡片、归档/标签列表与文章头图只读取 front-matter 的 img 字段，
 * 本仓库 12 篇文章写的是 cover，因此一直按标题哈希随机配图，作者指定的封面从未生效。
 * 这里在渲染前把 cover 映射为 img，避免逐篇复制字段造成两份真相。
 */
hexo.extend.filter.register('before_post_render', function (data) {
    if (!data.img && data.cover) data.img = data.cover;
    return data;
});

hexo.extend.filter.register('after_render:html', function (data) {
    data = data.replace(/<img\b[^>]*>/gi, (tag) => {
        if (/\bloading\s*=/i.test(tag) || LAZY_SKIP.test(tag)) return tag;
        const attrs = tag.replace(/\s*\/?>$/, '');
        const suffix = /\/\s*>$/.test(tag) ? ' />' : '>';
        const extra = /\bdecoding\s*=/i.test(tag) ? '' : ' decoding="async"';
        return `${attrs}${extra} loading="lazy"${suffix}`;
    });

    return data.replace(/<a\b[^>]*>/gi, (tag) => {
        if (!/target\s*=\s*["']?_blank/i.test(tag)) return tag;
        if (/\brel\s*=\s*["'][^"']*noopener/i.test(tag)) return tag;
        if (/\brel\s*=\s*["']/i.test(tag)) {
            return tag.replace(/\brel\s*=\s*["']([^"']*)["']/i, (m, p1) => `rel="${`${p1} noopener noreferrer`.trim()}"`);
        }
        return tag.replace(/>$/, ' rel="noopener noreferrer">');
    });
});
