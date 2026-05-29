const api = window.bookAgentReader || createHttpApi();

const state = {
  books: [],
  currentBook: null,
  chapterIndex: 0,
  pageIndex: 0,
  selectedText: '',
};

const elements = {
  bookList: document.getElementById('bookList'),
  sampleButton: document.getElementById('sampleButton'),
  importFileButton: document.getElementById('importFileButton'),
  bookTitle: document.getElementById('bookTitle'),
  bookMeta: document.getElementById('bookMeta'),
  chapterSelect: document.getElementById('chapterSelect'),
  chapterTitle: document.getElementById('chapterTitle'),
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

  elements.chapterSelect.addEventListener('change', () => {
    state.chapterIndex = Number(elements.chapterSelect.value || 0);
    state.pageIndex = 0;
    renderReader();
  });

  elements.prevPageButton.addEventListener('click', () => {
    state.pageIndex = Math.max(0, state.pageIndex - 1);
    renderReader();
  });

  elements.nextPageButton.addEventListener('click', () => {
    const chapter = currentChapter();
    state.pageIndex = Math.min((chapter?.pages.length || 1) - 1, state.pageIndex + 1);
    renderReader();
  });

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
  renderBookList();
  const selectedId = preferredBookId || state.currentBook?.manifest.id || state.books[0]?.id;
  if (selectedId) {
    await loadBook(selectedId);
  } else {
    renderEmpty();
  }
}

async function loadBook(bookId) {
  state.currentBook = await api.loadBook(bookId);
  state.chapterIndex = 0;
  state.pageIndex = 0;
  state.selectedText = '';
  renderBookList();
  renderReader();
  await refreshSidebars();
}

function renderBookList() {
  elements.bookList.innerHTML = '';
  if (!state.books.length) {
    elements.bookList.append(emptyCard('暂无书籍'));
    return;
  }
  for (const book of state.books) {
    const row = document.createElement('div');
    row.className = `book-row ${book.id === state.currentBook?.manifest.id ? 'active' : ''}`;
    row.innerHTML = `
      <div class="book-row-title">${escapeHtml(book.title)}</div>
      <div class="book-row-meta">${escapeHtml(book.author || '未知作者')} · ${book.chapterIds.length} 章</div>
    `;
    row.addEventListener('click', () => loadBook(book.id));
    elements.bookList.append(row);
  }
}

function renderEmpty() {
  elements.bookTitle.textContent = '未选择书籍';
  elements.bookMeta.textContent = '';
  elements.chapterSelect.innerHTML = '';
  elements.chapterTitle.textContent = '';
  elements.pageText.textContent = '';
  elements.pageIndicator.textContent = '0 / 0';
  elements.answerBox.textContent = '';
  elements.sessionList.innerHTML = '';
  elements.vocabList.innerHTML = '';
  elements.highlightList.innerHTML = '';
  elements.summaryList.innerHTML = '';
}

function renderReader() {
  const book = state.currentBook;
  if (!book) {
    renderEmpty();
    return;
  }

  elements.bookTitle.textContent = book.manifest.title;
  elements.bookMeta.textContent = `${book.manifest.author || '未知作者'} · ${book.manifest.language}`;
  elements.chapterSelect.innerHTML = book.chapters
    .map((chapter, index) => `<option value="${index}" ${index === state.chapterIndex ? 'selected' : ''}>${escapeHtml(chapter.title)}</option>`)
    .join('');

  const chapter = currentChapter();
  const page = currentPage();
  elements.chapterTitle.textContent = chapter?.title || '';
  elements.pageText.textContent = renderPageText(chapter, page);
  elements.pageIndicator.textContent = chapter ? `${state.pageIndex + 1} / ${chapter.pages.length}` : '0 / 0';
  elements.selectedText.textContent = state.selectedText || '未选择文本';
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
      pageIndex: state.pageIndex,
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
      pageIndex: state.pageIndex,
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
      pageIndex: state.pageIndex,
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
  const selection = window.getSelection()?.toString().trim() || '';
  state.selectedText = selection;
  elements.selectedText.textContent = selection || '未选择文本';
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
  return currentChapter()?.pages[state.pageIndex] || null;
}

function renderPageText(chapter, page) {
  return page?.text || '';
}

function emptyCard(text) {
  const div = document.createElement('div');
  div.className = 'stack-card';
  div.textContent = text;
  return div;
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
