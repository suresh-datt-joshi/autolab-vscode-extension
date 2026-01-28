"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
function openAutolabPanel(context) {
    const panel = vscode.window.createWebviewPanel('autolabApp', 'Autolab App', vscode.ViewColumn.One, {
        enableScripts: true,
        localResourceRoots: [
            vscode.Uri.file(path.join(context.extensionPath, 'media'))
        ]
    });
    const mediaPath = path.join(context.extensionPath, 'media');
    const indexPath = path.join(mediaPath, 'index.html');
    if (!fs.existsSync(indexPath)) {
        panel.webview.html = `<html><body><h2>Autolab App</h2><p>Build output not found. Please run <code>npm run vscode:prepare</code> in the workspace root.</p></body></html>`;
        return;
    }
    let html = fs.readFileSync(indexPath, 'utf8');
    const toWebviewUri = (relativePath) => {
        const onDisk = vscode.Uri.file(path.join(mediaPath, relativePath));
        return panel.webview.asWebviewUri(onDisk).toString();
    };
    // Map the stable asset names produced by Vite (configured in vite.config.ts)
    html = html.replace(/src="\.\/assets\/main\.js"/, `src="${toWebviewUri('assets/main.js')}"`);
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
    }
    else {
        // Fallback to linking if no CSS file found (should be rare).
        html = html.replace(/href="\.\/assets\/main\.css"/, `href="${toWebviewUri('assets/main.css')}"`);
    }
    panel.webview.html = html;
}
function activate(context) {
    // Command to manually open/reopen the app.
    context.subscriptions.push(vscode.commands.registerCommand('autolab-vscode.openApp', () => openAutolabPanel(context)));
    // Auto-open the app once VS Code finishes startup (useful for Extension Development Host).
    // Using setTimeout ensures the window UI is ready before creating the panel.
    setTimeout(() => {
        try {
            openAutolabPanel(context);
        }
        catch {
            // If something goes wrong, user can still run the command manually.
        }
    }, 250);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map