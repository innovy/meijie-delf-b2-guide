const GITHUB_API = "https://api.github.com";

exports.handler = async function handler(event) {
  if (event.method !== "POST") {
    return json(405, { error: "Only POST is allowed." });
  }

  const expectedPassword = process.env.ADMIN_PASSWORD;
  const providedPassword = event.headers["x-admin-password"] || event.headers["X-Admin-Password"];
  if (!expectedPassword) {
    return json(500, { error: "Netlify 环境变量 ADMIN_PASSWORD 尚未配置。" });
  }
  if (providedPassword !== expectedPassword) {
    return json(401, { error: "后台密码不正确。" });
  }

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";
  if (!token || !repo) {
    return json(500, { error: "Netlify 环境变量 GITHUB_TOKEN 或 GITHUB_REPO 尚未配置。" });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (error) {
    return json(400, { error: "请求内容不是合法 JSON。" });
  }

  if (!payload.data || typeof payload.data !== "object") {
    return json(400, { error: "缺少 data 内容。" });
  }

  try {
    await putFile({
      repo,
      branch,
      token,
      path: "content/data.json",
      contentBase64: Buffer.from(JSON.stringify(payload.data, null, 2) + "\n", "utf8").toString("base64"),
      message: "Update site content data",
    });

    const assets = Array.isArray(payload.assets) ? payload.assets : [];
    for (const asset of assets) {
      if (!asset.path || !asset.contentBase64) continue;
      if (!asset.path.startsWith("assets/uploads/")) {
        return json(400, { error: `不允许写入这个资源路径：${asset.path}` });
      }
      await putFile({
        repo,
        branch,
        token,
        path: asset.path,
        contentBase64: asset.contentBase64,
        message: `Upload ${asset.path}`,
      });
    }

    return json(200, { ok: true, message: `已保存内容，并上传 ${assets.length} 个资源。` });
  } catch (error) {
    return json(500, { error: error.message || "保存失败。" });
  }
};

async function putFile({ repo, branch, token, path, contentBase64, message }) {
  const sha = await getSha({ repo, branch, token, path });
  const response = await fetch(`${GITHUB_API}/repos/${repo}/contents/${encodeURIComponentPath(path)}`, {
    method: "PUT",
    headers: githubHeaders(token),
    body: JSON.stringify({
      message,
      content: contentBase64,
      branch,
      ...(sha ? { sha } : {}),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub 写入 ${path} 失败：${response.status} ${text}`);
  }
  return response.json();
}

async function getSha({ repo, branch, token, path }) {
  const response = await fetch(`${GITHUB_API}/repos/${repo}/contents/${encodeURIComponentPath(path)}?ref=${encodeURIComponent(branch)}`, {
    headers: githubHeaders(token),
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub 读取 ${path} 失败：${response.status} ${text}`);
  }
  const data = await response.json();
  return data.sha || null;
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

function encodeURIComponentPath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}
