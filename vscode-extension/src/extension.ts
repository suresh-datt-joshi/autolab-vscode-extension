import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

function openAutolabPanel(context: vscode.ExtensionContext) {
  const panel = vscode.window.createWebviewPanel(
    'autolabApp',
    'Autolab App',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(context.extensionPath, 'media'))
      ]
    }
  );

  const mediaPath = path.join(context.extensionPath, 'media');
  const indexPath = path.join(mediaPath, 'index.html');

  if (!fs.existsSync(indexPath)) {
    panel.webview.html = `<html><body><h2>Autolab App</h2><p>Build output not found. Please run <code>npm run vscode:prepare</code> in the workspace root.</p></body></html>`;
    return;
  }

  let html = fs.readFileSync(indexPath, 'utf8');

  const toWebviewUri = (relativePath: string) => {
    const onDisk = vscode.Uri.file(path.join(mediaPath, relativePath));
    return panel.webview.asWebviewUri(onDisk).toString();
  };

  // Map the stable asset names produced by Vite (configured in vite.config.ts)
  html = html.replace(
    /src="\.\/assets\/main\.js"/,
    `src="${toWebviewUri('assets/main.js')}"`
  );

  // Inline CSS in the webview HTML to avoid `cssRules` SecurityError when html-to-image
  // tries to read linked stylesheets inside VS Code webviews.
  const cssCandidates = ['assets/main.css', 'assets/index.css'];
  const cssPath = cssCandidates
    .map(p => path.join(mediaPath, p))
    .find(p => fs.existsSync(p));

  if (cssPath) {
    const cssText = fs.readFileSync(cssPath, 'utf8');
    // Remove the linked CSS (if present) and inject it inline.
    html = html.replace(/<link[^>]+href="\.\/assets\/main\.css"[^>]*>/, '');
    html = html.replace(/<\/head>/, `<style>${cssText}</style></head>`);
  } else {
    // Fallback to linking if no CSS file found (should be rare).
    html = html.replace(
      /href="\.\/assets\/main\.css"/,
      `href="${toWebviewUri('assets/main.css')}"`
    );
  }

  panel.webview.html = html;
}

export function activate(context: vscode.ExtensionContext) {
  // Command to manually open/reopen the app.
  context.subscriptions.push(
    vscode.commands.registerCommand('autolab-vscode.openApp', () => openAutolabPanel(context))
  );

  // Auto-open the app once VS Code finishes startup (useful for Extension Development Host).
  // Using setTimeout ensures the window UI is ready before creating the panel.
  setTimeout(() => {
    try {
      openAutolabPanel(context);
    } catch {
      // If something goes wrong, user can still run the command manually.
    }
  }, 250);
}

export function deactivate() {}

