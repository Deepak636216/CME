# System Design

The design for the real-time solar alert website described in [../SCOPE.md](../SCOPE.md).

| Read | What's inside |
|---|---|
| [TECH_STACK.md](TECH_STACK.md) | Chosen stack, free hosting research, latency budget |
| [backend/](backend/README.md) | Use cases & nouns, DB schema ([schema.sql](backend/schema.sql)), API flow & endpoints, components & router |
| [frontend/](frontend/README.md) | Use cases & UI nouns, client state schema, data flow, components & routes |
| [PLAN.md](PLAN.md) | Phase-by-phase build plan for both sides |
| [GAP_ANALYSIS.md](GAP_ANALYSIS.md) | Design and code checked against system-design best practice, with prioritised fixes |
| [frontend/DETAILED_DESIGN.md](frontend/DETAILED_DESIGN.md) | **HLD + LLD diagrams:** layers, stores, connection state machine, alert delivery, frame loop, Replay/Events, failure handling |
| [backend/DETAILED_DESIGN.md](backend/DETAILED_DESIGN.md) | **HLD + LLD diagrams:** topology, modules, schema, one tick, WebSocket session, alert engine, ops |
| [contract/DETAILED_DESIGN.md](contract/DETAILED_DESIGN.md) | **HLD + LLD diagrams:** packages, message shapes, delivery guarantees, validation and versioning, physics + mock + contract tests |

**In one line:** one Cloudflare Durable Object polls NOAA and NASA every ~5 s, computes, stores in SQLite, and pushes deltas over WebSockets. A React + three.js site on Cloudflare Pages renders them at 60 fps. Hosting costs $0.

## Regenerating the diagrams

The diagrams are drawn with Excalidraw. Open each `diagrams/src/*.excalidraw` file in [excalidraw.com](https://excalidraw.com) to edit by hand. To rebuild them all from code:

```bash
cd docs/design/_tools
npx -y mcp-excalidraw-server start     # then open http://127.0.0.1:3000 in a browser
python backend_diagrams.py
python frontend_diagrams.py
python hld_lld.py          # HLD + LLD diagrams for backend, frontend, contract
```
