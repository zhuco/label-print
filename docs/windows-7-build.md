# Windows 7 legacy build

The normal desktop build targets supported Windows versions. The Win7 build is
an isolated compatibility candidate and does not change the main Rust manifest
or lock file.

Run from the repository root:

```powershell
pnpm build:win7
```

Build the NSIS installer (it skips Evergreen WebView2 installation):

```powershell
pnpm build:win7-installer
```

Both installer builds publish into the repository-level `release` directory:

- `label-desktop_<version>_win11_x64.msi`
- `label-desktop_<version>_win7_x64.exe`

Build both in sequence with:

```powershell
pnpm build:all-installers
```

The script performs these steps:

1. installs Rust 1.77.2 through rustup when needed;
2. builds the frontend;
3. creates a temporary source staging directory under `target-win7`;
4. pins the verified Win7 dependency set and applies the Rust 1.77-compatible
   `lopdf` reservation patch inside staging only, and disables WinRT OCR in
   favor of the existing Tesseract OCR fallback;
5. builds `target-win7/release/label-desktop.exe` with Tauri's custom protocol,
   so frontend assets are embedded and no localhost server is required; the
   Microsoft C runtime is linked statically for unpatched Win7 machines;
6. fails if its PE import table contains a known post-Win7 API.

To re-run only the import audit:

```powershell
pnpm check:win7-imports
```

Passing the import audit proves that the original static-import startup failure
is absent. It does not prove complete Windows 7 support. Before distribution,
test installation, startup, PDF creation, barcode/OCR, SQLite data, and physical
printer output on fully patched Windows 7 SP1 x64. The NSIS installer skips
WebView2 installation because the current Evergreen runtime cannot run on
Win7. The target PC must already have a Win7-compatible WebView2 109 runtime;
a future fully-offline bundle should package that fixed runtime explicitly.
