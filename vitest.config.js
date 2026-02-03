import { defineConfig } from 'vitest/config';
import path from 'path';
export default defineConfig({
    test: {
        alias: {
            '@core': path.resolve(__dirname, './src/core'),
        },
    },
});
