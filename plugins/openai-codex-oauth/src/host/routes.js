import { EntryError, safeCode } from './controller.js';
export const PATH = '/api/wangzf/codex-oauth';
const OWNER = /^[a-f0-9]{64}$/;
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
export function parseBody(text) {
  let body;
  try { body = JSON.parse(text); } catch { throw new EntryError('BAD_REQUEST'); }
  if (!body || Array.isArray(body) || !['status', 'start', 'answer', 'cancel'].includes(body.action) ||
      !OWNER.test(body.owner) || Object.keys(body).some(k => !['action', 'owner', 'promptId', 'value'].includes(k))) throw new EntryError('BAD_REQUEST');
  if (body.action === 'answer') {
    if (typeof body.promptId !== 'string' || body.promptId.length > 64 ||
        typeof body.value !== 'string' || body.value.length > 8192) throw new EntryError('BAD_REQUEST');
  } else if ('value' in body || 'promptId' in body) throw new EntryError('BAD_REQUEST');
  return body;
}
function send(res, status, value) {
  if (res.destroyed || res.writableEnded) return;
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.end(JSON.stringify(value));
}
// A bounded reader, including stalled/chunked input; never log body or parse errors.
export function readBody(req, max = 16_384, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let size = 0, chunks = [];
    const finish = (error, value) => {
      clearTimeout(timer);
      req.off('data', data); req.off('end', end); req.off('error', errorEvent); req.off('aborted', abort);
      chunks = [];
      if (error) { req.resume(); reject(new EntryError('BAD_REQUEST')); } else resolve(value);
    };
    const data = chunk => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > max) finish(true);
      else chunks.push(bytes);
    };
    const end = () => finish(false, Buffer.concat(chunks).toString('utf8'));
    const errorEvent = () => finish(true);
    const abort = () => finish(true);
    const timer = setTimeout(() => finish(true), timeoutMs);
    timer.unref?.();
    req.on('data', data); req.on('end', end); req.on('error', errorEvent); req.on('aborted', abort);
  });
}
export function createHandler({ connection, getOrigin, controller }) {
  return async (req, res) => {
    try {
      const rejection = connection.requestRejection(req);
      if (rejection !== undefined) { send(res, rejection, { error: 'FORBIDDEN' }); return; }
      // Browser-owner-only, not delegated API credentials. No implicit localhost trust.
      const admission = connection.admit(req);
      if (!admission.peer || admission.peer.id !== connection.browserPeer.id ||
          admission.peer.principal.kind !== 'owner' || !LOOPBACK.has(req.socket?.remoteAddress)) {
        send(res, 403, { error: 'FORBIDDEN' }); return;
      }
      if (req.method !== 'POST') { res.setHeader('allow', 'POST'); send(res, 405, { error: 'BAD_REQUEST' }); return; }
      // Desktop's official forwardWebRequest checks the dsh-app origin, removes
      // Origin/Sec-Fetch-Site, and supplies the authenticated Host cookie. Missing
      // headers are NOT proof of Desktop identity: the trust, browser-peer and
      // loopback checks above must still pass. Never allow literal "null" origins,
      // contradictory Fetch Metadata, or a client-provided "desktop" bypass flag.
      const origin = req.headers.origin;
      const site = req.headers['sec-fetch-site'];
      const sameOrigin = origin === getOrigin() && (site === undefined || site === 'same-origin');
      const forwardedShape = origin === undefined && site === undefined;
      // The non-simple custom header + JSON gate excludes cross-site form/no-cors
      // submissions; this route does not approve CORS preflight (OPTIONS is 405).
      if ((!sameOrigin && !forwardedShape) || req.headers['x-codex-entry'] !== '1') {
        send(res, 403, { error: 'FORBIDDEN' }); return;
      }
      if (String(req.headers['content-type']).split(';')[0].trim().toLowerCase() !== 'application/json') {
        send(res, 415, { error: 'BAD_REQUEST' }); return;
      }
      const body = parseBody(await readBody(req));
      let value;
      if (body.action === 'status') value = await controller.snapshot(body.owner);
      if (body.action === 'start') value = await controller.start(body.owner);
      if (body.action === 'cancel') value = await controller.cancel(body.owner);
      if (body.action === 'answer') value = await controller.answer(body.owner, body.promptId, body.value);
      send(res, 200, { value });
    } catch (error) {
      const code = safeCode(error);
      send(res, code === 'FORBIDDEN' ? 403 : code === 'ALREADY_IN_FLIGHT' ? 409 : 400, { error: code });
    }
  };
}
