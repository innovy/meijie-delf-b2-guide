---
title: 妹姐的DELF B2超级攻略
colorFrom: red
colorTo: gray
sdk: static
pinned: false
---

# 妹姐的DELF B2超级攻略

这是一个面向法语学习者和 DELF B2 备考者的百科式知识库。前台读取 `content/data.json`，后台是定制管理台，不再使用 Decap CMS。

## 本地预览

```bash
cd "/Users/meijie/Codex/展示网站开放"
python3 -m http.server 8080
```

打开：

```text
http://127.0.0.1:8080
```

后台本地预览：

```text
http://127.0.0.1:8080/admin/
```

本地后台可以编辑和下载 `data.json`，但不能直接保存到 GitHub。线上保存需要 Netlify Functions。

## 新后台能做什么

- 编辑作者卡：姓名、头像、三行简介、微信号、二维码。
- 管理栏目：新增、删除、改名、拖动排序。
- 管理文章：新增、复制、删除、换栏目、排序、编辑正文。
- 飞书粘贴整理：把飞书内容粘贴到后台，自动识别标题、摘要、标签和正文结构。
- 富媒体编辑：插入标题、列表、引用、双链、外链、图片，并实时预览。若粘贴内容里带 base64 图片，后台会转为待上传图片资源；若飞书只提供权限图片链接，请用“插图”按钮上传原图。
- 保存到线上：通过 Netlify Function 写回 GitHub 的 `content/data.json`。

## Netlify 环境变量

在 Netlify 项目里进入：

```text
Site configuration → Environment variables
```

添加：

```text
ADMIN_PASSWORD=你自己设置的后台密码
GITHUB_REPO=你的GitHub用户名/仓库名
GITHUB_BRANCH=main
GITHUB_TOKEN=你的GitHub fine-grained token
```

`GITHUB_TOKEN` 需要允许该仓库的 Contents 读写权限。

## GitHub Token 权限

在 GitHub 创建 Fine-grained personal access token：

- Repository access：只选择这个项目仓库。
- Permissions → Contents：Read and write。

创建后复制 token，放到 Netlify 的 `GITHUB_TOKEN` 环境变量。

## 部署设置

Netlify 项目应从 GitHub 仓库导入。`netlify.toml` 已经配置：

```toml
[build]
  publish = "."
  functions = "netlify/functions"
```

部署后访问：

```text
https://你的站点.netlify.app/
https://你的站点.netlify.app/admin/
```

## 这次必须上传的文件

如果你在 GitHub 网页里手动上传，建议整包覆盖。至少要确认这些文件已经在 GitHub 仓库里：

```text
index.html
scripts.js
styles.css
content/data.json
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

## 内容文件

核心内容在：

```text
content/data.json
```

旧的 Markdown 文件仍保留为历史素材，但前台和新后台不再依赖它们。

## 保存失败排查

后台提示保存失败时，按顺序检查：

1. Netlify 是否已经重新部署最新代码。
2. `ADMIN_PASSWORD` 是否和后台输入的一致。
3. `GITHUB_REPO` 是否是 `用户名/仓库名`，例如 `meijie/meijie-delf-b2-guide`。
4. `GITHUB_BRANCH` 是否和 GitHub 默认分支一致，通常是 `main`。
5. `GITHUB_TOKEN` 是否是 fine-grained token，并且给了该仓库 Contents: Read and write 权限。
6. Netlify 的 Functions 日志里是否有 GitHub API 报错。
