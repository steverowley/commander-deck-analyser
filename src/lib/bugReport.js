// Pure helpers for assembling bug-report bodies. Kept out of the
// component so they're trivially testable and reusable from either
// the worker-submit path or the GitHub URL fallback.

export function buildBugReportBody({ description, steps, includeEnv, version, userAgent, url }) {
  const sections = [];
  sections.push('### What went wrong\n\n' + (description || '').trim());
  if (steps && steps.trim()) {
    sections.push('### Steps to reproduce\n\n' + steps.trim());
  }
  if (includeEnv) {
    const env = [];
    env.push(`- **Vault version:** ${version || 'unknown'}`);
    if (userAgent) env.push(`- **User agent:** ${userAgent}`);
    if (url) env.push(`- **URL:** ${url}`);
    sections.push('### Environment\n\n' + env.join('\n'));
  }
  return sections.join('\n\n');
}
