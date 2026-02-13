import { describe, it, expect } from 'vitest';
import { formatCitation } from '../../src/citation/formatter.js';

describe('formatCitation', () => {
  it('should format statute in full format', () => {
    const result = formatCitation('Art. 6:162 BW', 'full');
    expect(result).toContain('Burgerlijk Wetboek');
    expect(result).toContain('Art. 6:162');
  });

  it('should format statute in short format', () => {
    const result = formatCitation('Art. 6:162 BW', 'short');
    expect(result).toBe('Art. 6:162 BW');
  });

  it('should format statute in pinpoint format', () => {
    const result = formatCitation('Art. 6:162 BW', 'pinpoint');
    expect(result).toBe('Art. 6:162');
  });

  it('should include lid in formatting', () => {
    const result = formatCitation('Art. 6:162 lid 2 BW', 'short');
    expect(result).toBe('Art. 6:162 lid 2 BW');
  });

  it('should format flat statute (no book)', () => {
    const result = formatCitation('art. 287 Sr', 'full');
    expect(result).toContain('Wetboek van Strafrecht');
    expect(result).toContain('Art. 287');
  });

  it('should pass through ECLI unchanged', () => {
    expect(formatCitation('ECLI:NL:HR:2019:376')).toBe('ECLI:NL:HR:2019:376');
  });

  it('should return original for invalid citations', () => {
    expect(formatCitation('invalid')).toBe('invalid');
  });
});
