import { describe, expect, it } from 'vitest';
import { createGitGraphCustomRenderer } from './GitGraphCustomRenderer';

describe('GitGraphCustomRenderer', () => {
  it('creates a custom renderer config for git graph lanes', () => {
    const renderer = createGitGraphCustomRenderer();

    expect(renderer).toBeDefined();
    expect(typeof renderer).toBe('object');
  });
});
