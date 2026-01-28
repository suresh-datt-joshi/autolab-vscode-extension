# AutoLab App

AutoLab is a productivity tool for programming lab submissions: upload a folder of programs, generate execution-style output using Gemini, capture snapshot images, and download a neatly organized ZIP ready to submit.

## Gallery


**Home page**

![AutoLab Web App](https://github.com/user-attachments/assets/3cf1755c-9486-4554-b716-426f9e2b3b92)

<details>
  <summary><b>More screenshots</b></summary>

  <br />

  **Batch processing page**

  ![Batch processing](https://github.com/user-attachments/assets/649e9612-4502-4546-b77d-b058ceaaaa8a)

  **Naming configuration page**

  ![Naming settings](https://github.com/user-attachments/assets/0e5193f8-49d6-4682-98ec-06a18df3fa9a)

  **Package zipping page**

  ![ZIP packaging](https://github.com/user-attachments/assets/c829a2ab-c7e3-4bde-9ae6-03f5cba1002a)

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

