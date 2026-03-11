#!/usr/bin/env node

/**
 * 测试 AppConfigService 配置加载
 *
 * 使用方法：
 * node test-config-api.js
 */

const API_URL = 'http://localhost:3000/v1/app/init-config';

async function testConfigAPI() {
  console.log('=== 测试 App Config API ===\n');

  console.log(`API URL: ${API_URL}\n`);

  try {
    console.log('发送请求...');
    const response = await fetch(API_URL, {
      method: 'GET',
      headers: {
        'X-App-Version': '1.0.0',
        'X-Platform': 'darwin',
        'X-Locale': 'zh-CN',
      },
    });

    console.log(`HTTP Status: ${response.status} ${response.statusText}\n`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const config = await response.json();

    console.log('✅ 配置获取成功！\n');
    console.log('配置摘要:');
    console.log(`  版本: ${config.version}`);
    console.log(`  更新时间: ${new Date(config.updatedAt).toLocaleString()}`);

    if (config.forceUpdate) {
      console.log(`  强制更新字段: ${config.forceUpdate.fields.length} 个`);
      console.log(`    - ${config.forceUpdate.fields.slice(0, 3).join(', ')}...`);
      if (config.forceUpdate.reason) {
        console.log(`  更新原因: ${config.forceUpdate.reason}`);
      }
    }

    console.log('\nOAuth 配置:');
    console.log(`  Google Client ID: ${config.oauth.google.clientId}`);
    console.log(`  GitHub Client ID: ${config.oauth.github.clientId}`);
    console.log(`  GitHub Token Exchange URL: ${config.oauth.github.tokenExchangeUrl}`);

    console.log('\n模型提供商:');
    console.log(`  总数: ${config.modelProviders.length} 个`);
    console.log(`  前 5 个: ${config.modelProviders.slice(0, 5).map(p => p.name).join(', ')}`);

    console.log('\n搜索提供商:');
    console.log(`  总数: ${config.searchProviders.length} 个`);
    console.log(`  列表: ${config.searchProviders.map(p => p.name).join(', ')}`);

    console.log('\nMCP 市场源:');
    console.log(`  总数: ${config.mcpMarketSources.length} 个`);
    console.log(`  列表: ${config.mcpMarketSources.map(s => s.name).join(', ')}`);

    console.log('\n功能开关:');
    const enabledFlags = Object.entries(config.featureFlags)
      .filter(([_, enabled]) => enabled)
      .map(([key]) => key);
    console.log(`  已启用: ${enabledFlags.length} 个`);
    console.log(`  列表: ${enabledFlags.join(', ')}`);

    console.log('\n=== 测试完成 ===');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error('\n请确保:');
    console.error('  1. node-auth 服务正在运行 (pnpm dev)');
    console.error('  2. 服务运行在 http://localhost:3000');
    console.error('  3. 网络连接正常');
    process.exit(1);
  }
}

testConfigAPI();
