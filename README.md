# @philiprehberger/next-deploy

[![CI](https://github.com/philiprehberger/next-deploy/actions/workflows/ci.yml/badge.svg)](https://github.com/philiprehberger/next-deploy/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@philiprehberger/next-deploy.svg)](https://www.npmjs.com/package/@philiprehberger/next-deploy)
[![Last updated](https://img.shields.io/github/last-commit/philiprehberger/next-deploy)](https://github.com/philiprehberger/next-deploy/commits/main)

Release-based SSH deployment for Next.js apps with symlinks, dependency caching, and PM2 management

## Installation

```bash
npm install @philiprehberger/next-deploy
```

## Usage

### Server Structure

```
/var/www/myapp/
├── releases/
│   ├── 20251212112502/
│   ├── 20251213093015/
│   └── ..
├── current -> releases/20251213093015/
└── shared/
    └── .env
```

### CLI

```bash
npx next-deploy
npx next-deploy --skip-build
npx next-deploy --fresh
npx next-deploy --dry-run
```

### Configuration

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

### Programmatic API

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

## API

| Method | Description |
|--------|-------------|
| `deploy(config, options?)` | Run a full deployment with the given config and options |
| `loadConfig(projectRoot)` | Load deploy config from a config file in the project root |
| `loadConfigFromEnv(overrides?)` | Load deploy config from environment variables with optional overrides |

## Development

```bash
npm install
npm run build
npm test
```

## Support

If you find this project useful:

⭐ [Star the repo](https://github.com/philiprehberger/next-deploy)

🐛 [Report issues](https://github.com/philiprehberger/next-deploy/issues?q=is%3Aissue+is%3Aopen+label%3Abug)

💡 [Suggest features](https://github.com/philiprehberger/next-deploy/issues?q=is%3Aissue+is%3Aopen+label%3Aenhancement)

❤️ [Sponsor development](https://github.com/sponsors/philiprehberger)

🌐 [All Open Source Projects](https://philiprehberger.com/open-source-packages)

💻 [GitHub Profile](https://github.com/philiprehberger)

🔗 [LinkedIn Profile](https://www.linkedin.com/in/philiprehberger)

## License

[MIT](LICENSE)
