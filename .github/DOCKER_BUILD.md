# 在 GitHub 自动构建 Docker 镜像

本仓库的 `Build and Publish Docker Images` 工作流使用仓库自带的 `GITHUB_TOKEN` 发布镜像，无需配置 Docker Hub 账号或 SSH 部署密钥。

## 触发方式

- 推送 `main`，且修改前端、后端、Compose、环境示例或构建工作流时：构建并发布前后端镜像。
- Pull Request：校验 Compose 并构建 AMD64 镜像，不登录仓库、不发布镜像。
- 发布 Release：构建并发布多架构镜像，生成 Release 和语义化版本标签；预发布版本不覆盖 `latest`。
- Actions → Build and Publish Docker Images → Run workflow：可选指定 Git 分支、标签或 SHA，并添加自定义镜像标签。

正式发布包含 `linux/amd64` 和 `linux/arm64`。前后端分开构建和缓存，后端采用 Go 交叉编译，前端使用 QEMU 构建 ARM64。

## 镜像地址与标签

镜像地址自动根据当前仓库名生成，并转换为小写。当前仓库生成：

```text
ghcr.io/mr-chenh/alexandrie-frontend:latest
ghcr.io/mr-chenh/alexandrie-backend:latest
```

- `latest`：主分支，以及非预发布 Release。
- `sha-<12 位提交号>`：本次真正检出的提交，可用于固定版本或回滚。
- Release 标签：例如 `v8.14.2`，同时生成 `8.14.2` 和 `8.14`。
- 手动构建可添加 `preview` 等自定义标签。手动构建其他分支或历史提交不会自动覆盖 `latest`。

Fork 或重命名仓库后，工作流会自动使用新地址；部署端需要相应修改 `.env` 中的 `ALEXANDRIE_IMAGE_PREFIX`。

## GitHub 首次设置

1. 确认仓库的 Actions 已启用；Fork 首次打开 Actions 时可能需要点击启用工作流。
2. 将本次配置提交并推送至 `main`。在 Actions 查看前后端构建任务。
3. 工作流显式申请 `contents: read` 和 `packages: write`。组织策略如禁用包写入，需要由仓库管理员放开。
4. 首次发布后，进入 GitHub 的 Packages，分别将前后端包的可见性设为 **Public**，部署服务器才可以匿名拉取。保留私有包时，需要先使用具有 `read:packages` 权限的令牌执行 `docker login ghcr.io`。

自动构建只发布镜像；服务器更新通过 Compose 执行。

## 部署

```bash
cp .env.example .env
# 编辑 .env，设置访问域名、密码和 JWT_SECRET。
docker compose --env-file .env config --quiet
docker compose pull
docker compose up -d --no-build
docker compose logs -f --tail=100 frontend backend
```

`.env` 中的镜像配置：

```dotenv
ALEXANDRIE_IMAGE_PREFIX=ghcr.io/mr-chenh/alexandrie
ALEXANDRIE_IMAGE_TAG=latest
```

需要固定提交时，将标签改为工作流日志中实际发布的 `sha-...`，再执行 `docker compose pull && docker compose up -d --no-build`。

也可以从完整源码本地构建：

```bash
docker compose up -d --build
```

开发模式：

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

## 运行时配置

同一个前端镜像可以部署在不同域名，不需要将部署地址作为构建参数传入 GitHub。

- `NUXT_PUBLIC_BASE_URL`：对外站点地址，影响页面元信息与分享地址。
- `NUXT_PUBLIC_BASE_API` / `NUXT_PUBLIC_BASE_CDN`：浏览器使用的公开 API、文件地址。
- `NUXT_PUBLIC_I18N_BASE_URL`：多语言页面使用的公开站点地址。
- `NUXT_BASE_API_INTERNAL=http://backend:8201`：只供容器内的 Nitro 服务端请求使用，不发送给浏览器。

Compose 已将 `.env` 中的 `FRONTEND_URL`、`API_URL`、`CDN_URL` 和功能开关映射至对应运行时配置。前端入口脚本会将公开 API/CDN 的 origin 写入 PWA Service Worker；容器重启后可重新读取新地址。不会在启动时重新编译整个前端。

`COOKIE_DOMAIN` 只填写共同域名，不带协议或端口，例如 `localhost`、`example.com`。

## 构建约定

- 前端固定 Bun `1.4.4` 与 Node `24`，使用冻结锁文件安装。
- 前端构建和运行阶段都使用 Debian，避免原生依赖的 glibc/musl 不一致。
- 前端运行进程使用 `node` 用户；后端使用 distroless nonroot。
- `.dockerignore` 放在各自的构建上下文中，排除本地 `.env`、依赖目录、产物和日志。
- GitHub checkout 启用 LFS，确保视频等资源不会以指针文件进入镜像。
- PR 检查同时执行 API 地址选择、PWA 运行时配置和 PDF 分页测试，并构建前端后验证公开笔记的 SSR 响应。

## 本地验证

已校验生产 Compose 和开发覆盖配置，检查 Actions / shell 脚本语法，并编译 Linux AMD64 与 ARM64 后端。前端检查可复现为：

```bash
cd frontend
bun test app/helpers/
node --test docker-runtime-config.test.mjs
bun run typecheck
bun run build
node scripts/check-docker-runtime.mjs
```

最后一项使用临时 HTTP 接口和端口验证真实生产构建：公开笔记返回 200、元信息采用部署域名、服务端使用内部 API、客户端不包含内部地址，以及 Service Worker 的启动和重启配置。

公开页面还修正了原有 Pinia 集合状态的 SSR 序列化问题；Pinia 在服务端统一打包，避免重复模块的 hydration 标记不一致。

本地环境未安装 Docker，因此未在本机执行镜像构建或启动完整 MySQL / RustFS 栈。工作流会在 GitHub runner 上执行实际镜像构建；只有提交并推送配置后才会触发远端任务。
