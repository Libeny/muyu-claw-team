declare module 'electron' {
  export interface BrowserWindowOptions {
    width?: number;
    height?: number;
    minWidth?: number;
    minHeight?: number;
    title?: string;
    backgroundColor?: string;
    webPreferences?: {
      preload?: string;
      contextIsolation?: boolean;
      nodeIntegration?: boolean;
    };
  }

  export class BrowserWindow {
    constructor(options?: BrowserWindowOptions);
    loadFile(filePath: string): Promise<void>;
    static getAllWindows(): BrowserWindow[];
  }

  export const app: {
    whenReady(): Promise<void>;
    quit(): void;
    getPath(name: string): string;
    on(event: string, listener: () => void): void;
  };

  export const ipcMain: {
    handle(channel: string, listener: (event: unknown, ...args: any[]) => unknown): void;
  };

  export const ipcRenderer: {
    invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  };

  export const contextBridge: {
    exposeInMainWorld(apiKey: string, api: Record<string, unknown>): void;
  };

  export const dialog: {
    showOpenDialog(options: {
      title?: string;
      properties?: string[];
      filters?: Array<{ name: string; extensions: string[] }>;
    }): Promise<{ canceled: boolean; filePaths: string[] }>;
  };
}
