import type { AuditReport, Finding, Severity, Status } from '../types.js';
import type { MaturityProfile } from '../engine/maturity.js';
import { scoreLine } from '../engine/score.js';

/**
 * HTML renderer — the report as a self-contained web page.
 *
 * One file, inline CSS, zero scripts, zero external assets: it opens from
 * `file://` with no network and no server. Everything interpolated is
 * HTML-escaped (finding titles, messages, and paths all derive from the
 * audited tree, which is untrusted input), and there is deliberately no
 * `<script>` anywhere, so even hostile finding text has no execution
 * sink — the page cannot run code, only display it.
 *
 * Deterministic like the other renderers: no `Date.now()`, everything
 * from the report object.
 */

/** Escape text for HTML element and attribute contexts. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const OPEN: ReadonlySet<Status> = new Set([
  'FAIL',
  'WRONG',
  'MISSING',
  'DEPRECATED',
  'EXPERIMENTAL',
]);

const SEVERITIES: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'FUTURE'];

function severityClass(s: Severity): string {
  return `sev-${s.toLowerCase()}`;
}

function locationText(f: Finding): string {
  if (f.locations.length === 0) return 'project-wide';
  return f.locations.map((l) => (l.line === undefined ? l.file : `${l.file}:${l.line}`)).join(', ');
}

function findingCard(f: Finding): string {
  const parts = [
    `<article class="finding ${severityClass(f.severity)}">`,
    `<header><span class="badge">${escapeHtml(f.severity)}</span>`,
    `<code>${escapeHtml(f.ruleId)}</code>`,
    `<strong>${escapeHtml(f.title)}</strong></header>`,
    `<p>${escapeHtml(f.message)}</p>`,
    `<p class="where">${escapeHtml(locationText(f))}</p>`,
  ];
  if (f.remediation) parts.push(`<p class="fix"><b>Fix:</b> ${escapeHtml(f.remediation)}</p>`);
  if (f.dampened) parts.push(`<p class="dampened">Downgraded by the maturity profile.</p>`);
  parts.push('</article>');
  return parts.join('\n');
}

/** Renders an AuditReport as a self-contained HTML page (trailing newline). */
export function renderHtml(report: AuditReport, profile: MaturityProfile): string {
  void profile;
  const s = report.score;
  const open = report.findings.filter((f) => OPEN.has(f.status));
  const review = report.findings.filter((f) => f.status === 'UNKNOWN');
  const counts = SEVERITIES.filter((k) => s.severityCounts[k] > 0)
    .map((k) => `${k.toLowerCase()} ${s.severityCounts[k]}`)
    .join(' · ');

  const sections = s.sections
    .map(
      (sec) =>
        `<tr><td>${escapeHtml(sec.id)} · ${escapeHtml(sec.title)}</td>` +
        `<td>${sec.score === null ? '—' : `${sec.score}/10`}</td>` +
        `<td>${sec.passed}/${sec.applicable}</td></tr>`,
    )
    .join('\n');

  const openCards = open.map(findingCard).join('\n');
  const reviewRows = review
    .map(
      (f) =>
        `<tr><td><code>${escapeHtml(f.ruleId)}</code></td>` +
        `<td>${escapeHtml(f.title)}</td>` +
        `<td>${escapeHtml(f.evidenceHint ?? f.why ?? '')}</td></tr>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Audit: ${escapeHtml(report.target.name)} — ${escapeHtml(scoreLine(s))}</title>
<style>
:root { color-scheme: light dark; }
body { font-family: system-ui, sans-serif; max-width: 60rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
header.top { border-bottom: 2px solid currentColor; padding-bottom: 1rem; }
.score { font-size: 2.5rem; font-weight: bold; }
.badge { display: inline-block; padding: 0 .5em; border-radius: .5em; font-size: .8em; font-weight: bold; border: 1px solid currentColor; }
.finding { border: 1px solid currentColor; border-radius: .5rem; padding: 1rem; margin: 1rem 0; }
.finding header { display: flex; gap: .5rem; align-items: baseline; flex-wrap: wrap; }
.where { color: gray; font-size: .9em; }
table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
td, th { border: 1px solid currentColor; padding: .4rem .6rem; text-align: left; }
footer { margin-top: 2rem; font-size: .85em; color: gray; }
</style>
</head>
<body>
<header class="top">
<h1>Audit: ${escapeHtml(report.target.name)}</h1>
<p class="score">${escapeHtml(scoreLine(s))} <small>(${escapeHtml(report.detection.maturity)})</small></p>
<p>${s.counts.PASS} passed${counts ? ` · open: ${escapeHtml(counts)}` : ' · no open findings'} · ${s.counts.UNKNOWN} to review (${s.automationCoverage}% verified automatically)</p>
<p>Generated ${escapeHtml(report.generatedAt)} · USA ${escapeHtml(report.usaVersion)} · expected band ${s.expectedBand[0]}–${s.expectedBand[1]}</p>
</header>
<h2>Sections</h2>
<table><tr><th>Section</th><th>Score</th><th>Passed</th></tr>
${sections}
</table>
<h2>Open findings (${open.length})</h2>
${openCards || '<p>None. ✅</p>'}
<h2>Judgement queue (${review.length})</h2>
<table><tr><th>Rule</th><th>Title</th><th>Evidence needed</th></tr>
${reviewRows}
</table>
<footer>Report generated by USA — the Universal Software Auditor. Scores are reproducible: re-run with the same rules and depth to compare.</footer>
</body>
</html>
`;
}
