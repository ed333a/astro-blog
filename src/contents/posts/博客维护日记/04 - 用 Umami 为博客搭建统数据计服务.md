---
title: "[blog-MT-04] - 用 Umami 为博客搭建数据统计服务"
description: 记录用 Docker 部署 Umami 数据统计服务的过程, 包括修改 docker-compose 配置、初始化数据库、进入后台并接入博客统计脚本。
published: 2026-05-29 14:42:31
tags:
  - umami
  - 数据统计
  - Docker
  - 建站
  - 经验分享
  - web
category: 博客维护日记
postID: 70562cef # 自动生成, 不要修改这个项目的值
---

## 需要做的工作
- 拥有一台云服务器
- 拥有一个已经部署好的 umami 实例，本篇会介绍如何部署 umami 实例

## 部署 umami 实例
这里采用 docker 安装，在这之前你需要在云服务器上安装好 `docker` 服务，推荐使用[宝塔面板](https://www.bt.cn/new/index.html)来一键安装 docker 服务，本篇基于宝塔面板来介绍。

首先需要将 umami 的 github 仓库克隆下来
```shell
$ git clone https://github.com/umami-software/umami.git
```
然后进入刚刚克隆好的仓库目录下，找到 `docker-compose.yml`, 修改数据库的名字

![change-doker-compose](/img/posts/blog/04/change-doker-compose.png)

以下内容不修改也是可以的，但是为了安全起见建议修改
- **ports**: umami 实例的端口映射，建议修改一下**宿主机**的端口(冒号前面的)，不要用默认的端口。
- **DATABASE_URL**: 格式为 `postgresql://用户名:密码@db:端口号/数据库名` 这里的用户名、密码、数据库名对应 `db` 中 的 `POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB` 这三个值，端口号目前我不知道怎么改，如果有知道的大佬可以在评论区评论一下（
- **APP_SECRET**: 改成一串随机的字符串
- **POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB**: 在上面已经提到了，是数据库的用户名、密码、数据库名。

改完配置之后运行下面的命令:
```shell
$ docker compose up -d
```

之后在宝塔面板的 Docker 服务中就可以看到我们刚刚创建好的两个容器了，一个是 umami，另外一个是数据库。
![docker-containers](/img/posts/blog/04/docker-containers.png)

## 进入 umami 后台
部署完成后，可以访问 `http://服务器公网ip:端口(宿主机)` 进入 umami 后台了，默认用户名和密码为 `admin` 和 `umami`,

${note [fine]
也可以使用反向代理将域名解析到你的服务器 ip 上去掉端口，之前有介绍过这里就不说了。
}

### 创建网站
在 umami 后台中依次点击 `网站 -> 添加网站`，之后输入网站名称和网站的 **域名(不带 `https://`)** 就好了

![add website](/img/posts/blog/04/add-website.png)

${note [info]
初次进入界面时语言可能是英文，这时可以点击左下角 `admin -> Language -> 往下滑找到中文` 就可以改成中文了。
}

### 开始统计数据
点击右侧的 "编辑" 图标
![edit website](/img/posts/blog/04/edit-website.png)
找到 "跟踪代码" 块, 将这部分代码复制到 `<header> ... </header>` 标签页内即可开始跟踪数据。 
![Tracking code](/img/posts/blog/04/tracking-code.png)

### 分享数据
在编辑网站页面找到 "分享" 块，点击添加，选择你要分享的数据，选择好后点击保存会生成一个分享链接，将这个链接分享给他人就可以了。