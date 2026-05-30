const api = window.bookAgentReader || createHttpApi();
const DISPLAY_PAGE_SIZE = 900;

const state = {
  books: [],
  currentBook: null,
  view: 'library',
  chapterIndex: 0,
  pageIndex: 0,
  pageTurn: 'none',
  selectedText: '',
};

const elements = {
  libraryView: document.getElementById('libraryView'),
  readerView: document.getElementById('readerView'),
  libraryBookGrid: document.getElementById('libraryBookGrid'),
  libraryStats: document.getElementById('libraryStats'),
  sampleButton: document.getElementById('sampleButton'),
  importFileButton: document.getElementById('importFileButton'),
  backToLibraryButton: document.getElementById('backToLibraryButton'),
  chapterList: document.getElementById('chapterList'),
  chapterCount: document.getElementById('chapterCount'),
  bookTitle: document.getElementById('bookTitle'),
  bookMeta: document.getElementById('bookMeta'),
  chapterTitle: document.getElementById('chapterTitle'),
  bookPage: document.getElementById('bookPage'),
  pageText: document.getElementById('pageText'),
  pageIndicator: document.getElementById('pageIndicator'),
  prevPageButton: document.getElementById('prevPageButton'),
  nextPageButton: document.getElementById('nextPageButton'),
  selectedText: document.getElementById('selectedText'),
  questionInput: document.getElementById('questionInput'),
  askButton: document.getElementById('askButton'),
  translateButton: document.getElementById('translateButton'),
  summaryButton: document.getElementById('summaryButton'),
  answerBox: document.getElementById('answerBox'),
  sessionList: document.getElementById('sessionList'),
  vocabList: document.getElementById('vocabList'),
  highlightList: document.getElementById('highlightList'),
  summaryList: document.getElementById('summaryList'),
  saveHighlightButton: document.getElementById('saveHighlightButton'),
  saveVocabButton: document.getElementById('saveVocabButton'),
  exportNoteButton: document.getElementById('exportNoteButton'),
  exportSkillButton: document.getElementById('exportSkillButton'),
  statusBar: document.getElementById('statusBar'),
};

window.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  void refreshBooks();
});

function bindEvents() {
  elements.sampleButton.addEventListener('click', async () => {
    await runStatus('正在导入示例书', async () => {
      const book = await api.importSampleBook();
      await refreshBooks(book.manifest.id);
    });
  });

  elements.importFileButton.addEventListener('click', async () => {
    await runStatus('正在导入文件', async () => {
      const book = await api.importFile();
      if (book) await refreshBooks(book.manifest.id);
    });
  });

  elements.prevPageButton.addEventListener('click', () => {
    goToPageIndex(state.pageIndex - 1);
  });

  elements.nextPageButton.addEventListener('click', () => {
    goToPageIndex(state.pageIndex + 1);
  });

  elements.backToLibraryButton.addEventListener('click', showLibrary);
  document.addEventListener('keydown', handleReaderKeyboard);
  elements.pageText.addEventListener('mouseup', syncSelection);
  elements.pageText.addEventListener('keyup', syncSelection);

  elements.askButton.addEventListener('click', () => askAgent('ask'));
  elements.translateButton.addEventListener('click', () => askAgent('translate'));
  elements.summaryButton.addEventListener('click', () => askAgent('summarize-chapter'));
  elements.saveVocabButton.addEventListener('click', saveSelectedVocab);
  elements.saveHighlightButton.addEventListener('click', saveSelectedHighlight);
  elements.exportNoteButton.addEventListener('click', exportNote);
  elements.exportSkillButton.addEventListener('click', exportSkill);

  document.querySelectorAll('.tab-button').forEach((button) => {
    button.addEventListener('click', () => switchTab(button.dataset.tab));
  });
}

async function refreshBooks(preferredBookId) {
  state.books = await api.listBooks();
  renderLibrary();
  if (preferredBookId) await loadBook(preferredBookId);
  else if (state.view === 'reader' && state.currentBook) renderReader();
  else showLibrary();
}

async function loadBook(bookId) {
  state.currentBook = await api.loadBook(bookId);
  state.view = 'reader';
  state.chapterIndex = 0;
  state.pageIndex = 0;
  state.pageTurn = 'none';
  state.selectedText = '';
  renderLibrary();
  renderReader();
  showReader();
  await refreshSidebars();
}

function renderLibrary() {
  elements.libraryBookGrid.innerHTML = '';
  elements.libraryStats.textContent = state.books.length ? `${state.books.length} 本书` : '暂无书籍';
  if (!state.books.length) {
    const empty = document.createElement('div');
    empty.className = 'library-empty';
    empty.textContent = '暂无书籍，先导入一本 EPUB、PDF、TXT 或 Markdown。';
    elements.libraryBookGrid.append(empty);
    return;
  }
  for (const book of state.books) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `library-book-card ${book.id === state.currentBook?.manifest.id ? 'active' : ''}`;
    card.innerHTML = `
      ${renderLibraryCover(book)}
      <div class="library-book-title">${escapeHtml(book.title)}</div>
      <div class="library-book-meta">${escapeHtml(book.author || '未知作者')} · ${book.chapterIds.length} 个目录项</div>
    `;
    card.addEventListener('click', () => loadBook(book.id));
    elements.libraryBookGrid.append(card);
  }
}

function renderEmpty() {
  elements.bookTitle.textContent = '未选择书籍';
  elements.bookMeta.textContent = '';
  elements.chapterList.innerHTML = '';
  elements.chapterCount.textContent = '未选择书籍';
  elements.chapterTitle.textContent = '';
  elements.pageText.textContent = '';
  elements.pageIndicator.textContent = '0 / 0';
  elements.answerBox.textContent = '';
  elements.sessionList.innerHTML = '';
  elements.vocabList.innerHTML = '';
  elements.highlightList.innerHTML = '';
  elements.summaryList.innerHTML = '';
}

function showLibrary() {
  state.view = 'library';
  elements.libraryView.classList.remove('is-hidden');
  elements.readerView.classList.add('is-hidden');
  renderLibrary();
}

function showReader() {
  state.view = 'reader';
  elements.libraryView.classList.add('is-hidden');
  elements.readerView.classList.remove('is-hidden');
}

function renderReader() {
  const book = state.currentBook;
  if (!book) {
    renderEmpty();
    return;
  }

  elements.bookTitle.textContent = book.manifest.title;
  elements.bookMeta.textContent = `${book.manifest.author || '未知作者'} · ${book.manifest.language} · ${book.chapters.length} 个目录项`;
  renderChapterList(book);

  const chapter = currentChapter();
  state.pageIndex = clampPageIndex(state.pageIndex);
  elements.chapterTitle.textContent = chapter?.title || '';
  renderChapterContent(chapter);
  elements.bookPage.scrollTop = 0;
  updatePagePosition();
  elements.selectedText.textContent = state.selectedText || '未选择文本';
}

function renderChapterList(book) {
  elements.chapterList.innerHTML = '';
  elements.chapterCount.textContent = `${book.chapters.length} 个目录项 · 当前第 ${state.chapterIndex + 1} 项`;
  book.chapters.forEach((chapter, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `chapter-row ${index === state.chapterIndex ? 'active' : ''}`;
    button.innerHTML = `
      <div class="chapter-row-title">
        <span class="chapter-row-index">${String(index + 1).padStart(2, '0')}</span>
        <span class="chapter-row-name">${escapeHtml(chapter.title)}</span>
      </div>
      <div class="chapter-row-meta">${displayPagesForChapter(chapter).length} 页</div>
    `;
    button.addEventListener('click', () => changeChapter(index));
    elements.chapterList.append(button);
  });

  elements.chapterList.querySelector('.chapter-row.active')?.scrollIntoView({ block: 'nearest' });
}

function changeChapter(index) {
  if (!state.currentBook || index === state.chapterIndex) return;
  state.chapterIndex = index;
  state.pageIndex = 0;
  state.pageTurn = 'none';
  state.selectedText = '';
  window.getSelection()?.removeAllRanges();
  renderReader();
}

async function refreshSidebars() {
  if (!state.currentBook) return;
  const [sessions, vocab, highlights, summaries] = await Promise.all([
    api.listSessions(state.currentBook.manifest.id),
    api.listVocab(state.currentBook.manifest.id),
    api.listHighlights(state.currentBook.manifest.id),
    api.listSummaries(state.currentBook.manifest.id),
  ]);
  renderSessions(sessions);
  renderVocab(vocab);
  renderHighlights(highlights);
  renderSummaries(summaries);
}

function renderSessions(sessions) {
  elements.sessionList.innerHTML = '';
  if (!sessions.length) {
    elements.sessionList.append(emptyCard('暂无会话'));
    return;
  }
  for (const session of sessions) {
    const card = document.createElement('div');
    card.className = 'stack-card';
    card.innerHTML = `
      <div class="stack-title">${escapeHtml(session.title)}</div>
      <div class="stack-meta">${escapeHtml(session.summary || '暂无摘要')}</div>
    `;
    elements.sessionList.append(card);
  }
}

function renderVocab(vocab) {
  elements.vocabList.innerHTML = '';
  if (!vocab.length) {
    elements.vocabList.append(emptyCard('暂无生词'));
    return;
  }
  for (const entry of vocab) {
    const card = document.createElement('div');
    card.className = 'stack-card';
    card.innerHTML = `
      <div class="stack-title">${escapeHtml(entry.term)} · ${escapeHtml(entry.translation)}</div>
      <div class="stack-meta">${escapeHtml(entry.sourceSentence)}</div>
    `;
    elements.vocabList.append(card);
  }
}

function renderHighlights(highlights) {
  elements.highlightList.innerHTML = '';
  if (!highlights.length) {
    elements.highlightList.append(emptyCard('暂无高亮'));
    return;
  }
  for (const highlight of highlights) {
    const card = document.createElement('div');
    card.className = 'stack-card';
    card.innerHTML = `
      <div class="stack-title">${escapeHtml(highlight.text)}</div>
      <div class="stack-meta">${escapeHtml(highlight.note || '无备注')}</div>
    `;
    elements.highlightList.append(card);
  }
}

function renderSummaries(summaries) {
  elements.summaryList.innerHTML = '';
  if (!summaries.length) {
    elements.summaryList.append(emptyCard('暂无章节概要'));
    return;
  }
  for (const summary of summaries) {
    const card = document.createElement('div');
    card.className = 'stack-card';
    card.innerHTML = `
      <div class="stack-title">${escapeHtml(summary.chapterTitle)}</div>
      <div class="stack-meta">${escapeHtml(summary.summary)}</div>
    `;
    elements.summaryList.append(card);
  }
}

async function askAgent(mode) {
  const book = state.currentBook;
  const chapter = currentChapter();
  if (!book || !chapter) return;
  const question = buildQuestion(mode);
  await runStatus('智能体正在阅读上下文', async () => {
    const result = await api.ask({
      bookId: book.manifest.id,
      chapterId: chapter.id,
      pageIndex: currentContextPageIndex(),
      selectedText: state.selectedText,
      question,
      mode,
    });
    elements.answerBox.textContent = result.answer;
    await refreshSidebars();
    switchTab('ask');
  });
}

async function saveSelectedVocab() {
  const book = state.currentBook;
  const chapter = currentChapter();
  const page = currentPage();
  if (!book || !chapter || !state.selectedText.trim()) {
    setStatus('请先在正文中选择单词或短语');
    return;
  }
  await runStatus('正在保存生词', async () => {
    await api.saveVocab({
      bookId: book.manifest.id,
      chapterId: chapter.id,
      pageIndex: currentContextPageIndex(),
      term: state.selectedText.trim(),
      translation: '待复习',
      sourceSentence: page?.text || state.selectedText.trim(),
    });
    await refreshSidebars();
    switchTab('notebook');
  });
}

async function saveSelectedHighlight() {
  const book = state.currentBook;
  const chapter = currentChapter();
  if (!book || !chapter || !state.selectedText.trim()) {
    setStatus('请先在正文中选择要高亮的内容');
    return;
  }
  await runStatus('正在保存高亮', async () => {
    await api.saveHighlight({
      bookId: book.manifest.id,
      chapterId: chapter.id,
      pageIndex: currentContextPageIndex(),
      text: state.selectedText.trim(),
      note: elements.questionInput.value.trim(),
    });
    await refreshSidebars();
    switchTab('notebook');
  });
}

async function exportNote() {
  if (!state.currentBook) return;
  await runStatus('正在导出笔记', async () => {
    const outputPath = await api.exportNote(state.currentBook.manifest.id);
    setStatus(`已导出：${outputPath}`);
  });
}

async function exportSkill() {
  if (!state.currentBook) return;
  await runStatus('正在导出技能', async () => {
    const outputPath = await api.exportSkill(state.currentBook.manifest.id);
    setStatus(`已导出：${outputPath}`);
  });
}

function buildQuestion(mode) {
  if (mode === 'translate') return `请结合上下文翻译并解释：${state.selectedText}`;
  if (mode === 'summarize-chapter') return '请总结当前章节，并给出三个思考问题。';
  return elements.questionInput.value.trim() || `请解释这里：${state.selectedText || currentPage()?.text.slice(0, 120)}`;
}

function syncSelection() {
  const selection = window.getSelection();
  const text = selection?.toString().trim() || '';
  state.selectedText = text;
  elements.selectedText.textContent = text || '未选择文本';
}

function handleReaderKeyboard(event) {
  if (state.view !== 'reader') return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName || '')) return;
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    goToPageIndex(state.pageIndex - 1);
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    goToPageIndex(state.pageIndex + 1);
  }
}

function switchTab(name) {
  document.querySelectorAll('.tab-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === name);
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `${name}Tab`);
  });
}

async function runStatus(message, fn) {
  setStatus(message);
  try {
    await fn();
    if (elements.statusBar.textContent === message) setStatus('完成');
  } catch (error) {
    const errorMessage = error?.message || String(error);
    setStatus(`失败：${errorMessage}`);
    elements.answerBox.textContent = `操作失败：${errorMessage}`;
  }
}

function setStatus(message) {
  elements.statusBar.textContent = message;
}

function currentChapter() {
  return state.currentBook?.chapters[state.chapterIndex] || null;
}

function currentPage() {
  return currentDisplayPages()[state.pageIndex] || null;
}

function clampPageIndex(index) {
  const lastIndex = Math.max(0, currentDisplayPages().length - 1);
  return Math.min(Math.max(0, index), lastIndex);
}

function goToPageIndex(index) {
  const targetIndex = clampPageIndex(index);
  if (targetIndex === state.pageIndex) return;
  state.pageTurn = targetIndex > state.pageIndex ? 'forward' : 'backward';
  state.pageIndex = targetIndex;
  renderCurrentPage();
  updatePagePosition();
}

function updatePagePosition() {
  const total = currentDisplayPages().length;
  state.pageIndex = clampPageIndex(state.pageIndex);
  elements.pageIndicator.textContent = total ? `${state.pageIndex + 1} / ${total} 页` : '0 / 0';
  elements.prevPageButton.disabled = state.pageIndex <= 0;
  elements.nextPageButton.disabled = !total || state.pageIndex >= total - 1;
}

function currentDisplayPages() {
  return displayPagesForChapter(currentChapter());
}

function displayPagesForChapter(chapter) {
  if (!chapter) return [];
  const text = String(chapter.text || '').trim();
  if (!text) return chapter.pages || [{ index: 0, text: '', startOffset: 0, endOffset: 0 }];

  const pages = [];
  let start = 0;
  while (start < text.length) {
    const end = findDisplayPageEnd(text, start);
    pages.push({
      index: pages.length,
      text: text.slice(start, end).trim(),
      startOffset: start,
      endOffset: end,
    });
    start = end;
    while (text[start] === '\n' || text[start] === ' ') start += 1;
  }
  return pages.length ? pages : [{ index: 0, text: '', startOffset: 0, endOffset: 0 }];
}

function findDisplayPageEnd(text, start) {
  const hardEnd = Math.min(start + DISPLAY_PAGE_SIZE, text.length);
  if (hardEnd >= text.length) return text.length;

  const minEnd = start + Math.floor(DISPLAY_PAGE_SIZE * 0.58);
  const windowText = text.slice(minEnd, hardEnd);
  const paragraphBreak = windowText.lastIndexOf('\n\n');
  if (paragraphBreak >= 0) return minEnd + paragraphBreak + 2;
  const lineBreak = windowText.lastIndexOf('\n');
  if (lineBreak >= 0) return minEnd + lineBreak + 1;
  const sentenceBreak = Math.max(windowText.lastIndexOf('. '), windowText.lastIndexOf('? '), windowText.lastIndexOf('! '));
  if (sentenceBreak >= 0) return minEnd + sentenceBreak + 2;
  const space = windowText.lastIndexOf(' ');
  return space >= 0 ? minEnd + space + 1 : hardEnd;
}

function currentContextPageIndex() {
  const chapter = currentChapter();
  const displayPage = currentPage();
  if (!chapter || !displayPage) return 0;
  const contextPage = chapter.pages.find(
    (page) => displayPage.startOffset >= page.startOffset && displayPage.startOffset < page.endOffset,
  );
  return contextPage?.index ?? 0;
}

function renderChapterContent() {
  renderCurrentPage();
}

function renderCurrentPage() {
  const chapter = currentChapter();
  const page = currentPage();
  elements.pageText.innerHTML = '';
  elements.bookPage.scrollTop = 0;
  elements.pageText.classList.remove('turn-forward', 'turn-backward');
  if (!chapter || !page) return;
  renderPageContent(elements.pageText, chapter, page);
  if (state.pageTurn !== 'none') {
    void elements.pageText.offsetWidth;
    elements.pageText.classList.add(state.pageTurn === 'forward' ? 'turn-forward' : 'turn-backward');
  }
  state.pageTurn = 'none';
}

function renderPageContent(container, chapter, page) {
  const images = imagesForPage(chapter, page);
  let cursor = 0;
  for (const image of images) {
    const offset = Math.max(cursor, Math.min((image.textOffset || page.startOffset) - page.startOffset, page.text.length));
    appendTextNode(container, page.text.slice(cursor, offset));
    appendImageNode(container, image);
    cursor = offset;
  }
  appendTextNode(container, page.text.slice(cursor));
}

function appendTextNode(container, text) {
  if (!text) return;
  container.append(document.createTextNode(text));
}

function appendImageNode(container, image) {
  if (!image.dataUrl) return;
  const figure = document.createElement('figure');
  figure.className = 'reader-image';

  const img = document.createElement('img');
  img.src = image.dataUrl;
  img.alt = meaningfulImageText(image.altText) || '';
  figure.append(img);

  const caption = [meaningfulImageText(image.caption), meaningfulImageText(image.altText)].filter(Boolean)[0];
  if (caption) {
    const figcaption = document.createElement('figcaption');
    figcaption.textContent = caption;
    figure.append(figcaption);
  }

  container.append(figure);
}

function imagesForPage(chapter, page) {
  return (chapter?.images || [])
    .filter((image) => image.dataUrl && (image.textOffset || 0) >= page.startOffset && (image.textOffset || 0) <= page.endOffset)
    .sort((left, right) => (left.textOffset || 0) - (right.textOffset || 0));
}

function meaningfulImageText(value) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (['image', 'img', 'picture', 'photo', 'graphic', 'figure'].includes(normalized.toLowerCase())) return '';
  return normalized;
}

function emptyCard(text) {
  const div = document.createElement('div');
  div.className = 'stack-card';
  div.textContent = text;
  return div;
}

function renderLibraryCover(book) {
  if (book.coverImage?.dataUrl) {
    return `
      <div class="library-book-cover has-cover-image">
        <img src="${escapeHtml(book.coverImage.dataUrl)}" alt="${escapeHtml(book.coverImage.altText || `${book.title} 封面`)}" />
      </div>
    `;
  }
  return `
    <div class="library-book-cover">
      <div class="library-book-cover-title">${escapeHtml(compactTitle(book.title))}</div>
    </div>
  `;
}

function compactTitle(value) {
  const text = String(value || '未命名图书').trim();
  const chars = Array.from(text);
  return chars.length > 28 ? `${chars.slice(0, 28).join('')}...` : text;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function createHttpApi() {
  const request = async (url, options = {}) => {
    const response = await fetch(url, {
      headers: { 'content-type': 'application/json' },
      ...options,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || '请求失败');
    return payload;
  };

  return {
    listBooks: () => request('/api/books'),
    loadBook: (bookId) => request(`/api/books/${encodeURIComponent(bookId)}`),
    importSampleBook: () => request('/api/import-sample', { method: 'POST', body: '{}' }),
    importFile: () => pickAndUploadBookFile(request),
    importText: (input) => request('/api/import-text', { method: 'POST', body: JSON.stringify(input) }),
    importBinary: (input) => request('/api/import-binary', { method: 'POST', body: JSON.stringify(input) }),
    listSessions: (bookId) => request(`/api/books/${encodeURIComponent(bookId)}/sessions`),
    listVocab: (bookId) => request(`/api/books/${encodeURIComponent(bookId)}/vocab`),
    listHighlights: (bookId) => request(`/api/books/${encodeURIComponent(bookId)}/highlights`),
    listSummaries: (bookId) => request(`/api/books/${encodeURIComponent(bookId)}/summaries`),
    ask: (input) => request('/api/ask', { method: 'POST', body: JSON.stringify(input) }),
    saveVocab: (input) => request('/api/vocab', { method: 'POST', body: JSON.stringify(input) }),
    saveHighlight: (input) => request('/api/highlights', { method: 'POST', body: JSON.stringify(input) }),
    exportNote: async (bookId) => (await request(`/api/books/${encodeURIComponent(bookId)}/export-note`, { method: 'POST', body: '{}' })).path,
    exportSkill: async (bookId) => (await request(`/api/books/${encodeURIComponent(bookId)}/export-skill`, { method: 'POST', body: '{}' })).path,
  };
}

function pickAndUploadBookFile(request) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.epub,.pdf,.txt,.md,.markdown,text/plain,application/pdf,application/epub+zip';
    input.addEventListener('change', async () => {
      try {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        const dataBase64 = await fileToBase64(file);
        resolve(
          request('/api/import-binary', {
            method: 'POST',
            body: JSON.stringify({ fileName: file.name, dataBase64 }),
          }),
        );
      } catch (error) {
        reject(error);
      }
    });
    input.click();
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('文件读取失败'));
    reader.onload = () => {
      const value = String(reader.result || '');
      resolve(value.includes(',') ? value.slice(value.indexOf(',') + 1) : value);
    };
    reader.readAsDataURL(file);
  });
}
