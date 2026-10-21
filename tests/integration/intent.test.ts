import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseOtm, normaliseCwe, IntentFormatError } from '../../src/intent/otm.js';
import { cwesOf, evidenceFromScanJson, matchThreats } from '../../src/intent/match.js';
import { cmdIntent } from '../../src/cli-intent.js';

const FIXTURES = path.resolve(process.cwd(), 'tests/fixtures/scanners');
const model = (): string => fs.readFileSync(path.join(FIXTURES, 'threat-model.otm.json'), 'utf8');

/**
 * The intent model is a real OTM 0.2.0 document exported by Threat Dragon, so
 * these assertions describe the format, not our hopes about it.
 */
describe('OTM parsing', () => {
  it('reads the real Threat Dragon export', () => {
    const m = parseOtm(model());
    expect(m.format).toBe('otm');
    expect(m.version).toBe('0.2.0');
    expect(m.project.name).toBe('Test project');
    expect(m.assets).toHaveLength(2);
    expect(m.components).toHaveLength(4);
    expect(m.dataFlows).toHaveLength(2);
    expect(m.trustZones).toHaveLength(2);
    expect(m.threats).toHaveLength(1);
    expect(m.mitigations).toHaveLength(2);
  });

  it('normalises the threat CWEs, which are the join key', () => {
    const threat = parseOtm(model()).threats[0]!;
    expect(threat.cwes).toEqual(['CWE-79', 'CWE-787']);
    expect(threat.categories).toEqual(['Spoofing', 'Tampering']);
  });

  it('keeps the trust-zone relationship rather than flattening it', () => {
    const m = parseOtm(model());
    const webClient = m.components.find((c) => c.name === 'Web Client')!;
    expect(webClient.trustZone).toBe('f0ba7722-39b6-4c81-8290-a30a248bb8d9');
    expect(webClient.type).toBe('web-client');
  });

  it('reads dataflow endpoints and direction', () => {
    const flow = parseOtm(model()).dataFlows[0]!;
    expect(flow.source).toBe('web-client');
    expect(flow.destination).toBe('web-service');
    expect(flow.bidirectional).toBe(true);
  });

  it('a non-OTM document says which format it is, not "parse failed"', () => {
    expect(() => parseOtm(JSON.stringify({ summary: {}, detail: { diagrams: [] } }))).toThrow(
      IntentFormatError,
    );
    expect(() => parseOtm(JSON.stringify({ summary: {}, detail: {} }))).toThrow(
      /not an OTM document/,
    );
  });

  it('garbage is a named error, not a stack trace', () => {
    expect(() => parseOtm('{oops')).toThrow(/not valid JSON/);
    expect(() => parseOtm('[]')).toThrow(/not an OTM document/);
  });

  it('an unknown top-level key is reported, never dropped silently', () => {
    const m = parseOtm(JSON.stringify({ otmVersion: '0.2.0', project: {}, zombies: [] }));
    expect(m.unrecognised).toEqual(['zombies']);
  });
});

describe('CWE normalisation', () => {
  it('accepts every spelling the tools use', () => {
    for (const input of ['CWE-79', 'cwe-79', 'CWE 79', 'cwe_79', '79', 'CWE-079']) {
      expect(normaliseCwe(input)).toBe('CWE-79');
    }
  });

  it('an empty or non-numeric value yields nothing rather than a bogus id', () => {
    expect(normaliseCwe('')).toBe('');
    expect(normaliseCwe('none')).toBe('');
  });
});

describe('intended vs observed', () => {
  const evidence = (cwes?: string[], id = 'EVT-1') => ({
    id,
    claim: 'a finding',
    cwes,
  });

  it('a threat whose CWE was observed is OBSERVED, with the evidence ids', () => {
    const report = matchThreats(parseOtm(model()), [evidence(['CWE-79'])]);
    const match = report.matches[0]!;
    expect(match.verdict).toBe('OBSERVED');
    expect(match.evidenceIds).toEqual(['EVT-1']);
    expect(match.reason).toContain('CWE-79');
  });

  it('no matching evidence is NOT_OBSERVED and says it does not prove mitigation', () => {
    const report = matchThreats(parseOtm(model()), [evidence(['CWE-94'])]);
    expect(report.matches[0]!.verdict).toBe('NOT_OBSERVED');
    expect(report.matches[0]!.reason).toMatch(/does not prove/);
  });

  it('a threat that declares no CWE can never be joined — UNKNOWN, not a pass', () => {
    const bare = parseOtm(
      JSON.stringify({ otmVersion: '0.2.0', project: {}, threats: [{ id: 't', name: 'vague' }] }),
    );
    const report = matchThreats(bare, [evidence(['CWE-79'])]);
    expect(report.matches[0]!.verdict).toBe('UNKNOWN');
    expect(report.matches[0]!.reason).toMatch(/declares no CWE/);
  });

  it('evidence citing a CWE the model never declared is listed as unmodelled', () => {
    const report = matchThreats(parseOtm(model()), [
      evidence(['CWE-94']),
      evidence(['CWE-89'], 'EVT-2'),
    ]);
    expect(report.unmodeled.map((u) => u.cwe)).toEqual(['CWE-89', 'CWE-94']);
    expect(report.unmodeled[0]!.evidenceIds).toEqual(['EVT-2']);
  });

  it('a declared trust zone with no component inside it is reported', () => {
    const m = parseOtm(model());
    m.components = m.components.filter((c) => c.trustZone !== m.trustZones[0]!.id);
    const report = matchThreats(m, []);
    expect(report.emptyTrustZones.length).toBeGreaterThan(0);
  });

  it('structured CWEs win over text, and text is only a fallback', () => {
    expect(cwesOf({ id: 'a', claim: 'nothing here', cwes: ['CWE-79'] })[0]!.field).toBe('cwes');
    expect(cwesOf({ id: 'b', claim: 'refers to CWE-787 in prose' })[0]).toEqual({
      cwe: 'CWE-787',
      field: 'claim',
    });
    expect(cwesOf({ id: 'c', claim: 'no cwe at all' })).toEqual([]);
  });

  it('reads the shape `usa scan --json` actually emits', () => {
    const payload = {
      evidence: [{ id: 'EVT-1', claim: 'x', source: { tool: 'semgrep' }, cwes: ['CWE-94'] }],
    };
    expect(evidenceFromScanJson(payload)).toEqual([
      { id: 'EVT-1', claim: 'x', source: { tool: 'semgrep' }, cwes: ['CWE-94'] },
    ]);
    expect(evidenceFromScanJson({})).toEqual([]);
  });
});

describe('usa intent command', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads a model and prints the declared shape', () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((m) => lines.push(String(m)));
    try {
      expect(cmdIntent({ _: ['intent', path.join(FIXTURES, 'threat-model.otm.json')] })).toBe(0);
    } finally {
      spy.mockRestore();
    }
    expect(lines.join('\n')).toContain('OTM 0.2.0');
    expect(lines.join('\n')).toContain('2 assets · 4 components');
  });

  it('joins evidence when given one', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-intent-'));
    const ev = path.join(dir, 'scan.json');
    fs.writeFileSync(
      ev,
      JSON.stringify({ evidence: [{ id: 'EVT-1', claim: 'x', cwes: ['CWE-79'] }] }),
    );
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((m) => lines.push(String(m)));
    try {
      expect(
        cmdIntent({ _: ['intent', path.join(FIXTURES, 'threat-model.otm.json')], evidence: ev }),
      ).toBe(0);
    } finally {
      spy.mockRestore();
    }
    expect(lines.join('\n')).toContain('1 observed');
  });

  it('a missing model is a usage error with exit 1', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(cmdIntent({ _: ['intent', '/nope/model.json'] })).toBe(1);
      expect(cmdIntent({ _: ['intent'] })).toBe(1);
    } finally {
      err.mockRestore();
    }
  });

  it('a wrong format exits 1 with the reason', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-intent-'));
    const bad = path.join(dir, 'bad.json');
    fs.writeFileSync(bad, '{"summary":{}}');
    const err: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((m) => err.push(String(m)));
    try {
      expect(cmdIntent({ _: ['intent', bad] })).toBe(1);
    } finally {
      spy.mockRestore();
    }
    expect(err.join('')).toMatch(/not an OTM document/);
  });
});
