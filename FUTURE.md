# Foilsim — Future Performance & Feature Roadmap

## Performance Quick Wins (Current Three.js r128)

- [ ] **Adaptive ocean LOD** — Reduce ocean segments from 512x512 to 256x256 on lower-end devices (262K → 65K vertices)
- [ ] **Terrain LOD** — Use step=4 or step=8 for Maliko's 76km terrain instead of step=2 everywhere
- [ ] **Shader simplification toggle** — "Performance" checkbox that reduces FBM octaves from 6→3, skips subsurface scattering, simplifies cloud noise
- [ ] **Frustum culling for cliffs** — Skip rendering cliff segments behind the camera

## Performance Major (Requires Three.js Upgrade)

- [ ] **Upgrade Three.js r128 → r171+** — Needed for WebGPU support
- [ ] **WebGPU renderer** — 2-10x draw-call improvement, automatic WebGL fallback
- [ ] **Convert GLSL shaders to TSL** (Three Shader Language) — Required for WebGPU path
- [ ] **GPU compute shaders for wave physics** — Move CPU wave calc to GPU (10-100x for physics)
- [ ] **Texture compression (KTX2/Basis)** — 2x texture load time improvement

## Standalone App (Optional)

- [ ] **Electron wrapper** — Zero code changes, gives file I/O and offline use, but same GPU perf as Chrome
- [ ] **Tauri** — Lighter weight (10MB vs 200MB), but has documented WebGL issues with Three.js

### Why Not Standalone First?
Electron/Tauri wrap the same WebGL pipeline — GPU shaders run at the same speed as in Chrome. The real bottleneck is CPU-side JavaScript (wave physics, animation loop) and WebGL draw-call overhead, both addressed by WebGPU upgrade.

## Anti-Cheat: Supabase Edge Function (Future)

Currently the client computes the score and POSTs it directly to Supabase with a client-side checksum. Moving to a Supabase Edge Function would make this much harder to cheat:

- **Client sends raw telemetry** instead of a computed score: replay log sampled every 10s (position, speed, heading, energy), plus summary stats
- **Edge Function validates physics**: checks distance between points is plausible given speed, speed doesn't exceed caps, energy stays 0-1, session time ≤ 120s
- **Edge Function recomputes score** server-side using the formula `floor(distance + 2*pocketTime + 10*(topSpeed_mph))` — scoring formula never in client JS
- **RLS change**: remove anon INSERT on rufus_leaderboard, only service role (Edge Function) can write
- **Rate limiting**: same IP can't submit more than 1 score per 60s
- **Deployment**: `supabase functions deploy submit-score`, set `SERVICE_ROLE_KEY` as secret
- **Cost**: free tier covers 500K invocations/month

This blocks casual curl/Postman cheating and fabricated scores. Won't stop a bot that actually plays the game (but that's fair play). Full plan was designed in conversation — search for "Edge Function" in plans.

## Notes
- Native rewrite (C++/Rust/Vulkan) estimated at 6-12 months for ~3-5x gain — not worth it
- WebGPU is production-ready in Three.js r171+ (Sept 2025), Safari 26 added support
- Current heaviest scene: Maliko HD (76km x 51km terrain + 262K ocean vertices + 7 shaders)
