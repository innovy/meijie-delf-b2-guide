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

const state = {
  data: null,
  selectedArticleId: "",
  activeTab: "articles",
  pastedHtml: "",
  pastedText: "",
  pendingAssets: [],
  dirty: false,
  isRendering: false,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const fields = {
  password: $("#adminPassword"),
  saveStatus: $("#saveStatus"),
  articleList: $("#articleList"),
  categoryList: $("#categoryList"),
  articleTitle: $("#articleTitle"),
  articleCategory: $("#articleCategory"),
  articleOrder: $("#articleOrder"),
  articleSlug: $("#articleSlug"),
  articleSummary: $("#articleSummary"),
  articleTags: $("#articleTags"),
  articleAliases: $("#articleAliases"),
  articleBody: $("#articleBody"),
  articlePreview: $("#articlePreview"),
  pasteBox: $("#pasteBox"),
  siteTitle: $("#siteTitle"),
  siteSubtitle: $("#siteSubtitle"),
  siteLogo: $("#siteLogo"),
  siteSearchPlaceholder: $("#siteSearchPlaceholder"),
  authorName: $("#authorName"),
  authorAvatar: $("#authorAvatar"),
  authorBio: $("#authorBio"),
  authorWechatId: $("#authorWechatId"),
  authorWechatQr: $("#authorWechatQr"),
};

init();

async function init() {
  fields.password.value = sessionStorage.getItem("meijieAdminPassword") || "";
  bindEvents();
  await loadData();
}

async function loadData() {
  setStatus("正在读取内容...");
  const response = await fetch("../content/data.json", { cache: "no-store" });
  state.data = await response.json();
  normalizeData();
  state.selectedArticleId = state.data.articles[0]?.id || "";
  renderAll();
  setStatus("内容已加载。");
}

function normalizeData() {
  state.data.categories = (state.data.categories || []).map((category, index) => ({
    id: category.id || slugify(category.title || `category-${index + 1}`),
    title: category.title || "未命名栏目",
    order: Number(category.order || index + 1),
  }));
  state.data.articles = (state.data.articles || []).map((article, index) => ({
    id: article.id || article.slug || crypto.randomUUID(),
    title: article.title || "未命名文章",
    slug: article.slug || slugify(article.title || `article-${index + 1}`),
    categoryId: article.categoryId || state.data.categories[0]?.id || "",
    order: Number(article.order || index + 1),
    author: article.author || "妹姐",
    summary: article.summary || "",
    tags: normalizeList(article.tags),
    aliases: normalizeList(article.aliases),
    body: article.body || "",
  }));
  sortData();
}

function sortData() {
  state.data.categories.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "zh-Hans-CN"));
  state.data.articles.sort((a, b) => {
    const ca = getCategoryOrder(a.categoryId);
    const cb = getCategoryOrder(b.categoryId);
    return ca - cb || a.order - b.order || a.title.localeCompare(b.title, "zh-Hans-CN");
  });
}

function bindEvents() {
  $$(".tab").forEach((button) => {
    button.addEventListener("click", () => setTab(button.dataset.tab));
  });
  $("#saveAllButton").addEventListener("click", saveAll);
  $("#downloadButton").addEventListener("click", () => downloadJson("data.json", collectData()));
  $("#newArticleButton").addEventListener("click", newArticle);
  $("#duplicateArticleButton").addEventListener("click", duplicateArticle);
  $("#deleteArticleButton").addEventListener("click", deleteArticle);
  $("#newCategoryButton").addEventListener("click", newCategory);
  $("#parsePasteButton").addEventListener("click", () => applyPastedContent(false));
  $("#appendPasteButton").addEventListener("click", () => applyPastedContent(true));
  $("#clearPasteButton").addEventListener("click", clearPasteBox);
  $("#regenMetaButton").addEventListener("click", regenerateMeta);
  $("#slugifyButton").addEventListener("click", regenerateSlug);
  fields.pasteBox.addEventListener("paste", capturePaste);
  $("#imageInput").addEventListener("change", handleImageInput);
  $$(".toolbar button").forEach((button) => {
    button.addEventListener("click", () => handleToolbar(button));
  });
  $("#wikiButton").addEventListener("click", insertWikiLink);
  $("#linkButton").addEventListener("click", insertExternalLink);
  [
    fields.articleTitle,
    fields.articleCategory,
    fields.articleOrder,
    fields.articleSlug,
    fields.articleSummary,
    fields.articleTags,
    fields.articleAliases,
    fields.articleBody,
  ].forEach((field) => field.addEventListener("input", updateSelectedArticle));
  [fields.siteTitle, fields.siteSubtitle, fields.siteLogo, fields.siteSearchPlaceholder, fields.authorName, fields.authorAvatar, fields.authorBio, fields.authorWechatId, fields.authorWechatQr]
    .forEach((field) => field.addEventListener("input", updateSiteFields));
  fields.password.addEventListener("input", () => sessionStorage.setItem("meijieAdminPassword", fields.password.value));
  window.addEventListener("beforeunload", (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

function renderAll() {
  state.isRendering = true;
  renderArticleList();
  renderCategoryOptions();
  renderArticleEditor();
  renderCategoryList();
  renderSiteEditor();
  state.isRendering = false;
}

function setTab(tab) {
  state.activeTab = tab;
  $$(".tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  $$(".workspace").forEach((section) => section.classList.toggle("active", section.id === `workspace-${tab}`));
}

function renderArticleList() {
  const categories = state.data.categories;
  fields.articleList.innerHTML = categories.map((category) => {
    const articles = state.data.articles
      .filter((article) => article.categoryId === category.id)
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "zh-Hans-CN"));
    return `
      <div class="article-group">
        <p class="hint">${escapeHtml(category.title)}</p>
        ${articles.map((article) => `
          <div class="article-item ${article.id === state.selectedArticleId ? "active" : ""}" draggable="true" data-id="${article.id}">
            <strong>${escapeHtml(article.title)}</strong>
            <span>${article.order} · ${escapeHtml(article.slug || "")}</span>
          </div>
        `).join("")}
      </div>
    `;
  }).join("");

  $$(".article-item").forEach((item) => {
    item.addEventListener("click", () => {
      state.selectedArticleId = item.dataset.id;
      renderAll();
      setTab("articles");
    });
    item.addEventListener("dragstart", () => item.classList.add("dragging"));
    item.addEventListener("dragend", () => item.classList.remove("dragging"));
    item.addEventListener("dragover", (event) => event.preventDefault());
    item.addEventListener("drop", () => reorderArticleByDrop(item.dataset.id));
  });
}

function renderArticleEditor() {
  const article = getSelectedArticle();
  if (!article) return;
  $("#editorTitle").textContent = article.title || "文章编辑";
  fields.articleTitle.value = article.title || "";
  fields.articleCategory.value = article.categoryId || "";
  fields.articleOrder.value = article.order || 100;
  fields.articleSlug.value = article.slug || "";
  fields.articleSummary.value = article.summary || "";
  fields.articleTags.value = (article.tags || []).join("，");
  fields.articleAliases.value = (article.aliases || []).join("，");
  fields.articleBody.value = article.body || "";
  renderPreview();
}

function renderCategoryOptions() {
  fields.articleCategory.innerHTML = state.data.categories
    .map((category) => `<option value="${escapeAttr(category.id)}">${escapeHtml(category.title)}</option>`)
    .join("");
}

function renderCategoryList() {
  fields.categoryList.innerHTML = state.data.categories
    .map((category) => `
      <div class="category-item" draggable="true" data-id="${category.id}">
        <div class="drag-handle">⋮⋮</div>
        <input data-field="title" value="${escapeAttr(category.title)}">
        <input data-field="order" type="number" value="${Number(category.order || 100)}">
        <button class="danger" type="button" data-action="delete">删除</button>
      </div>
    `)
    .join("");

  $$(".category-item").forEach((item) => {
    item.addEventListener("dragstart", () => item.classList.add("dragging"));
    item.addEventListener("dragend", () => item.classList.remove("dragging"));
    item.addEventListener("dragover", (event) => event.preventDefault());
    item.addEventListener("drop", () => reorderCategoryByDrop(item.dataset.id));
    item.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", () => updateCategory(item.dataset.id, input.dataset.field, input.value));
    });
    item.querySelector("[data-action='delete']").addEventListener("click", () => deleteCategory(item.dataset.id));
  });
}

function renderSiteEditor() {
  const site = state.data.site || {};
  const author = site.authorCard || {};
  $("#adminLogo").src = previewAssetPath(site.logo || "assets/brand/meijie-logo.png");
  fields.siteTitle.value = site.title || "";
  fields.siteSubtitle.value = site.subtitle || "";
  fields.siteLogo.value = site.logo || "";
  fields.siteSearchPlaceholder.value = site.searchPlaceholder || "";
  fields.authorName.value = author.name || "";
  fields.authorAvatar.value = author.avatar || "";
  fields.authorBio.value = (author.bio || []).join("\n");
  fields.authorWechatId.value = author.wechatId || "";
  fields.authorWechatQr.value = author.wechatQr || "";
}

function updateSelectedArticle() {
  const article = getSelectedArticle();
  if (!article) return;
  article.title = fields.articleTitle.value.trim() || "未命名文章";
  article.categoryId = fields.articleCategory.value;
  article.order = Number(fields.articleOrder.value || 100);
  article.slug = fields.articleSlug.value.trim() || slugify(article.title);
  article.id = article.id || article.slug;
  article.summary = fields.articleSummary.value.trim();
  article.tags = splitList(fields.articleTags.value);
  article.aliases = splitList(fields.articleAliases.value);
  article.body = fields.articleBody.value;
  if (!article.summary) article.summary = generateSummary(article.body);
  if (!article.tags.length) article.tags = generateTags(article);
  sortData();
  renderArticleList();
  renderPreview();
  markDirty();
}

function updateSiteFields() {
  if (state.isRendering) return;
  state.data.site = state.data.site || {};
  state.data.site.authorCard = state.data.site.authorCard || {};
  state.data.site.title = fields.siteTitle.value.trim();
  state.data.site.subtitle = fields.siteSubtitle.value.trim();
  state.data.site.logo = fields.siteLogo.value.trim();
  state.data.site.searchPlaceholder = fields.siteSearchPlaceholder.value.trim();
  state.data.site.authorCard.name = fields.authorName.value.trim();
  state.data.site.authorCard.avatar = fields.authorAvatar.value.trim();
  state.data.site.authorCard.bio = fields.authorBio.value.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  state.data.site.authorCard.wechatId = fields.authorWechatId.value.trim();
  state.data.site.authorCard.wechatQr = fields.authorWechatQr.value.trim();
  markDirty();
}

function newArticle() {
  const categoryId = state.data.categories[0]?.id || "";
  const nextOrder = getNextOrder(state.data.articles.filter((article) => article.categoryId === categoryId));
  const article = {
    id: crypto.randomUUID(),
    title: "新文章",
    slug: `article-${Date.now()}`,
    categoryId,
    order: nextOrder,
    author: "妹姐",
    summary: "",
    tags: [],
    aliases: [],
    body: "## 小标题\n\n这里开始写正文。",
  };
  state.data.articles.push(article);
  state.selectedArticleId = article.id;
  markDirty();
  renderAll();
  setTab("articles");
}

function duplicateArticle() {
  const article = getSelectedArticle();
  if (!article) return;
  const copy = JSON.parse(JSON.stringify(article));
  copy.id = crypto.randomUUID();
  copy.title = `${copy.title} 副本`;
  copy.slug = `${slugify(copy.title)}-${Date.now()}`;
  copy.order = getNextOrder(state.data.articles.filter((item) => item.categoryId === copy.categoryId));
  state.data.articles.push(copy);
  state.selectedArticleId = copy.id;
  markDirty();
  renderAll();
}

function deleteArticle() {
  const article = getSelectedArticle();
  if (!article || !confirm(`确认删除《${article.title}》吗？`)) return;
  state.data.articles = state.data.articles.filter((item) => item.id !== article.id);
  state.selectedArticleId = state.data.articles[0]?.id || "";
  markDirty();
  renderAll();
}

function newCategory() {
  const order = getNextOrder(state.data.categories);
  state.data.categories.push({ id: `category-${Date.now()}`, title: "新栏目", order });
  markDirty();
  renderCategoryOptions();
  renderCategoryList();
}

function updateCategory(id, field, value) {
  const category = state.data.categories.find((item) => item.id === id);
  if (!category) return;
  if (field === "title") category.title = value.trim() || "未命名栏目";
  if (field === "order") category.order = Number(value || 100);
  sortData();
  markDirty();
  renderArticleList();
  renderCategoryOptions();
}

function deleteCategory(id) {
  const used = state.data.articles.some((article) => article.categoryId === id);
  if (used) {
    alert("这个栏目下还有文章。请先把文章移到其他栏目，再删除。");
    return;
  }
  state.data.categories = state.data.categories.filter((item) => item.id !== id);
  markDirty();
  renderCategoryOptions();
  renderCategoryList();
}

function reorderCategoryByDrop(targetId) {
  const dragging = $(".category-item.dragging");
  if (!dragging || dragging.dataset.id === targetId) return;
  moveItem(state.data.categories, dragging.dataset.id, targetId);
  state.data.categories.forEach((category, index) => category.order = index + 1);
  markDirty();
  renderAll();
}

function reorderArticleByDrop(targetId) {
  const dragging = $(".article-item.dragging");
  if (!dragging || dragging.dataset.id === targetId) return;
  const dragged = state.data.articles.find((article) => article.id === dragging.dataset.id);
  const target = state.data.articles.find((article) => article.id === targetId);
  if (!dragged || !target) return;
  dragged.categoryId = target.categoryId;
  const siblings = state.data.articles.filter((article) => article.categoryId === target.categoryId);
  moveItem(siblings, dragged.id, target.id);
  siblings.forEach((article, index) => article.order = index + 1);
  markDirty();
  renderAll();
}

function moveItem(items, sourceId, targetId) {
  const sourceIndex = items.findIndex((item) => item.id === sourceId);
  const targetIndex = items.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  const [source] = items.splice(sourceIndex, 1);
  items.splice(targetIndex, 0, source);
}

function capturePaste(event) {
  state.pastedHtml = event.clipboardData?.getData("text/html") || "";
  state.pastedText = event.clipboardData?.getData("text/plain") || "";
}

function applyPastedContent(append) {
  const parsed = parsePastedContent(state.pastedHtml || fields.pasteBox.innerHTML, state.pastedText || fields.pasteBox.innerText);
  const article = getSelectedArticle();
  if (!article) return;
  if (!append) {
    article.title = parsed.title || article.title;
    article.slug = slugify(article.title);
    article.summary = parsed.summary;
    article.tags = parsed.tags;
    article.aliases = [article.title];
    article.body = parsed.body;
  } else {
    article.body = `${article.body || ""}\n\n${parsed.body}`.trim();
  }
  markDirty();
  renderAll();
}

function parsePastedContent(html, text) {
  let markdown = html ? htmlToMarkdown(html) : textToMarkdown(text);
  const lines = markdown.split("\n").map((line) => line.trim()).filter(Boolean);
  let title = "";
  if (lines[0]?.startsWith("# ")) {
    title = lines[0].replace(/^#\s+/, "");
    markdown = lines.slice(1).join("\n\n");
  } else {
    title = stripMarkdown(lines[0] || "新文章");
  }
  markdown = normalizePastedMarkdown(markdown.replace(/^#\s+/gm, "## "));
  markdown = extractDataUrlImages(markdown);
  const summary = generateSummary(markdown);
  const tags = generateTags({ title, body: markdown, categoryId: fields.articleCategory.value });
  return { title, body: markdown, summary, tags };
}

function extractDataUrlImages(markdown) {
  return String(markdown || "").replace(/!\[(.*?)\]\((data:image\/([a-zA-Z0-9.+-]+);base64,([^)]+))\)/g, (_, alt, _src, ext, base64) => {
    const safeExt = ext === "jpeg" ? "jpg" : ext;
    const path = `assets/uploads/pasted-${Date.now()}-${state.pendingAssets.length + 1}.${safeExt}`;
    state.pendingAssets.push({ path, contentBase64: base64 });
    return `![${alt || "粘贴图片"}](${path})`;
  });
}

function htmlToMarkdown(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const chunks = [];
  doc.body.childNodes.forEach((node) => chunks.push(nodeToMarkdown(node)));
  return chunks.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

function nodeToMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent.trim();
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const tag = node.tagName.toLowerCase();
  const text = [...node.childNodes].map(nodeToMarkdown).join(" ").replace(/\s+/g, " ").trim();
  if (!text && tag !== "img") return "";
  if (tag === "h1") return `# ${text}`;
  if (tag === "h2") return `## ${text}`;
  if (tag === "h3") return `### ${text}`;
  if (tag === "strong" || tag === "b") return `**${text}**`;
  if (tag === "em" || tag === "i") return `*${text}*`;
  if (tag === "a") return `[${text}](${node.getAttribute("href") || ""})`;
  if (tag === "img") return `![${node.getAttribute("alt") || "图片"}](${node.getAttribute("src") || ""})`;
  if (tag === "li") return `- ${text}`;
  if (tag === "ul" || tag === "ol") return [...node.children].map(nodeToMarkdown).join("\n");
  if (tag === "table") return tableToMarkdown(node);
  if (tag === "blockquote") return text.split("\n").map((line) => `> ${line}`).join("\n");
  if (tag === "br") return "\n";
  return text;
}

function tableToMarkdown(table) {
  const rows = [...table.querySelectorAll("tr")]
    .map((row) => [...row.children].map((cell) => cell.textContent.replace(/\s+/g, " ").trim()));
  if (!rows.length) return "";
  const width = Math.max(...rows.map((row) => row.length));
  const padded = rows.map((row) => [...row, ...Array(width - row.length).fill("")]);
  const header = padded[0];
  const divider = Array(width).fill("---");
  const body = padded.slice(1);
  return [header, divider, ...body].map((row) => `| ${row.join(" | ")} |`).join("\n");
}

function normalizePastedMarkdown(markdown) {
  const lines = String(markdown || "").split("\n");
  return lines
    .map((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      if (/^(#{2,3}|[-*>]|\d+\.)\s+/.test(trimmed) || trimmed.includes("|")) return trimmed;
      if (index > 0 && looksLikeHeading(trimmed)) return `## ${trimmed}`;
      return trimmed;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksLikeHeading(line) {
  if (line.length > 28) return false;
  if (/[。！？.!?；;：:]$/.test(line)) return false;
  return /[\u4e00-\u9fffA-Za-z]/.test(line);
}

function textToMarkdown(text) {
  const lines = String(text || "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return "";
  return lines.map((line, index) => index === 0 ? `# ${line}` : line).join("\n\n");
}

function clearPasteBox() {
  fields.pasteBox.innerHTML = "";
  state.pastedHtml = "";
  state.pastedText = "";
}

function handleToolbar(button) {
  if (button.dataset.insert) insertAtCursor(button.dataset.insert);
  if (button.dataset.wrap) wrapSelection(button.dataset.wrap);
  if (button.dataset.line) prefixCurrentLine(button.dataset.line);
}

function insertWikiLink() {
  wrapSelection("[[", "]]");
}

function insertExternalLink() {
  const selected = getSelectedText() || "链接文字";
  replaceSelection(`[${selected}](https://)`);
}

async function handleImageInput(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const safeName = `${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "-")}`;
  const path = `assets/uploads/${safeName}`;
  const dataUrl = await fileToDataUrl(file);
  const base64 = dataUrl.split(",")[1];
  state.pendingAssets.push({ path, contentBase64: base64 });
  insertAtCursor(`![${file.name}](${path})`);
  markDirty();
  event.target.value = "";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderPreview() {
  fields.articlePreview.innerHTML = markdownToHtml(fields.articleBody.value);
}

function previewAssetPath(path) {
  if (!path) return "";
  if (/^https?:|^data:|^\//.test(path)) return path;
  return `../${path}`;
}

function markdownToHtml(markdown) {
  return String(markdown || "")
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      if (/^###\s+/.test(trimmed)) return `<h3>${escapeHtml(trimmed.replace(/^###\s+/, ""))}</h3>`;
      if (/^##\s+/.test(trimmed)) return `<h2>${escapeHtml(trimmed.replace(/^##\s+/, ""))}</h2>`;
      if (/^>\s+/.test(trimmed)) {
        return `<blockquote>${trimmed.split("\n").map((line) => `<p>${inlineMarkdown(line.replace(/^>\s+/, ""))}</p>`).join("")}</blockquote>`;
      }
      if (isMarkdownTable(trimmed)) return renderMarkdownTable(trimmed);
      if (/^-\s+/m.test(trimmed)) {
        return `<ul>${trimmed.split("\n").map((line) => `<li>${inlineMarkdown(line.replace(/^-\s+/, ""))}</li>`).join("")}</ul>`;
      }
      if (/^!\[/.test(trimmed)) {
        return trimmed.replace(/^!\[(.*?)\]\((\S+?)(?:\s+"(.*?)")?\)/, (_, alt, src, caption) => {
          const previewSrc = previewAssetPath(src);
          return `<figure><img src="${escapeAttr(previewSrc)}" alt="${escapeAttr(alt)}"><figcaption>${escapeHtml(caption || alt)}</figcaption></figure>`;
        });
      }
      return `<p>${inlineMarkdown(trimmed.replace(/\n/g, " "))}</p>`;
    })
    .join("");
}

function isMarkdownTable(block) {
  const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
  return lines.length >= 2 && lines[0].includes("|") && /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(lines[1]);
}

function renderMarkdownTable(block) {
  const rows = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((_, index) => index !== 1)
    .map((line) => line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim()));
  const [head, ...body] = rows;
  return `
    <table>
      <thead><tr>${head.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join("")}</tr></thead>
      <tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>
  `;
}

function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[\[([^\]]+)\]\]/g, '<span class="wiki-link">[[$1]]</span>')
    .replace(/\[([^\]]+)\]\((.*?)\)/g, '<a href="$2">$1</a>');
}

async function saveAll() {
  const password = fields.password.value.trim();
  if (!password) {
    alert("请先填写后台密码。");
    return;
  }
  setStatus("正在保存到 GitHub...");
  try {
    const response = await fetch("/.netlify/functions/save-content", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": password,
      },
      body: JSON.stringify({ data: collectData(), assets: state.pendingAssets }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "保存失败");
    state.pendingAssets = [];
    state.dirty = false;
    setStatus(`保存成功：${result.message || "已提交到 GitHub"}`);
  } catch (error) {
    setStatus(`保存失败：${error.message}。你可以先下载 data.json 手动上传。`);
  }
}

function regenerateMeta() {
  const article = getSelectedArticle();
  if (!article) return;
  article.summary = generateSummary(article.body);
  article.tags = generateTags(article);
  renderArticleEditor();
  markDirty();
}

function regenerateSlug() {
  const article = getSelectedArticle();
  if (!article) return;
  article.slug = slugify(article.title);
  renderArticleEditor();
  markDirty();
}

function collectData() {
  updateSiteFields();
  updateSelectedArticle();
  sortData();
  return JSON.parse(JSON.stringify(state.data));
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function markDirty() {
  if (state.isRendering) return;
  state.dirty = true;
  setStatus("有未保存改动。记得保存到线上，或下载 data.json 备用。");
}

function getSelectedArticle() {
  return state.data.articles.find((article) => article.id === state.selectedArticleId);
}

function getCategoryOrder(categoryId) {
  return state.data.categories.find((category) => category.id === categoryId)?.order || 9999;
}

function getNextOrder(items) {
  return Math.max(0, ...items.map((item) => Number(item.order || 0))) + 1;
}

function insertAtCursor(text) {
  const textarea = fields.articleBody;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  textarea.value = `${textarea.value.slice(0, start)}${text}${textarea.value.slice(end)}`;
  textarea.focus();
  textarea.selectionStart = textarea.selectionEnd = start + text.length;
  updateSelectedArticle();
}

function getSelectedText() {
  return fields.articleBody.value.slice(fields.articleBody.selectionStart, fields.articleBody.selectionEnd);
}

function replaceSelection(text) {
  const textarea = fields.articleBody;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  textarea.value = `${textarea.value.slice(0, start)}${text}${textarea.value.slice(end)}`;
  textarea.focus();
  textarea.selectionStart = start;
  textarea.selectionEnd = start + text.length;
  updateSelectedArticle();
}

function wrapSelection(before, after = before) {
  const selected = getSelectedText() || "文字";
  replaceSelection(`${before}${selected}${after}`);
}

function prefixCurrentLine(prefix) {
  const textarea = fields.articleBody;
  const start = textarea.selectionStart;
  const lineStart = textarea.value.lastIndexOf("\n", start - 1) + 1;
  textarea.value = `${textarea.value.slice(0, lineStart)}${prefix}${textarea.value.slice(lineStart)}`;
  textarea.focus();
  textarea.selectionStart = textarea.selectionEnd = start + prefix.length;
  updateSelectedArticle();
}

function generateSummary(markdown) {
  const text = stripMarkdown(markdown).slice(0, 92).replace(/[，。；、,.!?！？\s]+$/g, "");
  return text ? `${text}${stripMarkdown(markdown).length > 92 ? "..." : ""}` : "";
}

function generateTags(article) {
  const category = state.data.categories.find((item) => item.id === article.categoryId)?.title || "";
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

function splitList(value) {
  return String(value || "").split(/[,，]/).map((item) => item.trim()).filter(Boolean);
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return splitList(value);
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || `item-${Date.now()}`;
}

function setStatus(message) {
  fields.saveStatus.textContent = message;
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
