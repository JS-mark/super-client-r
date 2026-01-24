/// <reference types="vite/client" />

interface Window {
  ipcRenderer: {
    on: (channel: string, listener: (event: any, ...args: any[]) => void) => import('electron').IpcRenderer
    off: (channel: string, listener: (...args: any[]) => void) => import('electron').IpcRenderer
    send: (channel: string, ...args: any[]) => void
    invoke: (channel: string, ...args: any[]) => Promise<any>
  }
}
