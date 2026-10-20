/* Arkanoid — a small canvas breakout clone.
   Fixed logical resolution of 800x600; CSS scales the canvas, and pointer
   input is mapped back through the bounding rect. */
(() => {
  'use strict';

  const W = 800, H = 600;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const el = {
    score: document.getElementById('score'),
    level: document.getElementById('level'),
    lives: document.getElementById('lives'),
    hiscore: document.getElementById('hiscore'),
    overlay: document.getElementById('overlay'),
    title: document.getElementById('ov-title'),
    text: document.getElementById('ov-text'),
    btn: document.getElementById('ov-btn'),
    mute: document.getElementById('muteBtn'),
  };

  // --- level maps -----------------------------------------------------------
  // '.' empty, digits 1-3 = hits needed, 'x' = indestructible
  const LEVELS = [
    [
      '.111111111111.',
      '.122222222221.',
      '.123333333321.',
      '.122222222221.',
      '.111111111111.',
    ],
    [
      '11..111111..11',
      '1x..122221..x1',
      '11..123321..11',
      '.111122221111.',
      '..1111111111..',
    ],
    [
      '2.2.2.2.2.2.2.',
      '.3.3.3.3.3.3.3',
      '2.2.2.2.2.2.2.',
      '.x.x.x.x.x.x.x',
      '1111111111111.',
    ],
    [
      '...33333333...',
      '..3222222223..',
      '.321111111123.',
      '..3x111111x3..',
      '...33333333...',
      '....111111....',
    ],
    [
      '3x3x3x3x3x3x3x',
      '22222222222222',
      '11111111111111',
      '.2.2.2.2.2.2.2',
      '33.33.33.33.33',
      '..1111111111..',
    ],
  ];

  const COLS = 14;
  const BRICK_W = 52, BRICK_H = 22, BRICK_GAP = 4;
  const FIELD_X = (W - (COLS * (BRICK_W + BRICK_GAP) - BRICK_GAP)) / 2;
  const FIELD_Y = 70;

  const BRICK_COLORS = { 1: '#ff5d73', 2: '#ffc542', 3: '#38e8ff', x: '#7b86b8' };

  // Bounce angles are measured off vertical. The floor keeps a dead-centre
  // paddle hit from sending the ball straight up, where it can lock into an
  // empty column and bounce forever; the ceiling keeps it from skimming
  // almost horizontally across the field.
  const MIN_ANGLE = 0.26;   // ~15 degrees
  const MAX_ANGLE = Math.PI / 3;  // 60 degrees

  // --- state ----------------------------------------------------------------
  const state = {
    mode: 'menu',          // menu | ready | playing | paused | levelclear | over | win
    score: 0,
    lives: 3,
    levelIndex: 0,
    bricks: [],
    balls: [],
    powerups: [],
    particles: [],
    sticky: false,
    paddleTargetX: null,
    keys: { left: false, right: false },
    shakeFrames: 0,
  };

  const paddle = { x: W / 2 - 55, y: H - 40, w: 110, h: 14, speed: 9 };

  let hiscore = Number(localStorage.getItem('arkanoid.hiscore') || 0);
  el.hiscore.textContent = hiscore;

  // --- audio ----------------------------------------------------------------
  let audioCtx = null;
  let muted = localStorage.getItem('arkanoid.muted') === '1';
  el.mute.textContent = 'Sound: ' + (muted ? 'off' : 'on');

  function beep(freq, duration = 0.06, type = 'square', gain = 0.05) {
    if (muted) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const vol = audioCtx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      vol.gain.setValueAtTime(gain, audioCtx.currentTime);
      vol.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
      osc.connect(vol).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (_) { /* audio is a nicety, never fatal */ }
  }

  el.mute.addEventListener('click', () => {
    muted = !muted;
    localStorage.setItem('arkanoid.muted', muted ? '1' : '0');
    el.mute.textContent = 'Sound: ' + (muted ? 'off' : 'on');
    el.mute.blur();
  });

  // --- helpers --------------------------------------------------------------
  function makeBall(x, y, vx, vy) {
    return { x, y, vx, vy, r: 8, stuck: false, offset: null };
  }

  function loadLevel(i) {
    const map = LEVELS[i % LEVELS.length];
    state.bricks = [];
    map.forEach((row, r) => {
      for (let c = 0; c < COLS; c++) {
        const ch = row[c] || '.';
        if (ch === '.') continue;
        state.bricks.push({
          x: FIELD_X + c * (BRICK_W + BRICK_GAP),
          y: FIELD_Y + r * (BRICK_H + BRICK_GAP),
          w: BRICK_W,
          h: BRICK_H,
          hits: ch === 'x' ? Infinity : Number(ch),
          kind: ch,
          alive: true,
        });
      }
    });
    state.powerups = [];
    state.particles = [];
    paddle.w = 110;
    state.sticky = false;
    resetBall();
  }

  function resetBall() {
    paddle.x = W / 2 - paddle.w / 2;
    const b = makeBall(W / 2, paddle.y - 10, 0, 0);
    b.stuck = true;
    state.balls = [b];
    state.mode = 'ready';
  }

  function launchBalls() {
    let launched = false;
    for (const b of state.balls) {
      if (b.stuck) {
        b.stuck = false;
        const angle = -Math.PI / 2 + (Math.random() * 0.5 - 0.25);
        const speed = 6.2;
        b.vx = Math.cos(angle) * speed;
        b.vy = Math.sin(angle) * speed;
        launched = true;
      }
    }
    if (launched) {
      state.mode = 'playing';
      beep(520, 0.05, 'triangle');
    }
  }

  function showOverlay(title, text, btn) {
    el.title.textContent = title;
    el.text.textContent = text;
    el.btn.textContent = btn;
    el.overlay.classList.add('visible');
  }

  function hideOverlay() { el.overlay.classList.remove('visible'); }

  function addScore(n) {
    state.score += n;
    el.score.textContent = state.score;
    if (state.score > hiscore) {
      hiscore = state.score;
      el.hiscore.textContent = hiscore;
      localStorage.setItem('arkanoid.hiscore', String(hiscore));
    }
  }

  function spawnParticles(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
      state.particles.push({
        x, y, color,
        vx: (Math.random() - 0.5) * 5,
        vy: (Math.random() - 0.5) * 5 - 1,
        life: 30 + Math.random() * 20,
      });
    }
  }

  // --- power-ups ------------------------------------------------------------
  const POWERS = [
    { id: 'wide',  label: 'W', color: '#4ade80' },
    { id: 'multi', label: 'M', color: '#38e8ff' },
    { id: 'slow',  label: 'S', color: '#a78bfa' },
    { id: 'life',  label: '+', color: '#ff5d73' },
    { id: 'grab',  label: 'G', color: '#ffc542' },
    { id: 'shrink',label: 'X', color: '#f97316' },
  ];

  function maybeDropPowerup(brick) {
    if (Math.random() > 0.17) return;
    const p = POWERS[Math.floor(Math.random() * POWERS.length)];
    state.powerups.push({
      x: brick.x + brick.w / 2,
      y: brick.y + brick.h / 2,
      r: 11, vy: 2.4, ...p,
    });
  }

  function applyPowerup(p) {
    beep(880, 0.12, 'sine', 0.06);
    switch (p.id) {
      case 'wide':
        paddle.w = Math.min(200, paddle.w + 40);
        break;
      case 'shrink':
        paddle.w = Math.max(60, paddle.w - 30);
        break;
      case 'multi': {
        const extra = [];
        for (const b of state.balls) {
          if (b.stuck) continue;
          for (const a of [0.45, -0.45]) {
            const cos = Math.cos(a), sin = Math.sin(a);
            extra.push(makeBall(b.x, b.y, b.vx * cos - b.vy * sin, b.vx * sin + b.vy * cos));
          }
        }
        state.balls.push(...extra.slice(0, 6));
        break;
      }
      case 'slow':
        for (const b of state.balls) { b.vx *= 0.75; b.vy *= 0.75; }
        break;
      case 'life':
        state.lives++;
        el.lives.textContent = state.lives;
        break;
      case 'grab':
        state.sticky = true;
        break;
    }
    addScore(50);
  }

  // --- input ----------------------------------------------------------------
  function pointerX(clientX) {
    const rect = canvas.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * W;
  }

  function onMove(clientX) {
    state.paddleTargetX = pointerX(clientX);
  }

  canvas.addEventListener('mousemove', e => onMove(e.clientX));
  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches[0]) onMove(e.touches[0].clientX);
  }, { passive: false });
  canvas.addEventListener('touchstart', e => {
    if (e.touches[0]) onMove(e.touches[0].clientX);
    primaryAction();
  }, { passive: true });
  canvas.addEventListener('mousedown', primaryAction);

  function primaryAction() {
    if (state.mode === 'ready') launchBalls();
    else if (state.mode === 'paused') togglePause();
  }

  window.addEventListener('keydown', e => {
    if (e.code === 'ArrowLeft') { state.keys.left = true; state.paddleTargetX = null; }
    if (e.code === 'ArrowRight') { state.keys.right = true; state.paddleTargetX = null; }
    if (e.code === 'Space') { e.preventDefault(); primaryAction(); }
    if (e.code === 'KeyP') togglePause();
    if (e.code === 'Enter' && el.overlay.classList.contains('visible')) el.btn.click();
  });

  window.addEventListener('keyup', e => {
    if (e.code === 'ArrowLeft') state.keys.left = false;
    if (e.code === 'ArrowRight') state.keys.right = false;
  });

  function togglePause() {
    if (state.mode === 'playing') {
      state.mode = 'paused';
      showOverlay('PAUSED', 'Take a breath.', 'RESUME');
    } else if (state.mode === 'paused') {
      state.mode = 'playing';
      hideOverlay();
    }
  }

  el.btn.addEventListener('click', () => {
    el.btn.blur();
    hideOverlay();
    switch (state.mode) {
      case 'paused':
        state.mode = 'playing';
        break;
      case 'levelclear':
        state.levelIndex++;
        el.level.textContent = state.levelIndex + 1;
        loadLevel(state.levelIndex);
        break;
      case 'menu':
      case 'over':
      case 'win':
        startGame();
        break;
    }
  });

  function startGame() {
    state.score = 0;
    state.lives = 3;
    state.levelIndex = 0;
    el.score.textContent = 0;
    el.lives.textContent = 3;
    el.level.textContent = 1;
    loadLevel(0);
  }

  // --- update ---------------------------------------------------------------
  function updatePaddle() {
    if (state.keys.left) paddle.x -= paddle.speed;
    if (state.keys.right) paddle.x += paddle.speed;
    if (state.paddleTargetX !== null) {
      paddle.x = state.paddleTargetX - paddle.w / 2;
    }
    paddle.x = Math.max(0, Math.min(W - paddle.w, paddle.x));
  }

  function hitBrick(brick, ball) {
    if (brick.hits !== Infinity) {
      brick.hits--;
      if (brick.hits <= 0) {
        brick.alive = false;
        addScore(brick.kind === '3' ? 120 : brick.kind === '2' ? 80 : 50);
        spawnParticles(brick.x + brick.w / 2, brick.y + brick.h / 2, BRICK_COLORS[brick.kind]);
        maybeDropPowerup(brick);
        beep(300 + Math.random() * 120, 0.05, 'square');
      } else {
        addScore(10);
        spawnParticles(ball.x, ball.y, BRICK_COLORS[brick.kind], 4);
        beep(200, 0.04, 'square', 0.03);
      }
    } else {
      beep(140, 0.05, 'sawtooth', 0.03);
      state.shakeFrames = 4;
    }
  }

  function collideBallBricks(ball) {
    for (const brick of state.bricks) {
      if (!brick.alive) continue;
      // circle vs AABB
      const nx = Math.max(brick.x, Math.min(ball.x, brick.x + brick.w));
      const ny = Math.max(brick.y, Math.min(ball.y, brick.y + brick.h));
      const dx = ball.x - nx, dy = ball.y - ny;
      if (dx * dx + dy * dy > ball.r * ball.r) continue;

      // Resolve along the axis of least penetration.
      const cx = brick.x + brick.w / 2, cy = brick.y + brick.h / 2;
      const overlapX = brick.w / 2 + ball.r - Math.abs(ball.x - cx);
      const overlapY = brick.h / 2 + ball.r - Math.abs(ball.y - cy);
      if (overlapX < overlapY) {
        ball.vx = -ball.vx;
        ball.x += ball.x < cx ? -overlapX : overlapX;
      } else {
        ball.vy = -ball.vy;
        ball.y += ball.y < cy ? -overlapY : overlapY;
      }
      hitBrick(brick, ball);
      normalize(ball);
      return; // one brick per step keeps bounces readable
    }
  }

  // Nudge a ball away from a near-horizontal path so it always makes
  // progress up or down the field.
  function normalize(ball) {
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed === 0) return;
    const minVy = Math.cos(MAX_ANGLE) * speed;
    if (Math.abs(ball.vy) < minVy) {
      ball.vy = (ball.vy >= 0 ? 1 : -1) * minVy;
      ball.vx = (ball.vx >= 0 ? 1 : -1) * Math.sqrt(Math.max(0, speed * speed - minVy * minVy));
    }
  }

  function collideBallPaddle(ball) {
    if (ball.vy <= 0) return;
    if (ball.y + ball.r < paddle.y || ball.y - ball.r > paddle.y + paddle.h) return;
    if (ball.x + ball.r < paddle.x || ball.x - ball.r > paddle.x + paddle.w) return;

    // Deflection angle depends on where the ball lands on the paddle.
    const hit = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
    const clamped = Math.max(-1, Math.min(1, hit));
    let angle = clamped * MAX_ANGLE;
    if (Math.abs(angle) < MIN_ANGLE) {
      // Keep the player's intended direction; break ties with the paddle's
      // own travel so a centred hit still feels deliberate.
      const dir = clamped !== 0 ? Math.sign(clamped)
                : (ball.x < W / 2 ? 1 : -1);
      angle = dir * MIN_ANGLE;
    }
    const speed = Math.min(12, Math.hypot(ball.vx, ball.vy) * 1.02);
    ball.vx = Math.sin(angle) * speed;
    ball.vy = -Math.abs(Math.cos(angle) * speed);
    ball.y = paddle.y - ball.r - 0.1;

    if (state.sticky) {
      ball.stuck = true;
      ball.offset = ball.x - paddle.x;
      state.mode = 'ready';
      state.sticky = false;
    }
    beep(440, 0.05, 'triangle');
  }

  function updateBalls() {
    for (const ball of state.balls) {
      if (ball.stuck) {
        ball.x = ball.offset === null ? paddle.x + paddle.w / 2 : paddle.x + ball.offset;
        ball.y = paddle.y - ball.r - 2;
        continue;
      }
      // Sub-step so fast balls can't tunnel through bricks.
      const steps = Math.ceil(Math.hypot(ball.vx, ball.vy) / 4);
      for (let s = 0; s < steps; s++) {
        ball.x += ball.vx / steps;
        ball.y += ball.vy / steps;

        if (ball.x - ball.r < 0) { ball.x = ball.r; ball.vx = Math.abs(ball.vx); beep(660, 0.03, 'triangle', 0.03); }
        if (ball.x + ball.r > W) { ball.x = W - ball.r; ball.vx = -Math.abs(ball.vx); beep(660, 0.03, 'triangle', 0.03); }
        if (ball.y - ball.r < 0) { ball.y = ball.r; ball.vy = Math.abs(ball.vy); beep(660, 0.03, 'triangle', 0.03); }

        collideBallBricks(ball);
        collideBallPaddle(ball);
      }
    }

    const before = state.balls.length;
    state.balls = state.balls.filter(b => b.y - b.r < H + 40);
    if (state.balls.length === 0 && before > 0) loseLife();
  }

  function loseLife() {
    state.lives--;
    el.lives.textContent = Math.max(0, state.lives);
    state.shakeFrames = 10;
    beep(120, 0.4, 'sawtooth', 0.06);
    if (state.lives <= 0) {
      state.mode = 'over';
      showOverlay('GAME OVER', `Final score: ${state.score}`, 'PLAY AGAIN');
    } else {
      resetBall();
    }
  }

  function updatePowerups() {
    for (const p of state.powerups) {
      p.y += p.vy;
      const caught = p.y + p.r > paddle.y && p.y - p.r < paddle.y + paddle.h &&
                     p.x > paddle.x && p.x < paddle.x + paddle.w;
      if (caught) { applyPowerup(p); p.dead = true; }
    }
    state.powerups = state.powerups.filter(p => !p.dead && p.y - p.r < H);
  }

  function updateParticles() {
    for (const p of state.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12;
      p.life--;
    }
    state.particles = state.particles.filter(p => p.life > 0);
  }

  function checkLevelClear() {
    const remaining = state.bricks.some(b => b.alive && b.hits !== Infinity);
    if (remaining) return;
    addScore(500);
    if (state.levelIndex + 1 >= LEVELS.length) {
      state.mode = 'win';
      showOverlay('YOU WIN!', `All ${LEVELS.length} levels cleared with ${state.score} points.`, 'PLAY AGAIN');
    } else {
      state.mode = 'levelclear';
      showOverlay('LEVEL CLEAR', `Score: ${state.score}`, 'NEXT LEVEL');
    }
    beep(700, 0.2, 'sine', 0.06);
  }

  // --- render ---------------------------------------------------------------
  function drawRoundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function render() {
    ctx.save();
    if (state.shakeFrames > 0) {
      state.shakeFrames--;
      ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    }

    ctx.clearRect(-10, -10, W + 20, H + 20);
    ctx.fillStyle = '#06080f';
    ctx.fillRect(-10, -10, W + 20, H + 20);

    // subtle grid
    ctx.strokeStyle = 'rgba(56, 232, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // bricks
    for (const b of state.bricks) {
      if (!b.alive) continue;
      const base = BRICK_COLORS[b.kind];
      ctx.fillStyle = base;
      drawRoundRect(b.x, b.y, b.w, b.h, 4);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(b.x + 3, b.y + 3, b.w - 6, 4);
      if (b.hits !== Infinity && b.hits < Number(b.kind)) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        drawRoundRect(b.x, b.y, b.w, b.h, 4);
        ctx.fill();
      }
      if (b.kind === 'x') {
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 2;
        drawRoundRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2, 4);
        ctx.stroke();
      }
    }

    // particles
    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, p.life / 45);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;

    // power-ups
    for (const p of state.powerups) {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#06080f';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.label, p.x, p.y + 1);
    }

    // paddle
    const grad = ctx.createLinearGradient(paddle.x, 0, paddle.x + paddle.w, 0);
    grad.addColorStop(0, '#38e8ff');
    grad.addColorStop(0.5, '#ffffff');
    grad.addColorStop(1, '#38e8ff');
    ctx.fillStyle = grad;
    drawRoundRect(paddle.x, paddle.y, paddle.w, paddle.h, 7);
    ctx.fill();
    if (state.sticky) {
      ctx.strokeStyle = '#ffc542';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // balls
    for (const b of state.balls) {
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#38e8ff';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    if (state.mode === 'ready') {
      ctx.fillStyle = 'rgba(232, 236, 255, 0.65)';
      ctx.font = '16px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Click or press SPACE to launch', W / 2, H - 70);
    }

    ctx.restore();
  }

  // --- loop -----------------------------------------------------------------
  function frame() {
    if (state.mode === 'playing' || state.mode === 'ready') {
      updatePaddle();
      updateBalls();
      updatePowerups();
      updateParticles();
      if (state.mode === 'playing' || state.mode === 'ready') checkLevelClear();
    } else {
      updateParticles();
    }
    render();
    requestAnimationFrame(frame);
  }

  loadLevel(0);
  state.mode = 'menu';
  showOverlay('ARKANOID', "Break every brick. Don't drop the ball.", 'START');
  frame();
})();
