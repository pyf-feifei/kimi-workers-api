// 简单的内存缓存实现
const memoryCache = new Map();

// 缓存有效期（默认24小时，单位：毫秒）
const DEFAULT_TTL = 24 * 60 * 60 * 1000;

/**
 * 从缓存中获取值
 * @param {string} key 缓存键
 * @returns {any|null} 缓存值或null
 */
export function get(key) {
  if (!key) return null;
  
  const item = memoryCache.get(key);
  if (!item) return null;
  
  // 检查是否过期
  if (item.expiry && item.expiry < Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  
  return item.value;
}

/**
 * 设置缓存值
 * @param {string} key 缓存键
 * @param {any} value 缓存值
 * @param {number} ttl 过期时间（毫秒）
 */
export function set(key, value, ttl = DEFAULT_TTL) {
  if (!key) return;
  
  const expiry = ttl ? Date.now() + ttl : null;
  memoryCache.set(key, { value, expiry });
}

/**
 * 删除缓存
 * @param {string} key 缓存键
 */
export function remove(key) {
  if (key) memoryCache.delete(key);
}

/**
 * 清空缓存
 */
export function clear() {
  memoryCache.clear();
}