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

const SLUG_KEYWORDS = [
  ["delf b2", "delf-b2"],
  ["dalf c2", "dalf-c2"],
  ["delf", "delf"],
  ["dalf", "dalf"],
  ["b2", "b2"],
  ["c1", "c1"],
  ["c2", "c2"],
  ["报名与考试当天流程", "registration-day"],
  ["考试结构与评分", "format-scoring"],
  ["备考路线图", "prep-roadmap"],
  ["内容更新与后台方案", "content-workflow"],
  ["重新认识", "rethink"],
  ["一站式", "one-stop"],
  ["总览", "overview"],
  ["考试", "exam"],
  ["流程", "process"],
  ["结构", "format"],
  ["评分", "scoring"],
  ["报名", "registration"],
  ["当天", "day"],
  ["考点", "test-center"],
  ["时间", "schedule"],
  ["费用", "fee"],
  ["成绩", "results"],
  ["证书", "certificate"],
  ["写作", "writing"],
  ["口语", "speaking"],
  ["听力", "listening"],
  ["阅读", "reading"],
  ["语法", "grammar"],
  ["词汇", "vocabulary"],
  ["发音", "pronunciation"],
  ["备考", "prep"],
  ["路线", "roadmap"],
  ["计划", "plan"],
  ["复盘", "review"],
  ["模板", "template"],
  ["真题", "past-papers"],
  ["模拟", "mock"],
  ["技巧", "tips"],
  ["经验", "tips"],
  ["官方", "official"],
  ["材料", "resources"],
  ["资料", "resources"],
  ["后台", "admin"],
  ["更新", "update"],
  ["内容", "content"],
  ["图片", "images"],
  ["飞书", "feishu"],
  ["攻略", "guide"],
  ["法语", "french"],
  ["法国", "france"],
  ["索邦", "sorbonne"],
];

const TEMPLATE_SNIPPETS = {
  section: "## 小标题\n\n这里写这一节的核心解释。\n\n- 要点一：\n- 要点二：\n",
  tip: "> 重点提示：这里写最想提醒学生注意的一句话。\n",
  steps: "1. 第一步：\n2. 第二步：\n3. 第三步：\n",
  divider: "---\n",
  wechat: "## 需要进一步练习\n\n如果你希望我帮你判断目前离 DELF B2 还差哪一步，可以添加微信：meijie_fr。\n",
};

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
  setupReport: $("#setupReport"),
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
  setStatus("正在读取由 Markdown 生成的内容数据...");
  const response = await fetch("../content/data.json", { cache: "no-store" });
  state.data = await response.json();
  normalizeData();
  state.selectedArticleId = state.data.articles[0]?.id || "";
  renderAll();
  setStatus("内容已加载：Markdown 是源文件，data.json 是前台发布文件。首次上线后建议先点“检查保存链路”。", "ok");
}

function normalizeData() {
  state.data.categories = (state.data.categories || []).map((category, index) => ({
    id: category.id || slugify(category.title || `category-${index + 1}`),
    title: category.title || "未命名栏目",
    order: Number(category.order || index + 1),
    sourceFile: category.sourceFile || "",
  }));
  state.data.articles = (state.data.articles || []).map((article, index) => ({
    id: article.id || article.slug || crypto.randomUUID(),
    title: article.title || "未命名文章",
    slug: article.slug || smartSlug(article.title || `article-${index + 1}`),
    categoryId: article.categoryId || state.data.categories[0]?.id || "",
    order: Number(article.order || index + 1),
    author: article.author || "妹姐",
    summary: article.summary || "",
    tags: normalizeList(article.tags),
    aliases: normalizeList(article.aliases),
    body: article.body || "",
    sourceFile: article.sourceFile || "",
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
  ["#saveAllButton", "#saveTopButton", "#saveBodyButton"].forEach((selector) => {
    $(selector)?.addEventListener("click", saveAll);
  });
  $("#checkSetupButton")?.addEventListener("click", checkSetup);
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
  $$(".template-toolbar button").forEach((button) => {
    button.addEventListener("click", () => insertTemplate(button.dataset.template));
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
  fields.password.addEventListener("input", () => {
    fields.password.classList.remove("needs-attention");
    sessionStorage.setItem("meijieAdminPassword", fields.password.value);
    clearSetupReport();
  });
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
  article.slug = fields.articleSlug.value.trim() || uniqueArticleSlug(smartSlug(article.title, article.body), article.id);
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
  copy.slug = uniqueArticleSlug(smartSlug(copy.title), copy.id);
  copy.order = getNextOrder(state.data.articles.filter((item) => item.categoryId === copy.categoryId));
  copy.sourceFile = "";
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
    article.slug = uniqueArticleSlug(smartSlug(article.title, article.body), article.id);
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
  const lines = markdown.split("\n");
  const firstContentIndex = lines.findIndex((line) => line.trim());
  const firstLine = firstContentIndex >= 0 ? lines[firstContentIndex].trim() : "";
  let title = "";
  if (firstLine.startsWith("# ")) {
    title = firstLine.replace(/^#\s+/, "");
    lines.splice(firstContentIndex, 1);
    markdown = lines.join("\n");
  } else {
    title = stripMarkdown(firstLine || "新文章");
    if (firstContentIndex >= 0) lines.splice(firstContentIndex, 1);
    markdown = lines.join("\n");
  }
  markdown = normalizePastedMarkdown(markdown.replace(/^#\s+/gm, "## "));
  markdown = extractDataUrlImages(markdown);
  const summary = generateSummary(markdown);
  const tags = generateTags({ title, body: markdown, categoryId: fields.articleCategory.value });
  return { title, body: markdown, summary, tags };
}

function extractDataUrlImages(markdown) {
  return String(markdown || "").replace(/!\[(.*?)\]\((data:image\/([a-zA-Z0-9.+-]+);base64,([^)]+))\)/g, (match, alt, _src, ext, base64) => {
    const safeExt = normalizeImageExtension(ext);
    if (!safeExt) return match;
    const path = `assets/uploads/pasted-${Date.now()}-${state.pendingAssets.length + 1}.${safeExt}`;
    state.pendingAssets.push({ path, contentBase64: base64.replace(/\s+/g, "") });
    return `![${alt || "粘贴图片"}](${path})`;
  });
}

function htmlToMarkdown(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const chunks = [...doc.body.childNodes].map(nodeToMarkdown);
  return cleanupPastedMarkdown(chunks.join("\n\n"));
}

function nodeToMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) return normalizeInlineText(node.textContent);
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const tag = node.tagName.toLowerCase();
  if (tag === "br") return "\n";
  if (tag === "hr") return "---";
  if (tag === "img") return `![${node.getAttribute("alt") || "图片"}](${node.getAttribute("src") || ""})`;
  if (tag === "table") return tableToMarkdown(node);
  if (tag === "pre") return `\`\`\`\n${node.textContent.replace(/\n{3,}/g, "\n\n").trim()}\n\`\`\``;

  const text = childrenToMarkdown(node).trim();
  if (!text) return node.querySelector("br") ? "\n" : "";
  if (tag === "h1") return `# ${text}`;
  if (tag === "h2") return `## ${text}`;
  if (tag === "h3") return `### ${text}`;
  if (tag === "h4") return `### ${text}`;
  if (tag === "strong" || tag === "b") return `**${text}**`;
  if (tag === "em" || tag === "i") return `*${text}*`;
  if (tag === "a") {
    const href = node.getAttribute("href") || "";
    return href ? `[${text}](${href})` : text;
  }
  if (tag === "li") return text.replace(/\n+/g, " ").trim();
  if (tag === "ul") {
    return [...node.children]
      .filter((child) => child.tagName?.toLowerCase() === "li")
      .map((child) => `- ${nodeToMarkdown(child).replace(/\n+/g, " ").trim()}`)
      .join("\n");
  }
  if (tag === "ol") {
    return [...node.children]
      .filter((child) => child.tagName?.toLowerCase() === "li")
      .map((child, index) => `${index + 1}. ${nodeToMarkdown(child).replace(/\n+/g, " ").trim()}`)
      .join("\n");
  }
  if (tag === "blockquote") return text.split("\n").map((line) => `> ${line}`).join("\n");
  return text;
}

function childrenToMarkdown(node) {
  const parts = [];
  [...node.childNodes].forEach((child) => {
    const part = nodeToMarkdown(child);
    if (!part && part !== "\n") return;
    if (isBlockNode(child)) {
      parts.push(part.trim());
      return;
    }
    if (!parts.length) {
      parts.push(part);
      return;
    }
    parts[parts.length - 1] += part;
  });
  return parts.join("\n\n");
}

function isBlockNode(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  return /^(address|article|aside|blockquote|div|dl|figure|footer|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|ul)$/i.test(node.tagName);
}

function normalizeInlineText(text) {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ");
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
  const lines = cleanupPastedMarkdown(markdown).split("\n");
  return lines
    .map((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      if (/^(#{2,3}|[-*>]|\d+\.)\s+/.test(trimmed) || trimmed.includes("|") || trimmed === "---") return trimmed;
      const previousBlank = index === 0 || !lines[index - 1]?.trim();
      if (index > 0 && previousBlank && looksLikeHeading(trimmed)) return `## ${trimmed}`;
      return trimmed;
    })
    .join("\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function looksLikeHeading(line) {
  if (line.length > 28) return false;
  if (/[。！？.!?；;：:]$/.test(line)) return false;
  return /[\u4e00-\u9fffA-Za-z]/.test(line);
}

function textToMarkdown(text) {
  const lines = String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => normalizePlainTextLine(line));
  const firstContentIndex = lines.findIndex((line) => line.trim());
  if (firstContentIndex < 0) return "";
  lines[firstContentIndex] = lines[firstContentIndex].trim().startsWith("# ")
    ? lines[firstContentIndex].trim()
    : `# ${lines[firstContentIndex].trim()}`;
  return cleanupPastedMarkdown(lines.join("\n"));
}

function normalizePlainTextLine(line) {
  const trimmedRight = String(line || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+$/g, "");
  const trimmed = trimmedRight.trim();
  if (!trimmed) return "";
  if (/^[•◦·]\s*/.test(trimmed)) return trimmed.replace(/^[•◦·]\s*/, "- ");
  return trimmedRight;
}

function cleanupPastedMarkdown(markdown) {
  return String(markdown || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
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

function insertTemplate(templateId) {
  const snippet = TEMPLATE_SNIPPETS[templateId];
  if (!snippet) return;
  const textarea = fields.articleBody;
  const before = textarea.value.slice(0, textarea.selectionStart);
  const after = textarea.value.slice(textarea.selectionEnd);
  const prefix = before && !before.endsWith("\n\n") ? "\n\n" : "";
  const suffix = after && !after.startsWith("\n\n") ? "\n\n" : "";
  insertAtCursor(`${prefix}${snippet}${suffix}`);
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
  const extension = normalizeImageExtension(file.name.split(".").pop() || file.type.split("/").pop());
  if (!extension) {
    alert("目前插图只支持 jpg、png、gif、webp。请先把图片转成这些格式再上传。");
    event.target.value = "";
    return;
  }
  const safeName = `${Date.now()}-${safeUploadName(file.name, extension)}`;
  const path = `assets/uploads/${safeName}`;
  const dataUrl = await fileToDataUrl(file);
  const base64 = dataUrl.split(",")[1];
  state.pendingAssets.push({ path, contentBase64: base64 });
  insertAtCursor(`![${file.name}](${path})`);
  markDirty();
  event.target.value = "";
}

function normalizeImageExtension(value) {
  const extension = String(value || "").toLowerCase().replace(/^x-/, "");
  if (extension === "jpeg" || extension === "jpg") return "jpg";
  if (["png", "gif", "webp"].includes(extension)) return extension;
  return "";
}

function safeUploadName(filename, extension) {
  const base = String(filename || "image")
    .replace(/\.[^.]+$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "image";
  return `${base}.${extension}`;
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
  const article = getSelectedArticle();
  const category = state.data.categories.find((item) => item.id === fields.articleCategory.value);
  const rendered = markdownToHtml(fields.articleBody.value, article?.slug || "preview");
  const tags = splitList(fields.articleTags.value)
    .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
    .join("");
  const toc = rendered.headings.length
    ? `<nav class="article-toc" aria-label="本文目录"><strong>本文目录</strong>${rendered.headings
        .map((heading) => `<a class="level-${heading.level}" href="#${heading.id}">${escapeHtml(heading.text)}</a>`)
        .join("")}</nav>`
    : "";

  fields.articlePreview.innerHTML = `
    <header class="article-header">
      <p class="eyebrow">${escapeHtml(category?.title || "DELF B2")}</p>
      <h1>${escapeHtml(fields.articleTitle.value || "文章标题")}</h1>
      ${fields.articleSummary.value ? `<p class="summary">${escapeHtml(fields.articleSummary.value)}</p>` : ""}
      <div class="meta"><span>作者：妹姐</span><span>正式前台预览样式</span></div>
      ${tags ? `<div class="tag-row">${tags}</div>` : ""}
    </header>
    ${toc}
    <div class="article-body">${rendered.html}</div>
  `;
}

function previewAssetPath(path) {
  if (!path) return "";
  if (/^https?:|^data:|^\//.test(path)) return path;
  return `../${path}`;
}

function markdownToHtml(markdown, articleSlug = "preview") {
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
      html.push(`<h${level} id="${escapeAttr(id)}">${inlineMarkdown(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }
    if (isTableStart(lines, i)) {
      const tableLines = [];
      while (i < lines.length && lines[i].includes("|")) tableLines.push(lines[i++]);
      html.push(renderMarkdownTable(tableLines.join("\n")));
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

function renderMarkdownTable(block) {
  const rows = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((_, index) => index !== 1)
    .map((line) => line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim()));
  const [head = [], ...body] = rows;
  return `
    <table>
      <thead><tr>${head.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join("")}</tr></thead>
      <tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>
  `;
}

function renderImage(alt, src, caption) {
  const previewSrc = previewAssetPath(src);
  return `
    <figure>
      <img src="${escapeAttr(previewSrc)}" alt="${escapeAttr(alt)}">
      ${caption || alt ? `<figcaption>${escapeHtml(caption || alt)}</figcaption>` : ""}
    </figure>
  `;
}

function renderMedia(attrs) {
  const src = previewAssetPath(attrs.src || "");
  if (!src) return "";
  const caption = attrs.caption ? `<figcaption>${escapeHtml(attrs.caption)}</figcaption>` : "";
  if (attrs.type === "video") {
    const poster = attrs.poster ? ` poster="${escapeAttr(previewAssetPath(attrs.poster))}"` : "";
    return `<figure><video controls src="${escapeAttr(src)}"${poster}></video>${caption}</figure>`;
  }
  return `<figure><audio controls src="${escapeAttr(src)}"></audio>${caption}</figure>`;
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
    return `<span class="wiki-link">${escapeHtml(label || target)}</span>`;
  });
  output = output.replace(/\[([^\]]+)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
  return output;
}

function stripInlineSyntax(text) {
  return stripMarkdown(text).replace(/\s+/g, " ").trim();
}

function makeHeadingId(slug, text, index) {
  return `${slug || "preview"}-${slugify(text) || "section"}-${index}`;
}

async function checkSetup() {
  const password = requirePasswordForRemoteAction();
  if (!password) return;

  setCheckingState(true);
  setStatus("正在检查 Netlify 环境变量和 GitHub 仓库...", "info");
  clearSetupReport();

  try {
    const response = await fetch("/.netlify/functions/save-content", {
      method: "GET",
      headers: {
        "x-admin-password": password,
      },
      cache: "no-store",
    });
    const result = await readApiResponse(response);
    renderSetupReport(result);
    if (!response.ok) throw new Error(result.error || result.message || "体检没有通过");
    setStatus(result.message || "体检通过：可以保存到 GitHub。", "ok");
  } catch (error) {
    setStatus(`体检失败：${friendlyNetworkError(error.message)}。`, "error");
  } finally {
    setCheckingState(false);
  }
}

async function saveAll() {
  const password = requirePasswordForRemoteAction();
  if (!password) return;

  setSavingState(true);
  setStatus("正在同步 Markdown 源文件和前台数据，请不要关闭页面...", "info");
  try {
    const response = await fetch("/.netlify/functions/save-content", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": password,
      },
      body: JSON.stringify({ data: collectData(), assets: state.pendingAssets }),
    });
    const result = await readApiResponse(response);
    renderSetupReport(result);
    if (!response.ok) throw new Error(result.error || "保存失败");
    state.pendingAssets = [];
    state.dirty = false;
    setStatus(`保存成功：${result.message || "已提交到 GitHub"}`, "ok");
  } catch (error) {
    setStatus(`保存失败：${friendlyNetworkError(error.message)} 请按上方体检结果修改；也可以先下载 data.json 备用。`, "error");
  } finally {
    setSavingState(false);
  }
}

function setSavingState(isSaving) {
  ["#saveAllButton", "#saveTopButton", "#saveBodyButton"].forEach((selector) => {
    const button = $(selector);
    if (!button) return;
    button.disabled = isSaving;
    button.textContent = isSaving ? "保存中..." : (selector === "#saveAllButton" ? "保存 Markdown 源" : "保存 Markdown");
  });
}

function setCheckingState(isChecking) {
  const button = $("#checkSetupButton");
  if (!button) return;
  button.disabled = isChecking;
  button.textContent = isChecking ? "检查中..." : "检查保存链路";
}

function requirePasswordForRemoteAction() {
  const password = fields.password.value.trim();
  if (password) return password;
  fields.password.classList.add("needs-attention");
  fields.password.focus();
  $(".setup-help")?.setAttribute("open", "");
  setStatus("请先填写后台密码：这个密码需要你在 Netlify 的 ADMIN_PASSWORD 环境变量里自己设置。", "error");
  return "";
}

async function readApiResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch (error) {
    return {
      ok: false,
      error: response.status === 404
        ? "没有找到 Netlify Function。请确认已经部署到 Netlify，且 netlify.toml 和 netlify/functions/save-content.js 已上传。"
        : `服务器返回了非 JSON 内容：${text.slice(0, 120)}`,
    };
  }
}

function renderSetupReport(result) {
  if (!fields.setupReport) return;
  const checks = Array.isArray(result?.checks) ? result.checks : [];
  if (!checks.length) {
    clearSetupReport();
    return;
  }

  fields.setupReport.hidden = false;
  fields.setupReport.innerHTML = `
    <strong>${escapeHtml(result.title || (result.ok ? "体检结果" : "需要处理"))}</strong>
    ${result.config ? `<p>目标仓库：${escapeHtml(result.config.repo || "未填写")} / 分支：${escapeHtml(result.config.branch || "未填写")}</p>` : ""}
    <ul>
      ${checks.map(renderSetupCheck).join("")}
    </ul>
  `;
}

function renderSetupCheck(check) {
  const statusText = { pass: "通过", warn: "提醒", fail: "失败" }[check.status] || "提示";
  return `
    <li class="${escapeAttr(check.status || "info")}">
      <span>${statusText}</span>
      <div>
        <strong>${escapeHtml(check.name || "检查项")}</strong>
        <p>${escapeHtml(check.detail || "")}</p>
        ${check.fix ? `<p class="fix">${escapeHtml(check.fix)}</p>` : ""}
      </div>
    </li>
  `;
}

function clearSetupReport() {
  if (!fields.setupReport) return;
  fields.setupReport.hidden = true;
  fields.setupReport.innerHTML = "";
}

function friendlyNetworkError(message) {
  const text = String(message || "请求失败。");
  if (text.includes("Only POST is allowed")) {
    return "线上 Netlify Function 还是旧版本。请先把本机最新版项目上传到 GitHub，然后在 Netlify 的 Deploys 里重新部署一次；新版函数支持“检查保存链路”和“保存 Markdown”。";
  }
  if (text.includes("这里只接受 GET 体检和 POST 保存请求")) {
    return "保存接口收到了异常请求。请刷新 /admin/ 后重试；如果仍出现，说明线上前端和函数版本不一致，需要重新部署。";
  }
  if (text.includes("Failed to fetch") || text.includes("Load failed") || text.includes("NetworkError")) {
    if (location.hostname === "127.0.0.1" || location.hostname === "localhost") {
      return "本地普通预览不能运行 Netlify Functions。部署到 Netlify 后再体检；本地写 Markdown 时运行 python3 build.py 同步前台数据。";
    }
    return "浏览器连不上 Netlify Function。请刷新页面后重试，或查看 Netlify Functions 日志。";
  }
  return text;
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
  article.slug = uniqueArticleSlug(smartSlug(article.title, article.body), article.id);
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
  setStatus("有未保存改动。记得保存 Markdown 源，或下载 data.json 备用。", "warn");
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

function smartSlug(title, body = "") {
  const original = String(title || "").replace(/^\s*(第?\d+[\.\u3001、章节课]?\s*)+/, "").trim();
  const asciiSlug = slugify(transliterateFrench(original));
  if (!/[\u4e00-\u9fff]/.test(original)) return asciiSlug;

  const source = transliterateFrench(original || body).toLowerCase();
  const headline = source.split(/\n/)[0].replace(/^\s*(第?\d+[\.\u3001、章节课]?\s*)+/, "");
  const keywords = [...SLUG_KEYWORDS].sort((a, b) => b[0].length - a[0].length);
  const tokens = [];
  let i = 0;

  while (i < headline.length) {
    const rest = headline.slice(i);
    const word = rest.match(/^[a-z0-9]+/);
    if (word) {
      tokens.push(word[0]);
      i += word[0].length;
      continue;
    }
    const match = keywords.find(([keyword]) => rest.startsWith(transliterateFrench(keyword).toLowerCase()));
    if (match) {
      tokens.push(...match[1].split("-"));
      i += match[0].length;
      continue;
    }
    i += 1;
  }

  const slug = tokens
    .filter(Boolean)
    .filter((token, index, list) => list.indexOf(token) === index || /^[a-z]$/.test(token))
    .join("-");
  return slugify(slug || asciiSlug || "article");
}

function uniqueArticleSlug(base, currentId = "") {
  const cleanBase = slugify(base || "article");
  const used = new Set(
    (state.data?.articles || [])
      .filter((article) => article.id !== currentId)
      .map((article) => article.slug)
      .filter(Boolean)
  );
  if (!used.has(cleanBase)) return cleanBase;
  let index = 2;
  while (used.has(`${cleanBase}-${index}`)) index += 1;
  return `${cleanBase}-${index}`;
}

function transliterateFrench(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/ç/g, "c");
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || `item-${Date.now()}`;
}

function setStatus(message, tone = "info") {
  fields.saveStatus.textContent = message;
  fields.saveStatus.classList.remove("status-ok", "status-warn", "status-error", "status-info");
  fields.saveStatus.classList.add(`status-${tone}`);
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
