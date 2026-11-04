---
title: "[blog-MT-01] - 使用 Astro/Hexo 框架的博客建站过程"
description: 记录从配置 Node.js 环境到安装 Hexo、初始化项目并生成静态页面的建站过程, 同时说明与 Astro 建站的差异和注意事项。
publishedAt: 2026-05-19 22:33:31
tags:
  - hexo
  - Astro
  - 建站
  - 经验分享
  - web
category: 博客维护日记
draft: false
type: post
postID: f1ef2aaa # 自动生成, 不要修改这个项目的值
lastModified: 2026-11-04 15:29:13 # content:d2ac70541eb6af00
---

:::
note [warn]

注意: 文章中关于使用 hexo 框架建站的内容已不再适用于本站, 本站采用 [Astro](https://astro.build/) 框架搭建。相关内容仅作参考, 请勿直接用于 Astro 框架的博客网站。
:::

## 关于 Hexo
**Hexo** 是一个基于 Node.js 编写的快速、简洁且高效的**博客框架**。它通过解析 Markdown 格式的源文件，结合主题模板，一键生成静态网页资源；用户可以将这些静态资源文件部署到如 Github Pages 的静态资源托管服务站点上，无需后端环境或数据库，即可拥有高性能、易于维护的个人博客站点。

## 配置 Node.js 环境
在安装 Hexo 之前，首先要配置 Node.js 环境，前往 [Node.js 中文网下载页面](https://nodejs.cn/download/) 下载适合你当前所使用的系统的 Node.js 安装包。

:::
note [warn]

使用 Windows 10 或更高版本的系统时，通常建议 **直接下载安装包 [Windows 安装包(.msi)]** 进行安装，以免因 PowerShell 执行策略阻止未签名脚本运行，造成 npm 脚本无法正常执行。
:::

## 安装 Hexo
安装好 Node.js 后，使用以下命令来全局安装 hexo
```shell
$ npm install hexo-cli -g
```
安装完成后，在控制台中输入以下命令后，控制台中应出现 hexo-cli 的安装版本
```shell
$ hexo -v
```
![](../../../assets/img/posts/blog/01/cmd_hexo_v.png)

在此次安装过程中，我的控制台中提示了以下内容，这种情况一般是在安装 Node.js 时没有配置好系统变量。将 `%appdata%/npm` 这个路径添加到系统变量中即可 (复制到文件资源管理器中的地址栏，然后获得绝对路径)。
```shell
$ hexo: 无法将 “hexo” 项识别为 cmdlet、函数、脚本文件或可运行程序的名称。请检查名称的拼写，如果包括路径，请确保路径正确，然后再试一次。
```

## 初始化 Hexo 目录
完成 Hexo 的安装后，在**适当的位置**创建一个文件夹，用来存放 hexo 的项目文件。
![](../../../assets/img/posts/blog/01/hexo_project_folder.png)

:::
note [fine]

**这里的文件夹仅作为演示使用，无须严格按照图中所示的路径创建，你可以依照自己的文件管理习惯自己创建**
:::

**进入这个文件夹**，然后执行以下命令
```shell
$ hexo init
```
之后 Hexo 将会在文件夹下初始化一些必要文件，如图所示。
![](../../../assets/img/posts/blog/01/hexo_project_init.png)

:::
note [warn]

Hexo 初始化时会从 Github 克隆一个模板仓库，有时受限于网络波动等因素，你可能无法完成初始化，此时请考虑**使用网络代理**或其它方式完成初始化。
:::

初始化完成后，使用以下命令安装 Node.js 模块
```shell
$ npm install
```

至此，你已完成 Hexo 建站的所有前置条件，使用以下命令即可开启一个本地服务器用来预览你的 Hexo 页面
```shell
$ hexo s
```

然后在浏览器中输入控制台输出的地址 `localhost:4000` 即可预览你的 hexo 页面 
![](../../../assets/img/posts/blog/01/hexo_page_hello_world.png)

:::
note [fine]
当默认端口被占用时，你可以在命令后面增加参数 `-p [端口号]` 来指定一个未占用的端口。

命令如下
```shell 
$ hexo s -p 4001
```
:::

## 生成静态资源
使用以下命令可以生成部署到 Github Pages 的静态资源
```shell
$ hexo g
```
生成好的静态资源位于 `public` 文件夹下
