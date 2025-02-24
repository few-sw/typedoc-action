import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import core from '@actions/core';
import { exec } from '@actions/exec';

const entry = core.getInput('entry') || 'src/index.ts';
const name = core.getInput('name');
const configFile = core.getInput('config')
const pnpmInput = core.getInput('pnpm') || 'false';
const packageManager = pnpmInput === 'true' ? 'pnpm' : 'npm';

const defaultTsconfig = `{
  "compilerOptions": {
    "lib": ["DOM", "ESNext"]
  }
}
`;

try {
  const packageJson = await getPackageJson();
  const tsVersion = getTsVersion(packageJson);
  const { hasTsConfig, tsConfigPath } = await ensureTsConfig();

  if (!existsSync('node_modules')) {
    core.warning('node_modules is not present. Running `npm install`...');
    await exec(packageManager, ['install']);
  }

  await writeTypedocJson(name || packageJson.name, tsConfigPath);

  if (tsVersion) {
    // Install the same version of TypeScript as the project.
    await exec(packageManager, ['install', `typescript@${tsVersion}`, '-w']);
  }

  const args = [
    fileURLToPath(new URL('node_modules/typedoc/bin/typedoc', import.meta.url)),
  ];

  await exec('node', args, {
    cwd: fileURLToPath(new URL('.', import.meta.url)),
  });
  if (!hasTsConfig) {
    await fs.unlink(tsConfigPath);
  }
} catch (error) {
  core.setFailed(error);
}

async function writeTypedocJson(name, tsConfigPath) {
  /**
   * @type {import('typedoc').TypeDocOptions}
   */
  const options = {
    out: path.resolve('docs'),
    name,
    emit: "both",
    skipErrorChecking: true,
    excludePrivate: true,
    hideGenerator: false,
    githubPages: true,
    tsconfig: path.resolve(tsConfigPath),
    entryPoints: entry.split(/ +/).map((entry) => path.resolve(entry)),
    plugin: ['typedoc-plugin-katex'],
    // typedoc-plugin-katex plugin options
    katex: {
      options: {
        delimiters: [{ left: '$', right: '$', display: true }],
        fleqn: 'true',
        leqno: 'false',
      },
    },
  };
  await fs.writeFile(
    new URL('typedoc.json', import.meta.url),
    JSON.stringify(options, null, 2),
  );
}

async function getPackageJson() {
  return JSON.parse(await fs.readFile('package.json', 'utf-8'));
}

async function ensureTsConfig() {
  let has = true;
  if (configFile) {
    return { hasTsConfig: has, tsConfigPath: path.resolve(configFile) };
  }
  if (!existsSync('tsconfig.json')) {
    has = false;
    await fs.writeFile('tsconfig.json', defaultTsconfig);
  }
  return { hasTsConfig: has, tsConfigPath: path.resolve('tsconfig.json') };
}

function getTsVersion(packageJson) {
  const deps = packageJson.dependencies || {};
  const devDeps = packageJson.devDependencies || {};
  const tsVersion = deps.typescript || devDeps.typescript;
  return tsVersion || null;
}
