/**
 * The backend boundary: where a session's truth is kept.
 *
 * `LOCAL` today — leases under `~/.macp/leases/`, seals under `~/.macp/seals/`,
 * handoffs in the repository. `JARVIS` later — the same six operations served
 * by a central authority, with the repository holding only the git-tracked
 * handoff it needs to be readable by a human.
 *
 * The interface exists now, before JARVIS exists, because the cost of adding it
 * later is the cost of touching every command and every harness adapter. The
 * worker calls `backend.start(request)`; whether that runs in-process or over
 * HTTP is not the worker's business, and must not become the worker's problem.
 */
import { abandon, close, reopen, seal, start, submit } from './lifecycle.mjs';
import { log, queue, status } from './record.mjs';
import { verify } from './verify.mjs';
import { ack, checkpoint } from './checkpoint.mjs';

/**
 * The contract. Every method takes one plain request object and returns
 * `{code, out}` — the same shape the CLI prints and the tests assert.
 *
 * Parameters are underscore-prefixed because the base class only exists to fix
 * the signatures; the real work is in `LocalBackend` and `JarvisBackend`.
 */
export class MacpBackend {
  async start(_request) {
    throw new Error('not implemented');
  }

  async log(_request) {
    throw new Error('not implemented');
  }

  async queue(_request) {
    throw new Error('not implemented');
  }

  async submit(_request) {
    throw new Error('not implemented');
  }

  async checkpoint(_request) {
    throw new Error('not implemented');
  }

  async ack(_request) {
    throw new Error('not implemented');
  }

  async close(_request) {
    throw new Error('not implemented');
  }

  async seal(_request) {
    throw new Error('not implemented');
  }

  async reopen(_request) {
    throw new Error('not implemented');
  }

  async status() {
    throw new Error('not implemented');
  }

  async verify() {
    throw new Error('not implemented');
  }
}

/** Everything in-process, everything on this machine. The default. */
export class LocalBackend extends MacpBackend {
  async start(request) {
    return start(request);
  }

  async log(request) {
    return log(request);
  }

  async queue(request) {
    return queue(request);
  }

  async submit(request) {
    return submit(request);
  }

  async checkpoint(request) {
    return checkpoint(request);
  }

  async ack(request) {
    return ack(request);
  }

  async abandon(request) {
    return abandon(request);
  }

  async close(request) {
    return close(request);
  }

  async seal(request) {
    return seal(request);
  }

  async reopen(request) {
    return reopen(request);
  }

  async status() {
    return status();
  }

  async verify() {
    return verify();
  }
}

/**
 * The JARVIS contract, unimplemented on purpose.
 *
 * The wire shape is fixed here so a worker can be pointed at a central
 * authority without a CLI change: one POST per operation, JSON body, JSON
 * `{code, out}` response. What is deliberately *not* decided here is
 * authentication, because inventing a token scheme before the authority exists
 * is how a stub becomes a liability.
 */
export const JARVIS_ROUTES = Object.freeze({
  start: 'POST /macp/v1/sessions',
  log: 'POST /macp/v1/sessions/:id/events',
  submit: 'POST /macp/v1/sessions/:id/submit',
  checkpoint: 'POST /macp/v1/sessions/:id/checkpoints',
  ack: 'POST /macp/v1/sessions/:id/checkpoints/:n/ack',
  abandon: 'POST /macp/v1/sessions/:id/abandon',
  close: 'POST /macp/v1/sessions/:id/close',
  seal: 'POST /macp/v1/sessions/:id/seal',
  reopen: 'POST /macp/v1/sessions/:id/reopen',
  status: 'GET  /macp/v1/sessions/current',
  verify: 'GET  /macp/v1/verify',
});

export class JarvisBackend extends MacpBackend {
  constructor(baseUrl) {
    super();
    this.baseUrl = baseUrl?.replace(/\/$/, '');
  }

  async #call(operation, request) {
    if (!this.baseUrl) {
      throw new Error(
        `JARVIS backend selected but MACP_JARVIS_URL is unset. The contract is ` +
          `${JARVIS_ROUTES[operation]}. Until an authority answers it, use MACP_BACKEND=local.`,
      );
    }
    const response = await fetch(`${this.baseUrl}/macp/v1/${operation}`, {
      method: operation === 'status' || operation === 'verify' ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: operation === 'status' || operation === 'verify' ? undefined : JSON.stringify(request),
    });
    if (!response.ok) throw new Error(`JARVIS ${operation} failed: HTTP ${response.status}`);
    return response.json();
  }

  async start(request) {
    return this.#call('start', request);
  }

  async log(request) {
    return this.#call('log', request);
  }

  async submit(request) {
    return this.#call('submit', request);
  }

  async abandon(request) {
    return this.#call('abandon', request);
  }

  async close(request) {
    return this.#call('close', request);
  }

  async seal(request) {
    return this.#call('seal', request);
  }

  async reopen(request) {
    return this.#call('reopen', request);
  }

  async status() {
    return this.#call('status', {});
  }

  async verify() {
    return this.#call('verify', {});
  }
}

/** `MACP_BACKEND=jarvis` with `MACP_JARVIS_URL` selects the central authority. */
export function createBackend(env = process.env) {
  if ((env.MACP_BACKEND ?? 'local').toLowerCase() === 'jarvis') {
    return new JarvisBackend(env.MACP_JARVIS_URL);
  }
  return new LocalBackend();
}
