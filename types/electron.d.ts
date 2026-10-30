interface DesktopOpenFile {
  filePath: string;
  fileName: string;
  content: string;
  modifiedAt: number;
}

interface DesktopSaveRequest {
  filePath?: string;
  fileName: string;
  content: string;
}

interface DesktopWriteFileRequest {
  filePath: string;
  content: string;
  expectedModifiedAt?: number;
}

interface DesktopSavedFile {
  filePath: string;
  fileName: string;
  modifiedAt: number;
}

interface Window {
  dillingerDesktop?: {
    isDesktop: true;
    platform: string;
    openFile: () => Promise<DesktopOpenFile | null>;
    saveFile: (request: DesktopSaveRequest) => Promise<DesktopSavedFile | null>;
    writeFile: (request: DesktopWriteFileRequest) => Promise<DesktopSavedFile>;
    confirmUnsavedChanges: () => Promise<0 | 1 | 2>;
    confirmClose: (shouldClose: boolean) => Promise<void>;
    quit: () => Promise<void>;
    onMenuAction: (callback: (action: string) => void) => () => void;
    onRequestClose: (callback: () => void) => () => void;
  };
}
