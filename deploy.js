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

try {
  // 1. 检查 Cloudflare 登录状态
  if (!checkCloudflareLogin()) {
    throw new Error('请确保已登录 Cloudflare 账户或设置了 CLOUDFLARE_API_TOKEN 环境变量');
  }
  
  // 2. 部署 Worker
  console.log('正在部署 Worker...');
  execSync('npx wrangler deploy', { stdio: 'inherit' });
  
  console.log('部署完成！');
} catch (error) {
  console.error('部署过程中出错:', error.message);
  process.exit(1);
}