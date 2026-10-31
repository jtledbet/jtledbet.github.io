// Collision response adapted from the original site's pinball table.
// Keep time, rendering, score, and input outside this module.
export const PHYSICS = Object.freeze({
  step: 1 / 240,
  gravity: 360,
  maxSpeed: 1100,
  bumperKick: 280,
  slingKick: 118,
  impactDamping: .96,
  bumperCooldown: .1,
  slingCooldown: .18
});

export const TABLE = Object.freeze({
  ballRadius: 9,
  bumperRadius: 27,
  guideRadius: 6,
  flipperRadius: 7,
  left: 20,
  right: 460,
  top: 120,
  drain: 730,
  flipperY: 620,
  flipperLength: 85
});

export function limitSpeed(ball, maximum = PHYSICS.maxSpeed) {
  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed > maximum) {
    ball.vx *= maximum / speed;
    ball.vy *= maximum / speed;
  }
}

export function integrate(ball, dt) {
  // Bound velocity before moving, including immediately after a power-up.
  limitSpeed(ball);
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt + .5 * PHYSICS.gravity * dt * dt;
  ball.vy += PHYSICS.gravity * dt;
}

export function reflect(ball, nx, ny, {restitution = 1, kick = 0, damping = PHYSICS.impactDamping, surfaceX = 0, surfaceY = 0} = {}) {
  const approach = (ball.vx - surfaceX) * nx + (ball.vy - surfaceY) * ny;
  // Separate overlapping shapes without kicking a departing ball back into them.
  if (approach >= 0) return false;
  ball.vx -= (1 + restitution) * approach * nx;
  ball.vy -= (1 + restitution) * approach * ny;
  ball.vx = (ball.vx + nx * kick) * damping;
  ball.vy = (ball.vy + ny * kick) * damping;
  limitSpeed(ball);
  return true;
}

export function circleContact(ball, cx, cy, radius, response) {
  let dx = ball.x - cx, dy = ball.y - cy, distance = Math.hypot(dx, dy);
  const separation = TABLE.ballRadius + radius;
  if (distance >= separation) return false;
  if (distance < 1e-9) {
    const speed = Math.hypot(ball.vx, ball.vy);
    dx = speed ? -ball.vx / speed : 0;
    dy = speed ? -ball.vy / speed : -1;
    distance = 1;
  }
  const nx = dx / distance, ny = dy / distance;
  ball.x = cx + nx * separation;
  ball.y = cy + ny * separation;
  return reflect(ball, nx, ny, response);
}

export function segmentContact(ball, ax, ay, bx, by, radius, response = {}, pivotX = 0, pivotY = 0, omega = 0) {
  const dx = bx - ax, dy = by - ay, lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((ball.x - ax) * dx + (ball.y - ay) * dy) / lengthSquared)) : 0;
  const cx = ax + t * dx, cy = ay + t * dy;
  let nx = ball.x - cx, ny = ball.y - cy, distance = Math.hypot(nx, ny);
  const separation = TABLE.ballRadius + radius;
  if (distance >= separation) return false;
  const surfaceX = -omega * (cy - pivotY), surfaceY = omega * (cx - pivotX);
  if (distance < 1e-9) {
    // At exact coincidence, use a true segment normal facing into the impact.
    const length = Math.sqrt(lengthSquared) || 1;
    nx = lengthSquared ? -dy / length : 0;
    ny = lengthSquared ? dx / length : -1;
    if ((ball.vx - surfaceX) * nx + (ball.vy - surfaceY) * ny > 0) { nx = -nx; ny = -ny; }
  } else { nx /= distance; ny /= distance; }
  ball.x = cx + nx * separation;
  ball.y = cy + ny * separation;
  return reflect(ball, nx, ny, {...response, surfaceX, surfaceY});
}

export function wallContacts(ball) {
  const left = TABLE.left + TABLE.ballRadius, right = TABLE.right - TABLE.ballRadius, top = TABLE.top + TABLE.ballRadius;
  const response = {restitution: .94, damping: 1};
  if (ball.x < left) { ball.x = left; reflect(ball, 1, 0, response); }
  if (ball.x > right) { ball.x = right; reflect(ball, -1, 0, response); }
  if (ball.y < top) { ball.y = top; reflect(ball, 0, 1, response); }
}
