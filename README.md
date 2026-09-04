# Math Cards 🐻

A cute flash-card game for practicing addition and subtraction with the numbers **1, 2, and 5** — made for young kids (around age 5).

## Play it

No build step needed — just open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

It also works great hosted on GitHub Pages (serve the repo root).

## Features

- Pick **Adding**, **Taking Away**, or **Mix It Up!**
- Big, colorful, multiple-choice flash cards (numbers 1, 2, 5 only)
- A bouncy animal mascot that cheers you on
- Confetti and cheerful chime sounds for correct answers (generated with the Web Audio API — no audio files needed)
- Gentle, encouraging "try again" feedback for wrong answers — never harsh
- Star counter, streak badge, and a celebration screen at the end of each round
- Sound on/off toggle in the top-right corner
- Fully responsive for phones and tablets

## Files

- `index.html` — page structure
- `style.css` — styling and animations
- `script.js` — game logic, question generation, and sound engine
