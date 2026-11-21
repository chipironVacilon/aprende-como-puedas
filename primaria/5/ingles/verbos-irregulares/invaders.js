/*
 * Space-invaders simulation for the irregular-verb game.
 *
 * The screen and the scoring live in index.html; this file only owns the
 * simulation: the wave of four aliens carrying candidate words, the player ship,
 * the single bullet, the lives and the slow descent of the wave. It never knows
 * anything about verbs: the caller hands it a ready question.
 *
 * It touches no DOM, starts no timer and reads no clock. The caller feeds the
 * elapsed milliseconds, so the rules can be checked without a browser.
 */
window.InvadersGame = (() => {
  "use strict";

  /** Logical field the canvas is painted in; every coordinate below is a field unit. */
  const FIELD = { width: 480, height: 360 };

  /** Alien box: wide enough for "understood" in the 84 units it gets. */
  const ALIEN_WIDTH = 84;
  const ALIEN_HEIGHT = 28;
  /** Left edge of the first alien: 4 * 84 + 3 * 40 = 456, with 12 units of margin each side. */
  const ALIEN_LEFT = 12;
  const ALIEN_GAP = 40;
  /** Top edge of the wave when a question starts: high up, but with room to read. */
  const ALIEN_ROW_Y = 104;

  const SHIP_WIDTH = 46;
  const SHIP_HEIGHT = 22;
  /** Units between the bottom of the field and the bottom of the ship. */
  const SHIP_BOTTOM_MARGIN = 14;
  /** Top edge of the ship, where the wave has to be stopped. */
  const SHIP_TOP = FIELD.height - SHIP_BOTTOM_MARGIN - SHIP_HEIGHT;

  const BULLET_WIDTH = 4;
  const BULLET_HEIGHT = 12;

  /** Field units per second. */
  const SHIP_SPEED = 250;
  const BULLET_SPEED = 380;
  /** Slow enough to read the four words and aim, fast enough to press. */
  const DESCENT_SPEED = 12;

  /** Safety net: a long pause must not teleport the wave into the ship. */
  const MAX_TICK_MS = 100;
  /** How long a hit alien stays on screen fading out. */
  const DYING_MS = 260;

  const START_LIVES = 3;

  const EVENT_HIT_CORRECT = "hit-correct";
  const EVENT_HIT_WRONG = "hit-wrong";
  const EVENT_LIFE_LOST = "life-lost";
  const EVENT_WAVE_LANDED = "wave-landed";
  const EVENT_GAME_OVER = "game-over";

  /**
   * One game. `random` is injected for the shapes that need it (the wave keeps
   * no randomness today) and is never called by this module on its own.
   */
  function create({ random = Math.random } = {}) {
    let status = "playing";
    let lives = START_LIVES;
    let score = 0;
    /** Centre of the ship. */
    let shipX = FIELD.width / 2;
    /** -1, 0 or 1: the ship keeps moving while the key is held. */
    let direction = 0;
    let bulletActive = false;
    let bulletX = shipX;
    let bulletY = 0;
    /** Top edge of the wave. */
    let waveY = ALIEN_ROW_Y;
    let aliens = [];
    let events = [];
    let question = null;

    const alienLeft = (index) => ALIEN_LEFT + index * (ALIEN_WIDTH + ALIEN_GAP);
    const shipLeft = () => shipX - SHIP_WIDTH / 2;
    const alienBottom = (alien) => alien.y + ALIEN_HEIGHT;

    function push(type, alienIndex) {
      events.push(alienIndex === undefined ? { type } : { type, alienIndex });
    }

    /** One alien falls to the shot: it fades out and stops blocking the wave. */
    function killAlien(alien) {
      alien.alive = false;
      alien.dying = true;
      alien.dyingMs = DYING_MS;
    }

    function loseLife() {
      lives = Math.max(0, lives - 1);
      push(EVENT_LIFE_LOST);
      if (lives === 0) {
        status = "over";
        direction = 0;
        bulletActive = false;
        push(EVENT_GAME_OVER);
        return true;
      }
      return false;
    }

    function startQuestion(next) {
      if (status !== "playing" || !next || !Array.isArray(next.options)) return;
      if (next.options.length === 0) return;
      question = next;
      waveY = ALIEN_ROW_Y;
      bulletActive = false;
      aliens = next.options.map((option, index) => ({
        index,
        word: String(option.text),
        correct: option.correct === true,
        x: alienLeft(index),
        y: ALIEN_ROW_Y,
        alive: true,
        dying: false,
        dyingMs: 0
      }));
    }

    function move(nextDirection) {
      if (status !== "playing") {
        direction = 0;
        return;
      }
      direction = nextDirection > 0 ? 1 : nextDirection < 0 ? -1 : 0;
    }

    /**
     * Park the ship straight under a finger: dragging the field is a position,
     * not a direction. Clamped like everything else that moves the ship.
     */
    function placeShip(x) {
      if (status !== "playing") return;
      const half = SHIP_WIDTH / 2;
      const wanted = Number(x);
      if (!Number.isFinite(wanted)) return;
      shipX = Math.min(FIELD.width - half, Math.max(half, wanted));
      direction = 0;
    }

    function fire() {
      if (status !== "playing" || bulletActive) return;
      bulletActive = true;
      bulletX = shipX;
      bulletY = SHIP_TOP - BULLET_HEIGHT;
    }

    /** Boxes overlap when they share any area; touching edges do not count. */
    function overlapsBullet(alien) {
      return (
        bulletX + BULLET_WIDTH / 2 > alien.x &&
        bulletX - BULLET_WIDTH / 2 < alien.x + ALIEN_WIDTH &&
        bulletY + BULLET_HEIGHT > alien.y &&
        bulletY < alien.y + ALIEN_HEIGHT
      );
    }

    /** The bullet stops at the first living alien it meets, or leaves the field. */
    function stepBullet(dtMs) {
      if (!bulletActive) return;
      bulletY -= (BULLET_SPEED * dtMs) / 1000;
      if (bulletY + BULLET_HEIGHT < 0) {
        bulletActive = false;
        return;
      }
      for (const alien of aliens) {
        if (!alien.alive) continue;
        if (!overlapsBullet(alien)) continue;
        bulletActive = false;
        killAlien(alien);
        if (alien.correct) {
          score += 1;
          push(EVENT_HIT_CORRECT, alien.index);
        } else {
          push(EVENT_HIT_WRONG, alien.index);
          loseLife();
        }
        return;
      }
    }

    function stepWave(dtMs) {
      const alive = aliens.filter((alien) => alien.alive);
      if (alive.length === 0) return;
      waveY += (DESCENT_SPEED * dtMs) / 1000;
      for (const alien of aliens) {
        if (alien.alive) alien.y = waveY;
      }
      const landed = alive.some((alien) => alienBottom(alien) >= SHIP_TOP);
      if (!landed) return;
      if (loseLife()) return;
      push(EVENT_WAVE_LANDED);
      waveY = ALIEN_ROW_Y;
      for (const alien of aliens) {
        if (alien.alive) alien.y = waveY;
      }
    }

    function stepDying(dtMs) {
      for (const alien of aliens) {
        if (!alien.dying) continue;
        alien.dyingMs -= dtMs;
        if (alien.dyingMs <= 0) {
          alien.dying = false;
          alien.dyingMs = 0;
        }
      }
    }

    function step(dtMs) {
      if (status !== "playing") return;
      const elapsed = Math.max(0, Math.min(Number(dtMs) || 0, MAX_TICK_MS));
      if (elapsed === 0) return;

      if (direction !== 0) {
        const half = SHIP_WIDTH / 2;
        shipX = Math.min(
          FIELD.width - half,
          Math.max(half, shipX + (direction * SHIP_SPEED * elapsed) / 1000)
        );
      }
      stepBullet(elapsed);
      if (status === "playing") stepWave(elapsed);
      stepDying(elapsed);
    }

    function drainEvents() {
      const drained = events;
      events = [];
      return drained;
    }

    function snapshot() {
      return {
        status,
        lives,
        score,
        verb: question ? question.verb : null,
        form: question ? question.form : null,
        label: question ? question.label : null,
        shipX,
        shipTop: SHIP_TOP,
        bulletActive,
        bulletX,
        bulletY,
        aliens: aliens.map((alien) => ({
          x: alien.x,
          y: alien.y,
          width: ALIEN_WIDTH,
          height: ALIEN_HEIGHT,
          word: alien.word,
          correct: alien.correct,
          alive: alien.alive,
          dying: alien.dying
        }))
      };
    }

    return {
      startQuestion,
      move,
      placeShip,
      fire,
      step,
      drainEvents,
      snapshot
    };
  }

  return {
    FIELD,
    ALIEN_WIDTH,
    ALIEN_HEIGHT,
    SHIP_WIDTH,
    SHIP_HEIGHT,
    SHIP_TOP,
    BULLET_WIDTH,
    BULLET_HEIGHT,
    START_LIVES,
    create
  };
})();
