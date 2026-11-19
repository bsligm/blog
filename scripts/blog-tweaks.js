'use strict';

/**
 * 站点构建期微调，分两类。
 *
 * 内容修正（只处理渲染结果与元数据，不改写 source 下任何文章正文）：
 * 1. front-matter 的 cover 映射为主题实际读取的 img 字段
 * 2. 正文图片补 loading="lazy" 与 decoding="async"，降低首屏并发（文章图片均为 OSS 直链）
 * 3. target="_blank" 外链补 rel="noopener"，避免被打开页反向控制窗口引用
 * 4. 修正 hexo-renderer-marked v7 的正文过度转义（见 marked:tokenizer 段）
 *
 * 构建确定性（同一份源码连续构建须逐字节一致，否则每次部署都产生与内容无关的 diff）：
 * 5. locals.posts 显式按日期倒序
 * 6. locals.pages 按 source 路径排序，locals.tags / locals.categories 按全序排序
 * 7. post.tags / post.categories 虚拟属性按全序排序
 *
 * 5～7 的必要性：PostTag/PostCategory 关系记录由并行 processor 插入，warehouse 的
 * BinaryRelationIndex 以 Map/Set 保存插入顺序，Model.dataKeys 也是插入顺序，因此一篇
 * 文章的标签与分类在正文卡片、归档、分类页、atom.xml、search.xml 中的次序每次构建都可能不同。
 * Hexo 5.4.0 与 8.1.2 实现一致，该抖动升级前即存在，并非本次升级引入，在此一并收口。
 */

const LAZY_SKIP = /(logo|avatar|favicon)\./i;
const frontMatter = require('hexo-front-matter');

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
// marked 原生转义语义（等价 marked/src/helpers.escape(html)，encode=false）。
// hexo-renderer-marked v4 用 marked 自带 escape，只处理 & < > " '；
// v7 改用 hexo-util 的 escapeHTML，额外把 / = ` 转成 &#x2F; &#x3D; &#96;，
// 导致正文与摘要出现「Windows 10&#x2F;11」，并经主题 strip_html 二次转义为
// &amp;#x2F; 后在 meta description / og:description / JSON-LD 中显示为字面实体。
const ESCAPE_TEST = /[<>"']|&(?!#?\w+;)/;
const ESCAPE_REPLACE = /[<>"']|&(?!#?\w+;)/g;
const ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
};
const escapeText = (str) => (ESCAPE_TEST.test(str) ? str.replace(ESCAPE_REPLACE, (ch) => ESCAPE_MAP[ch]) : str);

// 与 hexo-renderer-marked 内置 smartypants 等价（仅去撇号分支依赖，行为一致）。
const smartypants = (str, quotes) => {
    const [openDbl, closeDbl, openSgl, closeSgl] =
        typeof quotes === 'string' && quotes.length === 4 ? quotes : ['\u201c', '\u201d', '\u2018', '\u2019'];
    return str
        .replace(/---/g, '\u2014')
        .replace(/--/g, '\u2013')
        .replace(/(^|[-\u2014/([{"\s])'/g, '$1' + openSgl)
        .replace(/'/g, closeSgl)
        .replace(/(^|[-\u2014/([{\u2018\s])"/g, '$1' + openDbl)
        .replace(/"/g, closeDbl)
        .replace(/\.{3}/g, '\u2026');
};

hexo.extend.filter.register('marked:tokenizer', function (tokenizer) {
    tokenizer.inlineText = function (src) {
        const cap = this.rules.inline.text.exec(src);
        if (!cap) return undefined;
        const isRaw = this.lexer.state.inRawBlock || this.rules.inline.url.exec(src);
        const smart = this.options.smartypants ? smartypants(cap[0], this.options.quotes) : cap[0];
        return { type: 'text', raw: cap[0], text: isRaw ? cap[0] : escapeText(smart) };
    };
});

hexo.locals.set('posts', () => {
    const query = {};
    if (!hexo.config.future) query.date = { $lte: Date.now() };
    if (!hexo.config.render_drafts) query.published = true;
    return hexo.database.model('Post').find(query).sort('-date');
});

const byNameThenPath = (a, b) => {
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    if (a.path === b.path) return 0;
    return a.path < b.path ? -1 : 1;
};

// hexo-generator-sitemap 等插件会调用 Query 实例的 toArray()，因此必须返回
// warehouse Query 而不是普通数组；Query 构造函数只接收数据数组。
const queryFrom = (query, data) => {
    const Query = Object.getPrototypeOf(query).constructor;
    return new Query(data);
};

const stableSortedQuery = (query) => queryFrom(query, query.data.slice().sort(byNameThenPath));

/**
 * locals.pages 按 source 路径排序。
 *
 * hexo-generator-sitemap 只按 `b.updated - a.updated` 排序，Array.prototype.sort 稳定，
 * 因此 updated 相同的条目其相对次序完全由输入顺序决定；而 Page 模型的数据键顺序来自
 * source 目录的并行 processor 插入顺序，与 tags/categories 属同一类抖动。本站
 * tags/index.md、categories/index.md、friends/index.md 三个页面的 updated 完全相同，
 * 导致 sitemap.xml 里 tags 与 categories 两条 <url> 每次构建可能互换，产生与内容无关的
 * 部署 diff。给 pages 一个全序输入即可消解，不影响页面路由与渲染结果。
 */
hexo.locals.set('pages', () => {
    const query = {};
    if (!hexo.config.future) query.date = { $lte: Date.now() };
    const pages = hexo.database.model('Page').find(query);
    return queryFrom(pages, pages.data.slice().sort((a, b) => (a.source === b.source ? 0 : a.source < b.source ? -1 : 1)));
});

hexo.locals.set('tags', () => stableSortedQuery(hexo.database.model('Tag').filter((tag) => tag.length)));

hexo.locals.set('categories', () =>
    stableSortedQuery(hexo.database.model('Category').filter((category) => category.length))
);

/**
 * 取作者在 front-matter 中声明 tags/categories 的先后顺序，作为构建期的稳定次序来源。
 * 一次构建内 Post.raw 不变，按 Post._id 缓存解析结果。
 */
const declaredOrderCache = new Map();

const declaredOrder = (post) => {
    if (!declaredOrderCache.has(post._id)) {
        const order = { tags: [], categories: [] };
        try {
            const parsed = frontMatter.parse(post.raw || '');
            for (const field of ['tags', 'categories']) {
                const value = Array.isArray(parsed[field]) ? parsed[field] : parsed[field] ? [parsed[field]] : [];
                // 分级分类可写成嵌套数组，展平后即为「父级在前」的顺序。
                order[field] = value.flat().map(String).filter(Boolean);
            }
        } catch {
            // 解析失败时保持空顺序，回落到名称序，不阻断构建。
        }
        declaredOrderCache.set(post._id, order);
    }
    return declaredOrderCache.get(post._id);
};

// 先按作者声明顺序；未声明的（如 Hexo 为分级分类自动补出的父级）排后面并按名称序，构成全序。
const byDeclaredThenName = (declared) => (a, b) => {
    const ia = declared.indexOf(a.name);
    const ib = declared.indexOf(b.name);
    if (ia !== -1 || ib !== -1) {
        if (ia === ib) return byNameThenPath(a, b);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
    }
    return byNameThenPath(a, b);
};

/**
 * 重注册 post.tags / post.categories 虚拟属性，把顺序固定为作者的声明次序。
 * Schema.virtual() 会向 getter 栈追加一条定义，同一属性后定义的 getter 覆盖先前那条，
 * 因此无需修改 node_modules，也不影响 Hexo 自身的 setTags 写入路径。
 */
const overrideRelationVirtual = (relation) => {
    const { virtual, index, idKey, model, field } = relation;
    hexo.model('Post').schema.virtual(virtual).get(function () {
        const ids = hexo._binaryRelationIndex[index].find({ post_id: this._id }).map((item) => item[idKey]);
        const query = hexo.model(model).find({ _id: { $in: ids } });
        return queryFrom(query, query.data.slice().sort(byDeclaredThenName(declaredOrder(this)[field])));
    });
};

overrideRelationVirtual({ virtual: 'tags', index: 'post_tag', idKey: 'tag_id', model: 'Tag', field: 'tags' });
overrideRelationVirtual({
    virtual: 'categories',
    index: 'post_category',
    idKey: 'category_id',
    model: 'Category',
    field: 'categories'
});

