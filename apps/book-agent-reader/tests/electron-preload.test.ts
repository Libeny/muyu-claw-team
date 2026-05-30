import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Electron 主窗口使用 CommonJS preload 入口', async () => {
  const mainSource = await readFile(path.join(projectRoot, 'src/main/main.ts'), 'utf-8');

  assert.match(mainSource, /preload\.cjs/);
  assert.doesNotMatch(mainSource, /preload\.js/);
  await access(path.join(projectRoot, 'src/main/preload.cts'));
});

test('阅读器正文渲染不把章节图片列表拼成占位文本', async () => {
  const rendererSource = await readFile(path.join(projectRoot, 'src/renderer/app.js'), 'utf-8');
  const styles = await readFile(path.join(projectRoot, 'src/renderer/styles.css'), 'utf-8');

  assert.doesNotMatch(rendererSource, /【图片】/);
  assert.doesNotMatch(rendererSource, /chapter\?\.images[\s\S]*renderPageText/);
  assert.match(rendererSource, /function renderPageContent/);
  assert.match(rendererSource, /function appendImageNode/);
  assert.match(styles, /\.reader-image/);
});
