# Wind-Driven Ocean Waves - Implementation Plan

## Goal
Add realistic wind effects to Experiment 6c (working GPGPU water) to simulate how wind creates and shapes ocean waves.

---

## Wind Physics Overview

### How Wind Creates Waves (Real Ocean)

1. **Initial Ripples (Capillary Waves)**
   - Wind friction on water surface creates tiny ripples
   - < 1.7 cm wavelength
   - Surface tension dominant

2. **Wave Growth**
   - Wind transfers energy to ripples
   - Ripples grow into gravity waves
   - Fetch (distance) determines max size
   - Wind speed determines steepness

3. **Wave Propagation**
   - Waves travel in wind direction
   - Group velocity < individual wave velocity
   - Longer waves travel faster

4. **Beaufort Scale**
   - Maps wind speed → wave characteristics
   - Wind 10 knots → 0.5m waves
   - Wind 30 knots → 4m waves

---

## Proposed Implementation (3 Options)

### Option 1: Simple Wind Forcing ⭐ RECOMMENDED
**Pros:** Fast, works with existing simulation, easy to implement
**Cons:** Not physically perfect, but looks good

**How it works:**
1. Add wind direction + strength controls
2. Modify heightmap shader:
   - Add directional forcing (pushes gradient in wind direction)
   - Add random seed forcing (creates ambient ripples)
3. Periodically spawn ripples in wind direction (JavaScript)

**Code changes:**
```glsl
// In heightmap_frag shader:
uniform vec2 uWindDirection; // normalized direction
uniform float uWindStrength; // 0-10 scale

// Wind forcing term
vec2 gradient = vec2(east.x - west.x, north.x - south.x);
float windForce = uWindStrength * dot(uWindDirection, gradient) * 0.1;
newHeight += windForce;

// Ambient ripples (wind texture on surface)
float noise = sin(uv.x * 50.0 + uTime * 2.0) * sin(uv.y * 50.0 + uTime * 3.0);
newHeight += uWindStrength * 0.001 * noise;
```

**UI Controls:**
- Wind Direction (0-360°)
- Wind Strength (0-10) mapped to Beaufort scale
- Wind Gust toggle (periodic strength variation)

**Performance:** No impact (few extra shader ops)

---

### Option 2: FFT-Based Ocean Spectrum
**Pros:** Physically accurate, very realistic
**Cons:** Complex, slower, needs complete rewrite

**How it works:**
1. Use Phillips spectrum for wind-wave distribution
2. FFT to generate heightfield each frame
3. Inverse FFT for wave evolution

**Code complexity:** HIGH (need FFT implementation)
**Performance:** Medium (FFT is expensive but doable)

**Note:** This is what professional ocean sims use (Houdini, Unreal Engine)

---

### Option 3: Hybrid Approach
**Pros:** Balance of realism and performance
**Cons:** More complex than Option 1

**How it works:**
1. Keep GPGPU wave propagation (interactive)
2. Add pre-computed Gerstner waves for ambient ocean swell
3. Wind controls both systems

**Code changes:**
- Vertex shader: Add Gerstner wave displacement
- Heightmap shader: Add wind forcing
- Blend two systems (propagation + swell)

**Performance:** Slight hit from Gerstner evaluation

---

## Recommended Approach: Enhanced Option 1

### Phase 1: Basic Wind (30 min)
1. Add wind uniforms to heightmap shader
2. Add directional forcing term
3. Add UI sliders (direction, strength)
4. Test with various wind speeds

### Phase 2: Ambient Ripples (15 min)
1. Add multi-octave noise to shader
2. Spawn random ripples periodically (JS)
3. Modulate by wind strength

### Phase 3: Wind Gusts (15 min)
1. Add gust system (sine wave modulation)
2. Visual feedback (wind strength indicator)
3. Toggle control

### Phase 4: Beaufort Scale Mapping (Optional, 10 min)
1. Map wind strength to real-world speeds
2. Display wave height estimate
3. Preset buttons (Calm, Breeze, Gale, Storm)

---

## Visual Enhancements (Beyond Physics)

### Foam & Whitecaps
- Add foam on wave crests when wind > 5
- Threshold based on wave steepness
- Simple shader addition

### Wave Trails
- Ducks leave trails in wind direction
- Modify duck physics to create wake

### Atmospheric Effects
- Haze increases with wind
- Fog color shifts (stormy gray vs calm blue)

---

## Controls Design

### Proposed UI Layout
```
┌─ Wind Settings ────────┐
│ Direction:  [----●----] │ 0-360°
│ Strength:   [--●------] │ 0-10 (Beaufort)
│ Gust:       [Toggle]    │
│                         │
│ Presets:                │
│ [Calm] [Breeze] [Storm] │
└─────────────────────────┘
```

### Wind Strength Labels
- 0-1: Calm (mirror surface)
- 2-3: Light breeze (small ripples)
- 4-5: Moderate breeze (small waves)
- 6-7: Fresh wind (larger waves, foam)
- 8-10: Gale/Storm (steep waves, whitecaps)

---

## Testing Plan

1. **Wind = 0**: Verify no change (current behavior)
2. **Wind Direction = 0°**: Waves move East
3. **Wind Direction = 180°**: Waves move West
4. **Wind Strength = 3**: Gentle wave buildup
5. **Wind Strength = 8**: Strong wave activity
6. **Wind Gusts ON**: Periodic intensity changes
7. **Ducks in wind**: Should drift slightly downwind

---

## Expected Results

**Low Wind (1-3):**
- Small ripples appear
- Gentle wave motion
- Ducks bob gently

**Medium Wind (4-6):**
- Visible waves propagate
- Directional pattern clear
- Some foam on crests

**High Wind (7-10):**
- Large waves
- Choppy surface
- Foam trails
- Chaotic interaction

---

## Performance Budget

Current: ~60 FPS on your device
After wind: Should maintain 55-60 FPS

**Cost breakdown:**
- Wind forcing shader: +0.1ms/frame
- Ambient ripples: +0.2ms/frame
- Random spawn (JS): negligible
- Total impact: ~0.3ms = 3-5 FPS drop

**Safe to proceed!**

---

## Questions Before Implementation

1. **Which option?** (Recommend: Enhanced Option 1)
2. **Want Beaufort scale labels?** (Real wind speeds)
3. **Want preset buttons?** (Calm/Breeze/Storm)
4. **Want foam/whitecaps?** (Visual enhancement)
5. **Want wind gusts?** (Periodic variation)

Let me know your preferences and I'll implement! 🌊💨
