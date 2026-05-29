import { dialog, ipcMain } from 'electron';
import type { AppService } from '../services/app-service.js';

export function registerIpc(service: AppService): void {
  ipcMain.handle('book:list', () => service.listBooks());
  ipcMain.handle('book:load', (_event, bookId: string) => service.loadBook(bookId));
  ipcMain.handle('book:import-sample', () => service.importSampleBook());
  ipcMain.handle('book:import-text', (_event, input) => service.importText(input));
  ipcMain.handle('book:import-binary', (_event, input) => service.importBinary(input));
  ipcMain.handle('book:sessions', (_event, bookId: string) => service.listSessions(bookId));
  ipcMain.handle('book:vocab', (_event, bookId: string) => service.listVocab(bookId));
  ipcMain.handle('book:highlights', (_event, bookId: string) => service.listHighlights(bookId));
  ipcMain.handle('book:summaries', (_event, bookId: string) => service.listChapterSummaries(bookId));
  ipcMain.handle('book:ask', (_event, input) => service.ask(input));
  ipcMain.handle('book:save-vocab', (_event, input) => service.saveVocab(input));
  ipcMain.handle('book:save-highlight', (_event, input) => service.saveHighlight(input));
  ipcMain.handle('book:export-note', (_event, bookId: string) => service.exportReadingNote(bookId));
  ipcMain.handle('book:export-skill', (_event, bookId: string) => service.exportSkill(bookId));
  ipcMain.handle('book:import-file', async () => {
    const result = await dialog.showOpenDialog({
      title: '导入书籍',
      properties: ['openFile', 'openDirectory'],
      filters: [
        { name: '书籍文件', extensions: ['epub', 'pdf', 'txt', 'md', 'markdown'] },
        { name: '全部文件', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return service.importFile(result.filePaths[0]);
  });
}
