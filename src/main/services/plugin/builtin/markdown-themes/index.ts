import { manifest } from "./manifest";
import { source } from "./source";
import { marketInfo } from "./market";
import { css as newsprintCss } from "./themes/newsprint";
import { css as vueGreenCss } from "./themes/vue-green";
import { css as draculaCss } from "./themes/dracula";
import { css as solarizedLightCss } from "./themes/solarized-light";
import { css as nordCss } from "./themes/nord";
import { css as monokaiCss } from "./themes/monokai";
import { css as githubDimmedCss } from "./themes/github-dimmed";
import { css as oneDarkCss } from "./themes/one-dark";

const extraFiles: Record<string, string> = {
	"newsprint.css": newsprintCss,
	"vue-green.css": vueGreenCss,
	"dracula.css": draculaCss,
	"solarized-light.css": solarizedLightCss,
	"nord.css": nordCss,
	"monokai.css": monokaiCss,
	"github-dimmed.css": githubDimmedCss,
	"one-dark.css": oneDarkCss,
};

export { manifest, source, extraFiles, marketInfo };
