const state = {
  articles: [],
  categories: [],
  articleMap: new Map(),
  titleMap: new Map(),
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
  { tag: "后台", patterns: ["后台", "CMS", "Decap", "Netlify", "图片", "飞书"] },
];

const LIST_META_KEYS = new Set(["tags", "aliases"]);

const els = {
  article: document.querySelector("#article"),
  nav: document.querySelector("#articleNav"),
  search: document.querySelector("#siteSearch"),
  results: document.querySelector("#searchResults"),
  sidebar: document.querySelector("#sidebar"),
  menuButton: document.querySelector("#menuButton"),
  wechatButton: document.querySelector("#wechatButton"),
  wechatPopover: document.querySelector("#wechatPopover"),
  wechatClose: document.querySelector("#wechatClose"),
  scrim: document.querySelector("#scrim"),
};

init();

async function init() {
  try {
    const [index, categoryIndex] = await Promise.all([
      fetchJson("content/articles.json"),
      fetchOptionalJson("content/categories.json"),
    ]);
    const loaded = await Promise.all(
      index.articles.map(async (item) => {
        const markdown = await fetchText(item.file);
        const parsed = parseFrontmatter(markdown);
        return {
          ...item,
          ...parsed.meta,
          file: item.file,
          body: parsed.body.trim(),
          raw: markdown,
        };
      })
    );

    state.categories = (categoryIndex?.categories || []).sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    state.articles = loaded
      .map(enrichArticle)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    buildLookupMaps();
    renderNav();
    bindEvents();
    renderFromHash();
  } catch (error) {
    els.article.innerHTML = `<p class="loading">知识库加载失败：${escapeHtml(error.message)}</p>`;
  }
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} ${response.status}`);
  return response.json();
}

async function fetchOptionalJson(url) {
  const response = await fetch(url);
  if (!response.ok) return null;
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} ${response.status}`);
  return response.text();
}

function buildLookupMaps() {
  state.articles.forEach((article) => {
    state.articleMap.set(article.slug, article);
    const keys = [article.title, article.slug, ...(article.aliases || []), ...(article.tags || [])];
    keys.filter(Boolean).forEach((key) => state.titleMap.set(normalizeKey(key), article.slug));
  });
}

function enrichArticle(article) {
  const tags = normalizeList(article.tags);
  const aliases = normalizeList(article.aliases);
  return {
    ...article,
    slug: article.slug || slugFromFile(article.file) || slugify(article.title || "article"),
    author: article.author || "妹姐",
    aliases,
    summary: article.summary || generateSummary(article.body),
    tags: tags.length ? tags : generateTags(article),
  };
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
  els.wechatButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleWechat();
  });
  els.wechatClose.addEventListener("click", closeWechat);
  els.scrim.addEventListener("click", closeSidebar);
}

function renderFromHash() {
  const slug = decodeURIComponent((location.hash || "").replace(/^#/, "")) || state.articles[0]?.slug;
  const article = state.articleMap.get(slug) || state.articles[0];
  renderArticle(article);
  hideSearch();
  closeWechat();
  closeSidebar();
}

function renderNav() {
  const groups = new Map();
  state.articles.forEach((article) => {
    const category = article.category || "未分类";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(article);
  });

  const knownCategories = state.categories.map((category) => category.title).filter(Boolean);
  const orderedCategories = [
    ...knownCategories.filter((category) => groups.has(category)),
    ...[...groups.keys()].filter((category) => !knownCategories.includes(category)),
  ];

  els.nav.innerHTML = orderedCategories
    .map((category) => {
      const articles = groups.get(category) || [];
      const links = articles
        .map((article) => `<a class="nav-link" href="#${article.slug}" data-slug="${article.slug}">${escapeHtml(article.title)}</a>`)
        .join("");
      return `<section class="nav-section"><h2>${escapeHtml(category)}</h2>${links}</section>`;
    })
    .join("");
}

function renderArticle(article) {
  state.currentSlug = article.slug;
  document.title = `${article.title} | 妹姐的DELF B2超级攻略`;

  document.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.toggle("active", link.dataset.slug === article.slug);
  });

  const rendered = markdownToHtml(article.body, article.slug);
  const toc = rendered.headings.length
    ? `<nav class="article-toc" aria-label="本文目录"><strong>本文目录</strong>${rendered.headings
        .map((heading) => `<a href="#${article.slug}" data-scroll-target="${heading.id}">${escapeHtml(heading.text)}</a>`)
        .join("")}</nav>`
    : "";

  const tags = (article.tags || [])
    .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
    .join("");

  const backlinks = findBacklinks(article.slug);

  els.article.innerHTML = `
    <header class="article-header">
      <p class="eyebrow">${escapeHtml(article.category || "DELF B2")}</p>
      <h1>${escapeHtml(article.title)}</h1>
      ${article.summary ? `<p class="summary">${escapeHtml(article.summary)}</p>` : ""}
      <div class="meta">
        <span>作者：${escapeHtml(article.author || "未署名")}</span>
      </div>
      ${tags ? `<div class="tag-row">${tags}</div>` : ""}
    </header>
    ${toc}
    <div class="article-body">${rendered.html}</div>
    ${renderBacklinks(backlinks)}
  `;

  els.article.querySelectorAll("[data-scroll-target]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const target = document.getElementById(link.dataset.scrollTarget);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  window.scrollTo({ top: 0, behavior: "auto" });
}

function renderBacklinks(backlinks) {
  if (!backlinks.length) return "";
  const links = backlinks
    .map((article) => `<a href="#${article.slug}">${escapeHtml(article.title)}</a>`)
    .join("");
  return `<aside class="backlinks"><h2>这些文章也提到本主题</h2>${links}</aside>`;
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
      return { article, score, haystack };
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
  const willOpen = els.wechatPopover.hidden;
  els.wechatPopover.hidden = !willOpen;
  els.wechatButton.setAttribute("aria-expanded", String(willOpen));
}

function closeWechat() {
  els.wechatPopover.hidden = true;
  els.wechatButton.setAttribute("aria-expanded", "false");
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

function parseFrontmatter(markdown) {
  if (!markdown.startsWith("---")) return { meta: {}, body: markdown };
  const end = markdown.indexOf("\n---", 3);
  if (end === -1) return { meta: {}, body: markdown };
  const rawMeta = markdown.slice(3, end).trim();
  const body = markdown.slice(end + 4);
  const meta = {};
  let currentListKey = "";

  rawMeta.split("\n").forEach((line) => {
    const listItem = line.match(/^\s*-\s+(.+)$/);
    if (listItem && currentListKey) {
      if (!Array.isArray(meta[currentListKey])) {
        meta[currentListKey] = normalizeList(meta[currentListKey]);
      }
      meta[currentListKey].push(parseMetaValue(listItem[1].trim()));
      return;
    }

    const splitAt = line.indexOf(":");
    if (splitAt === -1) return;
    const key = line.slice(0, splitAt).trim();
    let value = line.slice(splitAt + 1).trim();
    currentListKey = "";
    if (!value) {
      meta[key] = LIST_META_KEYS.has(key) ? [] : "";
      currentListKey = LIST_META_KEYS.has(key) ? key : "";
    } else if (value.startsWith("[") && value.endsWith("]")) {
      value = value
        .slice(1, -1)
        .split(",")
        .map((item) => parseMetaValue(item.trim()))
        .filter(Boolean);
    } else {
      value = parseMetaValue(value);
    }
    meta[key] = value;
  });

  if (typeof meta.aliases === "string") meta.aliases = meta.aliases.split(",").map((item) => item.trim());
  if (typeof meta.tags === "string") meta.tags = meta.tags.split(",").map((item) => item.trim());
  return { meta, body };
}

function parseMetaValue(value) {
  const trimmed = String(value || "").trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

function slugFromFile(file) {
  return String(file || "")
    .split("/")
    .pop()
    ?.replace(/\.[^.]+$/, "");
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "article";
}

function generateSummary(markdown) {
  const paragraphs = markdown
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => {
      return block &&
        !block.startsWith("#") &&
        !block.startsWith("!") &&
        !block.startsWith("::media") &&
        !block.startsWith("|") &&
        !block.startsWith("```");
    });

  const first = stripMarkdown(paragraphs[0] || markdown);
  return truncateText(first, 92);
}

function generateTags(article) {
  const haystack = `${article.title || ""} ${article.category || ""} ${stripMarkdown(article.body || "")}`.toLowerCase();
  const tags = [];

  TAG_RULES.forEach((rule) => {
    const matched = rule.patterns.some((pattern) => haystack.includes(pattern.toLowerCase()));
    if (matched && !tags.includes(rule.tag)) tags.push(rule.tag);
  });

  if (article.category && !tags.includes(article.category)) tags.push(article.category);
  if (!tags.length) tags.push("DELF B2");
  return tags.slice(0, 5);
}

function truncateText(text, maxLength) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).replace(/[，。；、,.!?！？\s]+$/g, "")}...`;
}

function markdownToHtml(markdown, articleSlug) {
  const headings = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
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
      while (i < lines.length && !lines[i].startsWith("```")) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1;
      html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
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
      while (i < lines.length && lines[i].includes("|")) {
        tableLines.push(lines[i]);
        i += 1;
      }
      html.push(renderTable(tableLines));
      continue;
    }

    const image = line.match(/^!\[(.*?)\]\((.*?)\)(?:\s*"(.*?)")?\s*$/);
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
      while (i < lines.length && lines[i].startsWith("> ")) {
        quote.push(lines[i].slice(2));
        i += 1;
      }
      html.push(`<blockquote>${quote.map((item) => `<p>${inlineMarkdown(item)}</p>`).join("")}</blockquote>`);
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i += 1;
      }
      html.push(`<ul>${items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i += 1;
      }
      html.push(`<ol>${items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ol>`);
      continue;
    }

    const paragraph = [];
    while (i < lines.length && lines[i].trim() && !isSpecialLine(lines, i)) {
      paragraph.push(lines[i]);
      i += 1;
    }
    html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
  }

  return { html: html.join("\n"), headings };
}

function isSpecialLine(lines, i) {
  const line = lines[i];
  return (
    line.startsWith("```") ||
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
  const safeAlt = escapeHtml(alt);
  const safeSrc = escapeAttr(src);
  const figcaption = caption || alt;
  return `
    <figure class="article-figure">
      <img src="${safeSrc}" alt="${safeAlt}" loading="lazy">
      ${figcaption ? `<figcaption>${escapeHtml(figcaption)}</figcaption>` : ""}
    </figure>
  `;
}

function renderMedia(attrs) {
  const type = attrs.type || "audio";
  const src = escapeAttr(attrs.src || "");
  const caption = attrs.caption ? `<figcaption>${escapeHtml(attrs.caption)}</figcaption>` : "";
  if (!src) return "";
  if (type === "video") {
    const poster = attrs.poster ? ` poster="${escapeAttr(attrs.poster)}"` : "";
    return `<figure class="article-figure"><video controls src="${src}"${poster}></video>${caption}</figure>`;
  }
  return `<figure class="article-figure"><audio controls src="${src}"></audio>${caption}</figure>`;
}

function parseAttrs(input) {
  const attrs = {};
  input.replace(/(\w+)="([^"]*)"/g, (_, key, value) => {
    attrs[key] = value;
    return "";
  });
  return attrs;
}

function inlineMarkdown(text) {
  let output = escapeHtml(text);

  output = output.replace(/!\[(.*?)\]\((.*?)\)/g, (_, alt, src) => {
    return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}">`;
  });

  output = output.replace(/\[\[([^\]]+)\]\]/g, (_, rawTarget) => {
    const [target, label] = rawTarget.split("|").map((item) => item.trim());
    const slug = resolveWikiTarget(target);
    const text = escapeHtml(label || target);
    return slug
      ? `<a class="wiki-link" href="#${slug}">${text}</a>`
      : `<span class="missing-link" title="还没有对应文章">${text}</span>`;
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
  return [...markdown.matchAll(/\[\[([^\]]+)\]\]/g)].map((match) => match[1].split("|")[0].trim());
}

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function makeHeadingId(slug, text, index) {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug}-${normalized || "section"}-${index}`;
}

function stripMarkdown(markdown) {
  return markdown
    .replace(/^---[\s\S]*?---/, "")
    .replace(/!\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, "$2 $1")
    .replace(/\[([^\]]+)\]\((.*?)\)/g, "$1")
    .replace(/[#>*`_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripInlineSyntax(text) {
  return text
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, target, label) => label || target)
    .replace(/\[([^\]]+)\]\((.*?)\)/g, "$1");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
