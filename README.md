# AutoLab App

AutoLab is a productivity tool for programming lab submissions: upload a folder of programs, generate execution-style output using Gemini, capture snapshot images, and download a neatly organized ZIP ready to submit.

## Gallery

> Put your screenshots in `docs/images/` using the filenames below (or update the paths).

![AutoLab Web App](docs/images/webapp-01.png)

<details>
  <summary><b>More screenshots</b></summary>

  <br />

  ![Batch processing](docs/images/webapp-02.png)

  ![Naming settings](docs/images/webapp-03.png)

  ![ZIP packaging](docs/images/webapp-04.png)
</details>

## Features

- **Batch processing**: upload a whole lab folder or individual files
- **AI output simulation**: generates terminal-style output for common languages (and console logs for HTML)
- **Snapshots**: captures clean PNG “proof of output” images automatically
- **Naming patterns**: placeholders like `[index]`, `[name]`, `[ext]`, `[full]`
- **ZIP packaging**: one-click structured archive for submission

## Supported files

- Python (`.py`)
- C (`.c`)
- C++ (`.cpp`)
- Java (`.java`)
- JavaScript (`.js`)
- HTML (`.html`)

## Run locally (web app)

**Prerequisites:** Node.js

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` in the project root:

```bash
GEMINI_API_KEY=YOUR_KEY_HERE
```

3. Start dev server:

```bash
npm run dev
```

## VS Code extension

This repo includes a VS Code extension in `vscode-extension/` that runs the app inside a VS Code webview.

### Build + compile (one command)

```bash
npm run vscode:prepare
```

### Install as a VSIX (recommended)

1. Package the extension:

```bash
cd vscode-extension
npx @vscode/vsce package --allow-missing-repository
```

2. In VS Code: **Extensions** → `...` → **Install from VSIX…**
3. After installing, open it via **Ctrl+Shift+P** → **Open Autolab App**

## Notes / troubleshooting

- **429 / quota errors**: your Gemini API key may be rate-limited or out of quota. Wait, reduce usage, or increase quota in Google AI Studio.
- The extension runs fully locally; only the Gemini API calls go to Google.

