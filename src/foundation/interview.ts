/**
 * Foundation interview: pure question/answer builders plus a thin line-driven
 * driver for `usa foundation init`.
 *
 * Separation is the point: everything in the "builders" section is pure
 * (no readline, no fs, no console) so tests can drive the whole interview
 * without a terminal. The driver at the bottom only prints prompts, reads
 * lines through an injected `ask` function, and writes the file.
 *
 * Note on sync I/O: the CLI entrypoint is synchronous
 * (`process.exit(main(...))`), so the driver reads stdin with blocking
 * `fs.readSync` instead of `node:readline` (which is async-only and would be
 * truncated by `process.exit`). Piped stdin and TTYs both work.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  FOUNDATION_VERSION,
  INTENT_OPTIONS,
  STAGE_OPTIONS,
  defaultFoundation,
  type FoundationConfig,
} from './types.js';
import { foundationFile, parseFoundationYamlText, sanitizeIntent } from './loader.js';
import { detectFoundationDefaults } from './detect.js';

/* ---------------------------------------------------------- pure builders -- */

export type QuestionKind = 'text' | 'multi-select' | 'select' | 'boolean' | 'number' | 'list';

export interface InterviewQuestion {
  id: string;
  prompt: string;
  kind: QuestionKind;
  options?: readonly string[];
  help?: string;
  /** Current value rendered for the `[default]` slot of the prompt. */
  read: (config: FoundationConfig) => string;
}

const boolRead =
  (get: (config: FoundationConfig) => boolean) =>
  (config: FoundationConfig): string =>
    get(config) ? 'yes' : 'no';

export const INTERVIEW_QUESTIONS: readonly InterviewQuestion[] = [
  {
    id: 'project.name',
    prompt: 'Project name',
    kind: 'text',
    read: (c) => c.project.name,
  },
  {
    id: 'project.vision',
    prompt: 'What is this project for? (one or two sentences — the only answer no tool can guess)',
    kind: 'text',
    read: (c) => c.project.vision,
  },
  {
    id: 'project.intents',
    prompt: 'Intents — what does it do? (any that fit, comma-separated, or just say "all")',
    kind: 'multi-select',
    options: INTENT_OPTIONS,
    help: `One or more of: ${INTENT_OPTIONS.join(', ')}. Each becomes an intent:<value> fact the audit can see.`,
    read: (c) => c.project.intents.join(', '),
  },
  {
    id: 'stage',
    prompt: 'Stage target — how grown-up should the audit treat it as aiming to be?',
    kind: 'select',
    options: STAGE_OPTIONS,
    read: (c) => c.stage ?? '',
  },
  {
    id: 'pillars.docs.required',
    prompt: 'Required docs files (comma-separated)',
    kind: 'list',
    help: 'Files the docs pillar requires to exist, e.g. README.md, docs/ARCHITECTURE.md.',
    read: (c) => c.pillars.docs.required.join(', '),
  },
  {
    id: 'pillars.governance.codeOfConduct',
    prompt: 'Require a code of conduct?',
    kind: 'boolean',
    read: boolRead((c) => c.pillars.governance.codeOfConduct),
  },
  {
    id: 'pillars.governance.contributing',
    prompt: 'Require contributing guidance?',
    kind: 'boolean',
    read: boolRead((c) => c.pillars.governance.contributing),
  },
  {
    id: 'pillars.governance.securityPolicy',
    prompt: 'Require a security policy?',
    kind: 'boolean',
    read: boolRead((c) => c.pillars.governance.securityPolicy),
  },
  {
    id: 'pillars.governance.license',
    prompt: 'Require a license file?',
    kind: 'boolean',
    read: boolRead((c) => c.pillars.governance.license),
  },
  {
    id: 'pillars.ai.readable',
    prompt: 'AI posture: may assistants read this repo?',
    kind: 'boolean',
    read: boolRead((c) => c.pillars.ai.readable),
  },
  {
    id: 'pillars.ai.writable',
    prompt: 'AI posture: may assistants write to this repo?',
    kind: 'boolean',
    read: boolRead((c) => c.pillars.ai.writable),
  },
  {
    id: 'pillars.testing.dirs',
    prompt: 'Test directories (comma-separated)',
    kind: 'list',
    read: (c) => c.pillars.testing.dirs.join(', '),
  },
  {
    id: 'pillars.testing.minCoverage',
    prompt: 'Minimum coverage percent (0-100, empty clears)',
    kind: 'number',
    read: (c) =>
      c.pillars.testing.minCoverage === undefined ? '' : String(c.pillars.testing.minCoverage),
  },
  {
    id: 'pillars.environment.files',
    prompt: 'Environment files (comma-separated)',
    kind: 'list',
    help: 'Env exemplars contributors copy, e.g. .env.example.',
    read: (c) => c.pillars.environment.files.join(', '),
  },
  {
    id: 'pillars.pipelines.local',
    prompt: 'Local pipeline scripts (comma-separated package script names)',
    kind: 'list',
    read: (c) => c.pillars.pipelines.local.join(', '),
  },
  {
    id: 'pillars.pipelines.ci',
    prompt: 'CI workflow paths (comma-separated)',
    kind: 'list',
    read: (c) => c.pillars.pipelines.ci.join(', '),
  },
  {
    id: 'pillars.standards',
    prompt: 'Standards catalogues (comma-separated, empty for none)',
    kind: 'list',
    read: (c) => c.pillars.standards.join(', '),
  },
  {
    id: 'pillars.specs',
    prompt: 'Spec documents (comma-separated, empty for none)',
    kind: 'list',
    read: (c) => c.pillars.specs.join(', '),
  },
];

function clone(config: FoundationConfig): FoundationConfig {
  return JSON.parse(JSON.stringify(config)) as FoundationConfig;
}

function parseBool(raw: string, id: string): boolean {
  const v = raw.trim().toLowerCase();
  if (['yes', 'y', 'true', '1'].includes(v)) return true;
  if (['no', 'n', 'false', '0'].includes(v)) return false;
  throw new Error(`"${id}": expected yes/no, got ${JSON.stringify(raw)}`);
}

/**
 * Forgiving tokenization: humans paste option lists back (`a|b|c`), use
 * semicolons, or hit enter mid-thought. Split on every plausible separator —
 * validation against the option list still rejects real mistakes loudly.
 */
function splitList(raw: string): string[] {
  return raw
    .split(/[,;|\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The interview asks four things; everything else is detected from the repo
 * (see detect.ts) or stays default. Vision and intents are the only answers
 * no tool can observe — the rest would be an interrogation, not an interview.
 */
export const ASK_ORDER: readonly string[] = [
  'project.name',
  'project.vision',
  'project.intents',
  'stage',
];

/**
 * Applies one raw answer to a copy of `config` and returns it. An empty
 * answer keeps the current value. Unknown question ids and invalid values
 * throw (the driver catches per-question and re-prompts).
 *
 * One handler per answer kind — adding a kind means adding a line, not a
 * branch (the dispatch-table ethos the engine itself follows).
 */
export function applyInterviewAnswer(
  config: FoundationConfig,
  id: string,
  raw: string,
): FoundationConfig {
  const question = INTERVIEW_QUESTIONS.find((q) => q.id === id);
  if (!question) throw new Error(`unknown interview question: ${JSON.stringify(id)}`);
  if (raw.trim() === '') return clone(config);
  return ANSWER_HANDLERS[question.kind](clone(config), id, raw, question);
}

type AnswerHandler = (
  next: FoundationConfig,
  id: string,
  raw: string,
  question: InterviewQuestion,
) => FoundationConfig;

function checkOption(id: string, raw: string, value: string, options: readonly string[]): void {
  if (!options.includes(value)) {
    throw new Error(
      `"${id}": unknown value ${JSON.stringify(raw)} (expected one of ${options.join(', ')})`,
    );
  }
}

/** One check kind per entry — adding a kind means adding a line, not a branch. */
const ANSWER_HANDLERS: Record<QuestionKind, AnswerHandler> = {
  text: (next, id, raw) => {
    setPath(next, id, raw.trim());
    return next;
  },
  'multi-select': (next, id, raw, question) => {
    const options = question.options ?? [];
    const values = splitList(raw).map((s) => s.toLowerCase());
    if (values.length === 0) return next;
    // "all" (any case) means every option — the most common reasonable answer.
    if (values.length === 1 && values[0] === 'all') {
      setPath(next, id, [...options]);
      return next;
    }
    for (const v of values) checkOption(id, v, v, options);
    setPath(next, id, values);
    return next;
  },
  select: (next, id, raw, question) => {
    const v = raw.trim().toLowerCase();
    checkOption(id, raw.trim(), v, question.options ?? []);
    setPath(next, id, v);
    return next;
  },
  boolean: (next, id, raw) => {
    setPath(next, id, parseBool(raw, id));
    return next;
  },
  number: (next, id, raw) => {
    const n = Number(raw.trim());
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      throw new Error(`"${id}": expected a number from 0 to 100, got ${JSON.stringify(raw)}`);
    }
    setPath(next, id, n);
    return next;
  },
  list: (next, id, raw) => {
    setPath(next, id, splitList(raw));
    return next;
  },
};

/**
 * Question ids are the schema: only ids the interview asks may be written.
 * The allowlist keeps a typo'd id loud (same message as before) while the
 * setter itself stays a dumb path walk with no per-field branches.
 */
const KNOWN_IDS = new Set(INTERVIEW_QUESTIONS.map((q) => q.id));

/**
 * One view of a config node as a writable map. The cast follows a runtime
 * object check, so it is a narrowing, not an escape: a non-object segment is
 * a loud error naming the question instead of a TypeError on `undefined`.
 */
function objectView(node: unknown, id: string): Record<string, unknown> {
  if (typeof node !== 'object' || node === null) {
    throw new Error(`interview question path is not an object: ${JSON.stringify(id)}`);
  }
  return node as Record<string, unknown>;
}

function setPath(config: FoundationConfig, id: string, value: unknown): void {
  if (!KNOWN_IDS.has(id)) throw new Error(`unknown interview question: ${JSON.stringify(id)}`);
  const keys = id.split('.');
  const last = keys.pop()!;
  let node = objectView(config, id);
  for (const key of keys) node = objectView(node[key], id);
  node[last] = value;
}

/**
 * Builds a FoundationConfig from a `{ [questionId]: rawAnswer }` map, in
 * question order, starting from defaults. Pure; throws on invalid values.
 */
export function foundationFromAnswers(
  answers: Record<string, string>,
  projectName = 'project',
): FoundationConfig {
  let config = defaultFoundation(projectName);
  for (const question of INTERVIEW_QUESTIONS) {
    const raw = answers[question.id];
    if (raw !== undefined) config = applyInterviewAnswer(config, question.id, raw);
  }
  return config;
}

/** Renders one prompt line, e.g. `Stage target [prototype]: `. Pure. */
export function formatQuestionPrompt(
  question: InterviewQuestion,
  config: FoundationConfig,
): string {
  const current = question.read(config);
  const options =
    question.kind === 'multi-select' || question.kind === 'select'
      ? ` (${question.options?.join('|')})`
      : '';
  const help = question.help ? `\n  ${question.help}` : '';
  return `${question.prompt}${options} [${current}]:${help}\n> `;
}

/* -------------------------------------------------------- commented YAML -- */

const BARE_RE = /^[A-Za-z0-9][A-Za-z0-9_./-]*$/;

function yq(value: string): string {
  if (value === '') return '""';
  return BARE_RE.test(value) ? value : JSON.stringify(value);
}

function ylist(items: string[], indent: string): string {
  if (items.length === 0) return ' []';
  return `\n${items.map((item) => `${indent}  - ${yq(item)}`).join('\n')}`;
}

/**
 * Renders a commented foundation.yaml. Deterministic: fixed key order, fixed
 * comments. Round-trips through `parseFoundationYamlText`.
 */
export function renderFoundationYaml(config: FoundationConfig): string {
  const p = config.pillars;
  const lines = [
    '# USA foundation intent — what this project is and what it promises.',
    '# Deterministic input to readiness auditing: the coordinator turns',
    '# project.intents[] into intent:<value> facts. Hand-edit freely, but keep',
    '# it parseable — a broken file fails the audit loudly, never silently.',
    `version: ${FOUNDATION_VERSION}`,
    '',
    '# Who this project is for and what it wants to be.',
    'project:',
    `  name: ${yq(config.project.name)}`,
    `  vision: ${yq(config.project.vision)}`,
    `  # One or more of: ${INTENT_OPTIONS.join(', ')}.`,
    `  intents:${ylist(config.project.intents, '  ')}`,
    '',
    `# Stage target: ${STAGE_OPTIONS.join('|')}.`,
    config.stage === undefined ? '# stage: prototype' : `stage: ${yq(config.stage)}`,
    '',
    'pillars:',
    '  # Files the docs pillar requires to exist.',
    `  docs:\n    required:${ylist(p.docs.required, '    ')}`,
    '  # Governance files the project promises to keep.',
    '  governance:',
    `    codeOfConduct: ${p.governance.codeOfConduct}`,
    `    contributing: ${p.governance.contributing}`,
    `    securityPolicy: ${p.governance.securityPolicy}`,
    `    license: ${p.governance.license}`,
    '  # AI posture: may assistants read, and may they write?',
    '  ai:',
    `    readable: ${p.ai.readable}`,
    `    writable: ${p.ai.writable}`,
    '  # Where tests live and the coverage bar (0-100).',
    '  testing:',
    `    dirs:${ylist(p.testing.dirs, '    ')}`,
    `    minCoverage: ${p.testing.minCoverage === undefined ? 'null' : p.testing.minCoverage}`,
    '  # Env exemplars contributors copy.',
    `  environment:\n    files:${ylist(p.environment.files, '    ')}`,
    '  # Local package scripts and CI workflow paths.',
    '  pipelines:',
    `    local:${ylist(p.pipelines.local, '    ')}`,
    `    ci:${ylist(p.pipelines.ci, '    ')}`,
    '  # Standards catalogues and spec documents (empty when none).',
    `  standards:${ylist(p.standards, '  ')}`,
    `  specs:${ylist(p.specs, '  ')}`,
    '',
  ];
  return lines.join('\n');
}

/* --------------------------------------------------------------- summary -- */

/**
 * Human-readable rendering of the effective intent plus the exact facts it
 * would assert. Used by `usa foundation show`. Pure.
 */
export function summarizeFoundation(config: FoundationConfig): string {
  return [...summarizeHead(config), ...summarizePillars(config.pillars)].join('\n');
}

/** Identity block: who this project is and which facts that asserts. */
function summarizeHead(config: FoundationConfig): string[] {
  const facts = config.project.intents
    .map((entry) => sanitizeIntent(entry))
    .filter((f): f is string => f !== undefined);
  return [
    `# Foundation: ${config.project.name || '(unnamed)'}`,
    `vision: ${config.project.vision || '(none)'}`,
    `stage: ${config.stage ?? '(none)'}`,
    `intents: ${config.project.intents.length ? config.project.intents.join(', ') : '(none)'}`,
    'facts this intent would assert:',
    ...(facts.length ? facts.map((f) => `  ${f}`) : ['  (none — no usable intents)']),
  ];
}

/** An empty list reads as `(none)` rather than an empty stare. */
function joinOrNone(items: string[]): string {
  return items.length ? items.join(', ') : '(none)';
}

/** Names of the governance promises switched on, in questionnaire order. */
function enabledGovernanceNames(gov: FoundationConfig['pillars']['governance']): string[] {
  return (
    [
      ['code-of-conduct', gov.codeOfConduct],
      ['contributing', gov.contributing],
      ['security-policy', gov.securityPolicy],
      ['license', gov.license],
    ] as const
  )
    .filter(([, on]) => on)
    .map(([name]) => name);
}

/** One line per pillar promise, in pillar order. */
function summarizePillars(p: FoundationConfig['pillars']): string[] {
  return [
    'pillars:',
    `  docs.required: ${joinOrNone(p.docs.required)}`,
    `  governance: ${joinOrNone(enabledGovernanceNames(p.governance))}`,
    `  ai: ${p.ai.readable ? 'readable' : 'not readable'}, ${p.ai.writable ? 'writable' : 'not writable'}`,
    `  testing: ${joinOrNone(p.testing.dirs)}${p.testing.minCoverage === undefined ? '' : ` @ >=${p.testing.minCoverage}%`}`,
    `  environment: ${joinOrNone(p.environment.files)}`,
    `  pipelines.local: ${joinOrNone(p.pipelines.local)}`,
    `  pipelines.ci: ${joinOrNone(p.pipelines.ci)}`,
    `  standards: ${joinOrNone(p.standards)}`,
    `  specs: ${joinOrNone(p.specs)}`,
  ];
}

/* ---------------------------------------------------------------- driver -- */

export type AskFn = (prompt: string) => string | null;
export type PrintFn = (line: string) => void;

/**
 * Cap on one stdin answer line. Answers are short; piped input is not
 * necessarily (`yes | usa live` is infinite) — CLI-004 bounds it instead of
 * buffering until the process OOMs.
 */
export const MAX_STDIN_LINE_BYTES = 64 * 1024;

/**
 * Read one line from a byte source (`null` = end of input). Throws when the
 * line exceeds maxBytes instead of buffering forever. Callers fail loudly
 * (exit 2) on the throw; EOF still returns null so defaults apply.
 */
export function readCappedLine(
  next: () => number | null,
  maxBytes = MAX_STDIN_LINE_BYTES,
): string | null {
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const b = next();
    if (b === null) return chunks.length === 0 ? null : Buffer.concat(chunks).toString('utf8');
    if (b === 10) return Buffer.concat(chunks).toString('utf8');
    if (b === 13) continue;
    chunks.push(Buffer.from([b]));
    total += 1;
    if (total > maxBytes) {
      throw new Error(`stdin line exceeds ${maxBytes} bytes — refusing to buffer unbounded input`);
    }
  }
}

/**
 * Blocking stdin line reader (see module note). Returns one line without the
 * trailing newline, or null on EOF. The prompt is written as-is to stdout.
 * Read errors and over-long lines throw — both callers (live session,
 * foundation init) turn that into a loud exit 2 instead of silently
 * continuing on truncated input.
 */
export function createStdinAsk(
  fd = 0,
  write: (text: string) => void = (text) => process.stdout.write(text),
): AskFn {
  const one = Buffer.alloc(1);
  return (prompt: string): string | null => {
    write(prompt);
    return readCappedLine(() => {
      const n = fs.readSync(fd, one, 0, 1, null);
      return n === 0 ? null : (one[0] as number);
    });
  };
}

export interface FoundationInitOptions {
  dir: string;
  nonInteractive: boolean;
  dryRun?: boolean;
  ask?: AskFn;
  print?: PrintFn;
  error?: PrintFn;
  projectName?: string;
}

export interface FoundationShowOptions {
  dir: string;
  print?: PrintFn;
  error?: PrintFn;
}

/** Ask one question until it validates (EOF keeps the default). Sync. */
function askInterviewQuestion(
  question: InterviewQuestion,
  config: FoundationConfig,
  ask: AskFn,
  print: PrintFn,
  error: PrintFn,
): FoundationConfig {
  for (;;) {
    const raw = ask(formatQuestionPrompt(question, config));
    if (raw === null) {
      print('(EOF — keeping defaults for the remaining questions.)');
      return config;
    }
    try {
      return applyInterviewAnswer(config, question.id, raw);
    } catch (err) {
      error((err as Error).message);
    }
  }
}

/**
 * Resolve the file to create, or null when already handled: an existing
 * file is left alone, and --dry-run prints the preview (same line shape as
 * the CLI helper, duplicated here to avoid a cli→foundation import cycle).
 */
function foundationInitFile(
  dir: string,
  opts: FoundationInitOptions,
  print: PrintFn,
  error: PrintFn,
): string | null {
  const file = foundationFile(dir);
  if (fs.existsSync(file)) {
    error(`${file} already exists — leaving it alone.`);
    return null;
  }
  // CLI-003: preview before prompting or writing.
  if (opts.dryRun) {
    print(`dry-run: would write ${file}`);
    return null;
  }
  return file;
}

/** `usa foundation init`: interview (or defaults) → commented YAML. Sync. */
export function runFoundationInit(opts: FoundationInitOptions): number {
  const print = opts.print ?? ((line: string) => console.log(line));
  const error = opts.error ?? ((line: string) => console.error(line));
  const dir = path.resolve(opts.dir);
  const file = foundationInitFile(dir, opts, print, error);
  if (!file) return 0;
  try {
    const projectName = opts.projectName ?? path.basename(dir);
    let config = detectFoundationDefaults(dir, projectName);
    if (!opts.nonInteractive) {
      const ask = opts.ask ?? createStdinAsk();
      print(
        `Quick intent check for ${projectName} — I already looked at the repo, ` +
          `so just ${ASK_ORDER.length} questions (empty answers keep what I found).`,
      );
      for (const id of ASK_ORDER) {
        const question = INTERVIEW_QUESTIONS.find((q) => q.id === id);
        if (!question) continue;
        config = askInterviewQuestion(question, config, ask, print, error);
      }
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, renderFoundationYaml(config), 'utf8');
    print(`created ${file}`);
    return 0;
  } catch (err) {
    error((err as Error).message);
    return 2;
  }
}

/** `usa foundation show`: effective intent + asserted facts. Sync. */
export function runFoundationShow(opts: FoundationShowOptions): number {
  const print = opts.print ?? ((line: string) => console.log(line));
  const error = opts.error ?? ((line: string) => console.error(line));
  const file = foundationFile(path.resolve(opts.dir));
  if (!fs.existsSync(file)) {
    error(`no foundation file at ${file} — run \`usa foundation init\` first.`);
    return 1;
  }
  try {
    const config = parseFoundationYamlText(fs.readFileSync(file, 'utf8'), file);
    print(summarizeFoundation(config));
    return 0;
  } catch (err) {
    error((err as Error).message);
    return 2;
  }
}
