import { manifest } from "./manifest";
import { source } from "./source";
import { marketInfo } from "./market";
import * as oceanBlue from "./themes/ocean-blue";
import * as roseGold from "./themes/rose-gold";
import * as forestGreen from "./themes/forest-green";

const extraFiles: Record<string, string> = {
	"ocean-blue.css": oceanBlue.css,
	"ocean-blue.tokens.json": oceanBlue.tokens,
	"rose-gold.css": roseGold.css,
	"rose-gold.tokens.json": roseGold.tokens,
	"forest-green.css": forestGreen.css,
	"forest-green.tokens.json": forestGreen.tokens,
};

export { manifest, source, extraFiles, marketInfo };
