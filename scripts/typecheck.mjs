// Type-checks every workspace package that has a tsconfig.json.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';

const dirs = ['packages', 'apps']
  .filter((root) => existsSync(root))
  .flatMap((root) => readdirSync(root).map((name) => `${root}/${name}`))
  .filter((dir) => existsSync(`${dir}/tsconfig.json`));

for (const dir of dirs) {
  console.log(`tsc -p ${dir}`);
  execFileSync('tsc', ['--noEmit', '-p', dir], { stdio: 'inherit' });
}
