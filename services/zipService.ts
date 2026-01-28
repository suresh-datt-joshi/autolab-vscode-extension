
import JSZip from 'jszip';
import { ProgramFile } from '../types';

export const generateSubmissionZip = async (
  files: ProgramFile[], 
  folderPattern: string = '[name]', 
  screenshotPattern: string = '[name]_output',
  startIndex: number = 1,
  isNumberingEnabled: boolean = true
): Promise<Blob> => {
  const zip = new JSZip();

  const formatName = (pattern: string, file: ProgramFile, index: number) => {
    const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    const ext = file.name.split('.').pop() || '';
    
    let formatted = pattern
      .replace(/\[name\]/g, nameWithoutExt)
      .replace(/\[ext\]/g, ext)
      .replace(/\[full\]/g, file.name);

    if (isNumberingEnabled) {
      formatted = formatted.replace(/\[index\]/g, (startIndex + index).toString());
    } else {
      // Remove [index] and common separators following it
      formatted = formatted.replace(/\[index\][_\-\s]?/g, '');
    }
    
    return formatted;
  };

  files.forEach((file, index) => {
    const folderName = formatName(folderPattern, file, index);
    const screenshotName = formatName(screenshotPattern, file, index);
    const folder = zip.folder(folderName);
    
    if (folder) {
      // Original code
      folder.file(file.name, file.content);
      
      // Captured screenshot
      if (file.imageBlob) {
        folder.file(`${screenshotName}.png`, file.imageBlob);
      }
    }
  });

  return await zip.generateAsync({ type: 'blob' });
};
