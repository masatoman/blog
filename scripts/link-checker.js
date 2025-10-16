#!/usr/bin/env node

/**
 * リンクチェッカー - ブログ内のリンク切れを自動検出
 * 使用方法: node scripts/link-checker.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 設定
const BASE_URL = 'http://localhost:4321/blog-monakit';
const TIMEOUT = 5000; // 5秒

// チェック対象のページ
const PAGES_TO_CHECK = [
  '/',
  '/blogs',
  '/investment-results',
  '/blogs/diversified-investment-feature-complete'
];

// チェック対象のファイル
const FILES_TO_CHECK = [
  'src/pages/index.astro',
  'src/pages/blogs/index.astro',
  'src/pages/investment-results/index.astro',
  'src/layouts/Layout.astro'
];

class LinkChecker {
  constructor() {
    this.brokenLinks = [];
    this.checkedLinks = new Set();
    this.serverRunning = false;
  }

  /**
   * メイン実行
   */
  async run() {
    console.log('🔍 リンクチェッカーを開始します...\n');
    
    try {
      // 1. サーバーが起動しているかチェック
      await this.checkServerStatus();
      
      // 2. 各ページのリンクをチェック
      for (const page of PAGES_TO_CHECK) {
        console.log(`📄 チェック中: ${page}`);
        await this.checkPageLinks(page);
      }
      
      // 3. 静的ファイルの存在チェック
      this.checkStaticFiles();
      
      // 4. 結果を表示
      this.displayResults();
      
    } catch (error) {
      console.error('❌ エラーが発生しました:', error.message);
      process.exit(1);
    }
  }

  /**
   * サーバー状態をチェック
   */
  async checkServerStatus() {
    try {
      const response = await fetch(`${BASE_URL}/`);
      if (response.ok) {
        console.log('✅ サーバーが起動しています');
        this.serverRunning = true;
      } else {
        throw new Error('サーバーが起動していません');
      }
    } catch (error) {
      console.log('⚠️  サーバーが起動していません。先に `npm run dev` を実行してください。');
      console.log('   静的ファイルのみチェックします...\n');
      this.serverRunning = false;
    }
  }

  /**
   * ページ内のリンクをチェック
   */
  async checkPageLinks(page) {
    if (!this.serverRunning) return;

    try {
      const response = await fetch(`${BASE_URL}${page}`);
      if (!response.ok) {
        this.brokenLinks.push({
          page,
          link: page,
          status: response.status,
          type: 'page'
        });
        return;
      }

      const html = await response.text();
      const links = this.extractLinks(html);
      
      for (const link of links) {
        await this.checkLink(page, link);
      }
    } catch (error) {
      console.log(`❌ ページの取得に失敗: ${page} - ${error.message}`);
    }
  }

  /**
   * HTMLからリンクを抽出
   */
  extractLinks(html) {
    const links = [];
    
    // href属性のリンクを抽出
    const hrefRegex = /href=["']([^"']+)["']/g;
    let match;
    while ((match = hrefRegex.exec(html)) !== null) {
      const link = match[1];
      if (this.isInternalLink(link)) {
        links.push(link);
      }
    }
    
    return [...new Set(links)]; // 重複を除去
  }

  /**
   * 内部リンクかどうかチェック
   */
  isInternalLink(link) {
    return link.startsWith('/blog-monakit/') || 
           link.startsWith('/') || 
           link.startsWith('./') ||
           link.startsWith('../');
  }

  /**
   * 個別リンクをチェック
   */
  async checkLink(sourcePage, link) {
    if (this.checkedLinks.has(link)) return;
    this.checkedLinks.add(link);

    try {
      // 相対パスを絶対パスに変換
      const absoluteLink = this.normalizeLink(link);
      
      const response = await fetch(`${BASE_URL}${absoluteLink}`, {
        method: 'HEAD',
        timeout: TIMEOUT
      });
      
      if (!response.ok) {
        this.brokenLinks.push({
          page: sourcePage,
          link: absoluteLink,
          status: response.status,
          type: 'link'
        });
      }
    } catch (error) {
      this.brokenLinks.push({
        page: sourcePage,
        link: this.normalizeLink(link),
        status: 'TIMEOUT',
        type: 'link',
        error: error.message
      });
    }
  }

  /**
   * リンクを正規化
   */
  normalizeLink(link) {
    if (link.startsWith('/blog-monakit/')) {
      return link.replace('/blog-monakit', '');
    }
    if (link.startsWith('/')) {
      return link;
    }
    return `/${link}`;
  }

  /**
   * 静的ファイルの存在チェック
   */
  checkStaticFiles() {
    console.log('\n📁 静的ファイルの存在チェック...');
    
    const staticFiles = [
      'public/enhanced_dividend_result_20251016_145023.html',
      'public/netnet_result.html'
    ];
    
    for (const file of staticFiles) {
      const fullPath = path.join(process.cwd(), file);
      if (fs.existsSync(fullPath)) {
        console.log(`✅ ${file}`);
      } else {
        console.log(`❌ ${file} - ファイルが存在しません`);
        this.brokenLinks.push({
          page: 'static',
          link: file,
          status: 'NOT_FOUND',
          type: 'file'
        });
      }
    }
  }

  /**
   * 結果を表示
   */
  displayResults() {
    console.log('\n📊 チェック結果');
    console.log('='.repeat(50));
    
    if (this.brokenLinks.length === 0) {
      console.log('🎉 すべてのリンクが正常です！');
      return;
    }
    
    console.log(`❌ ${this.brokenLinks.length}個のリンクに問題があります:\n`);
    
    this.brokenLinks.forEach((broken, index) => {
      console.log(`${index + 1}. ${broken.type.toUpperCase()}`);
      console.log(`   ページ: ${broken.page}`);
      console.log(`   リンク: ${broken.link}`);
      console.log(`   ステータス: ${broken.status}`);
      if (broken.error) {
        console.log(`   エラー: ${broken.error}`);
      }
      console.log('');
    });
    
    console.log('💡 修正方法:');
    console.log('   - 存在しないページ: ページを作成するか、リンクを削除');
    console.log('   - 404エラー: ファイルパスを確認');
    console.log('   - タイムアウト: サーバーが起動しているか確認');
  }
}

// 実行
if (import.meta.url === `file://${process.argv[1]}`) {
  const checker = new LinkChecker();
  checker.run().catch(console.error);
}

export default LinkChecker;
