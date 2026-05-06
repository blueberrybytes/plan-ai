# Plan AI Desktop Recorder

[![Download on the Mac App Store](https://tools.applemediaservices.com/api/badges/download-on-the-mac-app-store/black/en-us?size=250x83)](https://apps.apple.com/us/app/plan-ai-recorder/id6759553699)

Plan AI Desktop Recorder is a macOS desktop application that captures meetings in real-time and uses AI to generate action items, notes, and tasks. It runs quietly in the background and intelligently prompts you to start recording when it detects microphone activity.

## Features

- **Native System Audio Capture**: Utilizes custom Swift scripts (`AudioCapture.swift`) to reliably record macOS system audio output.
- **Smart Active Microphone Detection**: A background Swift process (`MicActivity.swift`) monitors when your microphone becomes active (e.g., joining a Zoom/Meet call) and sends a toast notification to start recording.
- **Seamless Web Authentication**: Deep linking with a custom protocol (`blueberrybytes-recorder://`) and a local auth server allows smooth login via the Plan AI web application.
- **Chunked Audio Upload**: Automatically chunks audio recordings and streams them to the Plan AI backend for transcription (`audioRecorder.ts`, `planAiApi.ts`).
- **Modern UI**: Built with React, Material-UI, and Emotion for a sleek, dark-themed interface.

## Technology Stack

- **Framework**: Electron via [electron-vite](https://electron-vite.org/)
- **Frontend**: React 18, TypeScript, React Router
- **Styling**: Material-UI (MUI), Emotion
- **Backend / Services**: Firebase Authentication, Custom Plan AI APIs
- **Native macOS Code**: Swift 5 (compiled during build process)

## Prerequisites

- **macOS** is currently required for development, as the native audio capture scripts rely on macOS system frameworks (CoreAudio, ScreenCaptureKit).
- **Node.js**: v18+ recommended.
- **Yarn**: Used as the primary package manager (`yarn.lock` is present).
- **Swift**: Need Xcode command line tools installed to compile the native `.swift` files.

## Local Development Setup

1. **Clone the repository and install dependencies:**

   ```bash
   yarn install
   ```

2. **Environment Variables:**
   Copy the `.env.example` file to `.env` and fill in your Firebase configuration and API URLs.

   ```bash
   cp .env.example .env
   ```

   **Required variables typically include:**
   - `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, etc.
   - `VITE_PLAN_AI_WEB_URL`
   - `VITE_PLAN_AI_API_URL`

3. **Start the development server:**
   ```bash
   yarn dev
   ```
   _Note: The `predev` script will automatically compile the Swift binaries (`AudioCapture` and `MicActivity`) into the `macos/` directory._

## Building and Packaging

To build the application and package it for macOS (creates a `.dmg` and `.zip`):

```bash
yarn package
```

Or with code signing:

```bash
export CSC_NAME="BLUEBERRYBYTES SERVICES FZCO (8NN84K7QKJ)" && yarn package
```

The output will be placed in the `release/` directory.

- `yarn build`: Compiles the React application and Electron main process.
- `yarn package`: Runs `electron-builder` to package the compiled application into distributable formats. Includes necessary entitlements for macOS microphone and screen recording access (`entitlements.plist`).

## Releases and Versioning (Multi-Tenant)

**Public Releases Bucket:** [https://github.com/blueberrybytes/plan-ai-recorder-releases/releases](https://github.com/blueberrybytes/plan-ai-recorder-releases/releases)

Since introducing White-Labeling, both applications (`BlueberryBytes` and `HouseGroup`) can be compiled and published through the exact same workflow without any code changes.

### Step-by-Step Release Flow

1. **Test the build locally:**
   Run `yarn dev` (Blueberry) or `yarn dev:housegroup` (House Group) to confirm the app looks perfectly fine.

2. **Run the "All-in-One" Release script:**
   Depending on who you are pushing an update for, run **one** of the following commands:
   
   ```bash
   # Para publicar ambas aplicaciones SÍNCRONAMENTE en la misma versión
   yarn release:all

   # Para publicar una update genérica individual de BlueberryBytes
   yarn release:mixed
   
   # Para publicar una update individual de HouseGroup Media
   yarn release:mixed:housegroup
   ```

   **¿Qué hace este comando mágico internamente?**
   - Lanza el script automático que sube el número de versión (Bump Version).
   - Genera el compilado de **Windows (.exe)** y **Linux** inyectando sus logos y su identidad.
   - Sube automáticamente esos binarios a GitHub Releases como "Draft" (ya que tienen el `-p always`). Esto actualizará mágicamente en background a los usuarios de Windows por OTA (Over The Air) gracias a `electron-updater`.
   - Por último, compila el archivo **macOS (.dmg y .mas)** en el ordenador en local y SE SALTA la subida automática a Github (usando `-p never`).

3. **Subir macOS a la Apple App Store:**
   Como los usuarios de Apple requieren de la App Store, coge el archivo que se ha geerado en la carpeta `release/` (por ejemplo: `Plan AI Recorder_1.x.x_mac.pkg`) y arrástralo a la app **Apple Transporter** o súbelo vía **Xcode Organizer**. 

4. **Notificar Update (Opcional):**
   Una vez que **Apple apruebe la versión**, recuerda ir a la Base de Datos o al backend (ej. `versionController.ts`) e incrementar la versión vigente para que el panel web empiece a notificar a los usuarios pidiéndoles actualizar.

## Permissions

When running the application for the first time, macOS will prompt for the following permissions:

- **Microphone**: Needed to hear your voice during meetings.
- **Screen Recording**: Needed by macOS APIs to selectively capture the system audio output of other applications.

## 🤖 AI Development (Repomix)

If you are using AI tools (like Claude, ChatGPT, or Cursor) to help develop this module, you can pack the codebase into a single file by running the `repomix` script from the root repository:

```bash
cd ..
yarn repomix
```

This will automatically exclude tests, `node_modules`, compiled swift binaries, and other built files to keep the context window small and relevant.
