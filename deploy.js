import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// 配置文件路径
const wranglerPath = path.join(process.cwd(), 'wrangler.toml');

try {
  // 1. 创建 KV 命名空间
  console.log('正在创建 KV 命名空间...');
  const result = execSync('npx wrangler kv:namespace create TOKEN_CACHE').toString();
  
  // 2. 从输出中提取 KV ID
  const idMatch = result.match(/id\s*=\s*"([^"]+)"/);
  if (!idMatch) {
    throw new Error('无法从输出中提取 KV 命名空间 ID');
  }
  
  const kvId = idMatch[1];
  console.log(`成功创建 KV 命名空间，ID: ${kvId}`);
  
  // 3. 读取 wrangler.toml 文件
  let wranglerContent = fs.readFileSync(wranglerPath, 'utf8');
  
  // 4. 替换 KV ID
  wranglerContent = wranglerContent.replace(
    /binding\s*=\s*"TOKEN_CACHE"\s*,\s*id\s*=\s*"[^"]*"/,
    `binding = "TOKEN_CACHE", id = "${kvId}"`
  );
  
  // 5. 写回文件
  fs.writeFileSync(wranglerPath, wranglerContent);
  console.log('已更新 wrangler.toml 文件');
  
  // 6. 部署 Worker
  console.log('正在部署 Worker...');
  execSync('npx wrangler deploy', { stdio: 'inherit' });
  
  console.log('部署完成！');
} catch (error) {
  console.error('部署过程中出错:', error.message);
  process.exit(1);
}