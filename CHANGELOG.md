# Changelog

All notable changes to the vscode-gvm-auto-switcher extension will be documented in this file.

## [0.1.0] - 2025-09-16
### Added
- Auto `gvm use` on startup and when opening a new terminal.
- Prompt to install missing Go versions (`gvm install`) when not found.
- Support for `.go-pkgset` files: run `gvm pkgset use`.
- Prompt to create missing pkgsets (`gvm pkgset create`) if configured.
- Status bar indicator showing current Go version and pkgset.
- Extension settings:
  - `gvmSwitcher.gvmInitScriptPath`
  - `gvmSwitcher.promptOnFailure`
  - `gvmSwitcher.promptToCreatePkgset`
- Multi-line terminal injection for better zsh/Powerlevel10k compatibility.

## [0.1.2] - 2025-09-16
### Changed
- Added icon to extension manifest for Marketplace listing.
- Minor internal cleanup and packaging adjustments.