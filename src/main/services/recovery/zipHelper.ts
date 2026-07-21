/**
 * Thin wrapper around adm-zip so callers get a stable API and a typed
 * error when the dependency is not installed yet.
 *
 * Why dynamic require: package.json has been patched to add adm-zip but
 * `pnpm install` is deferred (store version mismatch in dev env). The
 * dynamic require + `unknown` cast lets `pnpm check` pass on either
 * state, and produces a descriptive runtime error if the module truly
 * isn't there when packAsZip is invoked.
 *
 * Runtime shape (as of adm-zip 0.5.x):
 *   const AdmZip = require("adm-zip");
 *   const z = new AdmZip();
 *   z.addLocalFolder(sourceDir);
 *   z.writeZip(targetPath);
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export class ZipDependencyMissingError extends Error {
	readonly code = "recovery.zip-dependency-missing";
	constructor(cause?: unknown) {
		super(
			"adm-zip is not installed — run `pnpm install` before using packAsZip. " +
				`Underlying: ${cause instanceof Error ? cause.message : String(cause)}`,
		);
		this.name = "ZipDependencyMissingError";
	}
}

interface AdmZipInstance {
	addLocalFolder(sourceDir: string): void;
	writeZip(targetPath: string): void;
}

type AdmZipCtor = new () => AdmZipInstance;

function loadAdmZip(): AdmZipCtor {
	try {
		// Runtime resolve so a missing dependency surfaces as a typed error
		// instead of a module-load failure at import time.
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const mod = require("adm-zip") as unknown;
		// adm-zip exports the ctor as `module.exports = AdmZip`, so `mod`
		// is directly the constructor.
		if (typeof mod !== "function") {
			throw new Error("adm-zip module did not export a constructor");
		}
		return mod as AdmZipCtor;
	} catch (error) {
		throw new ZipDependencyMissingError(error);
	}
}

/**
 * Pack `sourceDir` (recursively) into a `.zip` file at `targetZipPath`.
 * `sourceDir` becomes the top level inside the archive — the caller
 * decides whether the source dir remains on disk after packing.
 */
export function packDirectoryToZip(
	sourceDir: string,
	targetZipPath: string,
): void {
	const AdmZip = loadAdmZip();
	const zip = new AdmZip();
	zip.addLocalFolder(sourceDir);
	zip.writeZip(targetZipPath);
}
