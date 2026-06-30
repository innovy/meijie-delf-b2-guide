---
title: 妹姐的DELF B2超级攻略
colorFrom: red
colorTo: gray
sdk: static
pinned: false
---

# 妹姐的DELF B2超级攻略

这是一个面向法语学习者和 DELF B2 备考者的百科式知识库原型。前台是静态网页，后台预留了 Decap CMS，适合老师用可视化方式维护文章和图片。

## 本地预览

在这个文件夹里运行：

```bash
python3 -m http.server 8080
```

然后打开：

```text
http://localhost:8080
```

## 推荐后台

Hugging Face Static HTML 适合测试展示，但不适合作为日常内容后台。想要可视化新增、编辑、上传图片，建议用：

```text
GitHub + Netlify + Decap CMS
```

部署后访问：

```text
https://你的域名/admin/
```

就能进入内容后台。

## Netlify 后台配置步骤

1. 注册 GitHub，把这个项目上传到一个仓库。
2. 注册 Netlify，选择 Add new site，然后从 GitHub 导入这个仓库。
3. 构建设置保持：
   - Build command: `python3 build.py`
   - Publish directory: `.`
4. 部署成功后，进入 Netlify 的 Identity 设置并启用 Identity。
5. 把 Registration 设置成 Invite only。
6. 在 Identity 的 Services 里启用 Git Gateway。
7. 邀请自己的邮箱，按邮件完成注册。
8. 打开 `https://你的域名/admin/`，登录后编辑文章。

## 在后台怎么加图片

在 `/admin/` 的正文编辑器里，点击图片/媒体按钮，上传本地图片或从媒体库选择。图片会保存到：

```text
assets/uploads/
```

不需要手写 Markdown 图片语法。

## 手工内容更新备用方案

如果暂时不用后台，也可以直接改 `content/` 文件夹里的 `.md` 文件。新增文章后运行：

```bash
python3 build.py
```

它会自动重新生成 `content/articles.json`，前台左侧目录就能读到新文章。

## 双向链接怎么写

```markdown
[[写作]]
[[考试结构与评分]]
[[口语|B2口语表达]]
```

页面底部会自动显示反向链接。

## 音频和视频预留

```markdown
::media{type="audio" src="assets/listening-sample.mp3" caption="听力片段示例"}
::media{type="video" src="assets/oral-demo.mp4" caption="口语示范视频"}
```

## 部署建议

[Hugging Face Static HTML Spaces](https://huggingface.co/docs/hub/spaces-sdks-static) 可以测试这个版本。创建 Space 时选择 Static HTML，把本文件夹里的内容上传即可；README 顶部已经包含 `sdk: static`。

正式运营时，建议考虑：

- 静态网站 + [Decap CMS](https://decapcms.org/docs/intro/)：低门槛，有网页编辑器，内容仍可作为文件保存。
- Sanity / Strapi / Directus：更像真正后台，适合多人协作、图片/音频/视频字段和微信小程序 API。
- Netlify / Vercel / Cloudflare Pages：更适合长期网站部署和绑定域名。
