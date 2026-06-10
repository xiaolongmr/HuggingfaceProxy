# HuggingFace Proxy

🤗 一个简洁高效的 HuggingFace 代理服务，基于 Cloudflare Workers。
体验地址：https://hf.rimuru.work

## ✨ 特性

- **零配置使用** - 直接访问即可，所有请求自动转发到 HuggingFace
- **智能重定向** - 自动处理 CDN 重定向，无需多域名配置
- **HF Space 资源反代** - 支持 `*.hf.space` 图片、HTML 和静态资源代理
- **下载器脚本** - 提供 Python 下载器，支持并行下载、断点续传、HF Cache 导入
- **模块化架构** - 代码结构清晰，易于维护和扩展

## 📁 项目结构

```
hf_proxy/
├── src/                       # 源代码目录
│   ├── config.js              # 配置文件
│   ├── utils.js               # 工具函数
│   ├── handlers.js            # 请求处理器
│   ├── index.js               # 主入口
│   ├── templates/             # HTML 模板
│   │   └── home.html          # 首页模板
│   └── scripts/               # 脚本文件
│       └── hf_downloader.py   # Python 下载器
├── build.js                   # 构建脚本
├── _worker.js                 # 构建产物 (自动生成)
├── package.json
├── wrangler.toml
└── README.md
```

## 🚀 快速开始

### 部署到 Cloudflare Workers

1. Fork 本仓库
2. 在 Cloudflare Dashboard 创建 Worker，连接 GitHub 仓库
3. 构建命令填写 `npm run build`
4. 部署命令填写 `npx wrangler deploy`
5. 根目录保持 `/`
6. 推送代码到 `main` 分支后，Cloudflare 会自动构建并部署 Worker

部署完成后，可以在 Worker 的路由或自定义域名中绑定自己的域名。

> **注意**: `_worker.js` 是构建产物，由 `npm run build` 自动生成。

### 本地开发

```bash
# 安装依赖
npm install

# 构建并启动开发服务器
npm run dev

# 仅构建
npm run build

# 部署
npm run deploy
```

## 📖 使用方法

> ⚠️ **注意**: 不推荐使用 `huggingface-cli` 或 `snapshot_download` 搭配本代理。由于 Cloudflare 的缓存机制会覆盖或丢失 `Content-Length` / `X-Linked-Size` 等关键头信息，这会导致这些严格校验的客户端下载失败。请使用本项目自带的下载脚本，已专门优化以避开此问题。

### 直接访问

直接访问代理域名根路径即可查看使用示例和说明。

```bash
# 访问模型页面
https://your-proxy.com/bert-base-uncased

# 下载模型文件
https://your-proxy.com/bert-base-uncased/resolve/main/config.json

# API 调用
https://your-proxy.com/api/models/bert-base-uncased
```

### 反代 HF Space 图片和静态资源

本项目允许代理 `*.hf.space` 的公开资源。将原始 HF Space 地址改写为：

```bash
https://your-proxy.com/redirect_to_{hf.space域名}/{路径}
```

例如，原始图片地址：

```bash
https://zlcy-chatsam-public.hf.space/images/2026/06/11/1781109413_718dfe93ca15afa2bc8a37910405a837.png
```

通过代理访问：

```bash
https://your-proxy.com/redirect_to_zlcy-chatsam-public.hf.space/images/2026/06/11/1781109413_718dfe93ca15afa2bc8a37910405a837.png
```

Space 项目入口也可以代理，例如你的项目：

```bash
https://your-proxy.com/redirect_to_zlcy-li.hf.space/
```

也可以省略最后的 `/`：

```bash
https://your-proxy.com/redirect_to_zlcy-li.hf.space
```

这会转发到：

```bash
https://zlcy-li.hf.space/
```

> 部分 HF Space 对 `HEAD` 请求会返回 `405 Method Not Allowed`，但只要 `GET` 正常返回即可代理访问。
> Worker 会自动改写 HTML 中的根路径资源，例如 `/_next/static/app.js` 会变成 `/redirect_to_zlcy-li.hf.space/_next/static/app.js`。
> 如果 Space 页面里写死了其他完整绝对域名、WebSocket 或第三方 API 地址，浏览器可能仍会直连那些地址；单张图片、HTML 和普通静态资源反代最稳定。

### 缓存 HF Space 图片

Worker 会对 `*.hf.space` 和 `*.hf.co` 下的常见静态资源启用 Cloudflare 边缘缓存，包括图片、CSS、JS、字体、音视频等文件扩展名。默认缓存策略：

| 缓存位置 | 默认 TTL | 环境变量 |
|---------|---------|---------|
| Cloudflare Edge | 30 天 | `EDGE_CACHE_TTL_DAYS=30` |
| 浏览器 | 30 天 | `BROWSER_CACHE_TTL_DAYS=30` |

静态资源响应会覆盖源站的 `Cache-Control`，返回类似：

```text
Cache-Control: public, max-age=2592000, immutable
```

这样生成后 URL 不变的图片会更稳定地进入浏览器本地缓存。

如果想改成其他天数，直接填写天数即可，例如浏览器缓存 14 天：

```bash
BROWSER_CACHE_TTL_DAYS=14
```

如果需要关闭 Worker 里的边缘缓存：

```bash
EDGE_CACHE_TTL_DAYS=0
```

也可以在 Cloudflare Dashboard 里再加一条 Cache Rule：

```text
When incoming requests match:
  Hostname equals your-proxy.com
  URI Path starts with /redirect_to_

Then:
  Cache eligibility: Eligible for cache
  Edge TTL: 1 month
  Browser TTL: 1 month
```

### 使用下载器脚本

```bash
# 下载脚本
curl -O https://your-proxy.com/hf_downloader.py

# 安装依赖
pip install requests tqdm

# 下载模型
python hf_downloader.py bert-base-uncased
python hf_downloader.py openai/whisper-large-v3 --type model
python hf_downloader.py bigcode/starcoder --revision main --workers 8

# 网络优化选项
python hf_downloader.py bert-base-uncased -4   # 强制使用 IPv4
python hf_downloader.py bert-base-uncased -6   # 强制使用 IPv6
# 注：脚本会自动检测教育网环境（CERNET），如检测到则默认开启 IPv6 优化，无需手动指定
```

### 导入到 HuggingFace Cache

使用 `--cache` 参数，下载完成后自动将文件导入到 HuggingFace Hub 标准缓存目录，`transformers` 等库可直接命中缓存，无需重新下载。

```bash
# 下载并导入到 cache
python hf_downloader.py bert-base-uncased --cache

# 指定输出目录 + cache 导入（下载完成后 output 目录会被清理）
python hf_downloader.py bert-base-uncased --output ./tmp --cache
```

导入后的缓存结构：

```
~/.cache/huggingface/hub/
  models--bert-base-uncased/
    refs/
      main                          # commit SHA
    blobs/
      {sha256}                      # 文件内容
    snapshots/
      {commit_sha}/                 # 文件名 -> blobs 的链接
        config.json
        model.safetensors
        ...
```

在 Python 中直接使用：

```python
from transformers import AutoModel, AutoTokenizer

# 直接从缓存加载，不会重新下载
model = AutoModel.from_pretrained("bert-base-uncased")
tokenizer = AutoTokenizer.from_pretrained("bert-base-uncased")
```

## 🔧 工作原理

### 路由规则

| 请求路径 | 转发到 |
|---------|--------|
| `/api/models/xxx` | `huggingface.co/api/models/xxx` |
| `/bert-base/resolve/main/config.json` | `huggingface.co/bert-base/resolve/main/config.json` |
| `/redirect_to_cdn.hf.co/path/file` | `cdn.hf.co/path/file` |
| `/redirect_to_zlcy-li.hf.space/` | `zlcy-li.hf.space/` |
| `/redirect_to_zlcy-li.hf.space` | `zlcy-li.hf.space/` |
| `/redirect_to_xxx.hf.space/images/a.png` | `xxx.hf.space/images/a.png` |

### 重定向处理

当 HuggingFace 返回重定向到 CDN 节点时，Worker 会自动改写 Location：

```
原始: Location: https://cdn-lfs.hf.co/path/to/file
改写: Location: https://your-proxy.com/redirect_to_cdn-lfs.hf.co/path/to/file
```

## 📝 配置说明

### 环境变量

在 Cloudflare Workers 设置中可以配置以下环境变量：

| 变量名 | 说明 | 可选值 |
|--------|------|--------|
| `RESTRICT_BROWSER_ACCESS` | 限制浏览器直接访问代理 | `true` / `false` (未设置默认为 `false`) |
| `EDGE_CACHE_TTL_DAYS` | 静态资源边缘缓存天数 | 默认 `30`；`0` 为关闭 |
| `BROWSER_CACHE_TTL_DAYS` | 静态资源浏览器缓存天数 | 默认 `30` |
| `EDGE_CACHE_TTL_SECONDS` | 静态资源边缘缓存秒数 | 兼容旧配置；优先级低于 `EDGE_CACHE_TTL_DAYS` |
| `BROWSER_CACHE_TTL_SECONDS` | 静态资源浏览器缓存秒数 | 兼容旧配置；优先级低于 `BROWSER_CACHE_TTL_DAYS` |

- `RESTRICT_BROWSER_ACCESS=true` 时，浏览器只能访问首页 (`/`) 和脚本下载页面 (`/hf_downloader.py`)，其他路径将被拒绝
- 适用于希望限制浏览器直接下载，强制使用 Python 脚本的场景

### 代码配置

编辑 `src/config.js` 可以修改：

```javascript
// 允许的上游域名列表
export const ALLOWED_UPSTREAM_DOMAINS = [
    'huggingface.co',
];

// 默认上游域名
export const DEFAULT_UPSTREAM = 'huggingface.co';

// 重定向前缀
export const REDIRECT_PREFIX = 'redirect_to_';
```

除 `ALLOWED_UPSTREAM_DOMAINS` 中的精确域名外，`src/utils.js` 默认还允许所有 `*.hf.co` 和 `*.hf.space` 域名，用于 HuggingFace CDN 与 Space 公开资源代理。

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=AinzRimuru/HuggingfaceProxy&type=date&legend=top-left)](https://www.star-history.com/#AinzRimuru/HuggingfaceProxy&type=date&legend=top-left)
