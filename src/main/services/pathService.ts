import { app, ipcMain } from "electron";
import fs from "fs";
import path from "path";

export class PathService {
	private baseDir: string;
	private binDir: string;
	private isDev: boolean;

	constructor() {
		this.isDev = !app.isPackaged;
		const homeDir = app.getPath("home");
		const appName = "super-client-r";

		// Create base directory: ~/.super-client-r/{dev|release}
		this.baseDir = path.join(
			homeDir,
			`.${appName}`,
			this.isDev ? "dev" : "release",
		);
		this.binDir = path.join(this.baseDir, "bin");

		this.initDirectories();
		this.registerIpc();
	}

	private initDirectories() {
		const dirs = [
			this.baseDir,
			this.binDir,
			path.join(this.baseDir, "logs"),
			path.join(this.baseDir, "deps"),
			path.join(this.baseDir, "db"),
		];

		dirs.forEach((dir) => {
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}
		});
	}

	private registerIpc() {
		ipcMain.handle("get-app-paths", () => {
			return {
				base: this.baseDir,
				bin: this.binDir,
				logs: path.join(this.baseDir, "logs"),
				deps: path.join(this.baseDir, "deps"),
				db: path.join(this.baseDir, "db"),
			};
		});

		ipcMain.handle("register-bin-to-path", async () => {
			return this.addToPath();
		});
	}

	private addToPath(): Promise<{ success: boolean; message: string }> {
		return new Promise((resolve) => {
			const shell = process.env.SHELL;
			if (!shell) {
				resolve({ success: false, message: "Could not detect shell" });
				return;
			}

			const rcFile = shell.includes("zsh") ? ".zshrc" : ".bash_profile";
			const rcPath = path.join(app.getPath("home"), rcFile);
			const exportCmd = `\nexport PATH="$PATH:${this.binDir}"\n`;

			fs.readFile(rcPath, "utf8", (err, data) => {
				if (err && err.code !== "ENOENT") {
					resolve({
						success: false,
						message: `Failed to read ${rcFile}: ${err.message}`,
					});
					return;
				}

				if (data && data.includes(this.binDir)) {
					resolve({ success: true, message: "Path already registered" });
					return;
				}

				fs.appendFile(rcPath, exportCmd, (err) => {
					if (err) {
						resolve({
							success: false,
							message: `Failed to write to ${rcFile}: ${err.message}`,
						});
					} else {
						resolve({
							success: true,
							message: `Added to ${rcFile}. Please restart your terminal.`,
						});
					}
				});
			});
		});
	}

	public getPaths() {
		return {
			base: this.baseDir,
			bin: this.binDir,
		};
	}
}

export const pathService = new PathService();
