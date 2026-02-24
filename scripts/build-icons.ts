#!/usr/bin/env tsx
/**
 * 图标转换脚本
 * 将 SVG 图标转换为 macOS 所需的 ICNS 格式和多种尺寸的 PNG
 */

import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import sharp from "sharp";

const SVG_PATH = join(process.cwd(), "build", "icons", "icon.svg");
const OUTPUT_DIR = join(process.cwd(), "build", "icons");

// macOS ICNS 需要的尺寸
const ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024];

// 需要生成的 PNG 尺寸（用于不同场景）
const PNG_SIZES = [16, 32, 64, 128, 256, 512, 1024];

async function convertSvgToPng(size: number): Promise<Buffer> {
	const svgBuffer = await sharp(SVG_PATH)
		.resize(size, size, {
			fit: "contain",
			background: { r: 0, g: 0, b: 0, alpha: 0 },
		})
		.png()
		.toBuffer();
	return svgBuffer;
}

async function generatePngIcons(): Promise<void> {
	console.log("Generating PNG icons...");

	for (const size of PNG_SIZES) {
		const outputPath = join(OUTPUT_DIR, `icon-${size}x${size}.png`);
		const pngBuffer = await convertSvgToPng(size);
		writeFileSync(outputPath, pngBuffer);
		console.log(`  ✓ Generated icon-${size}x${size}.png`);
	}

	// 同时生成一个通用的 icon.png (512x512)
	const iconPngPath = join(OUTPUT_DIR, "icon.png");
	const iconBuffer = await convertSvgToPng(512);
	writeFileSync(iconPngPath, iconBuffer);
	console.log(`  ✓ Generated icon.png (512x512)`);
}

/**
 * 生成 ICNS 文件
 * ICNS 格式由多个图像组成，每个图像有特定的类型标识
 */
async function generateIcns(): Promise<void> {
	console.log("Generating icon.icns...");

	// ICNS 文件头
	const icnsHeader = Buffer.alloc(8);
	icnsHeader.write("icns", 0, 4, "ascii"); // 魔数
	let totalSize = 8; // 从头部大小开始

	const images: Buffer[] = [];

	// 为每个尺寸生成图像
	for (const size of ICNS_SIZES) {
		const pngBuffer = await convertSvgToPng(size);

		// 确定 OS 类型标识
		let osType: string;
		if (size === 16)
			osType = "icp4"; // 16x16
		else if (size === 32)
			osType = "icp5"; // 32x32
		else if (size === 64)
			osType = "icp6"; // 64x64
		else if (size === 128)
			osType = "ic07"; // 128x128
		else if (size === 256)
			osType = "ic08"; // 256x256
		else if (size === 512)
			osType = "ic09"; // 512x512
		else if (size === 1024)
			osType = "ic10"; // 1024x1024 (512@2x)
		else continue;

		// 图像条目: 4字节类型 + 4字节大小 + 数据
		const entrySize = 8 + pngBuffer.length;
		const entry = Buffer.alloc(entrySize);
		entry.write(osType, 0, 4, "ascii");
		entry.writeUInt32BE(entrySize, 4);
		pngBuffer.copy(entry, 8);

		images.push(entry);
		totalSize += entrySize;

		console.log(`  ✓ Added ${size}x${size} (${osType})`);
	}

	// 写入总大小
	icnsHeader.writeUInt32BE(totalSize, 4);

	// 合并所有部分
	const icnsBuffer = Buffer.concat([icnsHeader, ...images], totalSize);

	const icnsPath = join(OUTPUT_DIR, "icon.icns");
	writeFileSync(icnsPath, icnsBuffer);
	console.log(`  ✓ Generated icon.icns`);
}

/**
 * 生成 ICO 文件
 * ICO 格式: ICONDIR header + ICONDIRENTRY 数组 + PNG 数据
 */
async function generateIco(): Promise<void> {
	console.log("Generating icon.ico...");

	const ICO_SIZES = [16, 32, 48, 64, 128, 256];
	const pngBuffers: Buffer[] = [];

	for (const size of ICO_SIZES) {
		pngBuffers.push(await convertSvgToPng(size));
	}

	const numImages = ICO_SIZES.length;
	// ICONDIR: 6 bytes, ICONDIRENTRY: 16 bytes each
	const headerSize = 6 + numImages * 16;
	let dataOffset = headerSize;

	// ICONDIR header
	const header = Buffer.alloc(6);
	header.writeUInt16LE(0, 0); // Reserved
	header.writeUInt16LE(1, 2); // Type: 1 = ICO
	header.writeUInt16LE(numImages, 4); // Number of images

	// ICONDIRENTRY array
	const entries = Buffer.alloc(numImages * 16);
	for (let i = 0; i < numImages; i++) {
		const size = ICO_SIZES[i];
		const pngData = pngBuffers[i];
		const offset = i * 16;

		entries.writeUInt8(size >= 256 ? 0 : size, offset); // Width (0 = 256)
		entries.writeUInt8(size >= 256 ? 0 : size, offset + 1); // Height (0 = 256)
		entries.writeUInt8(0, offset + 2); // Color palette
		entries.writeUInt8(0, offset + 3); // Reserved
		entries.writeUInt16LE(1, offset + 4); // Color planes
		entries.writeUInt16LE(32, offset + 6); // Bits per pixel
		entries.writeUInt32LE(pngData.length, offset + 8); // Image data size
		entries.writeUInt32LE(dataOffset, offset + 12); // Offset to image data

		dataOffset += pngData.length;
		console.log(`  ✓ Added ${size}x${size}`);
	}

	const icoBuffer = Buffer.concat([header, entries, ...pngBuffers]);
	const icoPath = join(OUTPUT_DIR, "icon.ico");
	writeFileSync(icoPath, icoBuffer);
	console.log(`  ✓ Generated icon.ico`);
}

async function generateTrayIcon(): Promise<void> {
	console.log("Generating tray icon...");

	// macOS 托盘图标: 20x20 彩色图标（@2x = 40x40）
	const trayIconPath = join(OUTPUT_DIR, "tray-icon.png");
	const trayIcon2xPath = join(OUTPUT_DIR, "tray-icon@2x.png");

	// 生成 1x (20x20)
	const trayIcon1x = await sharp(SVG_PATH)
		.resize(20, 20, {
			fit: "contain",
			background: { r: 0, g: 0, b: 0, alpha: 0 },
		})
		.png()
		.toBuffer();
	writeFileSync(trayIconPath, trayIcon1x);
	console.log(`  ✓ Generated tray-icon.png (20x20)`);

	// 生成 2x (40x40) 用于 Retina 屏幕
	const trayIcon2x = await sharp(SVG_PATH)
		.resize(40, 40, {
			fit: "contain",
			background: { r: 0, g: 0, b: 0, alpha: 0 },
		})
		.png()
		.toBuffer();
	writeFileSync(trayIcon2xPath, trayIcon2x);
	console.log(`  ✓ Generated tray-icon@2x.png (40x40)`);
}

async function main(): Promise<void> {
	console.log("=== Building Icons ===\n");

	// 确保输出目录存在
	if (!existsSync(OUTPUT_DIR)) {
		mkdirSync(OUTPUT_DIR, { recursive: true });
	}

	// 检查源文件
	if (!existsSync(SVG_PATH)) {
		console.error(`Error: Source icon not found at ${SVG_PATH}`);
		process.exit(1);
	}

	try {
		await generatePngIcons();
		console.log();
		await generateTrayIcon();
		console.log();
		await generateIcns();
		console.log();
		await generateIco();
		console.log("\n=== Icon build complete ===");
	} catch (error) {
		console.error("Error building icons:", error);
		process.exit(1);
	}
}

main();
