import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import stylistic from "@stylistic/eslint-plugin";

// Shared config from the spirit-of-the-law-linting skill, without the TypeScript parts:
// this project is plain JavaScript as ES modules.
export default defineConfig([
    globalIgnores(["node_modules/**", "coverage/**"]),
    {
        name: "spirit-of-the-law",
        files: ["**/*.{js,mjs,cjs}"],
        extends: [js.configs.recommended],
        languageOptions: {
            sourceType: "module",
            globals: {
                process: "readonly",
                console: "readonly",
            },
        },
        plugins: {
            "@stylistic": stylistic,
        },
        rules: {
            // Letter of the law: correctness, and formatting that can auto-fix.
            "eqeqeq": ["error", "always"],
            "curly": ["error", "all"],
            "no-debugger": "error",
            "@stylistic/indent": ["error", 4],
            "@stylistic/semi": ["error", "always"],
            "@stylistic/eol-last": ["error", "always"],
            "@stylistic/no-trailing-spaces": "error",

            // Do not enforce quote style or trailing commas, even if a preset turned them on.
            "quotes": "off",
            "@stylistic/quotes": "off",
            "comma-dangle": "off",
            "@stylistic/comma-dangle": "off",

            // Spirit of the law: prefer the readable form. Warn, do not fail the lint.
            "@stylistic/max-len": ["warn", {
                "code": 120,
                "ignoreUrls": true,
                "ignoreStrings": true,
                "ignoreTemplateLiterals": true,
            }],
            "arrow-body-style": ["warn", "always"],
            "no-unused-vars": "warn",
        },
    },
]);
