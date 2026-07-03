const GITHUB_API = "https://api.github.com";
const DATA_PATH = "content/data.json";
const SITE_PATH = "content/site.json";
const ARTICLE_INDEX_PATH = "content/articles.json";
const CATEGORY_INDEX_PATH = "content/categories.json";
const UPLOAD_PREFIX = "assets/uploads/";
const ALLOWED_UPLOAD_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);
const MAX_ASSET_BYTES = 8 * 1024 * 1024;

exports.handler = async function handler(event) {
  try {
    const method = String(event.httpMethod || event.method || "").toUpperCase();
    if (method === "OPTIONS") return json(204, { ok: true, message: "预检通过。" });
    if (method === "HEAD") return head(204);
    if (method === "GET") return await checkSetup(event);
    if (method === "POST") return await saveContent(event);
    return json(405, { ok: false, error: `这里只接受 GET 体检和 POST 保存请求。当前收到的是 ${method || "未知"}。` });
  } catch (error) {
    return json(error.statusCode || 500, publicError(error));
  }
};

async function checkSetup(event) {
  const config = readConfig();
  const auth = requireAdminPassword(event, config);
  if (!auth.ok) return auth.response;

  const baseChecks = getConfigChecks(config);
  if (baseChecks.some((check) => check.status === "fail")) {
    return json(500, {
      ok: false,
      title: "Netlify 环境变量还没配完整",
      error: "请先补齐失败项，再重新部署一次 Netlify。",
      checks: baseChecks,
      config: publicConfig(config),
    });
  }

  const githubChecks = await runGithubChecks(config);
  const checks = [...baseChecks, ...githubChecks];
  const failed = checks.filter((check) => check.status === "fail");
  const warnings = checks.filter((check) => check.status === "warn");

  return json(failed.length ? 500 : 200, {
    ok: failed.length === 0,
    title: failed.length ? "GitHub 保存链路还有问题" : "保存链路体检通过",
    message: failed.length
      ? "失败项修好后，再回到这里点一次体检。"
      : warnings.length
        ? "可以保存。下面的提醒不是阻塞项，但建议看一眼。"
        : "可以保存到 GitHub。",
    checks,
    config: publicConfig(config),
  });
}

async function saveContent(event) {
  const config = readConfig();
  const auth = requireAdminPassword(event, config);
  if (!auth.ok) return auth.response;

  const configChecks = getConfigChecks(config);
  if (configChecks.some((check) => check.status === "fail")) {
    throw new UserFacingError(500, "Netlify 环境变量还没配完整。请先点“检查保存链路”，按失败项补齐。", {
      checks: configChecks,
      config: publicConfig(config),
    });
  }

  await ensureGithubTarget(config);

  const payload = parsePayload(event.body);
  validateContentData(payload.data);
  const assets = validateAssets(payload.assets);
  const prepared = prepareContentFiles(payload.data);

  const dataFile = await getContentFile({ config, path: DATA_PATH, purpose: "data", includeContent: true });
  if (!dataFile.exists && !config.allowFirstSaveCreate) {
    throw new UserFacingError(
      409,
      `首次部署保护已拦截：${config.repo}@${config.branch} 里没有 ${DATA_PATH}。请先确认 GITHUB_REPO 和 GITHUB_BRANCH 指向的就是这个网站仓库。`,
      {
        checks: [
          {
            name: DATA_PATH,
            status: "fail",
            detail: "目标仓库里没找到内容文件。为了避免误写到空仓库或错仓库，默认不允许第一次保存时自动创建。",
            fix: `把本项目的 ${DATA_PATH} 上传到 GitHub 后重新部署；如果你确认就是要首次创建，可在 Netlify 新增 ALLOW_FIRST_SAVE_CREATE=true。`,
          },
        ],
        config: publicConfig(config),
      }
    );
  }

  const previousData = dataFile.content ? safeJson(dataFile.content) : null;
  const staleCandidates = getStaleSourcePaths(previousData, prepared.data);
  const deletePaths = [];
  for (const path of staleCandidates) {
    const existing = await getContentFile({ config, path, purpose: "source" });
    if (existing.exists) deletePaths.push(path);
  }

  const files = [
    ...prepared.files,
    ...assets.map((asset) => ({
      path: asset.path,
      content: asset.contentBase64,
      encoding: "base64",
    })),
  ];

  await commitFiles({
    config,
    files,
    deletePaths,
    message: `Update site content from admin (${new Date().toISOString().slice(0, 10)})`,
  });

  return json(200, {
    ok: true,
    message: `已提交 Markdown 源文件、生成 JSON，并上传 ${assets.length} 个图片资源。Netlify 会在 GitHub 更新后自动重新部署。`,
    config: publicConfig(config),
  });
}

function readConfig() {
  return {
    adminPassword: process.env.ADMIN_PASSWORD || "",
    token: process.env.GITHUB_TOKEN || "",
    repo: (process.env.GITHUB_REPO || "").trim(),
    branch: (process.env.GITHUB_BRANCH || "main").trim(),
    branchWasDefaulted: !process.env.GITHUB_BRANCH,
    allowFirstSaveCreate: parseBoolean(process.env.ALLOW_FIRST_SAVE_CREATE),
  };
}

function requireAdminPassword(event, config) {
  if (!config.adminPassword) {
    return {
      ok: false,
      response: json(500, {
        ok: false,
        error: "Netlify 还没有设置 ADMIN_PASSWORD。请先设置后台密码并重新部署。",
        checks: getConfigChecks(config),
        config: publicConfig(config),
      }),
    };
  }

  const providedPassword = getHeader(event.headers, "x-admin-password");
  if (!providedPassword) {
    return {
      ok: false,
      response: json(401, {
        ok: false,
        error: "请先在后台左侧输入 ADMIN_PASSWORD，再点体检或保存。",
        checks: getConfigChecks(config),
        config: publicConfig(config),
      }),
    };
  }

  if (providedPassword !== config.adminPassword) {
    return {
      ok: false,
      response: json(401, {
        ok: false,
        error: "后台密码不正确。它应该和 Netlify 环境变量 ADMIN_PASSWORD 完全一致。",
        checks: [
          {
            name: "ADMIN_PASSWORD",
            status: "fail",
            detail: "后台输入的密码和 Netlify 保存的密码不一致。",
            fix: "重新输入后台密码；如果忘记了，就在 Netlify 里改一个新密码并重新部署。",
          },
        ],
        config: publicConfig(config),
      }),
    };
  }

  return { ok: true };
}

function getConfigChecks(config) {
  const checks = [
    config.adminPassword
      ? { name: "ADMIN_PASSWORD", status: "pass", detail: "已设置后台密码。" }
      : { name: "ADMIN_PASSWORD", status: "fail", detail: "缺少后台密码。", fix: "在 Netlify 的 Environment variables 里新增 ADMIN_PASSWORD。" },
    config.token
      ? { name: "GITHUB_TOKEN", status: "pass", detail: "已设置 GitHub Token。" }
      : { name: "GITHUB_TOKEN", status: "fail", detail: "缺少 GitHub Token。", fix: "创建 Fine-grained personal access token，给本仓库 Contents: Read and write 权限，再填到 Netlify。" },
    config.repo
      ? { name: "GITHUB_REPO", status: "pass", detail: `当前填写：${config.repo}` }
      : { name: "GITHUB_REPO", status: "fail", detail: "缺少 GitHub 仓库名。", fix: "格式必须是 用户名/仓库名，例如 meijie/meijie-delf-b2-guide。" },
    config.branch
      ? {
          name: "GITHUB_BRANCH",
          status: config.branchWasDefaulted ? "warn" : "pass",
          detail: config.branchWasDefaulted ? "未设置时默认使用 main。" : `当前填写：${config.branch}`,
          fix: config.branchWasDefaulted ? "如果你的 GitHub 默认分支不是 main，请在 Netlify 里补 GITHUB_BRANCH。" : undefined,
        }
      : { name: "GITHUB_BRANCH", status: "fail", detail: "缺少 GitHub 分支名。", fix: "通常填写 main；如果你的仓库默认分支叫 master，就填 master。" },
    config.allowFirstSaveCreate
      ? { name: "首次部署保护", status: "warn", detail: "ALLOW_FIRST_SAVE_CREATE=true，保存时允许自动创建 content/data.json。", fix: "首次创建成功后，建议删掉这个环境变量，避免以后误写错仓库。" }
      : { name: "首次部署保护", status: "pass", detail: "已开启：保存前必须先在目标仓库找到 content/data.json。" },
  ];

  if (config.repo && !isValidRepo(config.repo)) {
    checks.push({
      name: "GITHUB_REPO 格式",
      status: "fail",
      detail: `当前值 ${config.repo} 看起来不像 用户名/仓库名。`,
      fix: "不要填完整网址，不要填 .git，只填 owner/repo。",
    });
  }

  return checks;
}

async function runGithubChecks(config) {
  const checks = [];
  await ensureGithubTarget(config);
  checks.push({ name: "GitHub 仓库访问", status: "pass", detail: `Token 可以访问 ${config.repo}。` });
  checks.push({ name: "GitHub 分支", status: "pass", detail: `已找到 ${config.branch} 分支。` });

  const dataFile = await getContentFile({ config, path: DATA_PATH, purpose: "data" });
  if (dataFile.exists) {
    checks.push({ name: DATA_PATH, status: "pass", detail: "已在目标仓库找到内容文件。保存时会更新它，不会新建错位置。" });
  } else if (config.allowFirstSaveCreate) {
    checks.push({
      name: DATA_PATH,
      status: "warn",
      detail: "目标仓库暂时没有内容文件，但 ALLOW_FIRST_SAVE_CREATE=true，保存时会自动创建。",
      fix: "确认仓库和分支无误后再保存；创建成功后建议关闭这个开关。",
    });
  } else {
    checks.push({
      name: DATA_PATH,
      status: "fail",
      detail: "目标仓库没有 content/data.json，首次部署保护会阻止保存。",
      fix: "先把本项目上传到 GitHub 并让 Netlify 重新部署；确认这个文件存在后再保存。",
    });
  }

  const siteFile = await getContentFile({ config, path: SITE_PATH, purpose: "site" });
  checks.push(siteFile.exists
    ? { name: SITE_PATH, status: "pass", detail: "已找到站点和作者卡源文件。" }
    : { name: SITE_PATH, status: "warn", detail: "目标仓库暂时没有 content/site.json，保存时会自动创建。", fix: "如果你是整包上传项目，建议确认这个文件也已上传。" });

  const buildFile = await getContentFile({ config, path: "build.py", purpose: "build" });
  checks.push(buildFile.exists
    ? { name: "build.py", status: "pass", detail: "已找到 Netlify 构建脚本。" }
    : { name: "build.py", status: "fail", detail: "目标仓库没有 build.py，Netlify 重新部署时无法从 Markdown 生成 data.json。", fix: "把 build.py 上传到 GitHub 后重新部署。" });

  checks.push({
    name: "Contents 写入权限",
    status: "warn",
    detail: "体检已确认 Token 可读取仓库；GitHub 不提供无副作用的写入试验，真正写权限会在点击保存时验证。",
    fix: "如果保存时报 403，请把 GitHub Token 的 Repository permissions → Contents 改成 Read and write。",
  });

  return checks;
}

async function ensureGithubTarget(config) {
  await githubRequest({ config, endpoint: `/repos/${config.repo}`, action: "读取 GitHub 仓库" });
  await githubRequest({ config, endpoint: `/repos/${config.repo}/branches/${encodeURIComponent(config.branch)}`, action: "读取 GitHub 分支" });
}

function parsePayload(body) {
  try {
    return JSON.parse(body || "{}");
  } catch (error) {
    throw new UserFacingError(400, "请求内容不是合法 JSON。请刷新后台后重试。");
  }
}

function validateContentData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new UserFacingError(400, "缺少内容数据。请刷新后台后重试。");
  }
  if (!Array.isArray(data.categories)) {
    throw new UserFacingError(400, "内容数据里缺少 categories 栏目列表。请先下载 data.json 备用，再检查内容结构。");
  }
  if (!Array.isArray(data.articles)) {
    throw new UserFacingError(400, "内容数据里缺少 articles 文章列表。请先下载 data.json 备用，再检查内容结构。");
  }
}

function validateAssets(rawAssets) {
  const assets = Array.isArray(rawAssets) ? rawAssets : [];
  return assets.map((asset, index) => {
    if (!asset || typeof asset !== "object") {
      throw new UserFacingError(400, `第 ${index + 1} 个图片资源格式不正确。`);
    }

    const path = String(asset.path || "");
    if (!isSafeUploadPath(path)) {
      throw new UserFacingError(400, `图片路径不安全或格式不支持：${path || "空路径"}。图片只能保存到 assets/uploads/，并且只支持 jpg、png、gif、webp。`);
    }

    const contentBase64 = String(asset.contentBase64 || "").replace(/\s+/g, "");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(contentBase64)) {
      throw new UserFacingError(400, `图片 ${path} 的内容不是合法 base64。请重新选择图片。`);
    }

    const byteLength = Buffer.byteLength(contentBase64, "base64");
    if (byteLength > MAX_ASSET_BYTES) {
      throw new UserFacingError(400, `图片 ${path} 太大了。请压缩到 8MB 以内再上传。`);
    }

    return { path, contentBase64 };
  });
}

function prepareContentFiles(rawData) {
  const usedPaths = new Set();
  const site = rawData.site && typeof rawData.site === "object" ? JSON.parse(JSON.stringify(rawData.site)) : {};

  const categories = rawData.categories
    .map((category, index) => normalizeCategory(category, index, usedPaths))
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "zh-Hans-CN"));
  const categoryMap = new Map(categories.map((category) => [category.id, category]));

  const articles = rawData.articles
    .map((article, index) => normalizeArticle(article, index, usedPaths, categoryMap))
    .sort((a, b) => {
      const ca = categoryMap.get(a.categoryId)?.order || 9999;
      const cb = categoryMap.get(b.categoryId)?.order || 9999;
      return ca - cb || a.order - b.order || a.title.localeCompare(b.title, "zh-Hans-CN");
    });

  const data = {
    version: Number(rawData.version || 1),
    site,
    categories,
    articles,
  };

  const files = [
    { path: SITE_PATH, content: jsonString(site) },
    ...categories.map((category) => ({ path: category.sourceFile, content: categoryToMarkdown(category) })),
    ...articles.map((article) => ({ path: article.sourceFile, content: articleToMarkdown(article, categoryMap) })),
    { path: DATA_PATH, content: jsonString(data) },
    {
      path: ARTICLE_INDEX_PATH,
      content: jsonString({
        articles: articles
          .slice()
          .sort((a, b) => a.order - b.order || a.sourceFile.localeCompare(b.sourceFile))
          .map((article) => ({ file: article.sourceFile, order: article.order })),
      }),
    },
    {
      path: CATEGORY_INDEX_PATH,
      content: jsonString({
        categories: categories.map((category) => ({
          title: category.title,
          slug: category.id,
          order: category.order,
          file: category.sourceFile,
        })),
      }),
    },
  ];

  files.forEach((file) => {
    if (!isSafeRepoPath(file.path)) {
      throw new UserFacingError(400, `生成的文件路径不安全：${file.path}`);
    }
  });

  return { data, files };
}

function normalizeCategory(category, index, usedPaths) {
  const title = String(category?.title || "未命名栏目").trim();
  const id = String(category?.id || category?.slug || slugForPath(title, `category-${index + 1}`)).trim();
  const order = toOrder(category?.order, index + 1);
  const sourceFile = reserveSourcePath({
    preferred: category?.sourceFile,
    fallback: `content/categories/${padOrder(order)}-${slugForPath(id || title, `category-${index + 1}`)}.md`,
    type: "category",
    usedPaths,
  });
  return { id, title, order, sourceFile };
}

function normalizeArticle(article, index, usedPaths, categoryMap) {
  const title = String(article?.title || "未命名文章").trim();
  const slug = String(article?.slug || article?.id || slugForPath(title, `article-${index + 1}`)).trim();
  const order = toOrder(article?.order, index + 1);
  const categoryId = categoryMap.has(article?.categoryId) ? article.categoryId : [...categoryMap.keys()][0] || "";
  const sourceFile = reserveSourcePath({
    preferred: article?.sourceFile,
    fallback: `content/${padOrder(order)}-${slugForPath(slug || title, `article-${index + 1}`)}.md`,
    type: "article",
    usedPaths,
  });
  const body = String(article?.body || "").replace(/\r\n/g, "\n").trim();

  return {
    id: slug,
    title,
    slug,
    categoryId,
    order,
    author: String(article?.author || "妹姐"),
    summary: String(article?.summary || "").trim() || generateSummary(body),
    tags: normalizeList(article?.tags),
    aliases: normalizeList(article?.aliases),
    body,
    sourceFile,
  };
}

function reserveSourcePath({ preferred, fallback, type, usedPaths }) {
  const preferredPath = String(preferred || "");
  const base = isSafeSourcePath(preferredPath, type) ? preferredPath : fallback;
  let candidate = base;
  let suffix = 2;
  while (usedPaths.has(candidate)) {
    candidate = base.replace(/\.md$/i, `-${suffix}.md`);
    suffix += 1;
  }
  usedPaths.add(candidate);
  return candidate;
}

function categoryToMarkdown(category) {
  return [
    "---",
    `title: ${yamlString(category.title)}`,
    `slug: ${yamlString(category.id)}`,
    `order: ${category.order}`,
    "---",
    "",
  ].join("\n");
}

function articleToMarkdown(article, categoryMap) {
  const category = categoryMap.get(article.categoryId);
  const lines = [
    "---",
    `title: ${yamlString(article.title)}`,
    `slug: ${yamlString(article.slug)}`,
    `author: ${yamlString(article.author || "妹姐")}`,
    `categoryId: ${yamlString(article.categoryId)}`,
    `category: ${yamlString(category?.title || article.categoryId)}`,
    `order: ${article.order}`,
    `summary: ${yamlString(article.summary || "")}`,
    `tags: ${yamlList(article.tags)}`,
    `aliases: ${yamlList(article.aliases)}`,
    "---",
    "",
    article.body || "",
    "",
  ];
  return lines.join("\n").replace(/\n{4,}$/g, "\n\n");
}

function getStaleSourcePaths(previousData, nextData) {
  if (!previousData || typeof previousData !== "object") return [];
  const next = new Set([
    ...(nextData.articles || []).map((item) => item.sourceFile),
    ...(nextData.categories || []).map((item) => item.sourceFile),
  ]);

  const previous = [
    ...(previousData.articles || []).map((item) => ({ path: item.sourceFile, type: "article" })),
    ...(previousData.categories || []).map((item) => ({ path: item.sourceFile, type: "category" })),
  ];

  return previous
    .filter((item) => item.path && isSafeSourcePath(item.path, item.type) && !next.has(item.path))
    .map((item) => item.path);
}

async function commitFiles({ config, files, deletePaths, message }) {
  const filePaths = new Set(files.map((file) => file.path));
  for (const file of files) {
    await putContentFile({
      config,
      path: file.path,
      content: file.content,
      encoding: file.encoding || "utf-8",
      message,
    });
  }

  for (const path of deletePaths.filter((item) => !filePaths.has(item))) {
    await deleteContentFile({ config, path, message });
  }
}

async function putContentFile({ config, path, content, encoding, message }) {
  const existing = await getContentFile({ config, path, purpose: "target" });
  const contentBase64 = encoding === "base64"
    ? content
    : Buffer.from(content, "utf8").toString("base64");

  await githubJson({
    config,
    endpoint: `/repos/${config.repo}/contents/${encodeURIComponentPath(path)}`,
    action: `写入 ${path}`,
    options: {
      method: "PUT",
      body: JSON.stringify({
        message,
        content: contentBase64,
        branch: config.branch,
        ...(existing.sha ? { sha: existing.sha } : {}),
      }),
    },
  });
}

async function deleteContentFile({ config, path, message }) {
  const existing = await getContentFile({ config, path, purpose: "target" });
  if (!existing.sha) return;

  await githubJson({
    config,
    endpoint: `/repos/${config.repo}/contents/${encodeURIComponentPath(path)}`,
    action: `删除 ${path}`,
    options: {
      method: "DELETE",
      body: JSON.stringify({
        message,
        sha: existing.sha,
        branch: config.branch,
      }),
    },
  });
}

async function getContentFile({ config, path, purpose, includeContent = false }) {
  const response = await githubRequest({
    config,
    endpoint: `/repos/${config.repo}/contents/${encodeURIComponentPath(path)}?ref=${encodeURIComponent(config.branch)}`,
    action: purpose === "data" ? `读取 ${path}` : `检查 ${path}`,
    allowNotFound: true,
  });

  if (response.status === 404) return { exists: false, sha: null, content: "" };
  const data = await response.json();
  return {
    exists: true,
    sha: data.sha || null,
    content: includeContent && data.content ? Buffer.from(data.content.replace(/\s+/g, ""), "base64").toString("utf8") : "",
  };
}

async function githubJson(args) {
  const response = await githubRequest(args);
  return response.json();
}

async function githubRequest({ config, endpoint, action, options = {}, allowNotFound = false }) {
  const response = await fetch(`${GITHUB_API}${endpoint}`, {
    ...options,
    headers: {
      ...githubHeaders(config.token),
      ...(options.headers || {}),
    },
  });

  if (allowNotFound && response.status === 404) return response;
  if (!response.ok) {
    const text = await response.text();
    throw githubError({ status: response.status, text, action, config });
  }

  return response;
}

function githubError({ status, text, action, config }) {
  const message = parseGithubMessage(text);
  let friendly = `${action}失败。`;
  let fix = "请检查 Netlify 环境变量后重新部署。";

  if (status === 401) {
    friendly = "GitHub Token 无效或已经过期。";
    fix = "重新生成 Fine-grained personal access token，并更新 Netlify 的 GITHUB_TOKEN。";
  } else if (status === 403) {
    friendly = "GitHub 拒绝了这次操作，最常见原因是 Token 权限不够。";
    fix = "在 GitHub Token 里确认 Repository access 选中了这个仓库，Repository permissions → Contents 是 Read and write。";
  } else if (status === 404 && action.includes("仓库")) {
    friendly = `找不到 GitHub 仓库 ${config.repo}，或 Token 没有访问这个仓库的权限。`;
    fix = "GITHUB_REPO 只填 用户名/仓库名；同时确认 Token 的 Repository access 选中了这个仓库。";
  } else if (status === 404 && action.includes("分支")) {
    friendly = `没能读取 GitHub 分支 ${config.branch}。`;
    fix = "如果仓库首页确认分支就是 main，那么通常不是分支名问题，而是 Netlify 里的 GITHUB_TOKEN 还不是最新 token，或 GitHub Token 的修改没有点 Update 保存。请在 GitHub Token 页面点绿色 Update；如果点过 Regenerate token，要把新 token 重新粘贴到 Netlify 的 GITHUB_TOKEN，并重新部署。";
  } else if (status === 409) {
    friendly = "GitHub 上的分支刚刚被别人或另一次保存更新了。";
    fix = "刷新后台，重新读取最新内容后再保存。";
  } else if (status === 422) {
    friendly = "GitHub 没接受这次写入请求，通常是分支名、文件内容或权限设置不对。";
    fix = "先点“检查保存链路”；如果体检通过仍失败，请确认 Token 有 Contents: Read and write 权限。";
  }

  return new UserFacingError(status >= 500 ? 502 : status, `${friendly} ${fix}`, {
    githubStatus: status,
    githubMessage: message,
    checks: [
      {
        name: action,
        status: "fail",
        detail: friendly,
        fix,
      },
    ],
    config: publicConfig(config),
  });
}

function parseGithubMessage(text) {
  try {
    const data = JSON.parse(text || "{}");
    return data.message || text;
  } catch (error) {
    return text;
  }
}

function publicError(error) {
  return {
    ok: false,
    error: error.message || "保存失败。",
    ...(error.details || {}),
  };
}

class UserFacingError extends Error {
  constructor(statusCode, message, details = {}) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
    "User-Agent": "meijie-delf-b2-admin",
  };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function jsonString(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

function yamlString(value) {
  return JSON.stringify(String(value ?? ""));
}

function yamlList(value) {
  return `[${normalizeList(value).map(yamlString).join(", ")}]`;
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || "").split(/[,，]/).map((item) => item.trim()).filter(Boolean);
}

function generateSummary(markdown) {
  const blocks = String(markdown || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const first = blocks.find((block) => !block.startsWith("#") && !block.startsWith("!") && !block.startsWith("|")) || markdown;
  return truncateText(stripMarkdown(first), 92);
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

function truncateText(text, maxLength) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).replace(/[，。；、,.!?！？\s]+$/g, "")}...`;
}

function toOrder(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function padOrder(order) {
  return String(Math.max(1, Number(order) || 1)).padStart(2, "0");
}

function slugForPath(value, fallback) {
  return String(value || fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || fallback;
}

function isValidRepo(repo) {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo);
}

function isSafeRepoPath(path) {
  return Boolean(
    path &&
    !path.startsWith("/") &&
    !path.includes("..") &&
    !path.includes("\\") &&
    !path.includes("//") &&
    !/[\0\r\n]/.test(path)
  );
}

function isSafeSourcePath(path, type) {
  if (!isSafeRepoPath(path) || !path.endsWith(".md")) return false;
  if (type === "category") return path.startsWith("content/categories/");
  return path.startsWith("content/") && !path.startsWith("content/categories/");
}

function isSafeUploadPath(path) {
  if (!path.startsWith(UPLOAD_PREFIX)) return false;
  if (!isSafeRepoPath(path)) return false;
  if (!/^[A-Za-z0-9._/-]+$/.test(path)) return false;
  const extension = path.split(".").pop().toLowerCase();
  return ALLOWED_UPLOAD_EXTENSIONS.has(extension);
}

function encodeURIComponentPath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function getHeader(headers = {}, wantedName) {
  const entry = Object.entries(headers).find(([name]) => name.toLowerCase() === wantedName.toLowerCase());
  return entry ? entry[1] : "";
}

function parseBoolean(value) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

function publicConfig(config) {
  return {
    repo: config.repo || "",
    branch: config.branch || "",
    branchWasDefaulted: config.branchWasDefaulted,
    allowFirstSaveCreate: config.allowFirstSaveCreate,
  };
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function head(statusCode) {
  return {
    statusCode,
    headers: {
      "Cache-Control": "no-store",
    },
    body: "",
  };
}
