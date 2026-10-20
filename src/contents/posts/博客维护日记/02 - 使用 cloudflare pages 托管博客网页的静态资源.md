---
title: "[blog-MT-02] - 使用 cloudflare pages 托管博客网页的静态资源"
published: 2026-05-20 09:43:19
tags:
  - hexo
  - 经验分享
  - web
category: 博客维护日记
postID: 9942d232 # 自动生成, 不要修改这个项目的值
---
### 前言
由于 github pages 在国内的访问速度实在是不稳定，在查询资料的时候发现 cloudflare 可以提供静态资源部署服务，并且访问速度还是不错的。所以本篇文章基于此而诞生。

### 部署步骤
在这之前请注册 cloudflare 账号。关于账号注册本篇不再赘述，跟着提示一步步走即可，或者直接使用 github 账号登陆，登陆后验证一下邮箱就行了。
#### 创建页面
在注册好并成功登录之后，我们会来到如图所示的界面，然后根据图中箭头所示进入对应的页面。
![goto_pages](/img/posts/blog/02/goto_cloud_flare_pages.png)
来到这个页面之后，我们点击右上角的 Create Application
![](/img/posts/blog/02/works_pages_create_app.png)
然后就来到了这个页面，注意要选择下方的 Get started
![](/img/posts/blog/02/pages_create_app.png)
选择从 git 导入
![](/img/posts/blog/02/get_started_page.png)
选择你的 hexo **源码仓库**，即包含文章 markdown 源码的仓库。 (注意：不是 github pages 仓库，你可以前往我图中的这个仓库查看一下：[ed333a/hexo_repo](https://github.com/ed333a/hexo_repo))选择完毕后点击右下角的 Begining setup 蓝色按钮。
![](/img/posts/blog/02/sel_repo.png)
之后我们会来到这个页面，相关选项已在图中表示，配置好后往下翻找到 Save and Deploy 蓝色按钮，点击保存后开始自动部署。
![](/img/posts/blog/02/pages_setup.png)
之后自动部署好的静态网页将可以通过 `hexo-repo-e1a.pages.dev` 这个链接访问。在这之前我已经创建好了一个静态资源网页，它的地址是 `hexo-repo-1qi.pages.dev`。
