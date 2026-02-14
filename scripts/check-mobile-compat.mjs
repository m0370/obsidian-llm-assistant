import { readFileSync, statSync } from "fs";

const MAIN_JS = "main.js";

const FORBIDDEN_PATTERNS = [
	{ pattern: /require\s*\(\s*['"]fs['"]\s*\)/g, desc: "require('fs')" },
	{ pattern: /require\s*\(\s*['"]path['"]\s*\)/g, desc: "require('path')" },
	{ pattern: /require\s*\(\s*['"]child_process['"]\s*\)/g, desc: "require('child_process')" },
	{ pattern: /require\s*\(\s*['"]electron['"]\s*\)/g, desc: "require('electron')" },
	{ pattern: /require\s*\(\s*['"]crypto['"]\s*\)/g, desc: "require('crypto')" },
	{ pattern: /process\.env/g, desc: "process.env" },
	{ pattern: /\(\?<=/g, desc: "Regex lookbehind (?<=...)" },
];

try {
	const content = readFileSync(MAIN_JS, "utf-8");
	const stats = statSync(MAIN_JS);
	const sizeKB = (stats.size / 1024).toFixed(1);

	console.log("=== Mobile Compatibility Check ===\n");
	console.log(`Bundle size: ${sizeKB} KB`);

	let hasErrors = false;

	for (const { pattern, desc } of FORBIDDEN_PATTERNS) {
		const matches = content.match(pattern);
		if (matches) {
			console.log(`❌ FOUND: ${desc} (${matches.length} occurrence(s))`);
			hasErrors = true;
		} else {
			console.log(`✅ OK: No ${desc}`);
		}
	}

	console.log("");

	if (hasErrors) {
		console.log("❌ MOBILE COMPATIBILITY CHECK FAILED");
		process.exit(1);
	} else {
		console.log("✅ ALL CHECKS PASSED");
	}
} catch (err) {
	console.error(`Error: ${err.message}`);
	console.error("Make sure to run 'npm run build' first.");
	process.exit(1);
}
