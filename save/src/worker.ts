// The save service as a Cloudflare Worker: `pnpm dev` here runs it locally (wrangler dev), `pnpm deploy` publishes
// it. Its secrets (GITHUB_CLIENT_SECRET, SESSION_KEY) are set with `wrangler secret put`; see README.md.
import { handle, type Env } from './service';

export default {
  fetch: (req: Request, env: Env) => handle(req, env),
};
