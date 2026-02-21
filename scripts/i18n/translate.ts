import Anthropic from "@anthropic-ai/sdk";
import chalk from "chalk";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCALES_DIR = path.resolve(
	__dirname,
	"../../src/renderer/src/i18n/locales",
);
const BASE_LANG = "zh";

// Initialize Anthropic client
const apiKey =
	process.env.ANTHROPIC_API_KEY ||
	process.env.AI_TRANSLATE_KEY ||
	process.env.VITE_ANTHROPIC_API_KEY;
if (!apiKey) {
	console.error(
		chalk.red(
			"Error: ANTHROPIC_API_KEY, AI_TRANSLATE_KEY, or VITE_ANTHROPIC_API_KEY environment variable is required.",
		),
	);
	process.exit(1);
}

const anthropic = new Anthropic({
	apiKey: apiKey,
});

function loadJson(filePath: string): any {
	if (!fs.existsSync(filePath)) return {};
	return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function saveJson(filePath: string, data: any) {
	fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

// Helper to set nested value
function setNested(obj: any, path: string, value: any) {
	const keys = path.split(".");
	let current = obj;
	for (let i = 0; i < keys.length - 1; i++) {
		const key = keys[i];
		if (!current[key] || typeof current[key] !== "object") {
			current[key] = {};
		}
		current = current[key];
	}
	current[keys[keys.length - 1]] = value;
}

// Flatten object to dot notation
function flatten(obj: any, prefix = ""): Record<string, string> {
	const result: Record<string, string> = {};
	for (const key in obj) {
		if (typeof obj[key] === "object" && obj[key] !== null) {
			Object.assign(result, flatten(obj[key], prefix + key + "."));
		} else {
			result[prefix + key] = obj[key];
		}
	}
	return result;
}

async function _translateText(
	text: string,
	targetLang: string,
): Promise<string> {
	try {
		const prompt = `Translate the following text from Chinese to ${targetLang}. Only return the translated text, do not include any other characters or explanations.\n\n${text}`;

		const message = await anthropic.messages.create({
			model: "claude-3-haiku-20240307",
			max_tokens: 1000,
			messages: [{ role: "user", content: prompt }],
		});

		const content = message.content[0];
		if (content.type === "text") {
			return content.text.trim();
		}
		return text; // Fallback
	} catch (error) {
		console.error(chalk.red(`Translation failed for: ${text}`), error);
		return text;
	}
}

async function translateBatch(
	texts: Record<string, string>,
	targetLang: string,
): Promise<Record<string, string>> {
	if (Object.keys(texts).length === 0) return {};

	console.log(
		chalk.yellow(
			`Translating ${Object.keys(texts).length} keys to ${targetLang}...`,
		),
	);

	// Prepare a JSON string for the model to translate
	const contentToTranslate = JSON.stringify(texts, null, 2);

	const prompt = `You are a professional translator. Translate the values in the following JSON object from Chinese (zh) to ${targetLang}.
    Keep the keys exactly the same. Return ONLY the valid JSON object. Do not include markdown formatting like \`\`\`json.

    ${contentToTranslate}`;

	try {
		const message = await anthropic.messages.create({
			model: "claude-3-haiku-20240307",
			max_tokens: 4000,
			messages: [{ role: "user", content: prompt }],
		});

		const content = message.content[0];
		if (content.type === "text") {
			let jsonStr = content.text.trim();
			// Clean up if model adds markdown
			jsonStr = jsonStr.replace(/^```json\s*/, "").replace(/\s*```$/, "");
			try {
				return JSON.parse(jsonStr);
			} catch (e) {
				console.error(chalk.red("Failed to parse AI response as JSON"), e);
				console.log("Response:", jsonStr);
				return {};
			}
		}
	} catch (error) {
		console.error(chalk.red("Batch translation failed"), error);
	}
	return {};
}

async function run() {
	console.log(chalk.blue("Starting AI translation..."));

	const baseDir = path.join(LOCALES_DIR, BASE_LANG);
	const baseFiles = fs.readdirSync(baseDir).filter((f) => f.endsWith(".json"));
	const languages = fs
		.readdirSync(LOCALES_DIR)
		.filter(
			(f) =>
				f !== BASE_LANG && fs.statSync(path.join(LOCALES_DIR, f)).isDirectory(),
		);

	for (const lang of languages) {
		console.log(chalk.cyan(`\nProcessing language: ${lang}`));
		const langDir = path.join(LOCALES_DIR, lang);

		for (const file of baseFiles) {
			const baseFilePath = path.join(baseDir, file);
			const targetFilePath = path.join(langDir, file);

			const baseContent = loadJson(baseFilePath);
			const targetContent = loadJson(targetFilePath);

			const baseFlat = flatten(baseContent);
			const targetFlat = flatten(targetContent);

			const missingKeys: Record<string, string> = {};

			for (const key in baseFlat) {
				if (!Object.hasOwn(targetFlat, key)) {
					missingKeys[key] = baseFlat[key];
				}
			}

			if (Object.keys(missingKeys).length > 0) {
				console.log(
					chalk.yellow(
						`  File: ${file} - Found ${Object.keys(missingKeys).length} missing keys`,
					),
				);

				// Translate in batch
				const translated = await translateBatch(missingKeys, lang);

				// Merge back
				for (const key in translated) {
					setNested(targetContent, key, translated[key]);
				}

				// Check if any keys failed to translate (returned as empty or original?) - Here we just trust the result or existing
				// If batch failed, we might want to fallback or retry, but for now we skip saving if empty
				if (Object.keys(translated).length > 0) {
					saveJson(targetFilePath, targetContent);
					console.log(chalk.green(`  Updated ${file}`));
				}
			} else {
				console.log(chalk.gray(`  File: ${file} - Up to date`));
			}
		}
	}
	console.log(chalk.green("\nTranslation complete!"));
}

run();
