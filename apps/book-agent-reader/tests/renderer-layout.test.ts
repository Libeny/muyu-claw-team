import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(import.meta.dirname, '..');

test('阅读器使用左侧章节目录，不再用顶部章节下拉', async () => {
  const [html, script, styles] = await Promise.all([
    readFile(path.join(projectRoot, 'src/renderer/index.html'), 'utf-8'),
    readFile(path.join(projectRoot, 'src/renderer/app.js'), 'utf-8'),
    readFile(path.join(projectRoot, 'src/renderer/styles.css'), 'utf-8'),
  ]);

  assert.match(html, /id="chapterList"/);
  assert.match(html, /章节目录/);
  assert.match(html, /id="readerView" class="app-shell is-hidden"/);
  assert.match(html, /id="backToLibraryButton"/);
  assert.doesNotMatch(html, /id="chapterSelect"/);
  assert.doesNotMatch(script, /chapterSelect/);

  assert.match(script, /function renderChapterList/);
  assert.match(script, /function changeChapter/);
  assert.match(script, /function showReader/);
  assert.match(script, /function showLibrary/);
  assert.match(script, /个目录项/);
  assert.match(styles, /\.chapter-list/);
  assert.match(styles, /\.chapter-row\.active/);
});

test('书库是独立选择页，点击图书后再进入阅读器', async () => {
  const [html, script, styles] = await Promise.all([
    readFile(path.join(projectRoot, 'src/renderer/index.html'), 'utf-8'),
    readFile(path.join(projectRoot, 'src/renderer/app.js'), 'utf-8'),
    readFile(path.join(projectRoot, 'src/renderer/styles.css'), 'utf-8'),
  ]);

  assert.match(html, /id="libraryView"/);
  assert.match(html, /id="libraryBookGrid"/);
  assert.doesNotMatch(html, /id="bookList"/);
  assert.match(script, /state\.view = 'reader'/);
  assert.match(script, /card\.addEventListener\('click', \(\) => loadBook\(book\.id\)\)/);
  assert.match(script, /function renderLibraryCover/);
  assert.match(styles, /\.library-view/);
  assert.match(styles, /\.library-book-grid/);
  assert.match(styles, /\.library-book-card/);
  assert.match(styles, /\.library-book-cover\.has-cover-image/);
});

test('阅读正文按单页左右翻页渲染，并保留当前位置页码给助手上下文', async () => {
  const [html, script, styles] = await Promise.all([
    readFile(path.join(projectRoot, 'src/renderer/index.html'), 'utf-8'),
    readFile(path.join(projectRoot, 'src/renderer/app.js'), 'utf-8'),
    readFile(path.join(projectRoot, 'src/renderer/styles.css'), 'utf-8'),
  ]);

  assert.match(html, /id="bookPage"/);
  assert.match(html, />上一页</);
  assert.match(html, />下一页</);
  assert.doesNotMatch(html, />‹</);
  assert.doesNotMatch(html, />›</);

  assert.match(script, /function renderChapterContent/);
  assert.match(script, /function renderCurrentPage/);
  assert.match(script, /function handleReaderKeyboard/);
  assert.match(script, /function displayPagesForChapter/);
  assert.match(script, /function calculateDisplayPageSize/);
  assert.match(script, /function scheduleRepaginate/);
  assert.match(script, /function currentContextPageIndex/);
  assert.match(script, /function goToPageIndex/);
  assert.match(script, /function goToAdjacentChapter/);
  assert.match(script, /index >= total/);
  assert.match(script, /window\.addEventListener\('resize', scheduleRepaginate\)/);
  assert.match(script, /state\.pageIndex = direction > 0 \? 0 : Math\.max\(0, targetPages\.length - 1\)/);
  assert.match(script, /pageIndex: currentContextPageIndex\(\)/);
  assert.doesNotMatch(script, /const DISPLAY_PAGE_SIZE = 900/);
  assert.match(script, /pageSize \* 0\.82/);
  assert.doesNotMatch(script, /pageSize \* 0\.5/);
  assert.match(styles, /@keyframes turnForward/);
  assert.match(styles, /@keyframes turnBackward/);
});
