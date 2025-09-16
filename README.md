# GVM Auto Switcher (VS Code)

Auto-switch Go versions with gvm, like nvm for Node.js.

## Features

- Automatically run `gvm use` when opening a workspace with a `.go-version` file.
- Prompt to install missing Go versions via gvm.
- Support for `.go-pkgset` files with prompt to auto-create missing pkgsets.
- Status bar indicator showing the current Go version and pkgset.
- Option to update workspace `go.goroot` and `go.gopath` settings automatically.

## Installation

1. Install [gvm (Go Version Manager)](https://github.com/moovweb/gvm) on your system.
2. Install this extension from the VS Code Marketplace or via VSIX.
3. Reload VS Code to activate the extension.

## Usage

Place a `.go-version` file in your project root containing the Go version you want to use, for example:

```
go1.18
```

Optionally, add a `.go-pkgset` file to specify a gvm package set:

```
my-pkgset
```

When you open the workspace, the extension will automatically run `gvm use` with the specified version and pkgset. If the version or pkgset does not exist, you will be prompted to install or create them.

## Configuration

The extension contributes the following settings:

- `gvmAutoSwitcher.updateGoEnv`:  
  *boolean* (default: `true`)  
  Update workspace `go.goroot` and `go.gopath` settings automatically after switching Go versions.

- `gvmAutoSwitcher.promptOnMissingVersion`:  
  *boolean* (default: `true`)  
  Prompt to install missing Go versions when detected.

- `gvmAutoSwitcher.promptOnMissingPkgset`:  
  *boolean* (default: `true`)  
  Prompt to create missing pkgsets when detected.

- `gvmAutoSwitcher.statusBar.enabled`:  
  *boolean* (default: `true`)  
  Show Go version and pkgset in the status bar.

## Notes

- This extension currently supports macOS, Linux, and WSL environments only.
- It is compatible with `zsh` and Powerlevel10k multi-line prompt injection.
- Ensure your shell environment loads gvm properly for the extension to work.

## License

MIT © Hayati
