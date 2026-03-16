# @philiprehberger/next-deploy

[![CI](https://github.com/philiprehberger/next-deploy/actions/workflows/publish.yml/badge.svg)](https://github.com/philiprehberger/next-deploy/actions/workflows/publish.yml)
[![npm version](https://img.shields.io/npm/v/@philiprehberger/next-deploy.svg)](https://www.npmjs.com/package/@philiprehberger/next-deploy)
[![License](https://img.shields.io/github/license/philiprehberger/next-deploy)](LICENSE)

Release-based SSH deployment for Next.js apps with symlinks, dependency caching, and PM2 management.

## Features

- Release-based deployments with atomic symlink switching
- Production dependency caching (skips npm install when lockfile unchanged)
- Automatic old release cleanup
- Shared .env file linking
- PM2 process restart
- Lifecycle hooks (preBuild, postBuild, preSwitch, postSwitch, postDeploy)
- CLI and programmatic API

## Installation

```bash
npm install @philiprehberger/next-deploy
```

## Server Structure

```
/var/www/myapp/
├── releases/
│   ├── 20251212112502/
│   ├── 20251213093015/
│   └── ...
├── current -> releases/20251213093015/
└── shared/
    └── .env
```

## CLI Usage

```bash
npx next-deploy
npx next-deploy --skip-build
npx next-deploy --fresh
npx next-deploy --dry-run
```

## Configuration

### Option 1: Config file (`deploy.config.js`)

```js
module.exports = {
  server: {
    host: 'example.com',
    username: 'deploy',
    privateKeyPath: '~/.ssh/id_rsa',
  },
  paths: {
    basePath: '/var/www/myapp',
  },
  pm2Process: 'myapp',
  filesToTransfer: ['.next', 'public', 'package.json', 'package-lock.json', 'next.config.mjs'],
  releasesToKeep: 5,
};
```

### Option 2: Environment variables

```env
SERVER_HOST=example.com
SERVER_USERNAME=deploy
SERVER_PRIVATE_KEY=~/.ssh/id_rsa
SERVER_BASE_PATH=/var/www/myapp
SERVER_PM2_PROCESS=myapp
RELEASES_TO_KEEP=5
```

## Programmatic API

```ts
import { deploy, loadConfigFromEnv } from '@philiprehberger/next-deploy';

const config = loadConfigFromEnv({
  hooks: {
    postDeploy: (releaseName) => {
      console.log(`Deployed ${releaseName}!`);
    },
  },
});

const result = await deploy(config, { skipBuild: false });
console.log(result.success ? 'Done!' : `Failed: ${result.error}`);
```


## Development

```bash
npm install
npm run build
npm test
```

## License

MIT
