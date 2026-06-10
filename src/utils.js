/**
 * 工具函数
 */

import {
    ALLOWED_UPSTREAM_DOMAINS,
    DEFAULT_BROWSER_CACHE_TTL_SECONDS,
    DEFAULT_EDGE_CACHE_TTL_SECONDS,
    DEFAULT_UPSTREAM,
    REDIRECT_PREFIX,
    SECONDS_PER_DAY,
    STATIC_CACHE_EXTENSIONS
} from './config.js';

/**
 * 判断是否是允许的上游域名
 * @param {string} hostname - 要检查的域名
 * @returns {boolean}
 */
export function isAllowedUpstream(hostname) {
    // 直接匹配已知域名
    if (ALLOWED_UPSTREAM_DOMAINS.includes(hostname)) {
        return true;
    }
    // 允许所有 .hf.co 结尾的 CDN 节点
    if (hostname.endsWith('.hf.co') || hostname.endsWith('.hf.space')) {
        return true;
    }
    return false;
}

/**
 * 解析请求路径，提取目标上游和实际路径
 * @param {string} pathname - 请求路径
 * @returns {{ upstream: string, path: string }}
 */
export function parseRequest(pathname) {
    // 检查是否有 redirect_to_ 前缀
    // 格式: /redirect_to_{domain} 或 /redirect_to_{domain}/path/to/resource
    const prefixPattern = new RegExp(`^/${REDIRECT_PREFIX}([^/]+)(/.*)?$`);
    const match = pathname.match(prefixPattern);
    
    if (match) {
        // 有前缀，提取域名和路径
        return {
            upstream: match[1],
            path: match[2] || '/'
        };
    }
    
    // 无前缀，使用默认上游
    return {
        upstream: DEFAULT_UPSTREAM,
        path: pathname
    };
}

/**
 * 获取非负数字环境变量
 * @param {unknown} value - 环境变量值
 * @returns {number | null}
 */
function parseNonNegativeNumber(value) {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * 获取非负秒数环境变量
 * @param {unknown} value - 环境变量值
 * @param {number} fallback - 默认值
 * @returns {number}
 */
function parseTtlSeconds(value, fallback) {
    const parsed = parseNonNegativeNumber(value);
    return parsed === null ? fallback : Math.floor(parsed);
}

/**
 * 获取天数环境变量并转换为秒
 * @param {unknown} value - 环境变量值
 * @returns {number | null}
 */
function parseTtlDays(value) {
    const parsed = parseNonNegativeNumber(value);
    return parsed === null ? null : Math.floor(parsed * SECONDS_PER_DAY);
}

/**
 * 获取边缘缓存 TTL
 * @param {Record<string, string> | undefined} env - 环境变量
 * @returns {number}
 */
export function getEdgeCacheTtl(env) {
    return parseTtlDays(env?.EDGE_CACHE_TTL_DAYS)
        ?? parseTtlSeconds(env?.EDGE_CACHE_TTL_SECONDS, DEFAULT_EDGE_CACHE_TTL_SECONDS);
}

/**
 * 获取浏览器缓存 TTL
 * @param {Record<string, string> | undefined} env - 环境变量
 * @returns {number}
 */
export function getBrowserCacheTtl(env) {
    return parseTtlDays(env?.BROWSER_CACHE_TTL_DAYS)
        ?? parseTtlSeconds(env?.BROWSER_CACHE_TTL_SECONDS, DEFAULT_BROWSER_CACHE_TTL_SECONDS);
}

/**
 * 判断路径是否为可缓存静态资源
 * @param {string} path - 请求路径
 * @returns {boolean}
 */
export function isStaticCachePath(path) {
    const lowerPath = path.toLowerCase();
    return STATIC_CACHE_EXTENSIONS.some((extension) => lowerPath.endsWith(extension));
}

/**
 * 判断代理请求是否应启用边缘缓存
 * @param {Request} request - 请求对象
 * @param {string} upstream - 上游域名
 * @param {string} path - 上游路径
 * @param {Record<string, string> | undefined} env - 环境变量
 * @returns {boolean}
 */
export function shouldCacheProxyRequest(request, upstream, path, env) {
    const method = request.method.toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
        return false;
    }

    if (getEdgeCacheTtl(env) <= 0) {
        return false;
    }

    const isHfAssetHost = upstream.endsWith('.hf.space') || upstream.endsWith('.hf.co');
    return isHfAssetHost && isStaticCachePath(path);
}

/**
 * 重写重定向 Location
 * @param {string} location - 原始 Location
 * @param {string} proxyOrigin - 代理服务器的 origin
 * @param {string} currentUpstream - 当前上游域名，用于处理相对重定向
 * @returns {string | null} - 重写后的 Location，如果不需要重写则返回 null
 */
export function rewriteLocation(location, proxyOrigin, currentUpstream = DEFAULT_UPSTREAM) {
    try {
        const locUrl = new URL(location, `https://${currentUpstream}`);
        const locHost = locUrl.hostname;

        // 检查是否是允许的上游域名
        if (!isAllowedUpstream(locHost)) {
            return null;
        }

        // 构造新的重定向 URL
        if (locHost === DEFAULT_UPSTREAM) {
            // 默认上游，直接使用原路径
            return `${proxyOrigin}${locUrl.pathname}${locUrl.search}`;
        } else {
            // 其他上游，添加 redirect_to_ 前缀
            return `${proxyOrigin}/${REDIRECT_PREFIX}${locHost}${locUrl.pathname}${locUrl.search}`;
        }
    } catch (e) {
        console.error("Location parse error:", e);
        return null;
    }
}

/**
 * 重写 HTML 中的根路径资源，让 Space 页面资源继续走代理
 * @param {string} html - 原始 HTML
 * @param {string} upstream - 上游域名
 * @returns {string}
 */
export function rewriteHtmlAssetPaths(html, upstream) {
    if (upstream === DEFAULT_UPSTREAM) {
        return html;
    }

    const proxyPrefix = `/${REDIRECT_PREFIX}${upstream}`;
    return html
        .replace(/\b(href|src|action)=(["'])\/(?!\/)([^"']*)\2/g, (_match, attr, quote, path) => {
            return `${attr}=${quote}${proxyPrefix}/${path}${quote}`;
        })
        .replace(/\b(srcset)=(["'])([^"']*)\2/g, (_match, attr, quote, value) => {
            const rewritten = value
                .split(',')
                .map((part) => {
                    const trimmed = part.trimStart();
                    return trimmed.startsWith('/') && !trimmed.startsWith('//')
                        ? part.replace(trimmed, `${proxyPrefix}${trimmed}`)
                        : part;
                })
                .join(',');
            return `${attr}=${quote}${rewritten}${quote}`;
        });
}

/**
 * 判断请求是否来自浏览器
 * @param {Request} request - 请求对象
 * @returns {boolean}
 */
export function isBrowserRequest(request) {
    const accept = request.headers.get('Accept') || '';
    const userAgent = request.headers.get('User-Agent') || '';

    // 检查 Accept 头是否包含 HTML
    const acceptsHtml = accept.includes('text/html');

    // 检查 User-Agent 是否包含浏览器特征
    // 排除 curl、wget、python-requests、go-http 等工具
    const browserPatterns = [
        'Mozilla/', 'Chrome/', 'Safari/', 'Firefox/', 'Edge/', 'Opera/',
        'MSIE', 'Trident/', 'SamsungBrowser/', 'UCBrowser/'
    ];
    const isBrowserUA = browserPatterns.some(pattern => userAgent.includes(pattern));

    // 排除明确的非浏览器工具
    const nonBrowserPatterns = [
        'curl/', 'wget/', 'Python-requests', 'python-requests', 'requests/',
        'go-http-tool', 'Java/', 'okhttp', 'axios/', 'node-fetch', 'deno/',
        'libwww-perl', 'lwp-trivial', 'Git/', 'git/', 'GitHub-Hookshot',
        'HTTPie/', 'http.rb/', 'Ruby/', 'PHP/', 'PostmanRuntime/',
        'insomnia/', 'Paw/', 'REST Client', 'Swift/', 'Darwin/',
        'CF-Workers', 'Cloudflare-Workers', 'Worker/', 'dart:io'
    ];
    const isToolUA = nonBrowserPatterns.some(pattern => userAgent.includes(pattern));

    return acceptsHtml && isBrowserUA && !isToolUA;
}

/**
 * 检查路径是否为允许浏览器访问的页面
 * @param {string} pathname - 请求路径
 * @returns {boolean}
 */
export function isAllowedBrowserPath(pathname) {
    const allowedPaths = ['/', '', '/hf_downloader.py'];
    return allowedPaths.includes(pathname);
}

/**
 * 验证浏览器访问权限
 * @param {Request} request - 请求对象
 * @param {string} pathname - 请求路径
 * @param {boolean} restrictBrowserAccess - 是否启用浏览器访问限制
 * @returns {Response | null} - 如果验证失败返回错误响应，否则返回 null
 */
export function validateBrowserAccess(request, pathname, restrictBrowserAccess) {
    if (!restrictBrowserAccess) {
        return null;
    }

    if (isBrowserRequest(request) && !isAllowedBrowserPath(pathname)) {
        return new Response(
            '浏览器访问受限。请使用 API 客户端（curl、wget、Python 等）访问模型文件。\n\n' +
            '允许访问的页面：\n' +
            '  - / (首页)\n' +
            '  - /hf_downloader.py (下载脚本)',
            {
                status: 403,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            }
        );
    }

    return null;
}
