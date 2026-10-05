# @cme/contract-tests

The `/api/v1` contract as executable tests ([design](../../docs/design/contract/DETAILED_DESIGN.md#7-contract-test-suite-t1-built)). Any backend, mock or real, must pass them.

```bash
npm run test:contract                                   # against the mock, started in-process (also part of npm test / CI)

# against a running server
CONTRACT_BASE_URL=http://localhost:8787 CONTRACT_CONTROL=mock npm run test:contract     # a mock you started yourself
CONTRACT_BASE_URL=http://localhost:8788 CONTRACT_WAIT_MS=150000 npm run test:contract   # the Worker (wrangler dev), real-time
```

| Variable | Meaning |
|---|---|
| `CONTRACT_BASE_URL` | Server to test. Unset: start the mock in-process at 600× speed |
| `CONTRACT_CONTROL=mock` | The server has the `/mock/*` controls (test alerts). Without it, tests that need to trigger events are skipped, and the server must **not** have `/mock/*` routes |
| `CONTRACT_WAIT_MS` | How long to wait for stream traffic (default 8000). A real-time server sends a delta about once a minute |

Every message and response is also validated against the schemas in `@cme/shared`.
