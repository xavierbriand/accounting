import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

export function setup(): void {
  if (process.env['VITEST_SKIP_BUILD'] === '1') {
    return;
  }
  execSync('npm run build', {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
  });
}
