import { defineConfig } from 'vitest/config';
import path from 'path';
export default defineConfig({
    test: {
        alias: {
            '@core': path.resolve(import.meta.dirname, './src/core'),
        },
        exclude: ['**/node_modules/**', '**/.claude/**'],
    },
});
