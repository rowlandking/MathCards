(() => {
  'use strict';

  const NUMBER_RANGE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const ROUND_LENGTH = 10;
  const MASCOTS = ['🐻', '🐰', '🦊', '🐶', '🐱', '🐼'];
  const HAPPY_LINES = ['Yay!', 'You got it!', 'Super!', 'Woohoo!', 'Amazing!', 'Great job!', 'You\'re a star!'];
  const TRY_AGAIN_LINES = ['Almost!', 'So close!', 'Try again!', 'You can do it!'];
  const START_LINES = ['Hi friend! Ready to play?', 'Let\'s count together!', 'I love numbers, do you?'];
  const WIGGLE_CHALLENGES = [
    '🤸 3 Jumping Jacks!',
    '🌀 Spin Around 3 Times!',
    '🐸 5 Froggy Jumps!',
    '🙆 Touch Your Toes 3 Times!',
    '🦘 Hop on One Foot 5 Times!',
    '⭐ 3 Star Jumps!',
    '🦆 Waddle Like a Duck 5 Steps!',
    '🎉 Do a Happy Dance for 5 Seconds!',
  ];

  // ---------- Settings persistence (sticky across visits) ----------
  const SETTINGS_KEY = 'mathcards.settings.v1';
  const DEFAULT_SETTINGS = { mode: 'mix', numbers: [1, 2, 5], retryOnWrong: false, wiggleOnWrong: false };

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS, numbers: DEFAULT_SETTINGS.numbers.slice() };
      const parsed = JSON.parse(raw);
      const numbers = Array.isArray(parsed.numbers)
        ? parsed.numbers.filter(n => NUMBER_RANGE.includes(n))
        : [];
      return {
        mode: ['add', 'sub', 'mix'].includes(parsed.mode) ? parsed.mode : DEFAULT_SETTINGS.mode,
        numbers: numbers.length ? numbers : DEFAULT_SETTINGS.numbers.slice(),
        retryOnWrong: !!parsed.retryOnWrong,
        wiggleOnWrong: !!parsed.wiggleOnWrong,
      };
    } catch (e) {
      return { ...DEFAULT_SETTINGS, numbers: DEFAULT_SETTINGS.numbers.slice() };
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        mode: state.mode,
        numbers: state.numbers,
        retryOnWrong: state.retryOnWrong,
        wiggleOnWrong: state.wiggleOnWrong,
      }));
    } catch (e) { /* private browsing / storage disabled — settings just won't stick */ }
  }

  // ---------- Sound engine (Web Audio API, no external files) ----------
  let audioCtx = null;
  let soundOn = true;

  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function tone(freq, startTime, duration, type = 'sine', peakGain = 0.18) {
    const ctx = audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  function playMelody(notes, type = 'sine') {
    if (!soundOn) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    let t = ctx.currentTime;
    notes.forEach(([freq, dur]) => {
      tone(freq, t, dur, type);
      t += dur * 0.85;
    });
  }

  const Sound = {
    click() { playMelody([[520, 0.07]], 'triangle'); },
    correct() { playMelody([[523.25, 0.12], [659.25, 0.12], [783.99, 0.22]], 'sine'); },
    wrong() { playMelody([[349.23, 0.16], [293.66, 0.22]], 'sine'); },
    win() {
      playMelody([
        [523.25, 0.14], [587.33, 0.14], [659.25, 0.14],
        [783.99, 0.14], [659.25, 0.1], [783.99, 0.28]
      ], 'triangle');
    },
  };

  // ---------- Confetti ----------
  const CONFETTI_COLORS = ['#ff8fb1', '#b28dff', '#7ec8ff', '#ffd166', '#8ce99a', '#ffab76'];
  function burstConfetti(count = 60) {
    const root = document.getElementById('confetti-root');
    for (let i = 0; i < count; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      const size = 6 + Math.random() * 8;
      piece.style.width = size + 'px';
      piece.style.height = size * 0.6 + 'px';
      piece.style.left = Math.random() * 100 + 'vw';
      piece.style.background = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
      const duration = 1.8 + Math.random() * 1.4;
      piece.style.animationDuration = duration + 's';
      piece.style.animationDelay = (Math.random() * 0.3) + 's';
      root.appendChild(piece);
      setTimeout(() => piece.remove(), (duration + 0.5) * 1000);
    }
  }

  // ---------- Game state ----------
  const state = {
    mode: 'mix',
    numbers: [1, 2, 5],
    retryOnWrong: false,
    wiggleOnWrong: false,
    round: 0,
    stars: 0,
    streak: 0,
    mascot: '🐻',
    current: null,
    locked: false,
    bag: [],
    lastQuestionKey: null,
  };

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // Every distinct problem for the chosen numbers/mode, so a round draws from
  // a shuffled "bag" instead of random.random() — no repeats until all are seen.
  function buildPool(mode, numbers) {
    const pool = [];
    if (mode === 'add' || mode === 'mix') {
      numbers.forEach(a => numbers.forEach(b => {
        pool.push({ a, b, op: 'add', symbol: '+', answer: a + b });
      }));
    }
    if (mode === 'sub' || mode === 'mix') {
      numbers.forEach(a => numbers.forEach(b => {
        if (a >= b) pool.push({ a, b, op: 'sub', symbol: '−', answer: a - b });
      }));
    }
    return pool;
  }

  function questionKey(q) { return `${q.op}:${q.a}:${q.b}`; }

  function refillBag(mode, numbers) {
    const pool = shuffle(buildPool(mode, numbers));
    // avoid the reshuffled bag starting with the question that just ended the last one
    if (state.lastQuestionKey && pool.length > 1 && questionKey(pool[0]) === state.lastQuestionKey) {
      [pool[0], pool[1]] = [pool[1], pool[0]];
    }
    state.bag = pool;
  }

  function drawQuestion(mode, numbers) {
    if (state.bag.length === 0) refillBag(mode, numbers);
    const template = state.bag.shift();
    state.lastQuestionKey = questionKey(template);
    const maxVal = Math.max(...numbers) * 2;
    return { ...template, choices: buildChoices(template.answer, maxVal) };
  }

  function buildChoices(answer, maxVal) {
    // a little headroom above the true max sum so tiny number sets (even just "0")
    // always have enough plausible-looking distractors to fill 3 choices
    const ceiling = Math.max(maxVal + 4, 4);
    const set = new Set([answer]);
    let guard = 0;
    while (set.size < 3 && guard < 50) {
      guard += 1;
      const offset = pick([-2, -1, 1, 2]);
      let candidate = answer + offset;
      if (candidate < 0) candidate = answer + Math.abs(offset);
      if (candidate > ceiling) candidate = Math.max(0, answer - Math.abs(offset));
      set.add(candidate);
    }
    for (let filler = 0; set.size < 3 && filler <= ceiling; filler += 1) set.add(filler);
    return shuffle([...set]);
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ---------- DOM refs ----------
  const screens = {
    start: document.getElementById('screen-start'),
    game: document.getElementById('screen-game'),
    results: document.getElementById('screen-results'),
  };
  const soundToggle = document.getElementById('soundToggle');
  const startBubble = document.getElementById('startBubble');
  const subtitleEl = document.querySelector('#screen-start .subtitle');
  const mascotStart = document.getElementById('mascot');
  const mascotGame = document.getElementById('mascotGame');
  const modeButtons = document.querySelectorAll('.mode-btn');
  const numberChips = document.querySelectorAll('.number-chip');
  const retryToggle = document.getElementById('retryToggle');
  const wiggleToggle = document.getElementById('wiggleToggle');
  const wiggleOverlay = document.getElementById('wiggleOverlay');
  const wiggleText = document.getElementById('wiggleText');
  const wiggleDoneBtn = document.getElementById('wiggleDoneBtn');
  const startBtn = document.getElementById('startBtn');
  const againBtn = document.getElementById('againBtn');
  const starCount = document.getElementById('starCount');
  const progressFill = document.getElementById('progressFill');
  const streakBadge = document.getElementById('streakBadge');
  const streakCount = document.getElementById('streakCount');
  const card = document.getElementById('card');
  const cardQuestion = document.getElementById('cardQuestion');
  const answersEl = document.getElementById('answers');
  const feedbackEl = document.getElementById('feedback');
  const finalStars = document.getElementById('finalStars');
  const resultMessage = document.getElementById('resultMessage');

  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
  }

  // ---------- Start screen ----------
  state.mascot = pick(MASCOTS);
  mascotStart.textContent = state.mascot;
  mascotGame.textContent = state.mascot;
  startBubble.textContent = pick(START_LINES);

  function formatNumberList(nums) {
    const sorted = [...nums].sort((a, b) => a - b);
    if (sorted.length === 1) return String(sorted[0]);
    return sorted.slice(0, -1).join(', ') + ' & ' + sorted[sorted.length - 1];
  }

  function updateSubtitle() {
    subtitleEl.textContent = `Let's count with ${formatNumberList(state.numbers)}!`;
  }

  // restore sticky settings from a previous visit
  const saved = loadSettings();
  state.mode = saved.mode;
  state.numbers = saved.numbers;
  state.retryOnWrong = saved.retryOnWrong;
  state.wiggleOnWrong = saved.wiggleOnWrong;

  modeButtons.forEach(b => b.classList.toggle('selected', b.dataset.mode === state.mode));
  numberChips.forEach(chip => chip.classList.toggle('selected', state.numbers.includes(Number(chip.dataset.num))));
  retryToggle.classList.toggle('on', state.retryOnWrong);
  retryToggle.setAttribute('aria-pressed', String(state.retryOnWrong));
  wiggleToggle.classList.toggle('on', state.wiggleOnWrong);
  wiggleToggle.setAttribute('aria-pressed', String(state.wiggleOnWrong));
  updateSubtitle();

  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      Sound.click();
      modeButtons.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.mode = btn.dataset.mode;
      saveSettings();
    });
  });

  numberChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const n = Number(chip.dataset.num);
      const idx = state.numbers.indexOf(n);
      if (idx >= 0) {
        if (state.numbers.length === 1) return; // always keep at least one number picked
        state.numbers.splice(idx, 1);
        chip.classList.remove('selected');
      } else {
        state.numbers.push(n);
        chip.classList.add('selected');
      }
      state.numbers.sort((a, b) => a - b);
      Sound.click();
      updateSubtitle();
      saveSettings();
    });
  });

  retryToggle.addEventListener('click', () => {
    Sound.click();
    state.retryOnWrong = !state.retryOnWrong;
    retryToggle.classList.toggle('on', state.retryOnWrong);
    retryToggle.setAttribute('aria-pressed', String(state.retryOnWrong));
    saveSettings();
  });

  wiggleToggle.addEventListener('click', () => {
    Sound.click();
    state.wiggleOnWrong = !state.wiggleOnWrong;
    wiggleToggle.classList.toggle('on', state.wiggleOnWrong);
    wiggleToggle.setAttribute('aria-pressed', String(state.wiggleOnWrong));
    saveSettings();
  });

  let wiggleDoneCallback = null;
  function triggerWiggleBreak(onDone) {
    wiggleText.textContent = pick(WIGGLE_CHALLENGES);
    wiggleOverlay.hidden = false;
    wiggleDoneCallback = onDone;
  }
  wiggleDoneBtn.addEventListener('click', () => {
    Sound.click();
    wiggleOverlay.hidden = true;
    const cb = wiggleDoneCallback;
    wiggleDoneCallback = null;
    if (cb) cb();
  });

  soundToggle.addEventListener('click', () => {
    soundOn = !soundOn;
    soundToggle.textContent = soundOn ? '🔊' : '🔇';
    if (soundOn) { ensureAudio(); Sound.click(); }
  });

  startBtn.addEventListener('click', () => {
    ensureAudio();
    Sound.click();
    startGame();
  });

  againBtn.addEventListener('click', () => {
    ensureAudio();
    Sound.click();
    startGame();
  });

  // ---------- Game flow ----------
  function startGame() {
    state.round = 0;
    state.stars = 0;
    state.streak = 0;
    state.bag = [];
    state.lastQuestionKey = null;
    starCount.textContent = '0';
    progressFill.style.width = '0%';
    streakBadge.hidden = true;
    showScreen('game');
    nextQuestion();
  }

  function nextQuestion() {
    if (state.round >= ROUND_LENGTH) {
      finishRound();
      return;
    }
    state.round += 1;
    state.locked = false;
    feedbackEl.textContent = '';
    feedbackEl.className = 'feedback';
    progressFill.style.width = ((state.round - 1) / ROUND_LENGTH) * 100 + '%';

    const q = drawQuestion(state.mode, state.numbers);
    state.current = q;

    cardQuestion.textContent = `${q.a} ${q.symbol} ${q.b} = ?`;
    card.classList.remove('pop-in', 'shake');
    void card.offsetWidth;
    card.classList.add('pop-in');

    answersEl.innerHTML = '';
    q.choices.forEach(choice => {
      const btn = document.createElement('button');
      btn.className = 'answer-btn';
      btn.textContent = choice;
      btn.addEventListener('click', () => onAnswer(choice, btn));
      answersEl.appendChild(btn);
    });
  }

  function onAnswer(choice, btn) {
    if (state.locked || btn.disabled) return;
    const correct = choice === state.current.answer;
    const allBtns = answersEl.querySelectorAll('.answer-btn');

    if (correct) {
      state.locked = true;
      allBtns.forEach(b => b.disabled = true);
      btn.classList.add('correct');
      state.stars += 1;
      state.streak += 1;
      starCount.textContent = String(state.stars);
      feedbackEl.textContent = pick(HAPPY_LINES) + ' 🎉';
      feedbackEl.className = 'feedback';
      mascotGame.classList.remove('oops');
      void mascotGame.offsetWidth;
      mascotGame.classList.add('happy');
      Sound.correct();
      if (state.streak >= 3) {
        streakBadge.hidden = false;
        streakCount.textContent = String(state.streak);
      }
      if (state.streak > 0 && state.streak % 5 === 0) {
        burstConfetti(40);
      }
      progressFill.style.width = (state.round / ROUND_LENGTH) * 100 + '%';
      setTimeout(nextQuestion, 1100);
      return;
    }

    btn.classList.add('wrong');
    btn.disabled = true;
    state.streak = 0;
    streakBadge.hidden = true;
    feedbackEl.className = 'feedback wrong-text';
    mascotGame.classList.remove('happy', 'oops');
    card.classList.remove('shake');
    void mascotGame.offsetWidth;
    mascotGame.classList.add('oops');
    card.classList.add('shake');
    Sound.wrong();

    const continueAfterWrong = () => {
      if (state.retryOnWrong) {
        // leave the other buttons live so the child can pick again — no reveal, no auto-advance
        feedbackEl.textContent = pick(TRY_AGAIN_LINES) + ' Try another one!';
        return;
      }

      state.locked = true;
      allBtns.forEach(b => b.disabled = true);
      feedbackEl.textContent = pick(TRY_AGAIN_LINES);

      // reveal correct answer gently, then move on
      setTimeout(() => {
        allBtns.forEach(b => {
          if (Number(b.textContent) === state.current.answer) {
            b.classList.add('correct');
          }
        });
      }, 500);
      setTimeout(nextQuestion, 1600);
    };

    if (state.wiggleOnWrong) {
      feedbackEl.textContent = pick(TRY_AGAIN_LINES);
      triggerWiggleBreak(continueAfterWrong);
    } else {
      continueAfterWrong();
    }
  }

  function finishRound() {
    progressFill.style.width = '100%';
    finalStars.textContent = String(state.stars);
    let msg = 'You\'re a math superstar!';
    if (state.stars <= ROUND_LENGTH * 0.4) msg = 'Great try! Let\'s play again!';
    else if (state.stars <= ROUND_LENGTH * 0.8) msg = 'Wow, look at you go!';
    resultMessage.textContent = msg;
    showScreen('results');
    Sound.win();
    burstConfetti(90);
  }
})();
