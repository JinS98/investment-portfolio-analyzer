import { describe, expect, it } from 'vitest';
import { pageFromHash } from '@app/navigation';

describe('path aliases', () => {
  it('resolve app modules in the component test environment', () => {
    expect(pageFromHash('#market')).toBe('market');
  });
});
