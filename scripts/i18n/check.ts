import chalk from "chalk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCALES_DIR = path.resolve(
	__dirname,
	"../../src/renderer/src/i18n/locales",
);
const BASE_LANG = "zh";

function getFiles(dir: string): string[] {
	const dirents = fs.readdirSync(dir, { withFileTypes: true });
	const files = dirents.map((dirent) => {
		const res = path.resolve(dir, dirent.name);
		return dirent.isDirectory() ? getFiles(res) : res;
	});
	return Array.prototype.concat(...files);
}

function loadJson(filePath: string): any {
	return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function getKeys(obj: any, prefix = ""): string[] {
	let keys: string[] = [];
	for (const key in obj) {
		if (typeof obj[key] === "object" && obj[key] !== null) {
			keys = keys.concat(getKeys(obj[key], prefix + key + "."));
		} else {
			keys.push(prefix + key);
		}
	}
	return keys;
}

function check() {
	console.log(chalk.blue("Starting i18n check..."));

	const baseDir = path.join(LOCALES_DIR, BASE_LANG);
	if (!fs.existsSync(baseDir)) {
		console.error(chalk.red(`Base language directory not found: ${baseDir}`));
		process.exit(1);
	}

	const baseFiles = fs.readdirSync(baseDir).filter((f) => f.endsWith(".json"));
	const languages = fs
		.readdirSync(LOCALES_DIR)
		.filter(
			(f) =>
				f !== BASE_LANG && fs.statSync(path.join(LOCALES_DIR, f)).isDirectory(),
		);

	let hasError = false;

	for (const lang of languages) {
		console.log(chalk.cyan(`Checking language: ${lang}`));
		const langDir = path.join(LOCALES_DIR, lang);

		for (const file of baseFiles) {
			const baseFilePath = path.join(baseDir, file);
			const targetFilePath = path.join(langDir, file);

			if (!fs.existsSync(targetFilePath)) {
				console.error(chalk.red(`  Missing file: ${file}`));
				hasError = true;
				continue;
			}

			const baseContent = loadJson(baseFilePath);
			const targetContent = loadJson(targetFilePath);

			const baseKeys = getKeys(baseContent);
			const targetKeys = getKeys(targetContent);

			const missingKeys = baseKeys.filter((k) => !targetKeys.includes(k));

			if (missingKeys.length > 0) {
				console.error(chalk.yellow(`  File: ${file}`));
				missingKeys.forEach((k) => {
					console.error(chalk.red(`    Missing key: ${k}`));
				});
				hasError = true;
			}
		}
	}

	if (hasError) {
		console.error(chalk.red("\ni18n check failed. Please fix missing keys."));
		process.exit(1);
	} else {
		console.log(chalk.green("\ni18n check passed!"));
	}
}

check();
