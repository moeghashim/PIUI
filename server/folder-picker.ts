import { spawn } from "node:child_process";

interface ProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export async function chooseWorkspaceFolder(): Promise<string | null> {
  const preset = process.env.PIUI_FOLDER_PICKER_PATH;
  if (preset) return preset;

  if (process.platform === "darwin") {
    const result = await run("osascript", ["-e", 'POSIX path of (choose folder with prompt "Choose a PI workspace")']);
    if (result.code === 0) return selectedPath(result.stdout);
    if (/user canceled|-128/i.test(result.stderr)) return null;
    throw pickerError("macOS", result);
  }

  if (process.platform === "linux") {
    const result = await run("zenity", ["--file-selection", "--directory", "--title=Choose a PI workspace"]);
    if (result.code === 0) return selectedPath(result.stdout);
    if (result.code === 1) return null;
    throw pickerError("Linux", result);
  }

  if (process.platform === "win32") {
    const script = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
      "$dialog.Description = 'Choose a PI workspace'",
      "$dialog.ShowNewFolderButton = $true",
      "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.SelectedPath) }",
    ].join("; ");
    const result = await run("powershell.exe", ["-NoProfile", "-STA", "-Command", script]);
    if (result.code === 0) return selectedPath(result.stdout);
    throw pickerError("Windows", result);
  }

  throw new Error(`Folder selection is not supported on ${process.platform}`);
}

export function selectedPath(stdout: string): string | null {
  const value = stdout.trim();
  return value || null;
}

function run(command: string, args: string[]): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { if (stdout.length < 64_000) stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { if (stderr.length < 64_000) stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function pickerError(platform: string, result: ProcessResult) {
  const detail = result.stderr.trim().slice(0, 400);
  return new Error(`${platform} folder picker failed${detail ? `: ${detail}` : ""}`);
}
