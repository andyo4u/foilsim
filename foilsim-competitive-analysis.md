# FoilSim Competitive Analysis

*Date: 2026-02-23*

## Executive Summary

The hydrofoil/e-foil simulation space is virtually **unoccupied**. There is no dedicated e-foil simulator on any platform. The closest competitor (Hydrofoil Generation) focuses on sailing foils, not surf/e-foils. The broader water sports sim market is small, fragmented, and underserved — particularly on web/mobile. FoilSim has a genuine first-mover opportunity in e-foil simulation.

---

## 1. Competitor Comparison Table

| Game | Platform | Price | Engine/Tech | Reviews | Category |
|------|----------|-------|-------------|---------|----------|
| **Hydrofoil Generation** | PC (Steam) | ~$20 (50% sales) | Custom Rust engine | Very Positive (86%, ~100 reviews) | Sailing foil sim |
| **True Surf** | iOS, Android, Meta Quest VR | Free (IAP) | Custom mobile | 4.5★ App Store, millions downloads | Surfing sim |
| **YouRiding** | Steam, iOS, Android, Web | Free (IAP) | Proprietary wave physics | Very Positive (81%, 58 reviews) | Surfing/bodyboarding |
| **Barton Lynch Pro Surfing** | PC, PS5, Xbox | ~$40 | Unreal Engine | Very Positive (84%, 50 reviews) | Pro surfing sim |
| **Virtual Surfing** | PC (Steam) | ~$20 | Unity | Mixed (~70%) | Surfing sim |
| **Surfers Code** | PC (Steam) | ~$20 | Custom | Positive (small) | Open-world surfing |
| **Search for Surf** | PC (Steam) | ~$15 | Custom | Positive | Open-world surfing |
| **SkaterXL** | PC, Console | $40 | Unity | Mixed (60%) | Physics skateboarding |
| **Descenders** | PC, Console | $25 | Unity | Overwhelmingly Positive (95%, 10K+) | Physics MTB |
| **Steep** | PC, Console | $30 | Anvil (Ubisoft) | Very Positive | Winter sports open-world |

---

## 2. Feature Matrix

| Feature | FoilSim | Hydrofoil Gen | True Surf | YouRiding | Barton Lynch | Descenders |
|---------|---------|--------------|-----------|-----------|--------------|------------|
| **Web-based (no install)** | ✅ | ❌ | ❌ | ⚠️ (old ver) | ❌ | ❌ |
| **Mobile support** | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| **E-foil/hydrofoil focus** | ✅ | ⚠️ (sailing) | ❌ | ❌ | ❌ | ❌ |
| **Real terrain/locations** | ✅ | ❌ | ✅ (real spots) | ✅ (real spots) | ✅ | ❌ (procedural) |
| **Wave physics** | ✅ | ✅ (wind/water) | ✅ | ✅ | ✅ | N/A |
| **Multiplayer** | ❌ | ✅ | ⚠️ (async) | ✅ | ❌ | ✅ |
| **VR support** | ❌ | ❌ | ✅ (Quest) | ❌ | ❌ | ❌ |
| **Multiple render modes** | ✅ (11) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Level/wave editor** | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Career/progression** | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Leaderboards** | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Character customization** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Free to play** | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| **3D engine** | Three.js | Custom Rust | Custom | Proprietary | UE | Unity |

---

## 3. Pricing Analysis

| Tier | Games | Notes |
|------|-------|-------|
| **Free + IAP** | True Surf, YouRiding | Most successful reach on mobile; monetize via cosmetics, wave packs, premium conditions |
| **$15–25** | Descenders, Virtual Surfing, Search for Surf | Sweet spot for indie physics games |
| **$30–40** | Barton Lynch, Steep, SkaterXL | Premium tier; requires polish + content depth |
| **$20 + DLC** | Hydrofoil Generation (SailGP DLC) | Niche sim pricing with official license content |

**Recommendation for FoilSim:** Free web demo → Premium features via subscription or one-time unlock ($5–15). The web-based zero-install advantage makes freemium the natural model.

---

## 4. Gap Analysis — What's Missing from the Market

### 🎯 Massive Gaps FoilSim Can Own

1. **No e-foil simulator exists anywhere.** Zero competition. Hydrofoil Generation is sailing foils (AC75, SailGP). Nobody simulates the e-foil/surf foil experience.

2. **No web-based water sports sim.** Every competitor requires download/install. FoilSim's instant-play-in-browser is unique across the entire category.

3. **No foil sport on mobile.** True Surf dominates mobile surfing but has no foiling mode (they've teased it for Quest VR but haven't shipped it for mobile).

4. **Real terrain + foiling = nobody.** Real locations exist in surfing games but not for foil runs (downwind runs, coastal routes).

5. **Training/learning tool gap.** No simulator helps people learn foiling before buying a $5K–15K e-foil. Brands like Lift, Fliteboard, Waydoo have no companion sim/game.

### Secondary Gaps

6. **Downwind foiling simulation** — a growing discipline with zero game representation
7. **Board/foil configuration playground** — no game lets you experiment with mast height, wing size, etc.
8. **Social/multiplayer foiling** — group rides, races on real routes
9. **Integration with real conditions** — wind/swell data for real-time simulation

---

## 5. MVP Feature Recommendations

Based on competitive landscape, prioritized:

### Must-Have (Competitive Parity + Differentiation)

1. **Playable game loop** — Score system, run completion, personal bests. Every competitor has this; FoilSim is currently a tech demo.
2. **Leaderboards** — Even basic time-trial leaderboards per course. Low effort, high retention.
3. **2–3 polished courses** — Columbia Gorge + Maliko Run are great starts. Quality > quantity.
4. **Tutorial/onboarding** — Teach foiling basics. Doubles as marketing for the sport.

### High-Value Differentiators

5. **Board/foil customization** — Mast height, wing area, board volume. No competitor does this. Educational + fun.
6. **Real wind/swell conditions** — Pull live data from weather APIs. True Surf does this for surfing; nobody does it for foiling.
7. **Instant sharing** — "Share this run" link (web-native advantage). Viral growth mechanic.
8. **Brand partnerships** — Approach Lift Foils, Fliteboard, Waydoo as sponsors/partners. They sell $10K products with no try-before-you-buy option.

### Growth Features (Post-MVP)

9. **Multiplayer races** — Group downwind runs
10. **Course editor** — Upload real terrain, define routes
11. **VR mode** — Three.js → WebXR is feasible. True Surf proved VR surfing works.
12. **Mobile app wrapper** — PWA or Capacitor for App Store presence

---

## 6. Strategic Positioning

### FoilSim's Unique Position
```
                    Realistic ←————————→ Arcade
                         |
            Hydrofoil Gen ●
                         |
                FoilSim  ●  ← Only e-foil sim, web-native
                         |
             True Surf   ●
                         |
            Descenders       ●
                         |
                    Niche ←————————→ Mass Market
```

### Key Insight
The e-foil market is booming ($1.5B+ and growing). Every major e-foil brand needs a way to let potential customers "try before they buy." FoilSim could be both a **game** and a **marketing tool for e-foil brands** — a dual revenue model no competitor has.

### Recommended Tagline Positioning
> "The world's first e-foil simulator. Fly above the water — no ocean required."

---

## Competitor Deep Dives

### Hydrofoil Generation (Closest Competitor)
- **Developer:** Jaxx Vane Studio (Stefano "kunos" Casillo, co-founder of Kunos Simulazioni / Assetto Corsa)
- **Focus:** Sailing foil racing (AC75, SailGP boats), NOT personal foiling
- **Tech:** 100% Rust, custom engine, realistic wind/water physics
- **Strengths:** Hardcore sim credibility, SailGP official license, excellent physics
- **Weaknesses:** Tiny community (~100 reviews), PC-only, steep learning curve, no casual mode
- **Threat to FoilSim:** LOW — different sport (sailing vs personal foiling)

### True Surf (Market Leader in Water Sports Mobile)
- **Developer:** True Axis (Australia)
- **Focus:** Surfing (WSL official game), recently launched on Meta Quest
- **Tech:** Custom mobile engine, real wave data via Surfline
- **Business:** Free + IAP (boards, gear, wave conditions) — reportedly predatory monetization
- **Strengths:** WSL license, massive install base, real conditions, expanding to VR
- **Weaknesses:** No foiling mode, pay-to-play complaints, mobile-only quality
- **Threat to FoilSim:** MEDIUM — if they add foiling to their VR version

### YouRiding
- **Developer:** Small indie team
- **Focus:** Surfing + bodyboarding with wave editor
- **Business:** Free-to-play across all platforms
- **Strengths:** Cross-platform, wave editor/community, long history (10+ years)
- **Weaknesses:** Dated graphics, complaints about Steam paid version vs old free web game
- **Threat to FoilSim:** LOW

### Descenders (Adjacent Model to Study)
- **Why it matters:** Best example of physics-based action sports done right as an indie
- **Key lessons:** Procedural generation keeps content fresh, tight game feel matters more than graphics, roguelike progression adds replayability, community modding extends life
- **10K+ reviews, 95% positive** on a $25 price point — proof that niche physics sports games can succeed

---

*Report prepared for FoilSim v0.89 strategic planning*
