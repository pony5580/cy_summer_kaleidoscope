# High-End Animation & Web Design Guidelines

## Tech Stack & Libraries

- **Framework**: Next.js (App Router) / React + TypeScript
- **Styling**: Tailwind CSS
- **Animation Primary**: GSAP + ScrollTrigger (for complex scroll timeline/pinning) or Framer Motion / Motion (for UI interaction/gestures)
- **Smooth Scroll**: Lenis
- **3D/WebGL (If needed)**: Three.js / React Three Fiber (R3F)

## Design System & Motion Principles

### 1. Reject Generic AI Aesthetic

- Do NOT use repetitive Purple/Blue gradients with generic rounded cards.
- Establish a clear visual identity (e.g., Editorial, Cinematic Minimal, Cyber Brutalism, High-fashion Typography).
- Use dynamic scale, bold display fonts, and strong grid structures with intentional white space.

### 2. Animation Rules & Performance

- **Property Restriction**: Only animate `transform` (translate, scale, rotate) and `opacity`. NEVER animate `width`, `height`, `top`, or `margin` to prevent layout reflows.
- **Will-Change**: Apply `will-change: transform` only when actively animating heavy elements, and clean it up afterward.
- **Easing**:
  - Entrance/Exit: Use custom ease-out curves (e.g., `cubic-bezier(0.16, 1, 0.3, 1)`).
  - Gestures/Hover: Prefer Spring physics (`stiffness: 300, damping: 30`).
- **Staggering**: Group items should enter sequentially with 0.05s–0.1s stagger delays.

### 3. Scroll-Driven Animations

- Synchronize smooth scrolling via **Lenis**.
- When using **GSAP ScrollTrigger**:
  - Always clean up triggers on component unmount (`ctx.revert()`).
  - Use `scrub: true` or `scrub: 1` for fluid scroll-tied progress.
- Implement subtle parallax effects (10%–20% depth offset) to add visual depth.

### 4. Accessibility & Safety

- Wrap high-motion elements with `@media (prefers-reduced-motion: reduce)` fallbacks.
- Keep interactive animations subtle; avoid distracting full-screen looping animations.
