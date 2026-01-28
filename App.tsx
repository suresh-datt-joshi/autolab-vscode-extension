
import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { ProgramFile, FileStatus } from './types';
import { GoogleGenAI } from "@google/genai";
import JSZip from 'jszip';
import { toPng } from 'html-to-image';
import { 
  FolderIcon, 
  DocumentIcon, 
  PlayIcon, 
  ArrowDownTrayIcon, 
  TrashIcon, 
  SparklesIcon, 
  FolderPlusIcon, 
  Cog6ToothIcon, 
  InformationCircleIcon, 
  HashtagIcon, 
  GlobeAltIcon, 
  CommandLineIcon, 
  XMarkIcon 
} from '@heroicons/react/24/outline';

const App: React.FC = () => {
  const [files, setFiles] = useState<ProgramFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // Naming configuration state
  const [folderPattern, setFolderPattern] = useState('[index]_[name]');
  const [screenshotPattern, setScreenshotPattern] = useState('[name]_output');
  const [startIndex, setStartIndex] = useState(1);
  const [isNumberingEnabled, setIsNumberingEnabled] = useState(true);
  
  const terminalRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);

  // Close settings when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showSettings && 
        settingsRef.current && 
        !settingsRef.current.contains(event.target as Node) &&
        settingsButtonRef.current &&
        !settingsButtonRef.current.contains(event.target as Node)
      ) {
        setShowSettings(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSettings]);

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
      formatted = formatted.replace(/\[index\][_\-\s]?/g, '');
    }
    
    return formatted;
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = event.target.files;
    if (!uploadedFiles) return;

    const validFiles = Array.from(uploadedFiles).filter(f => !f.name.startsWith('.') && !f.name.includes('DS_Store'));

    const newFiles: ProgramFile[] = validFiles.map((file) => ({
      id: Math.random().toString(36).substring(7),
      name: file.name,
      content: '', 
      language: file.name.split('.').pop()?.toLowerCase() || 'text',
      status: FileStatus.PENDING,
    }));

    validFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setFiles(prev => {
          const updated = [...prev];
          const match = updated.find(f => f.name === file.name && f.content === '');
          if (match) match.content = content;
          return updated;
        });
      };
      reader.readAsText(file);
    });

    setFiles(prev => [...prev, ...newFiles]);
    event.target.value = '';
  };

  const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

  const getErrorStatus = (error: unknown): number | undefined => {
    // @google/genai throws ApiError with a JSON payload in message, but structure can vary.
    const anyErr = error as any;
    const direct =
      anyErr?.status ??
      anyErr?.code ??
      anyErr?.response?.status ??
      anyErr?.error?.code ??
      anyErr?.error?.status;
    if (typeof direct === 'number') return direct;
    return undefined;
  };

  const generateOutput = async (file: ProgramFile) => {
    const isHtml = file.language === 'html';
    
    try {
      // Use a generally-available fast model (preview models can be more quota-limited).
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = isHtml 
        ? `Act as a Browser Developer Tools Console. Analyze the following HTML/JavaScript code. Provide ONLY the console logs (console.log, console.error, console.warn) that would be printed to the developer console upon page load. If there are no logs, return "Console was cleared.". Do not explain anything. 
           
           Code:
           ${file.content}`
        : `Act as a terminal environment. Run the following ${file.language} code and provide ONLY the standard output as it would appear in a command line interface. Do not explain anything. If there is an error, show the error message. 
        
           Code:
           ${file.content}`;

      // Backoff + retry for transient rate limits (429).
      // NOTE: If your account quota is fully exhausted, retries won't help and we'll show a clear message.
      const maxAttempts = 4;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
              temperature: 0.1,
              systemInstruction: isHtml
                ? "You are a web browser console. Extract and print only the log outputs from the code provided."
                : "You are a precise code execution simulator. Output exactly what a terminal would print."
            }
          });
          return response.text || (isHtml ? "Console was cleared." : "No output generated.");
        } catch (err) {
          const status = getErrorStatus(err);
          const isRateLimited = status === 429 || String(err).includes('429') || String(err).includes('RESOURCE_EXHAUSTED');
          if (!isRateLimited || attempt === maxAttempts) {
            throw err;
          }
          // Exponential backoff: 1.5s, 3s, 6s...
          const delayMs = Math.round(1500 * Math.pow(2, attempt - 1));
          await sleep(delayMs);
        }
      }
      return isHtml ? "Console was cleared." : "No output generated.";
    } catch (error) {
      console.error("AI Error:", error);
      const status = getErrorStatus(error);
      if (status === 429 || String(error).includes('RESOURCE_EXHAUSTED')) {
        return [
          "Execution Error: Gemini API quota/rate limit exceeded (429).",
          "Fix: wait a bit, reduce batch size, or enable billing / increase quota in Google AI Studio.",
          "Docs: https://ai.google.dev/gemini-api/docs/rate-limits"
        ].join('\n');
      }
      return "Execution Error: Failed to generate output via AI.";
    }
  };

  const processSingleFile = async (fileId: string) => {
    // 1. Mark as running
    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: FileStatus.RUNNING } : f));

    // 2. Get the file data
    const currentFiles = [...files];
    const file = currentFiles.find(f => f.id === fileId);
    if (!file) return;

    // 3. Generate Output
    const output = await generateOutput(file);
    
    // 4. Update status and output
    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, output, status: FileStatus.COMPLETED } : f));

    // 5. Short wait for UI update
    await new Promise(resolve => setTimeout(resolve, 800));

    // 6. Capture screenshot
    const terminalEl = terminalRefs.current[fileId];
    if (terminalEl) {
      try {
        const dataUrl = await toPng(terminalEl, { 
          quality: 0.95, 
          cacheBust: true,
          backgroundColor: '#f8fafc',
          pixelRatio: 1.5 // Reduced slightly from 2 to speed up PNG generation
        });
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        setFiles(prev => prev.map(f => f.id === fileId ? { ...f, imageBlob: blob } : f));
      } catch (err) {
        console.error(`Screenshot failed for ${file.name}:`, err);
        setFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: FileStatus.ERROR } : f));
      }
    }
  };

  const processAll = async () => {
    if (isProcessing) return;
    setIsProcessing(true);

    // Process files sequentially to avoid Gemini rate limits/quota errors in a webview.
    const filesToProcess = files.filter(f => f.status !== FileStatus.COMPLETED);
    for (const file of filesToProcess) {
      await processSingleFile(file.id);
      // Small delay between calls helps avoid 429 spikes.
      await sleep(700);
    }

    setIsProcessing(false);
  };

  const downloadAll = async () => {
    try {
      const zip = new JSZip();

      files.forEach((file, index) => {
        const folderName = formatName(folderPattern, file, index);
        const screenshotName = formatName(screenshotPattern, file, index);
        const folder = zip.folder(folderName);
        
        if (folder) {
          folder.file(file.name, file.content);
          if (file.imageBlob) {
            folder.file(`${screenshotName}.png`, file.imageBlob);
          }
        }
      });

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Lab_Submission_${new Date().toISOString().split('T')[0]}.zip`;
      link.click();
      
      // Reset the application to home screen after download
      setTimeout(() => {
        setFiles([]);
        setIsProcessing(false);
        URL.revokeObjectURL(url);
      }, 1000);
    } catch (err) {
      console.error("Download failed:", err);
      alert("Failed to generate zip file. Please try again.");
    }
  };

  const removeFile = (id: string) => {
    setFiles(files.filter(f => f.id !== id));
  };

  const clearAll = () => {
    if (confirm("Clear all uploaded files?")) {
      setFiles([]);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-32 relative">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between shadow-sm gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <SparklesIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 leading-tight">AutoLab</h1>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-widest">Efficiency Engine</p>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-3">
          <button 
            ref={settingsButtonRef}
            onClick={() => setShowSettings(!showSettings)}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 font-semibold text-sm transition-all ${
              showSettings ? 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Cog6ToothIcon className="w-5 h-5" />
            Naming Settings
          </button>

          <label className="cursor-pointer bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-50 transition-all flex items-center gap-2 font-semibold text-sm">
            <FolderPlusIcon className="w-5 h-5 text-indigo-500" />
            Upload Folder
            <input 
              type="file" 
              className="hidden" 
              onChange={handleFileUpload}
              {...({ webkitdirectory: "", directory: "" } as any)} 
            />
          </label>
          
          <label className="cursor-pointer bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-50 transition-all flex items-center gap-2 font-semibold text-sm">
            <DocumentIcon className="w-5 h-5 text-indigo-500" />
            Select Files
            <input type="file" multiple className="hidden" onChange={handleFileUpload} />
          </label>
          
          <button 
            onClick={processAll}
            disabled={files.length === 0 || isProcessing}
            className={`px-5 py-2 rounded-lg flex items-center gap-2 font-bold text-sm transition-all ${
              isProcessing || files.length === 0 
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md active:scale-95'
            }`}
          >
            <PlayIcon className="w-5 h-5" />
            {isProcessing ? 'Automating Batch...' : 'Start Batch'}
          </button>
        </div>
      </header>

      {/* Settings Panel */}
      {showSettings && (
        <div 
          ref={settingsRef}
          className="bg-white border-b border-slate-200 p-6 shadow-inner animate-in slide-in-from-top duration-300 sticky top-[73px] z-40"
        >
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Cog6ToothIcon className="w-5 h-5 text-slate-400" />
                <h2 className="font-bold text-slate-700">Naming Configurations</h2>
              </div>
              <button 
                onClick={() => setShowSettings(false)}
                className="p-1 hover:bg-slate-100 rounded-full transition-colors"
              >
                <XMarkIcon className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="md:col-span-2 space-y-4">
                <div className="flex items-center gap-3 mb-2">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={isNumberingEnabled}
                      onChange={(e) => setIsNumberingEnabled(e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    <span className="ms-3 text-sm font-bold text-slate-700">Enable Sequential Numbering</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-600 mb-1">Folder Name Pattern</label>
                    <input 
                      type="text" 
                      value={folderPattern}
                      onChange={(e) => setFolderPattern(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                      placeholder="e.g., [index]_[name]"
                    />
                    <p className="mt-1 text-[10px] text-slate-400 italic">Preview: /{formatName(folderPattern, { name: 'program.py' } as any, 0)}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-semibold text-slate-600 mb-1">Screenshot Name Pattern</label>
                    <input 
                      type="text" 
                      value={screenshotPattern}
                      onChange={(e) => setScreenshotPattern(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                      placeholder="e.g., [name]_output"
                    />
                    <p className="mt-1 text-[10px] text-slate-400 italic">Preview: {formatName(screenshotPattern, { name: 'program.py' } as any, 0)}.png</p>
                  </div>
                </div>

                <div className={`pt-2 transition-opacity ${!isNumberingEnabled ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
                  <label className="block text-sm font-semibold text-slate-600 mb-1 flex items-center gap-2">
                    <HashtagIcon className="w-4 h-4" />
                    Start Numbering From
                  </label>
                  <input 
                    type="number" 
                    value={startIndex}
                    disabled={!isNumberingEnabled}
                    onChange={(e) => setStartIndex(parseInt(e.target.value) || 0)}
                    className="w-32 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                  />
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 h-full">
                <div className="flex items-center gap-2 text-indigo-600 mb-2">
                  <InformationCircleIcon className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">Placeholders</span>
                </div>
                <div className="space-y-2">
                  <div className={`flex items-center justify-between text-xs transition-opacity ${!isNumberingEnabled ? 'opacity-30' : 'opacity-100'}`}>
                    <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-indigo-600 font-bold">[index]</code>
                    <span className="text-slate-500 text-[10px]">Serial ID</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-indigo-600 font-bold">[name]</code>
                    <span className="text-slate-500 text-[10px]">File without ext</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-indigo-600 font-bold">[ext]</code>
                    <span className="text-slate-500 text-[10px]">Extension only</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-indigo-600 font-bold">[full]</code>
                    <span className="text-slate-500 text-[10px]">Original filename</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto p-6 lg:p-10">
        {files.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-16 text-center shadow-sm">
            <div className="bg-indigo-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8">
              <FolderIcon className="w-12 h-12 text-indigo-300" />
            </div>
            <h2 className="text-3xl font-extrabold text-slate-800 mb-3">Welcome to AutoLab</h2>
            <p className="text-slate-500 max-w-lg mx-auto mb-10 text-lg">
              Save hours of manual work. Upload your lab folder once, and we'll automatically run every program in parallel, capture high-quality snapshots, and package everything for submission.
            </p>
            <div className="flex justify-center flex-wrap gap-4">
               <label className="cursor-pointer bg-indigo-600 text-white px-8 py-4 rounded-xl hover:bg-indigo-700 transition-all font-bold shadow-xl shadow-indigo-100 flex items-center gap-2">
                <FolderPlusIcon className="w-6 h-6" />
                Upload Lab Folder
                <input 
                  type="file" 
                  className="hidden" 
                  onChange={handleFileUpload}
                  {...({ webkitdirectory: "", directory: "" } as any)} 
                />
              </label>
              <label className="cursor-pointer bg-white border border-slate-200 text-slate-700 px-8 py-4 rounded-xl hover:bg-slate-50 transition-all font-bold shadow-sm flex items-center gap-2">
                <DocumentIcon className="w-6 h-6 text-slate-400" />
                Select Individual Files
                <input type="file" multiple className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
            {/* File List */}
            <div className="xl:col-span-1 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-slate-400 uppercase tracking-widest text-[10px]">Parallel Queue</h3>
                <button 
                  onClick={clearAll}
                  className="text-[10px] font-bold text-slate-400 hover:text-red-500 transition-colors uppercase"
                >
                  Clear All
                </button>
              </div>
              <div className="space-y-2 overflow-y-auto max-h-[70vh] pr-2 custom-scrollbar">
                {files.map((file, idx) => (
                  <div 
                    key={file.id} 
                    className={`bg-white border rounded-xl p-3 transition-all duration-300 ${
                      file.status === FileStatus.RUNNING ? 'ring-2 ring-indigo-500 border-indigo-200 shadow-lg' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <div className={`flex-shrink-0 w-2 h-2 rounded-full ${
                          file.status === FileStatus.COMPLETED ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 
                          file.status === FileStatus.RUNNING ? 'bg-amber-500 animate-pulse' : 
                          file.status === FileStatus.ERROR ? 'bg-red-500' : 'bg-slate-300'
                        }`} />
                        <span className="font-bold text-slate-700 truncate text-xs">
                          {isNumberingEnabled && `${startIndex + idx}. `}{file.name}
                        </span>
                      </div>
                      <button onClick={() => removeFile(file.id)} className="flex-shrink-0 text-slate-300 hover:text-red-500 transition-colors">
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Output Previews */}
            <div className="xl:col-span-3 space-y-8">
              <div className="flex items-center justify-between">
                 <h3 className="font-bold text-slate-400 uppercase tracking-widest text-[10px]">Submission Snapshots</h3>
                 <span className="text-[10px] text-slate-400 font-medium italic">Naming: {screenshotPattern}.png</span>
              </div>
             
              <div className="space-y-20">
                {files.map((file, idx) => (
                  <div key={file.id} className="relative group">
                    <div className="mb-4 flex items-center justify-between px-2">
                      <div className="flex items-center gap-3">
                        {isNumberingEnabled && (
                          <div className="bg-indigo-600 px-2 py-0.5 rounded text-[10px] font-black text-white uppercase tracking-tighter">Lab {startIndex + idx}</div>
                        )}
                        <span className="text-xs font-bold text-slate-400">/</span>
                        <span className="text-sm font-bold text-slate-800">/{formatName(folderPattern, file, idx)}</span>
                      </div>
                      {file.status === FileStatus.COMPLETED && (
                        <div className="flex items-center gap-1.5 text-green-600 font-bold text-[10px] bg-green-50 px-3 py-1 rounded-full border border-green-100 shadow-sm uppercase tracking-wider">
                          <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                          Ready
                        </div>
                      )}
                      {file.status === FileStatus.ERROR && (
                        <div className="flex items-center gap-1.5 text-red-600 font-bold text-[10px] bg-red-50 px-3 py-1 rounded-full border border-red-100 shadow-sm uppercase tracking-wider">
                          Capture Error
                        </div>
                      )}
                    </div>
                    
                    <div 
                      ref={el => { terminalRefs.current[file.id] = el; }}
                      className="rounded-2xl overflow-hidden shadow-2xl border border-slate-200 bg-white"
                    >
                      {file.language === 'html' ? (
                        /* BROWSER VIEW FOR HTML */
                        <div className="bg-white flex flex-col">
                          {/* Browser Toolbar */}
                          <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center gap-3">
                            <div className="flex gap-1.5">
                              <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                              <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                            </div>
                            <div className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <GlobeAltIcon className="w-3.5 h-3.5 text-indigo-500" />
                                <span className="text-[10px] text-slate-400 font-mono truncate tracking-tight">https://autolab.local/{file.name}</span>
                              </div>
                            </div>
                          </div>
                          
                          {/* Viewport Render */}
                          <div className="min-h-[350px] p-8 bg-white overflow-auto border-b border-slate-100">
                            {file.status === FileStatus.RUNNING && !file.output ? (
                              <div className="h-full w-full flex flex-col items-center justify-center gap-4 py-24">
                                <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                                <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">Rendering DOM...</span>
                              </div>
                            ) : (
                              <div 
                                className="w-full h-full animate-in fade-in duration-700"
                                dangerouslySetInnerHTML={{ __html: file.content }}
                              />
                            )}
                          </div>

                          {/* Console Section */}
                          <div className="bg-[#f3f4f6] border-t-2 border-slate-200 font-mono text-xs">
                             <div className="bg-white px-4 py-2 border-b border-slate-200 flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                <div className="flex items-center gap-2">
                                   <CommandLineIcon className="w-4 h-4 text-indigo-500" />
                                   Console
                                </div>
                                <div className="flex gap-4">
                                   <span className="text-indigo-600">All Levels</span>
                                   <span>Filter</span>
                                </div>
                             </div>
                             <div className="p-4 bg-white/50 space-y-1 overflow-auto max-h-[150px]">
                                {file.output ? (
                                   file.output.split('\n').map((line, lIdx) => (
                                      <div key={lIdx} className="flex gap-3 py-1 border-b border-slate-100 last:border-0 items-start">
                                         <span className="text-slate-400 flex-shrink-0 w-8">{lIdx + 1}</span>
                                         <span className="text-slate-800 break-all">{line || " "}</span>
                                      </div>
                                   ))
                                ) : file.status === FileStatus.RUNNING ? (
                                   <div className="animate-pulse text-indigo-500 italic">Capturing logs...</div>
                                ) : (
                                   <span className="text-slate-400 italic">No console logs detected...</span>
                                )}
                             </div>
                          </div>
                        </div>
                      ) : (
                        /* TERMINAL VIEW FOR OTHER CODE */
                        <div className="bg-[#0c0c0c]">
                          <div className="bg-[#1a1a1a] px-5 py-3 border-b border-[#2d2d2d] flex items-center justify-between">
                            <div className="flex gap-2">
                              <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                              <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                              <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
                            </div>
                            <div className="text-[#666666] text-[11px] font-mono font-black uppercase tracking-[0.2em]">
                              Terminal.exe - {file.name}
                            </div>
                          </div>
                          <div className="p-10 font-mono text-sm leading-relaxed text-[#d4d4d4] min-h-[250px]">
                            <div className="mb-4 flex items-start gap-3">
                              <span className="text-[#27c93f] font-bold">~/Assignments&gt;</span>
                              <span className="text-white opacity-90">{file.language === 'py' ? 'python' : 'run'} {file.name}</span>
                            </div>
                            {file.status === FileStatus.RUNNING && !file.output && (
                              <div className="flex items-center gap-3 text-indigo-400 font-bold py-6 animate-pulse">
                                <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                                Simulating execution output...
                              </div>
                            )}
                            {file.output && (
                              <pre className="whitespace-pre-wrap mt-2 font-mono text-[#cccccc] bg-white/5 p-6 rounded-xl border border-white/10 shadow-inner">{file.output}</pre>
                            )}
                            {file.status === FileStatus.COMPLETED && (
                               <div className="mt-8 text-[#27c93f] font-bold flex items-center gap-2">
                                  ~/Assignments&gt; 
                                  <span className="w-3 h-6 bg-white/30 inline-block align-middle animate-blink" />
                               </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4 px-2 opacity-60 group-hover:opacity-100 transition-opacity">
                      <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                        <FolderIcon className="w-4 h-4 text-indigo-400" />
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Target:</span>
                        <span className="text-[11px] font-black text-slate-600 truncate">/{formatName(folderPattern, file, idx)}</span>
                      </div>
                      <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                        <DocumentIcon className="w-4 h-4 text-indigo-400" />
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Asset:</span>
                        <span className="text-[11px] font-black text-slate-600 truncate">{formatName(screenshotPattern, file, idx)}.png</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Floating Action Bar */}
      {files.length > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-2xl border border-indigo-100 px-10 py-6 rounded-[2.5rem] shadow-[0_30px_60px_-12px_rgba(0,0,0,0.25)] flex items-center gap-16 z-50 animate-in slide-in-from-bottom-10 duration-500">
          <div className="flex items-center gap-8 border-r border-slate-200 pr-16">
            <div className="text-center">
              <div className="text-[9px] uppercase font-black text-slate-400 tracking-[0.2em] mb-2">Queue</div>
              <div className="text-3xl font-black text-slate-800 tabular-nums">{files.length}</div>
            </div>
            <div className="text-center">
              <div className="text-[9px] uppercase font-black text-slate-400 tracking-[0.2em] mb-2">Done</div>
              <div className="text-3xl font-black text-emerald-600 tabular-nums">
                {files.filter(f => !!f.imageBlob).length}
              </div>
            </div>
          </div>
          
          <div className="flex gap-5">
            <button 
              onClick={processAll}
              disabled={isProcessing}
              className={`px-12 py-5 rounded-2xl font-black text-xs uppercase tracking-[0.15em] flex items-center gap-4 transition-all ${
                isProcessing 
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                  : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-2xl shadow-indigo-200 active:scale-95'
              }`}
            >
              {isProcessing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Automating...
                </>
              ) : (
                <>
                  <PlayIcon className="w-5 h-5" />
                  Run All
                </>
              )}
            </button>
            <button 
              onClick={downloadAll}
              disabled={!files.some(f => !!f.imageBlob) || isProcessing}
              className={`px-12 py-5 rounded-2xl font-black text-xs uppercase tracking-[0.15em] flex items-center gap-4 transition-all ${
                !files.some(f => !!f.imageBlob) || isProcessing
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                  : 'bg-slate-900 text-white hover:bg-black shadow-2xl shadow-slate-200 active:scale-95'
              }`}
            >
              <ArrowDownTrayIcon className="w-5 h-5" />
              Package Zip
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .animate-blink {
          animation: blink 1s step-end infinite;
        }
      `}</style>
    </div>
  );
};

export default App;
