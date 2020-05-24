const fs = require("fs");
const fse = require("fs-extra");
const rollup = require("rollup");
const build = require("./lib/buildFuncs");
const getSport = require("./lib/getSport");
const replace = require("replace");
const rollupConfig = require("./lib/rollupConfig");

console.log("Bundling JavaScript files...");

const rev = build.genRev();
console.log(rev);

const sport = getSport();

const BLACKLIST = {
	ui: [/\/worker/],
	worker: [/\/ui/, /^react/],
};

const buildFile = async (name, legacy) => {
	const bundle = await rollup.rollup({
		...rollupConfig("production", BLACKLIST[name], `stats-${name}.html`),
		input: `src/${sport}/${name}/index.ts`,
	});

	const outFile = legacy
		? `build/gen/${name}-legacy-${rev}.js`
		: `build/gen/${name}-${rev}.js`;

	await bundle.write({
		compact: true,
		file: outFile,
		format: "iife",
		indent: false,
		name,
		sourcemap: true,
	});

	// Hack because otherwise I'm somehow left with no newline before the souce map URL, which confuses Bugsnag
	replace({
		regex: ";//# sourceMappingURL",
		replacement: ";\n//# sourceMappingURL",
		paths: [outFile],
		silent: true,
	});
};

(async () => {
	try {
		await Promise.all(["ui", "worker"].map(name => buildFile(name)));

		process.env.LEGACY = "LEGACY";
		await Promise.all(["ui", "worker"].map(name => buildFile(name, true)));
		delete process.env.LEGACY;

		build.setTimestamps(rev);

		const realPlayerDataFilename = "build/files/real-player-data.json";
		if (fs.existsSync(realPlayerDataFilename)) {
			const string = fs.readFileSync(realPlayerDataFilename);
			fs.writeFileSync(
				realPlayerDataFilename,
				JSON.stringify(JSON.parse(string)),
			);

			const hash = build.fileHash(string);
			const newFilename = realPlayerDataFilename.replace(
				".json",
				`-${hash}.json`,
			);
			fse.moveSync(realPlayerDataFilename, newFilename);

			replace({
				regex: "/files/real-player-data.json",
				replacement: `/files/real-player-data-${hash}.json`,
				paths: [
					`build/gen/worker-legacy-${rev}.js`,
					`build/gen/worker-${rev}.js`,
				],
				silent: true,
			});
		}
	} catch (error) {
		console.error(error);
		process.exit(1);
	}
})();
