import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('bookAgentReader', {
  listBooks: () => ipcRenderer.invoke('book:list'),
  loadBook: (bookId: string) => ipcRenderer.invoke('book:load', bookId),
  importSampleBook: () => ipcRenderer.invoke('book:import-sample'),
  importFile: () => ipcRenderer.invoke('book:import-file'),
  importText: (input: unknown) => ipcRenderer.invoke('book:import-text', input),
  importBinary: (input: unknown) => ipcRenderer.invoke('book:import-binary', input),
  listSessions: (bookId: string) => ipcRenderer.invoke('book:sessions', bookId),
  listVocab: (bookId: string) => ipcRenderer.invoke('book:vocab', bookId),
  listHighlights: (bookId: string) => ipcRenderer.invoke('book:highlights', bookId),
  listSummaries: (bookId: string) => ipcRenderer.invoke('book:summaries', bookId),
  ask: (input: unknown) => ipcRenderer.invoke('book:ask', input),
  saveVocab: (input: unknown) => ipcRenderer.invoke('book:save-vocab', input),
  saveHighlight: (input: unknown) => ipcRenderer.invoke('book:save-highlight', input),
  exportNote: (bookId: string) => ipcRenderer.invoke('book:export-note', bookId),
  exportSkill: (bookId: string) => ipcRenderer.invoke('book:export-skill', bookId),
});
