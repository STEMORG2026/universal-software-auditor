import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ScannerRunner, readArtifact, OUTPUT_CAP_BYTES } from '../../src/scanner/run.js';
import type { ScannerAdapter, ScannerCommand, ScanTarget } from '../../src/scanner/types.js';

const NODE = process.execPath;

const tmp = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'usa-runner-'));

/**
 * A fake adapter, because the contract under test is the runner's, not any
 * particular tool's: does it run the upstream stages, does it read the file the
 * tool wrote, and does a missing file look different from a clean run?
 */
function fakeAdapter(
  build: (target: ScanTarget) => ScannerCommand,
  seen: { raw?: string } = {},
): ScannerAdapter {
  return {
    id: 'fake',
    name: 'fake',
    defaultConfig: () => ({}),
    probe: () => ({ available: true, version: '1.0.0', executable: NODE }),
    buildCommand: (target) => build(target),
    parse: (raw) => {
      seen.raw = raw;
      return [];
    },
  };
}

function runOnce(
  build: (target: ScanTarget) => ScannerCommand,
  seen: { raw?: string } = {},
  options: { network?: boolean } = {},
) {
  const target = tmp();
  const runner = new ScannerRunner([fakeAdapter(build, seen)]);
  return runner.run({ target, adapters: ['fake'], ...options });
}

/** A node one-liner that writes `content` to `file`, relative to the cwd. */
const write = (file: string, content: string): string[] => [
  NODE,
  '-e',
  `require('node:fs').writeFileSync(${JSON.stringify(file)}, ${JSON.stringify(content)})`,
];

describe('scanner runner: artifacts', () => {
  it('parses the declared artifact, not stdout', () => {
    const seen: { raw?: string } = {};
    const result = runOnce(
      () => ({
        argv: [
          NODE,
          '-e',
          // stdout says one thing, the artifact says another: the adapter must
          // be handed the artifact.
          "console.log('progress: 1 of 9'); require('node:fs').writeFileSync('out.json','{\"from\":\"artifact\"}')",
        ],
        artifacts: ['out.json'],
      }),
      seen,
    );
    expect(seen.raw).toBe('{"from":"artifact"}');
    expect(result.manifest.adapters[0]!.artifact).toBe('out.json');
    expect(result.manifest.adapters[0]!.status).toBe('ok');
  });

  it('falls back to stdout when no artifact is declared', () => {
    const seen: { raw?: string } = {};
    runOnce(() => ({ argv: [NODE, '-e', "console.log('on stdout')"] }), seen);
    expect(seen.raw).toBe('on stdout\n');
  });

  it('a declared artifact that was not produced is an error, not a clean run', () => {
    const result = runOnce(() => ({
      argv: [NODE, '-e', "console.log('did nothing')"],
      artifacts: ['never-written.json'],
    }));
    const run = result.manifest.adapters[0]!;
    expect(run.status).toBe('error');
    expect(run.reason).toContain('declared artifact not produced');
    expect(run.evidenceCount).toBe(0);
  });

  it('the exit status is recorded and never interpreted', () => {
    // ORT exits 2 when it finds violations: a successful run that objects.
    const seen: { raw?: string } = {};
    const result = runOnce(
      () => ({
        argv: [NODE, '-e', "require('node:fs').writeFileSync('out.json','{}'); process.exit(2)"],
        artifacts: ['out.json'],
      }),
      seen,
    );
    const run = result.manifest.adapters[0]!;
    expect(run.exitCode).toBe(2);
    expect(run.status).toBe('ok');
    expect(seen.raw).toBe('{}');
  });
});

describe('scanner runner: prepare stages', () => {
  it('runs the upstream stage before the evidence command and records both', () => {
    const seen: { raw?: string } = {};
    const result = runOnce(
      () => ({
        prepare: [{ argv: write('in.txt', 'prepared') }],
        // Reads what prepare wrote: without the stage order this fails.
        argv: [NODE, '-e', "require('node:fs').copyFileSync('in.txt','out.json')"],
        artifacts: ['out.json'],
      }),
      seen,
    );
    const run = result.manifest.adapters[0]!;
    expect(seen.raw).toBe('prepared');
    expect(run.prepare).toHaveLength(1);
    expect(run.prepare![0]).toEqual(write('in.txt', 'prepared'));
    expect(run.command[0]).toBe(NODE);
    expect(run.status).toBe('ok');
  });

  it('a failed prepare stage is a blind spot with a reason, not a verdict', () => {
    const seen: { raw?: string } = {};
    const result = runOnce(
      () => ({
        prepare: [{ argv: [NODE, '-e', 'process.exit(3)'] }],
        argv: write('out.json', '{}'),
        artifacts: ['out.json'],
      }),
      seen,
    );
    const run = result.manifest.adapters[0]!;
    expect(run.status).toBe('error');
    expect(run.reason).toContain('prepare stage');
    expect(seen.raw).toBeUndefined();
  });

  it('provenance carries the stages a re-run needs', () => {
    const target = tmp();
    const adapter: ScannerAdapter = {
      id: 'fake',
      name: 'fake',
      defaultConfig: () => ({}),
      probe: () => ({ available: true, version: '1', executable: NODE }),
      buildCommand: () => ({
        prepare: [{ argv: write('in.txt', 'x') }],
        argv: write('out.json', '{}'),
        artifacts: ['out.json'],
      }),
      parse: () => [
        {
          id: 'EVT-1',
          source: { tool: 'fake', version: '1', kind: 'k', identifier: 'i' },
          provenance: {
            executionId: '',
            command: [],
            config: {},
            repositoryRevision: '',
            timestamp: '',
            executable: '',
            timeoutMs: 0,
            elapsedMs: 0,
          },
          claim: 'c',
          severity: 'INFO',
          severitySource: 'adapter-default',
          confidence: 1,
          status: 'PASS',
          location: null,
          rawReference: {},
        },
      ],
    };
    const result = new ScannerRunner([adapter]).run({ target, adapters: ['fake'] });
    expect(result.evidence[0]!.provenance.preparedBy).toHaveLength(1);
    expect(result.evidence[0]!.provenance.command).toEqual(write('out.json', '{}'));
  });

  it('a prepare stage does not run when the tool needs network and the run denies it', () => {
    const target = tmp();
    const adapter = fakeAdapter(() => ({
      argv: [NODE, '-e', "require('node:fs').writeFileSync('out.json','{}')"],
      prepare: [{ argv: write('in.txt', 'x') }],
      artifacts: ['out.json'],
      network: true,
    }));
    const result = new ScannerRunner([adapter]).run({ target, adapters: ['fake'] });
    expect(result.manifest.adapters[0]!.status).toBe('unavailable');
    expect(fs.existsSync(path.join(target, 'in.txt'))).toBe(false);
  });
});

describe('readArtifact', () => {
  it('returns the first declared artifact that exists', () => {
    const root = tmp();
    fs.writeFileSync(path.join(root, 'b.json'), 'second');
    const read = readArtifact(root, ['a.json', 'b.json']);
    expect(read.ok && read.path).toBe('b.json');
  });

  it('refuses a path that escapes the workdir', () => {
    const root = tmp();
    const read = readArtifact(root, ['../../etc/passwd']);
    expect(read.ok).toBe(false);
    expect(!read.ok && read.reason).toContain('outside the scan workdir');
  });

  it('refuses an artifact over the output cap', () => {
    const root = tmp();
    const big = path.join(root, 'big.json');
    fs.writeFileSync(big, '');
    fs.truncateSync(big, OUTPUT_CAP_BYTES + 1);
    const read = readArtifact(root, ['big.json']);
    expect(read.ok).toBe(false);
    expect(!read.ok && read.reason).toContain('output cap');
  });

  it('ignores a directory that happens to carry the name', () => {
    const root = tmp();
    fs.mkdirSync(path.join(root, 'out.json'));
    const read = readArtifact(root, ['out.json']);
    expect(read.ok).toBe(false);
  });
});
