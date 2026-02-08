import { defineConfig } from "vite";

export default defineConfig({
    build: {
        rollupOptions: {
            input: {
                content: "./src/content_script.ts",
                background: "./src/background.ts",
                options: "./src/options.ts",
                popup: "./src/popup.ts",
            },
            output: {
                entryFileNames: (chunk) => {
                    if (chunk.name === "content") return "content_script.js";
                    if (chunk.name === "background") return "background.js";
                    if (chunk.name === "options") return "options.js";
                    if (chunk.name === "popup") return "popup.js";
                    return "[name].js";
                },
            },
        },
        outDir: "dist",
        emptyOutDir: true,
        target: "es2022",
    },
    publicDir: "public",
});
