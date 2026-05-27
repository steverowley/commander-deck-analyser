import { describe, it, expect } from 'vitest';
import { buildBugReportBody } from './bugReport.js';

describe('buildBugReportBody', () => {
  it('includes the description under a "What went wrong" heading', () => {
    const out = buildBugReportBody({
      description: 'Roll button hung at bracket 5',
      steps: '',
      includeEnv: false,
    });
    expect(out).toContain('### What went wrong');
    expect(out).toContain('Roll button hung at bracket 5');
  });

  it('omits the Steps section when steps is empty or whitespace', () => {
    const a = buildBugReportBody({ description: 'x', steps: '', includeEnv: false });
    const b = buildBugReportBody({ description: 'x', steps: '   \n  ', includeEnv: false });
    expect(a).not.toContain('### Steps to reproduce');
    expect(b).not.toContain('### Steps to reproduce');
  });

  it('includes Steps when provided', () => {
    const out = buildBugReportBody({
      description: 'x',
      steps: '1. open modal\n2. click submit',
      includeEnv: false,
    });
    expect(out).toContain('### Steps to reproduce');
    expect(out).toContain('1. open modal');
  });

  it('emits Environment block with version, UA, URL when includeEnv is true', () => {
    const out = buildBugReportBody({
      description: 'x',
      steps: '',
      includeEnv: true,
      version: '0.13.0',
      userAgent: 'Mozilla/5.0 Test',
      url: 'https://example.com/foo',
    });
    expect(out).toContain('### Environment');
    expect(out).toContain('**Vault version:** 0.13.0');
    expect(out).toContain('**User agent:** Mozilla/5.0 Test');
    expect(out).toContain('**URL:** https://example.com/foo');
  });

  it('omits Environment block when includeEnv is false', () => {
    const out = buildBugReportBody({
      description: 'x',
      steps: '',
      includeEnv: false,
      version: '0.13.0',
      userAgent: 'Mozilla/5.0 Test',
      url: 'https://example.com/foo',
    });
    expect(out).not.toContain('### Environment');
    expect(out).not.toContain('0.13.0');
  });

  it('falls back to "unknown" version when none provided', () => {
    const out = buildBugReportBody({
      description: 'x',
      steps: '',
      includeEnv: true,
    });
    expect(out).toContain('**Vault version:** unknown');
  });

  it('trims surrounding whitespace from description and steps', () => {
    const out = buildBugReportBody({
      description: '  padded description  \n',
      steps: '  step one  \n',
      includeEnv: false,
    });
    // The blank line after the heading is intentional; what we care
    // about is no leading/trailing whitespace on the user content.
    expect(out).toContain('### What went wrong\n\npadded description');
    expect(out).not.toContain('padded description  ');
    expect(out).toContain('### Steps to reproduce\n\nstep one');
    expect(out).not.toContain('step one  ');
  });
});
