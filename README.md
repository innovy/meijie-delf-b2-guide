---
title: 妹姐的DELF B2超级攻略
colorFrom: red
colorTo: gray
sdk: static
pinned: false
---

# 妹姐的DELF B2超级攻略

这是一个面向法语学习者和 DELF B2 备考者的百科式知识库。内容源保留为 Markdown，构建脚本会自动生成前台读取的 `content/data.json`；后台保存时也会把可视化编辑结果同步回 Markdown，避免两边内容漂移。

## 本地预览

```bash
cd "/Users/meijie/Codex/展示网站开放"
python3 -m http.server 8080
```

打开：

```text
http://127.0.0.1:8080
http://127.0.0.1:8080/admin/
```

本地普通预览可以编辑和下载 `data.json` 备用，但不能直接保存到 GitHub。线上保存需要 Netlify Functions。

## 内容流

日常维护只认这一条线：

```text
content/*.md + content/categories/*.md + content/site.json
  → python3 build.py
  → content/data.json
  → 前台和后台读取
```

- 文章源文件：`content/*.md`
- 栏目源文件：`content/categories/*.md`
- 站点和作者卡源文件：`content/site.json`
- 生成文件：`content/data.json`、`content/articles.json`、`content/categories.json`

如果你本地直接写 Markdown，写完运行：

```bash
python3 build.py
```

如果你在线上后台编辑，点击“保存 Markdown 源”，Netlify Function 会一次性提交 Markdown 源文件、`content/site.json`、生成 JSON 和上传图片。

## Netlify 上线步骤

1. 在 GitHub 新建一个仓库，把整个项目上传进去。
2. 在 Netlify 点 Add new site → Import an existing project，选择这个 GitHub 仓库。
3. Build command 填 `python3 build.py`，Publish directory 填 `.`。本项目的 `netlify.toml` 已经写好，一般 Netlify 会自动读到。
4. 部署成功后，进入 Site configuration → Environment variables，填写下面四个变量。
5. 回到 Netlify，点 Trigger deploy → Deploy site，让新环境变量生效。
6. 打开 `https://你的站点.netlify.app/admin/`，输入后台密码，先点“检查保存链路”。
7. 体检通过后再编辑内容，点击“保存 Markdown 源”。

## 环境变量

必须填写：

```text
ADMIN_PASSWORD=你自己设置的后台密码
GITHUB_REPO=你的GitHub用户名/仓库名
GITHUB_BRANCH=main
GITHUB_TOKEN=你的GitHub fine-grained token
```

可选保护开关：

```text
ALLOW_FIRST_SAVE_CREATE=true
```

默认不要填 `ALLOW_FIRST_SAVE_CREATE`。后台保存前会先确认目标仓库里已经有 `content/data.json`，避免你把内容误写到空仓库或错仓库。只有在你确认第一次就是要自动创建 `content/data.json` 时，才临时设为 `true`；创建成功后建议删掉它。

## GitHub Token 权限

创建 Fine-grained personal access token 时这样选：

- Repository access：只选择这个项目仓库。
- Repository permissions → Contents：Read and write。

创建后复制 `github_pat_...`，填到 Netlify 的 `GITHUB_TOKEN`。它不是 GitHub 登录密码。

## 后台体检会检查什么

`/admin/` 左侧的“检查保存链路”会检查：

- `ADMIN_PASSWORD` 是否存在、后台输入是否正确。
- `GITHUB_REPO` 是否像 `用户名/仓库名`。
- `GITHUB_BRANCH` 是否能在 GitHub 找到。
- `content/data.json` 是否已在目标仓库中，首次部署保护是否会拦截。
- `content/site.json` 和 `build.py` 是否在目标仓库中。
- Token 是否至少能读取仓库；真正写入权限会在第一次保存时验证。

如果保存时报 403，最常见原因是 `GITHUB_TOKEN` 没给 Contents: Read and write，或 Token 没选中这个仓库。

## 必须上传的文件

如果你在 GitHub 网页里手动上传，建议整包覆盖。至少确认这些文件都在仓库里：

```text
index.html
scripts.js
styles.css
build.py
content/data.json
content/site.json
content/articles.json
content/categories.json
content/*.md
content/categories/*.md
admin/index.html
admin/admin.css
admin/admin.js
netlify.toml
netlify/functions/save-content.js
assets/brand/meijie-logo.png
assets/brand/meijie-avatar.jpg
assets/brand/wechat-qr.jpg
assets/uploads/.gitkeep
```

如果 `/admin/` 打开后不是“自定义内容后台”，通常就是 `admin/index.html`、`admin/admin.js` 或 `admin/admin.css` 没传上去。

## 保存失败排查

按这个顺序看：

1. Netlify 是否在填完环境变量后重新部署过。
2. 后台输入的密码是否和 `ADMIN_PASSWORD` 完全一致。
3. `GITHUB_REPO` 是否只填了 `用户名/仓库名`，不要填网址、不要加 `.git`。
4. `GITHUB_BRANCH` 是否和 GitHub 仓库默认分支一致，通常是 `main`。
5. `GITHUB_TOKEN` 是否是 fine-grained token，是否选中了这个仓库，Contents 是否是 Read and write。
6. 目标仓库里是否已有 `content/data.json` 和 `build.py`。
7. Netlify 的 Functions 日志里是否有更具体的 GitHub 报错。
