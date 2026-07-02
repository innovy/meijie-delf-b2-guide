const state = {
  data: null,
  articles: [],
  categories: [],
  articleMap: new Map(),
  titleMap: new Map(),
  categoryMap: new Map(),
  currentSlug: "",
};

const TAG_RULES = [
  { tag: "DELF B2", patterns: ["DELF B2", "B2", "考试"] },
  { tag: "写作", patterns: ["写作", "作文", "书面表达", "Production écrite", "Production ecrite"] },
  { tag: "口语", patterns: ["口语", "口头表达", "Production orale", "考官"] },
  { tag: "听力", patterns: ["听力", "听懂", "Compréhension de l'oral", "音频"] },
  { tag: "阅读", patterns: ["阅读", "读懂", "Compréhension des écrits", "文章"] },
  { tag: "报名", patterns: ["报名", "考点", "考试日期", "证件"] },
  { tag: "评分", patterns: ["评分", "分数", "25", "50/100", "通过"] },
  { tag: "备考", patterns: ["备考", "计划", "复盘", "模拟", "路线"] },
  { tag: "后台", patterns: ["后台", "CMS", "Netlify", "GitHub", "图片", "飞书"] },
];

let els = {};

init();

async function init() {
  cacheElements();
  try {
    const data = await fetchJson("content/data.json");
    state.data = data;
    state.categories = normalizeCategories(data.categories || []);
    state.articles = normalizeArticles(data.articles || []);
    buildLookupMaps();
    renderShell();
    renderNav();
    bindEvents();
    renderFromHash();
  } catch (error) {
    els.article.innerHTML = `<p class="loading">知识库加载失败：${escapeHtml(error.message)}</p>`;
  }
}

function cacheElements() {
  els = {
    article: document.querySelector("#article"),
    nav: document.querySelector("#articleNav"),
    search: document.querySelector("#siteSearch"),
    results: document.querySelector("#searchResults"),
    sidebar: document.querySelector("#sidebar"),
    menuButton: document.querySelector("#menuButton"),
    scrim: document.querySelector("#scrim"),
    brand: document.querySelector(".brand"),
    brandLogo: document.querySelector(".brand-mark"),
    brandTitle: document.querySelector(".brand strong"),
    brandSubtitle: document.querySelector(".brand small"),
    topSocials: document.querySelector(".social-actions"),
    authorCard: document.querySelector(".author-card"),
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url} ${response.status}`);
  return response.json();
}

function normalizeCategories(categories) {
  return categories
    .map((category, index) => ({
      id: category.id || slugify(category.title || `category-${index + 1}`),
      title: category.title || "未分类",
      order: Number(category.order || index + 1),
    }))
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "zh-Hans-CN"));
}

function normalizeArticles(articles) {
  return articles
    .map((article, index) => {
      const slug = article.slug || article.id || slugify(article.title || `article-${index + 1}`);
      const enriched = {
        id: article.id || slug,
        slug,
        title: article.title || "未命名文章",
        categoryId: article.categoryId || state.categories[0]?.id || "uncategorized",
        order: Number(article.order || index + 1),
        author: article.author || "妹姐",
        summary: article.summary || generateSummary(article.body || ""),
        tags: normalizeList(article.tags),
        aliases: normalizeList(article.aliases),
        body: article.body || "",
      };
      if (!enriched.tags.length) enriched.tags = generateTags(enriched);
      return enriched;
    })
    .sort((a, b) => {
      const categoryOrder = getCategoryOrder(a.categoryId) - getCategoryOrder(b.categoryId);
      return categoryOrder || a.order - b.order || a.title.localeCompare(b.title, "zh-Hans-CN");
    });
}

function getCategoryOrder(categoryId) {
  return state.categories.find((category) => category.id === categoryId)?.order || 9999;
}

function buildLookupMaps() {
  state.articleMap.clear();
  state.titleMap.clear();
  state.categoryMap.clear();
  state.categories.forEach((category) => state.categoryMap.set(category.id, category));
  state.articles.forEach((article) => {
    state.articleMap.set(article.slug, article);
    const keys = [article.title, article.slug, article.id, ...(article.aliases || []), ...(article.tags || [])];
    keys.filter(Boolean).forEach((key) => state.titleMap.set(normalizeKey(key), article.slug));
  });
}

function renderShell() {
  const site = state.data.site || {};
  const author = site.authorCard || {};

  document.title = `${site.title || "妹姐的DELF B2超级攻略"} | 一站式备考知识库`;
  els.brand.href = `#${state.articles[0]?.slug || ""}`;
  els.brandLogo.src = site.logo || "assets/brand/meijie-logo.png";
  els.brandTitle.textContent = site.title || "妹姐的DELF B2超级攻略";
  els.brandSubtitle.textContent = site.subtitle || "Guide DELF B2";
  els.search.placeholder = site.searchPlaceholder || "搜索考试流程、写作、口语...";

  els.topSocials.innerHTML = (site.socials || [])
    .map((social) => {
      const disabled = social.enabled && social.url ? "" : " disabled";
      const href = social.enabled && social.url ? ` data-url="${escapeAttr(social.url)}"` : "";
      return `<button class="social-button" type="button"${href}${disabled} title="${escapeAttr(social.label || "")}入口">${escapeHtml(social.label || "")}</button>`;
    })
    .join("");

  els.authorCard.innerHTML = `
    <div class="author-photo">
      <img src="${escapeAttr(author.avatar || "assets/brand/meijie-avatar.jpg")}" alt="${escapeAttr(author.name || "妹姐老师")}头像">
      <button class="social-button primary author-wechat-button" id="wechatButton" type="button" aria-expanded="false" aria-controls="wechatPopover">
        ${escapeHtml(author.wechatButtonText || "加微信")}
      </button>
    </div>
    <div class="author-info">
      <strong>${escapeHtml(author.name || "妹姐老师")}</strong>
      ${(author.bio || []).map((line) => `<span>${escapeHtml(line)}</span>`).join("")}
    </div>
    <div class="wechat-popover" id="wechatPopover" hidden>
      <button class="popover-close" id="wechatClose" type="button" aria-label="关闭微信二维码">×</button>
      <div class="wechat-profile">
        <img src="${escapeAttr(author.avatar || "assets/brand/meijie-avatar.jpg")}" alt="${escapeAttr(author.name || "妹姐老师")}头像">
        <div>
          <strong>添加${escapeHtml(author.name || "妹姐老师")}微信</strong>
          <span>微信号：${escapeHtml(author.wechatId || "")}</span>
        </div>
      </div>
      <img class="wechat-qr" src="${escapeAttr(author.wechatQr || "assets/brand/wechat-qr.jpg")}" alt="微信二维码">
    </div>
  `;
  cacheElements();
}

function bindEvents() {
  window.addEventListener("hashchange", renderFromHash);
  els.search.addEventListener("input", renderSearch);
  els.search.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideSearch();
  });
  els.results.addEventListener("click", (event) => {
    if (event.target.closest(".search-hit[href]")) {
      hideSearch();
      els.search.blur();
    }
  });
  els.topSocials.addEventListener("click", (event) => {
    const button = event.target.closest("[data-url]");
    if (button) window.open(button.dataset.url, "_blank", "noopener,noreferrer");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && document.activeElement !== els.search) {
      event.preventDefault();
      els.search.focus();
    }
    if (event.key === "Escape") closeWechat();
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-wrap")) hideSearch();
    if (!event.target.closest(".wechat-popover") && !event.target.closest("#wechatButton")) closeWechat();
  });
  els.menuButton.addEventListener("click", toggleSidebar);
  document.querySelector("#wechatButton")?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleWechat();
  });
  document.querySelector("#wechatClose")?.addEventListener("click", closeWechat);
  els.scrim.addEventListener("click", closeSidebar);
}

function renderFromHash() {
  const slug = decodeURIComponent((location.hash || "").replace(/^#/, "")) || state.articles[0]?.slug;
  const article = state.articleMap.get(slug) || state.articles[0];
  if (!article) return;
  renderArticle(article);
  hideSearch();
  closeWechat();
  closeSidebar();
}

function renderNav() {
  const grouped = new Map();
  state.articles.forEach((article) => {
    if (!grouped.has(article.categoryId)) grouped.set(article.categoryId, []);
    grouped.get(article.categoryId).push(article);
  });

  const known = state.categories.filter((category) => grouped.has(category.id));
  const unknown = [...grouped.keys()]
    .filter((categoryId) => !state.categoryMap.has(categoryId))
    .map((categoryId) => ({ id: categoryId, title: categoryId, order: 9999 }));

  els.nav.innerHTML = [...known, ...unknown]
    .map((category) => {
      const links = (grouped.get(category.id) || [])
        .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "zh-Hans-CN"))
        .map((article) => `<a class="nav-link" href="#${article.slug}" data-slug="${article.slug}">${escapeHtml(article.title)}</a>`)
        .join("");
      return `<section class="nav-section"><h2>${escapeHtml(category.title)}</h2>${links}</section>`;
    })
    .join("");
}

function renderArticle(article) {
  state.currentSlug = article.slug;
  const siteTitle = state.data.site?.title || "妹姐的DELF B2超级攻略";
  const category = state.categoryMap.get(article.categoryId);
  document.title = `${article.title} | ${siteTitle}`;

  document.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.toggle("active", link.dataset.slug === article.slug);
  });

  const rendered = markdownToHtml(article.body, article.slug);
  const toc = rendered.headings.length
    ? `<nav class="article-toc" aria-label="本文目录"><strong>本文目录</strong>${rendered.headings
        .map((heading) => `<a href="#${article.slug}" data-scroll-target="${heading.id}">${escapeHtml(heading.text)}</a>`)
        .join("")}</nav>`
    : "";

  const tags = (article.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
  const backlinks = findBacklinks(article.slug);

  els.article.innerHTML = `
    <header class="article-header">
      <p class="eyebrow">${escapeHtml(category?.title || "DELF B2")}</p>
      <h1>${escapeHtml(article.title)}</h1>
      ${article.summary ? `<p class="summary">${escapeHtml(article.summary)}</p>` : ""}
      <div class="meta"><span>作者：${escapeHtml(article.author || "妹姐")}</span></div>
      ${tags ? `<div class="tag-row">${tags}</div>` : ""}
    </header>
    ${toc}
    <div class="article-body">${rendered.html}</div>
    ${renderBacklinks(backlinks)}
  `;

  els.article.querySelectorAll("[data-scroll-target]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      document.getElementById(link.dataset.scrollTarget)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  window.scrollTo({ top: 0, behavior: "auto" });
}

function renderBacklinks(backlinks) {
  if (!backlinks.length) return "";
  return `<aside class="backlinks"><h2>这些文章也提到本主题</h2>${backlinks
    .map((article) => `<a href="#${article.slug}">${escapeHtml(article.title)}</a>`)
    .join("")}</aside>`;
}

function findBacklinks(slug) {
  return state.articles.filter((article) => {
    if (article.slug === slug) return false;
    return extractWikiTargets(article.body).some((target) => resolveWikiTarget(target) === slug);
  });
}

function renderSearch() {
  const query = els.search.value.trim().toLowerCase();
  if (!query) {
    hideSearch();
    return;
  }
  const hits = state.articles
    .map((article) => {
      const haystack = `${article.title} ${(article.tags || []).join(" ")} ${article.summary || ""} ${stripMarkdown(article.body)}`.toLowerCase();
      const score =
        article.title.toLowerCase().includes(query) ? 3 :
        (article.tags || []).join(" ").toLowerCase().includes(query) ? 2 :
        haystack.includes(query) ? 1 : 0;
      return { article, score };
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  els.results.hidden = false;
  els.results.innerHTML = hits.length
    ? hits
        .map(({ article }) => `
          <a class="search-hit" href="#${article.slug}">
            <strong>${escapeHtml(article.title)}</strong>
            <span>${escapeHtml(article.summary || stripMarkdown(article.body).slice(0, 92))}</span>
          </a>
        `)
        .join("")
    : `<div class="search-hit"><strong>没有找到结果</strong><span>可以换一个关键词，例如“报名”“评分”“口语”。</span></div>`;
}

function hideSearch() {
  els.results.hidden = true;
}

function toggleWechat() {
  const popover = document.querySelector("#wechatPopover");
  const button = document.querySelector("#wechatButton");
  if (!popover || !button) return;
  const willOpen = popover.hidden;
  popover.hidden = !willOpen;
  button.setAttribute("aria-expanded", String(willOpen));
}

function closeWechat() {
  const popover = document.querySelector("#wechatPopover");
  const button = document.querySelector("#wechatButton");
  if (!popover || !button) return;
  popover.hidden = true;
  button.setAttribute("aria-expanded", "false");
}

function toggleSidebar() {
  const isOpen = els.sidebar.classList.toggle("open");
  els.menuButton.setAttribute("aria-expanded", String(isOpen));
  els.scrim.hidden = !isOpen;
}

function closeSidebar() {
  els.sidebar.classList.remove("open");
  els.menuButton.setAttribute("aria-expanded", "false");
  els.scrim.hidden = true;
}

function markdownToHtml(markdown, articleSlug) {
  const headings = [];
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (line.startsWith("```")) {
      const code = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) code.push(lines[i++]);
      i += 1;
      html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }
    if (line.trim() === "---") {
      html.push("<hr>");
      i += 1;
      continue;
    }
    const heading = line.match(/^(#{2,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const text = stripInlineSyntax(heading[2]);
      const id = makeHeadingId(articleSlug, text, headings.length);
      headings.push({ id, text, level });
      html.push(`<h${level} id="${id}">${inlineMarkdown(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }
    if (isTableStart(lines, i)) {
      const tableLines = [];
      while (i < lines.length && lines[i].includes("|")) tableLines.push(lines[i++]);
      html.push(renderTable(tableLines));
      continue;
    }
    const image = line.match(/^!\[(.*?)\]\((\S+?)(?:\s+"(.*?)")?\)\s*$/);
    if (image) {
      html.push(renderImage(image[1], image[2], image[3]));
      i += 1;
      continue;
    }
    const media = line.match(/^::media\{(.+)\}\s*$/);
    if (media) {
      html.push(renderMedia(parseAttrs(media[1])));
      i += 1;
      continue;
    }
    if (line.startsWith("> ")) {
      const quote = [];
      while (i < lines.length && lines[i].startsWith("> ")) quote.push(lines[i++].slice(2));
      html.push(`<blockquote>${quote.map((item) => `<p>${inlineMarkdown(item)}</p>`).join("")}</blockquote>`);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ""));
      html.push(`<ul>${items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ul>`);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\.\s+/, ""));
      html.push(`<ol>${items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ol>`);
      continue;
    }
    const paragraph = [];
    while (i < lines.length && lines[i].trim() && !isSpecialLine(lines, i)) paragraph.push(lines[i++]);
    html.push(`<p>${paragraph.map((item) => inlineMarkdown(item)).join("<br>")}</p>`);
  }

  return { html: html.join("\n"), headings };
}

function isSpecialLine(lines, i) {
  const line = lines[i];
  return (
    line.startsWith("```") ||
    line.trim() === "---" ||
    /^(#{2,3})\s+/.test(line) ||
    /^!\[(.*?)\]\((.*?)\)/.test(line) ||
    /^::media\{/.test(line) ||
    line.startsWith("> ") ||
    /^\s*[-*]\s+/.test(line) ||
    /^\s*\d+\.\s+/.test(line) ||
    isTableStart(lines, i)
  );
}

function isTableStart(lines, i) {
  return Boolean(lines[i]?.includes("|") && lines[i + 1]?.match(/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/));
}

function renderTable(tableLines) {
  const rows = tableLines
    .filter((_, index) => index !== 1)
    .map((row) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim()));
  const [head, ...body] = rows;
  return `
    <table>
      <thead><tr>${head.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join("")}</tr></thead>
      <tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>
  `;
}

function renderImage(alt, src, caption) {
  return `
    <figure class="article-figure">
      <img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" loading="lazy">
      ${caption || alt ? `<figcaption>${escapeHtml(caption || alt)}</figcaption>` : ""}
    </figure>
  `;
}

function renderMedia(attrs) {
  const src = attrs.src || "";
  if (!src) return "";
  const caption = attrs.caption ? `<figcaption>${escapeHtml(attrs.caption)}</figcaption>` : "";
  if (attrs.type === "video") {
    const poster = attrs.poster ? ` poster="${escapeAttr(attrs.poster)}"` : "";
    return `<figure class="article-figure"><video controls src="${escapeAttr(src)}"${poster}></video>${caption}</figure>`;
  }
  return `<figure class="article-figure"><audio controls src="${escapeAttr(src)}"></audio>${caption}</figure>`;
}

function parseAttrs(input) {
  const attrs = {};
  String(input || "").replace(/(\w+)="([^"]*)"/g, (_, key, value) => {
    attrs[key] = value;
    return "";
  });
  return attrs;
}

function inlineMarkdown(text) {
  let output = escapeHtml(text);
  output = output.replace(/\[\[([^\]]+)\]\]/g, (_, rawTarget) => {
    const [target, label] = rawTarget.split("|").map((item) => item.trim());
    const slug = resolveWikiTarget(target);
    const visibleText = escapeHtml(label || target);
    return slug
      ? `<a class="wiki-link" href="#${slug}">${visibleText}</a>`
      : `<span class="missing-link" title="还没有对应文章">${visibleText}</span>`;
  });
  output = output.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
  return output;
}

function resolveWikiTarget(target) {
  return state.titleMap.get(normalizeKey(target));
}

function extractWikiTargets(markdown) {
  return [...String(markdown || "").matchAll(/\[\[([^\]]+)\]\]/g)].map((match) => match[1].split("|")[0].trim());
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

function generateSummary(markdown) {
  const first = String(markdown || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .find((block) => block && !block.startsWith("#") && !block.startsWith("!") && !block.startsWith("|"));
  return truncateText(stripMarkdown(first || markdown), 92);
}

function generateTags(article) {
  const category = state.categoryMap.get(article.categoryId)?.title ||
    state.categories.find((item) => item.id === article.categoryId)?.title ||
    "";
  const haystack = `${article.title || ""} ${category} ${stripMarkdown(article.body || "")}`.toLowerCase();
  const tags = [];
  TAG_RULES.forEach((rule) => {
    if (rule.patterns.some((pattern) => haystack.includes(pattern.toLowerCase()))) tags.push(rule.tag);
  });
  if (category && !tags.includes(category)) tags.push(category);
  return [...new Set(tags)].slice(0, 5);
}

function stripMarkdown(markdown) {
  return String(markdown || "")
    .replace(/!\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, "$2 $1")
    .replace(/\[([^\]]+)\]\((.*?)\)/g, "$1")
    .replace(/[#>*`_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripInlineSyntax(text) {
  return String(text || "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, target, label) => label || target)
    .replace(/\[([^\]]+)\]\((.*?)\)/g, "$1");
}

function makeHeadingId(slug, text, index) {
  return `${slug}-${slugify(text) || "section"}-${index}`;
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function truncateText(text, maxLength) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).replace(/[，。；、,.!?！？\s]+$/g, "")}...`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
