import { describe, it, expect } from 'vitest';
import { formatCitationTool, type FormatCitationInput } from '../../src/tools/format-citation.js';

describe('formatCitationTool', () => {
  it('should return results and metadata', async () => {
    const result = await formatCitationTool({ citation: 'Art. 6:162 BW' });
    expect(result.results).toBeDefined();
    expect(result._metadata).toBeDefined();
  });

  it('should format statute citation in full format', async () => {
    const result = await formatCitationTool({ citation: 'Art. 6:162 BW' });
    expect(result.results.original).toBe('Art. 6:162 BW');
    expect(result.results.formatted).toContain('Burgerlijk Wetboek');
    expect(result.results.format_used).toBe('full');
  });

  it('should format in short format', async () => {
    const result = await formatCitationTool({
      citation: 'Art. 6:162 BW',
      format: 'short',
    });
    expect(result.results.formatted).toBe('Art. 6:162 BW');
    expect(result.results.format_used).toBe('short');
  });

  it('should format in pinpoint format', async () => {
    const result = await formatCitationTool({
      citation: 'Art. 6:162 BW',
      format: 'pinpoint',
    });
    expect(result.results.formatted).toBe('Art. 6:162');
    expect(result.results.format_used).toBe('pinpoint');
  });

  it('should format ECLI citation', async () => {
    const result = await formatCitationTool({ citation: 'ECLI:NL:HR:2019:376' });
    expect(result.results.formatted).toBe('ECLI:NL:HR:2019:376');
  });

  it('should return original for unrecognized citation', async () => {
    const result = await formatCitationTool({ citation: 'random text' });
    expect(result.results.formatted).toBe('random text');
  });

  it('should format flat statute (Sr)', async () => {
    const result = await formatCitationTool({ citation: 'Art. 287 Sr' });
    expect(result.results.formatted).toContain('Wetboek van Strafrecht');
  });

  it('should format with lid reference', async () => {
    const result = await formatCitationTool({ citation: 'Art. 6:162 lid 2 BW' });
    expect(result.results.formatted).toContain('lid 2');
    expect(result.results.formatted).toContain('Burgerlijk Wetboek');
  });

  it('should not require database access', async () => {
    // formatCitationTool takes no db parameter
    const result = await formatCitationTool({ citation: 'Art. 1 Gw' });
    expect(result.results.formatted).toContain('Grondwet');
    // Metadata should still work without db
    expect(result._metadata.data_freshness.staleness_warning).toBeDefined();
  });

  it('should default to full format', async () => {
    const result = await formatCitationTool({ citation: 'Art. 1 Awb' });
    expect(result.results.format_used).toBe('full');
    expect(result.results.formatted).toContain('Algemene wet bestuursrecht');
  });
});
