interface DesktopOpenFile {
  filePath: string;
  fileName: string;
  content: string;
}

interface DesktopSaveRequest {
  filePath?: string;
  fileName: string;
  content: string;
}

interface DesktopSavedFile {
  filePath: string;
  fileName: string;
}

interface Window {
  dillingerDesktop?: {
    isDesktop: true;
    platform: string;
    openFile: () => Promise<DesktopOpenFile | null>;
    saveFile: (request: DesktopSaveRequest) => Promise<DesktopSavedFile | null>;
  };
}
