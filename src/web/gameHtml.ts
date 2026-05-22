import { PLAYER_MODULE_SCRIPT } from './playerModule';

type GameConfig = {
  relayUrl: string;
  room: string;
};

export function buildGameHtml(config: GameConfig): string {
  const safeConfig = JSON.stringify(config).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<title>Hockey Runner Game</title>
<style>
  :root { color-scheme: dark; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #020617; color: #f8fafc; }
  #wrap { position: fixed; inset: 0; display: grid; grid-template-columns: 1fr 310px; background: #020617; }
  #gameBox { position: relative; overflow: hidden; background: #0b1220; }
  canvas { width: 100%; height: 100%; display: block; }
  #hud { border-left: 1px solid #20304b; background: #08111f; padding: 14px; box-sizing: border-box; overflow: auto; }
  h1 { margin: 0 0 8px; font-size: 22px; }
  .small { color: #94a3b8; font-size: 12px; line-height: 17px; }
  .pill { display: inline-block; padding: 5px 8px; border-radius: 999px; font-size: 12px; font-weight: 800; margin: 3px 4px 3px 0; background: #0f172a; border: 1px solid #2b4263; }
  .ok { color: #86efac; } .warn { color: #fde68a; } .bad { color: #fca5a5; }
  button { width: 100%; border: 0; border-radius: 12px; padding: 13px 10px; margin: 6px 0; background: #38bdf8; color: #06101f; font-weight: 900; font-size: 15px; }
  button.secondary { background: #0f172a; color: #e0f2fe; border: 1px solid #38bdf8; }
  .metric { display: grid; grid-template-columns: 118px 1fr; gap: 6px; font-size: 13px; margin: 7px 0; }
  .metric b { color: #93c5fd; }
  #events { height: 110px; overflow: auto; background: #06101f; border: 1px solid #1e293b; border-radius: 12px; padding: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 16px; white-space: pre-wrap; }
  .flash { color: #facc15; font-weight: 900; }
  @media (max-width: 760px) { #wrap { grid-template-columns: 1fr; grid-template-rows: 1fr 220px; } #hud { border-left: 0; border-top: 1px solid #20304b; } }
</style>
</head>
<body>
<div id="wrap">
  <div id="gameBox"><canvas id="game"></canvas></div>
  <div id="hud">
    <h1>Hockey Runner</h1>
    <div class="small">После кнопки «Начать игру» старт через 5 секунд. Управление приходит от телефона‑трекера. На Mac дополнительно работают стрелки и пробел.</div>
    <button id="startBtn">Начать игру</button>
    <button id="resetBtn" class="secondary">Сбросить</button>
    <button id="wsBtn" class="secondary">Переподключить relay</button>
    <div><span id="wsStatus" class="pill warn">ws: off</span><span id="gameStatus" class="pill warn">ready</span></div>
    <div class="metric"><b>Комната</b><span id="room"></span></div>
    <div class="metric"><b>Relay</b><span id="relay"></span></div>
    <div class="metric"><b>Последняя команда</b><span id="lastCmd">—</span></div>
    <div class="metric"><b>Счет</b><span id="score">0</span></div>
    <div class="metric"><b>Комбо</b><span id="combo">0</span></div>
    <div class="metric"><b>Уверенность</b><span id="inputQuality">—</span></div>
    <div class="metric"><b>Лучший</b><span id="best">0</span></div>
    <div class="metric"><b>Скорость</b><span id="speed">1.0×</span></div>
    <div id="events"></div>
  </div>
</div>
<script>
window.HR_CONFIG = ${safeConfig};
</script>
<script>
${PLAYER_MODULE_SCRIPT}
</script>
<script>
(function () {
  var cfg = window.HR_CONFIG;
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var nativeWsConnected = false;
  var running = false;
  var countdown = 0;
  var countdownStartedAt = 0;
  var startDelaySec = 15;
  var lastTime = performance.now();
  var player = { lane: 0, x: 0, y: 0, jumpUntil: 0, duckUntil: 0, lastLaneAt: 0 };
  var obstacles = [];
  var particles = [];
  var score = 0;
  var best = Number(localStorage.getItem('hockeyRunnerBest') || 0);
  var speed = 1;
  var nextSpawn = 0;
  var lastInputAt = 0;
  var combo = 0;
  var feedback = { cmd: '', until: 0, confidence: 0, reason: '' };

  document.getElementById('room').textContent = cfg.room;
  document.getElementById('relay').textContent = cfg.relayUrl;
  document.getElementById('best').textContent = String(best);
  document.getElementById('startBtn').addEventListener('click', startCountdown);
  document.getElementById('resetBtn').addEventListener('click', resetGame);
  document.getElementById('wsBtn').addEventListener('click', connectWs);
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') handleCommand('left');
    if (e.key === 'ArrowRight') handleCommand('right');
    if (e.key === 'ArrowUp' || e.key === ' ') handleCommand('jump');
    if (e.key === 'ArrowDown') handleCommand('duck');
  });

  resize();
  connectWs();
  resetGame();
  requestAnimationFrame(loop);

  function setPill(id, cls, text) {
    var el = document.getElementById(id);
    el.className = 'pill ' + cls;
    el.textContent = text;
  }

  function log(msg) {
    var el = document.getElementById('events');
    var now = new Date().toLocaleTimeString();
    el.textContent = '[' + now + '] ' + msg + '\\n' + el.textContent.slice(0, 1800);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(msg);
  }

  function resize() {
    var box = document.getElementById('gameBox').getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(box.width * dpr));
    canvas.height = Math.max(1, Math.floor(box.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function postNative(payload) {
    if (!window.ReactNativeWebView) {
      log('Native bridge недоступен');
      return;
    }
    window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  }

  window.HR_NATIVE_WS = function (event) {
    if (!event || event.channel !== 'hr-ws') return;
    if (event.type === 'status') {
      if (event.status === 'connecting') {
        nativeWsConnected = false;
        setPill('wsStatus', 'warn', 'ws: connecting');
      } else if (event.status === 'connected') {
        nativeWsConnected = true;
        setPill('wsStatus', 'ok', 'ws: connected');
        log('Relay подключен');
      } else if (event.status === 'closed') {
        nativeWsConnected = false;
        setPill('wsStatus', 'bad', 'ws: closed');
        log('Relay закрыт. Проверьте адрес: ' + cfg.relayUrl);
      } else if (event.status === 'error') {
        nativeWsConnected = false;
        setPill('wsStatus', 'bad', 'ws: error');
        log('Relay недоступен: ' + cfg.relayUrl);
      }
      return;
    }

    if (event.type === 'message') {
      try {
        handleRelayMessage(JSON.parse(event.data));
      } catch (e) {}
    }
  };

  function connectWs() {
    nativeWsConnected = false;
    setPill('wsStatus', 'warn', 'ws: connecting');
    postNative({
      channel: 'hr-ws',
      action: 'connect',
      role: 'game',
      room: cfg.room,
      relayUrl: cfg.relayUrl
    });
  }

  function normalizeCommand(cmd) {
    if (!cmd) return '';
    var c = String(cmd).toLowerCase();
    if (c === 'up') return 'jump';
    if (c === 'down') return 'duck';
    if (c === 'crouch') return 'duck';
    return c;
  }

  function handleRelayMessage(msg) {
    if (!msg) return;
    var payload = msg && msg.payload && typeof msg.payload === 'object' ? msg.payload : msg;
    var room = payload.room || msg.room;
    if (room !== cfg.room) return;
    if (payload.type === 'input' || msg.type === 'input') {
      lastInputAt = Date.now();
      var cmd = normalizeCommand(payload.cmd || payload.command || payload.action);
      document.getElementById('lastCmd').textContent = cmd + ' x=' + fmt(payload.x) + ' y=' + fmt(payload.y) + ' c=' + fmt(payload.confidence) + ' v=' + fmt(payload.speed) + ' ' + (payload.reason || '');
      handleCommand(cmd, payload);
    }
  }

  function startCountdown() {
    resetGame();
    countdown = startDelaySec;
    countdownStartedAt = performance.now();
    setPill('gameStatus', 'warn', 'start in ' + startDelaySec);
    log('Старт через ' + startDelaySec + ' секунд');
  }

  function resetGame() {
    running = false;
    countdown = 0;
    obstacles = [];
    particles = [];
    score = 0;
    speed = 1;
    nextSpawn = 0;
    combo = 0;
    feedback = { cmd: '', until: 0, confidence: 0, reason: '' };
    player.lane = 0;
    player.jumpUntil = 0;
    player.duckUntil = 0;
    player.lastLaneAt = 0;
    document.getElementById('score').textContent = '0';
    document.getElementById('combo').textContent = '0';
    document.getElementById('inputQuality').textContent = '—';
    document.getElementById('speed').textContent = '1.0×';
    setPill('gameStatus', 'warn', 'ready');
  }

  function startGame() {
    running = true;
    countdown = 0;
    setPill('gameStatus', 'ok', 'playing');
    log('Игра началась');
  }

  function gameOver() {
    running = false;
    setPill('gameStatus', 'bad', 'game over');
    if (score > best) {
      best = Math.floor(score);
      localStorage.setItem('hockeyRunnerBest', String(best));
      document.getElementById('best').textContent = String(best);
    }
    combo = 0;
    document.getElementById('combo').textContent = '0';
    log('Столкновение. Счет: ' + Math.floor(score));
  }

  function handleCommand(cmd, raw) {
    if (!cmd || cmd === 'neutral' || cmd === 'lost') return;
    raw = raw || {};
    var confidence = typeof raw.confidence === 'number' ? raw.confidence : 1;
    if (confidence < 0.22) return;
    var now = performance.now();
    feedback = { cmd: cmd, until: now + 520, confidence: confidence, reason: raw.reason || '' };
    document.getElementById('inputQuality').textContent = confidence.toFixed(2) + (raw.reason ? ' / ' + raw.reason : '');

    var accepted = false;
    if (cmd === 'left' && now - player.lastLaneAt > 220) {
      player.lane = Math.max(-1, player.lane - 1);
      player.lastLaneAt = now;
      accepted = true;
      spawnIceSpray();
    } else if (cmd === 'right' && now - player.lastLaneAt > 220) {
      player.lane = Math.min(1, player.lane + 1);
      player.lastLaneAt = now;
      accepted = true;
      spawnIceSpray();
    } else if (cmd === 'jump') {
      player.jumpUntil = Math.max(player.jumpUntil, now + 620);
      accepted = true;
    } else if (cmd === 'duck') {
      player.duckUntil = Math.max(player.duckUntil, now + 700);
      accepted = true;
    }

    if (accepted) {
      combo += 1;
      score += Math.min(6, 1 + combo * 0.15);
      document.getElementById('combo').textContent = String(combo);
    }
  }

  function loop(now) {
    var dt = Math.min(0.032, (now - lastTime) / 1000);
    lastTime = now;
    if (countdown > 0) {
      var left = startDelaySec - Math.floor((now - countdownStartedAt) / 1000);
      countdown = Math.max(0, left);
      setPill('gameStatus', 'warn', 'start in ' + countdown);
      if (countdown === 0) startGame();
    }
    if (running) update(dt, now);
    draw(now);
    requestAnimationFrame(loop);
  }

  function update(dt, now) {
    score += dt * 11 * speed;
    speed = 1 + Math.min(2.2, score / 260);
    document.getElementById('score').textContent = String(Math.floor(score));
    document.getElementById('speed').textContent = speed.toFixed(1) + '×';

    nextSpawn -= dt;
    if (nextSpawn <= 0) {
      spawnObstacle();
      nextSpawn = Math.max(0.55, 1.45 - speed * 0.22 + Math.random() * 0.35);
    }
    var h = getSize().h;
    for (var i = obstacles.length - 1; i >= 0; i--) {
      var o = obstacles[i];
      o.y += dt * h * (0.28 + speed * 0.09);
      if (!o.passed && o.y > h * 0.75) { o.passed = true; score += 8 + Math.min(12, combo); }
      if (o.y > h + 120) obstacles.splice(i, 1);
    }
    for (var p = particles.length - 1; p >= 0; p--) {
      particles[p].life -= dt;
      particles[p].x += particles[p].vx * dt;
      particles[p].y += particles[p].vy * dt;
      if (particles[p].life <= 0) particles.splice(p, 1);
    }
    checkCollision(now);
  }

  function spawnObstacle() {
    var r = Math.random();
    var type = r < 0.48 ? 'defender' : r < 0.68 ? 'cone' : r < 0.84 ? 'gap' : 'bar';
    var lane = Math.floor(Math.random() * 3) - 1;
    obstacles.push({ type: type, lane: lane, y: -70, passed: false, wobble: Math.random() * Math.PI * 2 });
  }

  function checkCollision(now) {
    var h = getSize().h;
    var py = h * 0.76;
    var jumping = player.jumpUntil > now;
    var ducking = player.duckUntil > now;
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      if (Math.abs(o.y - py) > 45) continue;
      if ((o.type === 'defender' || o.type === 'cone') && o.lane === player.lane && !jumping) return gameOver();
      if (o.type === 'gap' && !jumping) return gameOver();
      if (o.type === 'bar' && !ducking) return gameOver();
    }
  }

  function draw(now) {
    var size = getSize();
    var w = size.w, h = size.h;
    ctx.clearRect(0, 0, w, h);
    drawRink(w, h);
    obstacles.forEach(function (o) { drawObstacle(o, w, h); });
    drawPlayer(w, h, now);
    drawActionFeedback(w, h, now);
    drawParticles();
    drawHudText(w, h, now);
  }

  function drawRink(w, h) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#dff7ff');
    g.addColorStop(0.55, '#b7e8fb');
    g.addColorStop(1, '#e8fbff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    var left = w * 0.22, right = w * 0.78;
    ctx.beginPath();
    ctx.moveTo(left, 0); ctx.lineTo(w * 0.10, h);
    ctx.moveTo(right, 0); ctx.lineTo(w * 0.90, h);
    ctx.stroke();
    ctx.lineWidth = 1;
    for (var i = 1; i < 3; i++) {
      var x = laneX(i - 2, w);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, h * 0.16); ctx.lineTo(w, h * 0.16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, h * 0.52); ctx.lineTo(w, h * 0.52); ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#0f172a';
    for (var s = 0; s < 32; s++) {
      var x1 = (s * 97) % w;
      var y1 = (s * 53 + performance.now() * 0.03) % h;
      ctx.fillRect(x1, y1, 80, 2);
    }
    ctx.restore();
  }

  function drawObstacle(o, w, h) {
    var x = laneX(o.lane, w);
    var y = o.y;
    ctx.save();
    if (o.type === 'defender') {
      drawShadow(x, y + 24, 32, 10);
      ctx.fillStyle = '#111827';
      roundedRect(x - 22, y - 20, 44, 56, 10, true);
      ctx.fillStyle = '#ef4444';
      roundedRect(x - 18, y - 16, 36, 28, 8, true);
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath(); ctx.arc(x, y - 30, 13, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#111827'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x - 28, y + 18); ctx.lineTo(x + 30, y + 38); ctx.stroke();
    } else if (o.type === 'cone') {
      drawShadow(x, y + 18, 28, 8);
      ctx.fillStyle = '#f97316';
      ctx.beginPath(); ctx.moveTo(x, y - 28); ctx.lineTo(x - 28, y + 28); ctx.lineTo(x + 28, y + 28); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff7ed'; ctx.fillRect(x - 17, y + 6, 34, 6);
    } else if (o.type === 'gap') {
      ctx.fillStyle = '#0f172a';
      roundedRect(w * 0.18, y - 14, w * 0.64, 28, 10, true);
      ctx.fillStyle = '#bae6fd'; ctx.font = 'bold 16px -apple-system'; ctx.textAlign = 'center'; ctx.fillText('JUMP', w / 2, y + 6);
    } else if (o.type === 'bar') {
      ctx.strokeStyle = '#334155'; ctx.lineWidth = 12;
      ctx.beginPath(); ctx.moveTo(w * 0.2, y); ctx.lineTo(w * 0.8, y); ctx.stroke();
      ctx.fillStyle = '#0f172a'; ctx.font = 'bold 16px -apple-system'; ctx.textAlign = 'center'; ctx.fillText('DUCK', w / 2, y - 14);
    }
    ctx.restore();
  }

  function drawPlayer(w, h, now) {
    window.HockeyRunnerPlayer.draw(ctx, player, w, h, now, laneX);
  }

  function drawActionFeedback(w, h, now) {
    if (!feedback.cmd || feedback.until <= now) return;
    var alpha = Math.max(0, Math.min(1, (feedback.until - now) / 520));
    ctx.save();
    ctx.globalAlpha = 0.25 + alpha * 0.55;
    ctx.fillStyle = '#facc15';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 4;
    ctx.font = '900 54px -apple-system';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var label = feedback.cmd.toUpperCase();
    var x = w / 2;
    var y = h * 0.28;
    if (feedback.cmd === 'left') { x = w * 0.24; y = h * 0.50; }
    if (feedback.cmd === 'right') { x = w * 0.76; y = h * 0.50; }
    if (feedback.cmd === 'jump') { x = w * 0.50; y = h * 0.23; }
    if (feedback.cmd === 'duck') { x = w * 0.50; y = h * 0.60; }
    ctx.strokeText(label, x, y);
    ctx.fillText(label, x, y);
    ctx.font = '800 18px -apple-system';
    ctx.fillText('confidence ' + feedback.confidence.toFixed(2), x, y + 38);
    ctx.restore();
  }

  function drawParticles() {
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
    particles.forEach(function (p) { ctx.globalAlpha = Math.max(0, p.life); ctx.fillRect(p.x, p.y, 5, 2); });
    ctx.restore();
  }

  function drawHudText(w, h, now) {
    ctx.save();
    ctx.fillStyle = '#0f172a';
    ctx.font = '900 28px -apple-system';
    ctx.textAlign = 'left';
    ctx.fillText('SCORE ' + Math.floor(score), 24, 44);
    ctx.font = '800 18px -apple-system';
    ctx.fillText('COMBO ' + combo, 24, 70);
    if (Date.now() - lastInputAt > 1200) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
      ctx.font = '800 18px -apple-system';
      ctx.fillText('Жду сигнал от телефона‑трекера...', 24, 98);
    }
    if (countdown > 0) {
      ctx.fillStyle = 'rgba(2, 6, 23, 0.58)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '900 96px -apple-system';
      ctx.textAlign = 'center';
      ctx.fillText(String(countdown), w / 2, h / 2);
      ctx.font = '800 24px -apple-system';
      ctx.fillText('Подготовьтесь. Игра начнется через 5 секунд.', w / 2, h / 2 + 48);
    } else if (!running) {
      ctx.fillStyle = 'rgba(2, 6, 23, 0.35)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '900 44px -apple-system';
      ctx.textAlign = 'center';
      ctx.fillText('HOCKEY RUNNER', w / 2, h / 2 - 18);
      ctx.font = '700 18px -apple-system';
      ctx.fillText('Нажмите «Начать игру»', w / 2, h / 2 + 24);
    }
    ctx.restore();
  }

  function spawnIceSpray() {
    var size = getSize();
    for (var i = 0; i < 12; i++) {
      particles.push({
        x: player.x + (Math.random() - 0.5) * 35,
        y: player.y + 22,
        vx: (Math.random() - 0.5) * 140,
        vy: 60 + Math.random() * 70,
        life: 0.35 + Math.random() * 0.3
      });
    }
  }

  function laneX(lane, w) {
    return w * (0.5 + lane * 0.18);
  }

  function getSize() {
    var rect = document.getElementById('gameBox').getBoundingClientRect();
    return { w: rect.width, h: rect.height };
  }

  function drawShadow(x, y, w, h) {
    ctx.save(); ctx.fillStyle = 'rgba(15, 23, 42, 0.20)'; ctx.beginPath(); ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  function roundedRect(x, y, w, h, r, fill) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    if (fill) ctx.fill(); else ctx.stroke();
  }

  function fmt(v) { return typeof v === 'number' ? v.toFixed(2) : String(v); }
})();
</script>
</body>
</html>`;
}
