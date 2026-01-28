
export interface ProgramFile {
  id: string;
  name: string;
  content: string;
  language: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  output?: string;
  imageBlob?: Blob;
}

export enum FileStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  ERROR = 'error'
}
