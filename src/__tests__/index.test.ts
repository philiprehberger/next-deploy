import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('next-deploy', async () => {
  const mod = await import('../../dist/index.js');

  it('exports deploy as a function', () => {
    assert.ok(typeof mod.deploy === 'function');
  });

  it('exports loadConfigFromEnv as a function', () => {
    assert.ok(typeof mod.loadConfigFromEnv === 'function');
  });
});
