import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// 配置文件路径
const wranglerPath = path.join(process.cwd(), 'wrangler.toml');

// 检查是否已登录 Cloudflare 或使用 API 令牌
function checkCloudflareLogin() {
  // 检查环境变量中是否有 API 令牌
  if (process.env.CLOUDFLARE_API_TOKEN) {
    console.log('使用环境变量中的 Cloudflare API 令牌进行身份验证');
    return true;
  }

  try {
    const whoamiOutput = execSync('npx wrangler whoami', { stdio: ['pipe', 'pipe', 'pipe'] }).toString();
    console.log('Cloudflare 账户已登录:', whoamiOutput.trim());
    return true;
  } catch (error) {
    console.log('您尚未登录 Cloudflare 账户');
    
    // 检查是否在 CI 环境中
    if (process.env.CI || process.env.NETLIFY) {
      console.log('检测到 CI 环境，请确保设置了 CLOUDFLARE_API_TOKEN 环境变量');
      return false;
    }
    
    // 在非 CI 环境中尝试交互式登录
    console.log('尝试交互式登录...');
    try {
      execSync('npx wrangler login', { stdio: 'inherit' });
      return true;
    } catch (loginError) {
      console.error('登录失败:', loginError.message);
      return false;
    }
  }
}

// 检查 KV 命名空间是否已存在
function checkExistingKVNamespace() {
  try {
    const kvListOutput = execSync('npx wrangler kv namespace list').toString();
    const existingNamespace = kvListOutput.includes('TOKEN_CACHE');
    
    if (existingNamespace) {
      // 尝试提取已存在的 KV ID
      const matches = kvListOutput.match(/TOKEN_CACHE[^\n]*id:\s*([a-f0-9-]+)/);
      if (matches && matches[1]) {
        console.log(`KV 命名空间 TOKEN_CACHE 已存在，ID: ${matches[1]}`);
        return matches[1];
      }
      console.log('KV 命名空间 TOKEN_CACHE 已存在，但无法提取 ID');
    }
    return null;
  } catch (error) {
    console.log('检查 KV 命名空间列表失败:', error.message);
    return null;
  }
}

try {
  // 1. 检查 Cloudflare 登录状态
  if (!checkCloudflareLogin()) {
    throw new Error('请确保已登录 Cloudflare 账户或设置了 CLOUDFLARE_API_TOKEN 环境变量');
  }
  
  // 2. 检查 KV 命名空间是否已存在
  let kvId = checkExistingKVNamespace();
  
  // 3. 如果不存在，则创建新的 KV 命名空间
  if (!kvId) {
    console.log('正在创建 KV 命名空间...');
    try {
      const result = execSync('npx wrangler kv namespace create TOKEN_CACHE').toString();
      
      // 修改正则表达式匹配新输出格式
      const idMatch = result.match(/id\s*=\s*"([a-f0-9-]+)"/);
      if (!idMatch) {
        throw new Error('无法从输出中提取 KV 命名空间 ID');
      }
      
      kvId = idMatch[1];
      console.log(`成功创建 KV 命名空间，ID: ${kvId}`);
    } catch (kvError) {
      console.error('创建 KV 命名空间失败:', kvError.message);
      console.log('尝试使用预览环境...');
      
      // 尝试创建预览环境的 KV 命名空间
      try {
        const result = execSync('npx wrangler kv namespace create TOKEN_CACHE --preview').toString();
        const idMatch = result.match(/id\s*=\s*"([a-f0-9-]+)"/);
        if (idMatch) {
          console.log(`成功创建预览环境 KV 命名空间，ID: ${idMatch[1]}`);
        }
      } catch (previewError) {
        console.log('创建预览环境 KV 命名空间也失败:', previewError.message);
      }
      
      // 继续使用默认 ID
      console.log('将使用默认 ID 继续部署...');
    }
  }
  
  // 4. 读取 wrangler.toml 文件
  let wranglerContent = fs.readFileSync(wranglerPath, 'utf8');
  
  // 5. 替换 KV ID（如果获取到了有效的 ID）
  if (kvId) {
    wranglerContent = wranglerContent.replace(
      /binding\s*=\s*"TOKEN_CACHE"\s*,\s*id\s*=\s*"[^"]*"/,
      `binding = "TOKEN_CACHE", id = "${kvId}"`
    );
    
    // 写回文件
    fs.writeFileSync(wranglerPath, wranglerContent);
    console.log('已更新 wrangler.toml 文件');
  } else {
    console.log('未获取到有效的 KV ID，将使用 wrangler.toml 中的默认配置');
  }
  
  // 6. 部署 Worker
  console.log('正在部署 Worker...');
  execSync('npx wrangler deploy', { stdio: 'inherit' });
  
  console.log('部署完成！');
} catch (error) {
  console.error('部署过程中出错:', error.message);
  process.exit(1);
}