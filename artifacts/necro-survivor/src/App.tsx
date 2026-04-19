import { useEffect, useRef, useState, useCallback } from "react";
import "./game.css";

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 600;
const TARGET_FPS = 60;

interface Player {
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  invincibleFrames: number;
}

interface Skeleton {
  x: number;
  y: number;
  attackCooldown: number;
  attackDelay: number;
}

interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  pierce: number;
  radius: number;
  hitEnemies: Set<number>;
}

interface Enemy {
  id: number;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  xp: number;
  type: "zombie" | "bat" | "ghost";
  poisonTimer: number;
}

interface XpOrb {
  x: number;
  y: number;
  value: number;
  radius: number;
}

interface GameState {
  player: Player;
  skeletons: Skeleton[];
  maxSkeletons: number;
  projectiles: Projectile[];
  enemies: Enemy[];
  xpOrbs: XpOrb[];
  enemyIdCounter: number;
  timer: number;
  frameCount: number;
  level: number;
  xp: number;
  xpToNext: number;
  kills: number;
  killsForLeech: number;
  skeletonDamageBonus: number;
  attackCooldownMultiplier: number;
  pierceBonus: number;
  speedMultiplier: number;
  hasPoisonAura: number;
  critChance: number;
  spawnAccumulator: number;
  gameOver: boolean;
  paused: boolean;
}

interface UpgradeOption {
  key: string;
  name: string;
  description: string;
}

const UPGRADES: UpgradeOption[] = [
  { key: "more_skeletons", name: "More Skeletons", description: "+1 skeleton minion (max 5)" },
  { key: "skeleton_damage", name: "Skeleton Damage", description: "+25% projectile damage" },
  { key: "rapid_fire", name: "Rapid Fire", description: "-15% skeleton attack cooldown" },
  { key: "piercing_shots", name: "Piercing Shots", description: "+1 pierce per projectile" },
  { key: "life_leech", name: "Life Leech", description: "Heal 1 HP per 10 kills" },
  { key: "fleet_foot", name: "Fleet Foot", description: "+15% movement speed" },
  { key: "poison_aura", name: "Poison Aura", description: "1 damage/sec to nearby enemies (r=70)" },
  { key: "tank", name: "Tank", description: "+3 max HP and heal 3" },
  { key: "crit_chance", name: "Crit Chance", description: "15% chance for double damage" },
];

function xpForLevel(level: number): number {
  return Math.floor(50 * Math.pow(level, 0.8));
}

function createGameState(): GameState {
  return {
    player: {
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT / 2,
      radius: 15,
      hp: 10,
      maxHp: 10,
      speed: 5,
      invincibleFrames: 0,
    },
    skeletons: [
      { x: CANVAS_WIDTH / 2 + 30, y: CANVAS_HEIGHT / 2, attackCooldown: 0, attackDelay: 30 },
    ],
    maxSkeletons: 1,
    projectiles: [],
    enemies: [],
    xpOrbs: [],
    enemyIdCounter: 0,
    timer: 0,
    frameCount: 0,
    level: 1,
    xp: 0,
    xpToNext: xpForLevel(1),
    kills: 0,
    killsForLeech: 0,
    skeletonDamageBonus: 0,
    attackCooldownMultiplier: 1,
    pierceBonus: 0,
    speedMultiplier: 1,
    hasPoisonAura: 0,
    critChance: 0,
    spawnAccumulator: 0,
    gameOver: false,
    paused: false,
  };
}

function spawnEnemy(state: GameState): Enemy {
  const angle = Math.random() * Math.PI * 2;
  const margin = 60;
  let ex = CANVAS_WIDTH / 2 + Math.cos(angle) * (CANVAS_WIDTH / 2 + margin);
  let ey = CANVAS_HEIGHT / 2 + Math.sin(angle) * (CANVAS_HEIGHT / 2 + margin);

  const rand = Math.random();
  let type: "zombie" | "bat" | "ghost";
  if (rand < 0.5) type = "zombie";
  else if (rand < 0.8) type = "bat";
  else type = "ghost";

  const configs = {
    zombie: { radius: 16, hp: 3, speed: 1.2, xp: 10 },
    bat: { radius: 10, hp: 1, speed: 2.5, xp: 5 },
    ghost: { radius: 14, hp: 2, speed: 1.8, xp: 8 },
  };

  const cfg = configs[type];
  return {
    id: state.enemyIdCounter++,
    x: ex,
    y: ey,
    type,
    radius: cfg.radius,
    hp: cfg.hp,
    maxHp: cfg.hp,
    speed: cfg.speed,
    xp: cfg.xp,
    poisonTimer: 0,
  };
}

function getSkeletonOffsets(count: number): { dx: number; dy: number }[] {
  const radius = 40;
  const offsets = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    offsets.push({ dx: Math.cos(a) * radius, dy: Math.sin(a) * radius });
  }
  return offsets;
}

function circlesOverlap(ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  const dist2 = dx * dx + dy * dy;
  const minDist = ar + br;
  return dist2 < minDist * minDist;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

function pickThreeUpgrades(state: GameState): UpgradeOption[] {
  const available = UPGRADES.filter((u) => {
    if (u.key === "more_skeletons" && state.maxSkeletons >= 5) return false;
    if (u.key === "poison_aura" && state.hasPoisonAura > 0) return false;
    if (u.key === "life_leech" && state.kills === 0 && state.level < 3) return false;
    return true;
  });
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3);
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const stateRef = useRef<GameState>(createGameState());
  const keysRef = useRef<Set<string>>(new Set());
  const lastTimeRef = useRef<number>(0);
  const highScoreRef = useRef<number>(
    parseInt(localStorage.getItem("necro_highscore") || "0", 10)
  );

  const [screen, setScreen] = useState<"start" | "playing" | "upgrade" | "gameover">("start");
  const [upgradeChoices, setUpgradeChoices] = useState<UpgradeOption[]>([]);
  const [finalTime, setFinalTime] = useState(0);
  const [highScore, setHighScore] = useState(highScoreRef.current);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const stopLoop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  const applyUpgrade = useCallback((key: string) => {
    const s = stateRef.current;
    switch (key) {
      case "more_skeletons":
        if (s.maxSkeletons < 5) {
          s.maxSkeletons++;
          const offsets = getSkeletonOffsets(s.maxSkeletons);
          const newOffset = offsets[s.skeletons.length];
          s.skeletons.push({
            x: s.player.x + newOffset.dx,
            y: s.player.y + newOffset.dy,
            attackCooldown: 0,
            attackDelay: Math.round(30 * s.attackCooldownMultiplier),
          });
        }
        break;
      case "skeleton_damage":
        s.skeletonDamageBonus += 0.25;
        break;
      case "rapid_fire":
        s.attackCooldownMultiplier = Math.max(0.1, s.attackCooldownMultiplier * 0.85);
        s.skeletons.forEach((sk) => {
          sk.attackDelay = Math.round(30 * s.attackCooldownMultiplier);
        });
        break;
      case "piercing_shots":
        s.pierceBonus += 1;
        break;
      case "life_leech":
        // Effect applied on kills
        break;
      case "fleet_foot":
        s.speedMultiplier = s.speedMultiplier * 1.15;
        s.player.speed = 5 * s.speedMultiplier;
        break;
      case "poison_aura":
        s.hasPoisonAura = 1;
        break;
      case "tank":
        s.player.maxHp += 3;
        s.player.hp = Math.min(s.player.maxHp, s.player.hp + 3);
        break;
      case "crit_chance":
        s.critChance = Math.min(1, s.critChance + 0.15);
        break;
    }
    s.paused = false;
    setScreen("playing");
  }, []);

  const triggerLevelUp = useCallback(() => {
    const s = stateRef.current;
    s.paused = true;
    const choices = pickThreeUpgrades(s);
    setUpgradeChoices(choices);
    setScreen("upgrade");
  }, []);

  const gameLoop = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (lastTimeRef.current === 0) lastTimeRef.current = timestamp;
    const rawDelta = timestamp - lastTimeRef.current;
    lastTimeRef.current = timestamp;

    const s = stateRef.current;
    if (s.paused || s.gameOver) {
      rafRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    // Cap delta at 100ms to avoid spiral of death
    const delta = Math.min(rawDelta, 100);
    const dtFactor = delta / (1000 / TARGET_FPS);

    // — Input —
    const keys = keysRef.current;
    let vx = 0;
    let vy = 0;
    if (keys.has("KeyW") || keys.has("ArrowUp")) vy -= 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) vy += 1;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) vx -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) vx += 1;
    const len = Math.sqrt(vx * vx + vy * vy);
    if (len > 0) { vx /= len; vy /= len; }

    // — Player movement —
    s.player.x = Math.max(s.player.radius, Math.min(CANVAS_WIDTH - s.player.radius,
      s.player.x + vx * s.player.speed * dtFactor));
    s.player.y = Math.max(s.player.radius, Math.min(CANVAS_HEIGHT - s.player.radius,
      s.player.y + vy * s.player.speed * dtFactor));

    if (s.player.invincibleFrames > 0) s.player.invincibleFrames -= dtFactor;

    // — Update skeletons —
    const skOffsets = getSkeletonOffsets(s.skeletons.length);
    s.skeletons.forEach((sk, i) => {
      const target = {
        x: s.player.x + skOffsets[i].dx,
        y: s.player.y + skOffsets[i].dy,
      };
      const dx = target.x - sk.x;
      const dy = target.y - sk.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 2) {
        sk.x += (dx / d) * 4 * dtFactor;
        sk.y += (dy / d) * 4 * dtFactor;
      }

      sk.attackCooldown -= dtFactor;
      if (sk.attackCooldown <= 0 && s.enemies.length > 0) {
        // Find nearest enemy
        let nearest: Enemy | null = null;
        let nearestDist = Infinity;
        for (const e of s.enemies) {
          const ed = dist(sk.x, sk.y, e.x, e.y);
          if (ed < nearestDist) { nearestDist = ed; nearest = e; }
        }
        if (nearest) {
          const ex = nearest.x - sk.x;
          const ey = nearest.y - sk.y;
          const el = Math.sqrt(ex * ex + ey * ey);
          const spd = 8;
          const baseDamage = 1 + s.skeletonDamageBonus;
          let damage = baseDamage;
          if (Math.random() < s.critChance) damage *= 2;
          s.projectiles.push({
            x: sk.x,
            y: sk.y,
            vx: (ex / el) * spd,
            vy: (ey / el) * spd,
            damage,
            pierce: s.pierceBonus,
            radius: 4,
            hitEnemies: new Set(),
          });
        }
        sk.attackCooldown = sk.attackDelay;
      }
    });

    // — Update projectiles —
    for (let i = s.projectiles.length - 1; i >= 0; i--) {
      const p = s.projectiles[i];
      p.x += p.vx * dtFactor;
      p.y += p.vy * dtFactor;

      // Off-canvas
      if (p.x < -20 || p.x > CANVAS_WIDTH + 20 || p.y < -20 || p.y > CANVAS_HEIGHT + 20) {
        s.projectiles.splice(i, 1);
        continue;
      }

      // Hit enemies
      let shouldRemove = false;
      for (let j = s.enemies.length - 1; j >= 0; j--) {
        const e = s.enemies[j];
        if (p.hitEnemies.has(e.id)) continue;
        if (circlesOverlap(p.x, p.y, p.radius, e.x, e.y, e.radius)) {
          p.hitEnemies.add(e.id);
          e.hp -= p.damage;
          if (p.pierce <= 0 || p.hitEnemies.size > p.pierce) {
            shouldRemove = true;
          }
          if (e.hp <= 0) {
            s.xpOrbs.push({ x: e.x, y: e.y, value: e.xp, radius: 5 });
            s.enemies.splice(j, 1);
            s.kills++;
            s.killsForLeech++;
          }
          if (shouldRemove) break;
        }
      }
      if (shouldRemove) s.projectiles.splice(i, 1);
    }

    // — Poison aura —
    if (s.hasPoisonAura > 0) {
      const poisonRadius = 70;
      for (const e of s.enemies) {
        if (dist(s.player.x, s.player.y, e.x, e.y) <= poisonRadius) {
          e.hp -= (1 / TARGET_FPS) * dtFactor;
          if (e.hp <= 0) {
            s.xpOrbs.push({ x: e.x, y: e.y, value: e.xp, radius: 5 });
            s.kills++;
            s.killsForLeech++;
          }
        }
      }
      s.enemies = s.enemies.filter((e) => e.hp > 0);
    }

    // Life leech check
    if (s.killsForLeech >= 10) {
      const leechAmount = Math.floor(s.killsForLeech / 10);
      s.player.hp = Math.min(s.player.maxHp, s.player.hp + leechAmount);
      s.killsForLeech = s.killsForLeech % 10;
    }

    // — Update enemies —
    for (let i = s.enemies.length - 1; i >= 0; i--) {
      const e = s.enemies[i];
      const dx = s.player.x - e.x;
      const dy = s.player.y - e.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0) {
        e.x += (dx / d) * e.speed * dtFactor;
        e.y += (dy / d) * e.speed * dtFactor;
      }

      // Enemy-enemy collision (non-ghost)
      if (e.type !== "ghost") {
        for (let j = i + 1; j < s.enemies.length; j++) {
          const other = s.enemies[j];
          if (other.type === "ghost") continue;
          if (circlesOverlap(e.x, e.y, e.radius, other.x, other.y, other.radius)) {
            const sep = e.radius + other.radius;
            const ddx = e.x - other.x;
            const ddy = e.y - other.y;
            const dd = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
            const push = (sep - dd) / 2;
            e.x += (ddx / dd) * push;
            e.y += (ddy / dd) * push;
            other.x -= (ddx / dd) * push;
            other.y -= (ddy / dd) * push;
          }
        }
      }

      // Player-enemy collision
      if (s.player.invincibleFrames <= 0 && circlesOverlap(s.player.x, s.player.y, s.player.radius, e.x, e.y, e.radius)) {
        s.player.hp -= 1;
        s.player.invincibleFrames = 30;
        const angle = Math.atan2(e.y - s.player.y, e.x - s.player.x);
        s.player.x -= Math.cos(angle) * 30;
        s.player.y -= Math.sin(angle) * 30;
        s.player.x = Math.max(s.player.radius, Math.min(CANVAS_WIDTH - s.player.radius, s.player.x));
        s.player.y = Math.max(s.player.radius, Math.min(CANVAS_HEIGHT - s.player.radius, s.player.y));
        if (s.player.hp <= 0) {
          s.player.hp = 0;
          s.gameOver = true;
          const hs = Math.max(highScoreRef.current, Math.floor(s.timer));
          highScoreRef.current = hs;
          localStorage.setItem("necro_highscore", hs.toString());
          setHighScore(hs);
          setFinalTime(Math.floor(s.timer));
          setScreen("gameover");
        }
      }
    }

    // — XP orbs —
    for (let i = s.xpOrbs.length - 1; i >= 0; i--) {
      const orb = s.xpOrbs[i];
      const dx = s.player.x - orb.x;
      const dy = s.player.y - orb.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0) {
        orb.x += (dx / d) * 2 * dtFactor;
        orb.y += (dy / d) * 2 * dtFactor;
      }
      if (circlesOverlap(s.player.x, s.player.y, s.player.radius, orb.x, orb.y, orb.radius)) {
        s.xp += orb.value;
        s.xpOrbs.splice(i, 1);
        if (s.xp >= s.xpToNext) {
          s.xp -= s.xpToNext;
          s.level++;
          s.xpToNext = xpForLevel(s.level);
          triggerLevelUp();
          break;
        }
      }
    }

    // — Spawning —
    s.timer += delta / 1000;
    const minutes = s.timer / 60;
    const spawnRate = Math.min(3, 1 / 1.5 + (minutes / 5) * (3 - 1 / 1.5));
    s.spawnAccumulator += spawnRate * dtFactor * (1 / TARGET_FPS);
    while (s.spawnAccumulator >= 1 && s.enemies.length < 100) {
      s.enemies.push(spawnEnemy(s));
      s.spawnAccumulator -= 1;
    }

    // — Draw —
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Background grid
    ctx.strokeStyle = "rgba(46, 204, 113, 0.04)";
    ctx.lineWidth = 1;
    for (let gx = 0; gx < CANVAS_WIDTH; gx += 40) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, CANVAS_HEIGHT); ctx.stroke();
    }
    for (let gy = 0; gy < CANVAS_HEIGHT; gy += 40) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(CANVAS_WIDTH, gy); ctx.stroke();
    }

    // Poison aura
    if (s.hasPoisonAura > 0) {
      const grad = ctx.createRadialGradient(s.player.x, s.player.y, 0, s.player.x, s.player.y, 70);
      grad.addColorStop(0, "rgba(155, 89, 182, 0.1)");
      grad.addColorStop(1, "rgba(155, 89, 182, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(s.player.x, s.player.y, 70, 0, Math.PI * 2);
      ctx.fill();
    }

    // XP orbs
    for (const orb of s.xpOrbs) {
      ctx.shadowBlur = 6;
      ctx.shadowColor = "#f1c40f";
      ctx.fillStyle = "#f39c12";
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Enemies
    for (const e of s.enemies) {
      const colors = { zombie: "#27ae60", bat: "#8e44ad", ghost: "rgba(180,180,255,0.7)" };
      const strokeColors = { zombie: "#2ecc71", bat: "#9b59b6", ghost: "rgba(200,200,255,0.9)" };
      ctx.fillStyle = colors[e.type];
      ctx.strokeStyle = strokeColors[e.type];
      ctx.lineWidth = 2;
      ctx.shadowBlur = 10;
      ctx.shadowColor = strokeColors[e.type];
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // HP bar
      if (e.hp < e.maxHp) {
        const bw = e.radius * 2;
        ctx.fillStyle = "#2c2c2c";
        ctx.fillRect(e.x - bw / 2, e.y - e.radius - 7, bw, 3);
        ctx.fillStyle = "#e74c3c";
        ctx.fillRect(e.x - bw / 2, e.y - e.radius - 7, bw * (e.hp / e.maxHp), 3);
      }
    }

    // Projectiles
    for (const p of s.projectiles) {
      ctx.shadowBlur = 12;
      ctx.shadowColor = "#2ecc71";
      ctx.fillStyle = "#2ecc71";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Skeletons
    for (const sk of s.skeletons) {
      ctx.shadowBlur = 8;
      ctx.shadowColor = "#95a5a6";
      ctx.fillStyle = "#ecf0f1";
      ctx.strokeStyle = "#bdc3c7";
      ctx.lineWidth = 1.5;
      // Body
      ctx.beginPath();
      ctx.arc(sk.x, sk.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Eyes
      ctx.fillStyle = "#2c3e50";
      ctx.beginPath();
      ctx.arc(sk.x - 3, sk.y - 2, 2, 0, Math.PI * 2);
      ctx.arc(sk.x + 3, sk.y - 2, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Player
    const blinking = s.player.invincibleFrames > 0 && Math.floor(s.player.invincibleFrames / 3) % 2 === 0;
    if (!blinking) {
      ctx.shadowBlur = 20;
      ctx.shadowColor = "#9b59b6";
      ctx.fillStyle = "#6c3483";
      ctx.strokeStyle = "#9b59b6";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.player.x, s.player.y, s.player.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Cloak detail
      ctx.fillStyle = "#7d3c98";
      ctx.beginPath();
      ctx.arc(s.player.x, s.player.y - 3, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Eyes glow
      ctx.shadowBlur = 8;
      ctx.shadowColor = "#f39c12";
      ctx.fillStyle = "#f1c40f";
      ctx.beginPath();
      ctx.arc(s.player.x - 4, s.player.y - 2, 2, 0, Math.PI * 2);
      ctx.arc(s.player.x + 4, s.player.y - 2, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // — HUD —
    drawHUD(ctx, s);

    s.frameCount++;
    rafRef.current = requestAnimationFrame(gameLoop);
  }, [triggerLevelUp]);

  function drawHUD(ctx: CanvasRenderingContext2D, s: GameState) {
    ctx.font = "13px 'Courier New', monospace";
    ctx.textAlign = "left";

    const padX = 12;
    const padY = 12;

    // Panel bg
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.beginPath();
    ctx.roundRect(padX - 6, padY - 6, 200, 100, 6);
    ctx.fill();

    // HP bar
    ctx.fillStyle = "#e74c3c";
    ctx.font = "bold 12px 'Courier New', monospace";
    ctx.fillText("HP", padX, padY + 14);
    const hpBarW = 140;
    ctx.fillStyle = "#2c2c2c";
    ctx.fillRect(padX + 28, padY + 3, hpBarW, 12);
    ctx.fillStyle = "#e74c3c";
    ctx.fillRect(padX + 28, padY + 3, hpBarW * (s.player.hp / s.player.maxHp), 12);
    ctx.strokeStyle = "#7f8c8d";
    ctx.lineWidth = 1;
    ctx.strokeRect(padX + 28, padY + 3, hpBarW, 12);
    ctx.fillStyle = "#ecf0f1";
    ctx.font = "10px 'Courier New', monospace";
    ctx.fillText(`${s.player.hp}/${s.player.maxHp}`, padX + 33, padY + 13);

    // Timer
    ctx.fillStyle = "#2ecc71";
    ctx.font = "bold 13px 'Courier New', monospace";
    ctx.fillText(`TIME: ${formatTime(s.timer)}`, padX, padY + 38);

    // Level
    ctx.fillStyle = "#9b59b6";
    ctx.fillText(`LVL: ${s.level}`, padX, padY + 56);

    // XP bar
    ctx.fillStyle = "#f39c12";
    ctx.font = "bold 12px 'Courier New', monospace";
    ctx.fillText("XP", padX, padY + 74);
    const xpBarW = 140;
    ctx.fillStyle = "#2c2c2c";
    ctx.fillRect(padX + 28, padY + 63, xpBarW, 10);
    ctx.fillStyle = "#f39c12";
    ctx.fillRect(padX + 28, padY + 63, xpBarW * Math.min(1, s.xp / s.xpToNext), 10);
    ctx.strokeStyle = "#7f8c8d";
    ctx.lineWidth = 1;
    ctx.strokeRect(padX + 28, padY + 63, xpBarW, 10);

    // Top-right kills
    ctx.textAlign = "right";
    ctx.fillStyle = "#ecf0f1";
    ctx.font = "bold 12px 'Courier New', monospace";
    ctx.fillText(`KILLS: ${s.kills}`, CANVAS_WIDTH - 12, padY + 18);
    ctx.fillText(`SKELETONS: ${s.skeletons.length}`, CANVAS_WIDTH - 12, padY + 38);
  }

  const startGame = useCallback(() => {
    stateRef.current = createGameState();
    lastTimeRef.current = 0;
    keysRef.current.clear();
    setScreen("playing");
    setFinalTime(0);
  }, []);

  // Start game loop when screen is playing
  useEffect(() => {
    if (screen === "playing") {
      stateRef.current.paused = false;
      rafRef.current = requestAnimationFrame(gameLoop);
      return () => stopLoop();
    }
  }, [screen, gameLoop, stopLoop]);

  // Keyboard listeners
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.code);
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
        e.preventDefault();
      }
    };
    const onUp = (e: KeyboardEvent) => keysRef.current.delete(e.code);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  const formatTimeDisplay = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  return (
    <div className="game-wrapper">
      <div className="canvas-container">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="game-canvas"
        />

        {screen === "start" && (
          <div className="overlay start-screen">
            <div className="overlay-panel">
              <h1 className="game-title">NECRO SURVIVOR</h1>
              <p className="game-subtitle">Command the undead. Defy death.</p>
              <div className="instructions">
                <p><span className="key-hint">WASD</span> or <span className="key-hint">Arrow Keys</span> to move</p>
                <p>Your skeleton minions auto-attack enemies</p>
                <p>Collect XP orbs to level up and choose upgrades</p>
                <p>Survive as long as possible!</p>
              </div>
              {highScore > 0 && (
                <p className="high-score-display">Best: {formatTimeDisplay(highScore)}</p>
              )}
              <button className="btn-start" onClick={startGame}>
                RISE FROM THE GRAVE
              </button>
            </div>
          </div>
        )}

        {screen === "upgrade" && (
          <div className="overlay upgrade-screen">
            <div className="overlay-panel upgrade-panel">
              <h2 className="upgrade-title">LEVEL UP!</h2>
              <p className="upgrade-subtitle">Choose an upgrade</p>
              <div className="upgrade-choices">
                {upgradeChoices.map((u) => (
                  <button
                    key={u.key}
                    className="upgrade-btn"
                    onClick={() => applyUpgrade(u.key)}
                  >
                    <span className="upgrade-name">{u.name}</span>
                    <span className="upgrade-desc">{u.description}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {screen === "gameover" && (
          <div className="overlay gameover-screen">
            <div className="overlay-panel">
              <h1 className="gameover-title">YOU HAVE FALLEN</h1>
              <div className="gameover-stats">
                <p>Time Survived: <span className="stat-value">{formatTimeDisplay(finalTime)}</span></p>
                <p>Best Run: <span className="stat-value">{formatTimeDisplay(highScore)}</span></p>
              </div>
              <button className="btn-start" onClick={startGame}>
                RISE AGAIN
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
