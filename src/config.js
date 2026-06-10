/**
 * 配置文件
 */

// 允许的上游域名列表 (用于验证重定向目标)
export const ALLOWED_UPSTREAM_DOMAINS = [
    'huggingface.co',
    // .hf.co 结尾的域名都是允许的 CDN 节点
];

// 默认上游域名
export const DEFAULT_UPSTREAM = 'huggingface.co';

// 重定向前缀
export const REDIRECT_PREFIX = 'redirect_to_';

export const SECONDS_PER_DAY = 60 * 60 * 24;

// 默认边缘缓存时间：30 天，可用环境变量 EDGE_CACHE_TTL_DAYS / EDGE_CACHE_TTL_SECONDS 覆盖
export const DEFAULT_EDGE_CACHE_TTL_SECONDS = SECONDS_PER_DAY * 30;

// 默认浏览器缓存时间：30 天，可用环境变量 BROWSER_CACHE_TTL_DAYS / BROWSER_CACHE_TTL_SECONDS 覆盖
export const DEFAULT_BROWSER_CACHE_TTL_SECONDS = SECONDS_PER_DAY * 30;

// 仅缓存常见静态资源，避免误缓存 API 或动态页面
export const STATIC_CACHE_EXTENSIONS = [
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.ico',
    '.css', '.js', '.mjs', '.json', '.txt', '.xml',
    '.woff', '.woff2', '.ttf', '.otf', '.eot',
    '.mp4', '.webm', '.mp3', '.wav'
];
