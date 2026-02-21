/**
 * @scp/image — 内置图片生成工具
 * 接入 Silicon Flow（硅基流动）图片生成 API
 */

import { storeManager } from "../../../../store/StoreManager";
import type { InternalMcpServer, InternalToolHandler } from "../types";

const API_ENDPOINT = "https://api.siliconflow.cn/v1/images/generations";
const DEFAULT_MODEL = "black-forest-labs/FLUX.1-schnell";
const DEFAULT_IMAGE_SIZE = "1024x1024";
const REQUEST_TIMEOUT = 60_000; // 60s

function textResult(text: string, isError = false) {
	return { content: [{ type: "text" as const, text }], isError };
}

const generateImageHandler: InternalToolHandler = async (args) => {
	const prompt = args.prompt as string;
	if (!prompt || typeof prompt !== "string") {
		return textResult("Error: prompt is required", true);
	}

	const apiKey = storeManager.getConfig("siliconFlowApiKey") as
		| string
		| undefined;
	if (!apiKey) {
		return textResult(
			"Error: Silicon Flow API Key not configured. Please call the `configure_api_key` tool first to set your API key.",
			true,
		);
	}

	const model = (args.model as string) || DEFAULT_MODEL;
	const imageSize = (args.image_size as string) || DEFAULT_IMAGE_SIZE;
	const negativePrompt = args.negative_prompt as string | undefined;
	const seed = args.seed as number | undefined;
	const numInferenceSteps = args.num_inference_steps as number | undefined;
	const guidanceScale = args.guidance_scale as number | undefined;

	const requestBody: Record<string, unknown> = {
		model,
		prompt,
		image_size: imageSize,
		batch_size: 1,
	};

	if (negativePrompt) requestBody.negative_prompt = negativePrompt;
	if (seed !== undefined) requestBody.seed = seed;
	if (numInferenceSteps !== undefined)
		requestBody.num_inference_steps = numInferenceSteps;
	if (guidanceScale !== undefined) requestBody.guidance_scale = guidanceScale;

	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

		const response = await fetch(API_ENDPOINT, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(requestBody),
			signal: controller.signal,
		});

		clearTimeout(timer);

		if (!response.ok) {
			const errorText = await response.text();
			return textResult(`API error (${response.status}): ${errorText}`, true);
		}

		const data = (await response.json()) as {
			images?: Array<{ url: string }>;
			seed?: number;
		};

		if (!data.images || data.images.length === 0) {
			return textResult("Error: No images returned from API", true);
		}

		const imageUrl = data.images[0].url;
		const resultSeed = data.seed ?? seed ?? "random";

		const text = [
			`![Generated Image](${imageUrl})`,
			"",
			`**Model**: ${model} | **Size**: ${imageSize} | **Seed**: ${resultSeed}`,
		].join("\n");

		return textResult(text);
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return textResult(`Image generation error: ${msg}`, true);
	}
};

const configureApiKeyHandler: InternalToolHandler = async (args) => {
	const apiKey = args.api_key as string;
	if (!apiKey || typeof apiKey !== "string") {
		return textResult("Error: api_key is required", true);
	}

	storeManager.setConfig("siliconFlowApiKey", apiKey);
	return textResult("Silicon Flow API Key has been saved successfully.");
};

export function createImageGenServer(): InternalMcpServer {
	const handlers = new Map<string, InternalToolHandler>();
	handlers.set("generate_image", generateImageHandler);
	handlers.set("configure_api_key", configureApiKeyHandler);

	return {
		id: "@scp/image",
		name: "@scp/image",
		description:
			"Image generation tools powered by Silicon Flow API (FLUX, Stable Diffusion, etc.)",
		version: "1.0.0",
		tools: [
			{
				name: "generate_image",
				description:
					"Generate an image from a text prompt using Silicon Flow API. Returns a markdown image link. Supports models like FLUX.1-schnell, Stable Diffusion XL, Kolors, etc.",
				inputSchema: {
					type: "object",
					properties: {
						prompt: {
							type: "string",
							description: "Text description of the image to generate",
						},
						negative_prompt: {
							type: "string",
							description:
								"Things to exclude from the generated image (e.g. 'blurry, low quality')",
						},
						model: {
							type: "string",
							description: `Model to use (default: ${DEFAULT_MODEL})`,
						},
						image_size: {
							type: "string",
							description: `Image size (default: ${DEFAULT_IMAGE_SIZE}). Common sizes: 512x512, 768x768, 1024x1024, 1024x576, 576x1024`,
						},
						seed: {
							type: "number",
							description: "Random seed for reproducible results",
						},
						num_inference_steps: {
							type: "number",
							description:
								"Number of inference steps (higher = better quality but slower)",
						},
						guidance_scale: {
							type: "number",
							description:
								"Guidance scale for prompt adherence (typical range: 1-20, default varies by model)",
						},
					},
					required: ["prompt"],
				},
			},
			{
				name: "configure_api_key",
				description:
					"Save your Silicon Flow API key for image generation. Get your key from https://cloud.siliconflow.cn/",
				inputSchema: {
					type: "object",
					properties: {
						api_key: {
							type: "string",
							description: "Your Silicon Flow API key",
						},
					},
					required: ["api_key"],
				},
			},
		],
		handlers,
	};
}
