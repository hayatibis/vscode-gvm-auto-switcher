// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { exec } from "child_process";

let statusBarItem: vscode.StatusBarItem | undefined;

function getConfig() {
  return vscode.workspace.getConfiguration("gvmSwitcher");
}
function getInitPath(): string {
  return expandHome(
    getConfig().get<string>("gvmInitScriptPath") || "~/.gvm/scripts/gvm"
  );
}

function expandHome(filepath: string): string {
  if (!filepath) {
    return filepath;
  }
  if (filepath.startsWith("~")) {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

function normalizeGoVersion(v?: string): string | undefined {
  if (!v) {
    return undefined;
  }
  return v.startsWith("go") ? v : `go${v}`;
}

function readFirstLine(filePath: string): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    fs.open(filePath, "r", (err, fd) => {
      if (err) {
        return resolve(undefined);
      }
      const buffer = Buffer.alloc(256);
      fs.read(fd, buffer, 0, 256, 0, (err2, bytesRead) => {
        if (err2) {
          fs.close(fd, () => {});
          return resolve(undefined);
        }
        const content = buffer.toString("utf8", 0, bytesRead);
        const line = content.split(/\r?\n/)[0];
        fs.close(fd, () => {});
        resolve(line.trim());
      });
    });
  });
}

async function findInWorkspace(filename: string): Promise<string | undefined> {
  if (!vscode.workspace.workspaceFolders) {
    return undefined;
  }

  for (const folder of vscode.workspace.workspaceFolders) {
    const filePath = path.join(folder.uri.fsPath, filename);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  return undefined;
}

async function parseGoFromMod(modPath: string): Promise<string | undefined> {
  try {
    const content = await fs.promises.readFile(modPath, "utf8");
    const match = content.match(/^go\s+([0-9.]+)/m);
    if (match) {
      return match[1];
    }
  } catch (e) {}
  return undefined;
}

async function determineTargets(): Promise<{
  version?: string;
  pkgset?: string;
}> {
  let version: string | undefined = undefined;
  let pkgset: string | undefined = undefined;
  // .go-version
  const goVersionFile = await findInWorkspace(".go-version");
  if (goVersionFile) {
    version = await readFirstLine(goVersionFile);
  }
  // .go-pkgset
  const goPkgsetFile = await findInWorkspace(".go-pkgset");
  if (goPkgsetFile) {
    pkgset = await readFirstLine(goPkgsetFile);
  }
  // go.mod
  if (!version) {
    const goModFile = await findInWorkspace("go.mod");
    if (goModFile) {
      version = await parseGoFromMod(goModFile);
    }
  }
  version = normalizeGoVersion(version);
  return { version, pkgset };
}

function runLoginShell(cmd: string): Promise<string> {
  // Use login shell to get gvm loaded
  return new Promise((resolve, reject) => {
    const shell = process.env.SHELL || "/bin/bash";
    exec(
      `${shell} -l -c '${cmd.replace(/'/g, `'\\''`)}'`,
      (err, stdout, stderr) => {
        if (err) {
          return reject(stderr || stdout || err.message);
        }
        resolve(stdout);
      }
    );
  });
}

async function gvmUse(version?: string): Promise<boolean> {
  const v = normalizeGoVersion(version);
  if (!v) {
    return false;
  }
  const init = getInitPath();
  const cmd = [`[[ -s "${init}" ]] && source "${init}"`, `gvm use ${v}`].join(
    " && "
  );
  try {
    await runLoginShell(cmd);
    return true;
  } catch {
    return false;
  }
}

async function gvmPkgsetUse(pkgset: string): Promise<boolean> {
  const init = getInitPath();
  try {
    await runLoginShell(
      `[[ -s "${init}" ]] && source "${init}" && gvm pkgset use ${pkgset}`
    );
    return true;
  } catch {
    return false;
  }
}

async function gvmPkgsetCreate(pkgset: string): Promise<boolean> {
  const init = getInitPath();
  try {
    await runLoginShell(
      `[[ -s "${init}" ]] && source "${init}" && gvm pkgset create ${pkgset}`
    );
    return true;
  } catch {
    return false;
  }
}

async function useWorkspaceVersion(promptOnFailure = true) {
  const { version, pkgset } = await determineTargets();
  if (!version) {
    if (promptOnFailure) {
      vscode.window.showWarningMessage(
        "No Go version specified in .go-version or go.mod"
      );
    }
    if (statusBarItem) {
      statusBarItem.text = "GVM: No version";
    }
    return;
  }
  const ok = await gvmUse(version);
  if (ok) {
    let pkgsetApplied = true;
    if (pkgset) {
      pkgsetApplied = await gvmPkgsetUse(pkgset);
      if (
        !pkgsetApplied &&
        promptOnFailure &&
        getConfig().get<boolean>("promptToCreatePkgset") === true
      ) {
        const ans = await vscode.window.showWarningMessage(
          `gvm pkgset '${pkgset}' not found. Create it now?`,
          "Yes",
          "No"
        );
        if (ans === "Yes") {
          const created = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Creating pkgset ${pkgset}...`,
            },
            async () => {
              return await gvmPkgsetCreate(pkgset);
            }
          );
          if (created) {
            pkgsetApplied = await gvmPkgsetUse(pkgset);
          }
        }
      }
    }
    if (statusBarItem) {
      statusBarItem.text = `GVM: ${version}${
        pkgset && pkgsetApplied ? " (" + pkgset + ")" : ""
      }`;
    }
    if (promptOnFailure) {
      vscode.window.showInformationMessage(
        `Switched to Go ${version}${
          pkgset && pkgsetApplied ? " pkgset: " + pkgset : ""
        }`
      );
      if (pkgset && !pkgsetApplied) {
        vscode.window.showWarningMessage(`Failed to use pkgset '${pkgset}'`);
      }
    }
  } else {
    if (statusBarItem) {
      statusBarItem.text = `GVM: Failed (${version})`;
    }
    if (promptOnFailure) {
      const label = version + (pkgset ? " (" + pkgset + ")" : "");
      const choice = await vscode.window.showWarningMessage(
        `gvm use failed for ${label}. Install this version with gvm?`,
        "Yes",
        "No"
      );
      if (choice === "Yes") {
        const init = getInitPath();
        const v = normalizeGoVersion(version);
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Installing ${v} via gvm...`,
          },
          async () => {
            await runLoginShell(
              `[[ -s "${init}" ]] && source "${init}" && gvm install ${v}`
            );
          }
        );
        const retryOk = await gvmUse(version);
        if (retryOk) {
          let pkgsetApplied = true;
          if (pkgset) {
            pkgsetApplied = await gvmPkgsetUse(pkgset);
            if (
              !pkgsetApplied &&
              promptOnFailure &&
              getConfig().get<boolean>("promptToCreatePkgset") === true
            ) {
              const ans = await vscode.window.showWarningMessage(
                `gvm pkgset '${pkgset}' not found. Create it now?`,
                "Yes",
                "No"
              );
              if (ans === "Yes") {
                const created = await vscode.window.withProgress(
                  {
                    location: vscode.ProgressLocation.Notification,
                    title: `Creating pkgset ${pkgset}...`,
                  },
                  async () => {
                    return await gvmPkgsetCreate(pkgset);
                  }
                );
                if (created) {
                  pkgsetApplied = await gvmPkgsetUse(pkgset);
                }
              }
            }
          }
          if (statusBarItem) {
            statusBarItem.text = `GVM: ${version}${
              pkgset && pkgsetApplied ? " (" + pkgset + ")" : ""
            }`;
          }
          vscode.window.showInformationMessage(
            `Switched to Go ${version}${
              pkgset && pkgsetApplied ? " pkgset: " + pkgset : ""
            }`
          );
          if (pkgset && !pkgsetApplied) {
            vscode.window.showWarningMessage(
              `Failed to use pkgset '${pkgset}'`
            );
          }
        } else {
          vscode.window.showErrorMessage(
            `Failed to gvm use ${version}${
              pkgset ? " --pkgset=" + pkgset : ""
            } after installation`
          );
        }
      } else {
        vscode.window.showErrorMessage(
          `Failed to gvm use ${version}${pkgset ? " --pkgset=" + pkgset : ""}`
        );
      }
    }
  }
}

export function activate(context: vscode.ExtensionContext) {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.command = "gvmSwitcher.useWorkspaceVersion";
  statusBarItem.text = "GVM: ...";
  statusBarItem.tooltip =
    "Switch Go version using GVM (from .go-version, .go-pkgset, or go.mod)";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Command to manually trigger
  context.subscriptions.push(
    vscode.commands.registerCommand("gvmSwitcher.useWorkspaceVersion", () =>
      useWorkspaceVersion(true)
    )
  );
  // Command to apply from go.mod (for convenience)
  context.subscriptions.push(
    vscode.commands.registerCommand("gvmSwitcher.applyFromGoMod", async () => {
      const goModFile = await findInWorkspace("go.mod");
      if (!goModFile) {
        vscode.window.showWarningMessage("No go.mod found in workspace");
        return;
      }
      const versionRaw = await parseGoFromMod(goModFile);
      const version = normalizeGoVersion(versionRaw);
      if (!version) {
        vscode.window.showWarningMessage("No Go version found in go.mod");
        return;
      }
      const ok = await gvmUse(version);
      if (ok) {
        if (statusBarItem) {
          statusBarItem.text = `GVM: ${version}`;
        }
        vscode.window.showInformationMessage(
          `Switched to Go ${version} (from go.mod)`
        );
      } else {
        if (statusBarItem) {
          statusBarItem.text = `GVM: Failed (${version})`;
        }
        vscode.window.showErrorMessage(`Failed to gvm use ${version}`);
      }
    })
  );

  // Auto switch on terminal open
  context.subscriptions.push(
    vscode.window.onDidOpenTerminal(async (terminal) => {
      // Only auto switch on terminals in workspace
      const cfg = getConfig();
      const prompt = cfg.get<boolean>("promptOnFailure") === true;
      await useWorkspaceVersion(prompt);
      const { version, pkgset } = await determineTargets();
      if (!version) {
        return;
      }
      const init = getInitPath();
      terminal.sendText(`[[ -s "${init}" ]] && source "${init}"`, true);
      terminal.sendText(`gvm use ${version}`, true);
      if (pkgset) terminal.sendText(`gvm pkgset use ${pkgset}`, true);
    })
  );

  // Watch for changes in .go-version, .go-pkgset, go.mod
  const filesToWatch = [".go-version", ".go-pkgset", "go.mod"];
  for (const file of filesToWatch) {
    const watcher = vscode.workspace.createFileSystemWatcher(`**/${file}`);
    watcher.onDidChange(() => useWorkspaceVersion(false));
    watcher.onDidCreate(() => useWorkspaceVersion(false));
    watcher.onDidDelete(() => useWorkspaceVersion(false));
    context.subscriptions.push(watcher);
  }

  // Initial switch
  const cfg = getConfig();
  const prompt = cfg.get<boolean>("promptOnFailure") === true;
  useWorkspaceVersion(prompt);
}

export function deactivate() {
  if (statusBarItem) {
    statusBarItem.dispose();
    statusBarItem = undefined;
  }
}
