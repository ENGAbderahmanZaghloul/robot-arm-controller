const DEFAULT_HOST = "http://192.168.4.1";
const JOYSTICK_REPEAT_MS = 180;
const SPEED_SEND_DELAY_MS = 120;

const carState = {
  activePointerId: null,
  currentDirection: "stop",
  joystickTimer: null,
  speedTimer: null,
};

const carElements = {
  carSelect: document.querySelector("#carSelect"),
  carHostInput: document.querySelector("#carHostInput"),
  carStatusDot: document.querySelector("#carStatusDot"),
  statusButton: document.querySelector("#statusButton"),
  stopButton: document.querySelector("#stopButton"),
  centerStopButton: document.querySelector("#centerStopButton"),
  speedSlider: document.querySelector("#speedSlider"),
  speedValue: document.querySelector("#speedValue"),
  carLog: document.querySelector("#carLog"),
  joystickPad: document.querySelector("#joystickPad"),
  joystickBullet: document.querySelector("#joystickBullet"),
  joystickDirection: document.querySelector("#joystickDirection"),
};

function normalizedHost() {
  const host = carElements.carHostInput.value.trim() || DEFAULT_HOST;
  return host.replace(/\/+$/, "");
}

function appendCarLog(message, isError = false) {
  const time = new Date().toLocaleTimeString();
  carElements.carLog.textContent += `\n[${time}] ${isError ? "!" : "•"} ${message}`;
  carElements.carLog.scrollTop = carElements.carLog.scrollHeight;
}

function setCarOnline(isOnline) {
  carElements.carStatusDot.textContent = isOnline ? "Reachable" : "Not reachable";
  carElements.carStatusDot.classList.toggle("connected", isOnline);
}

async function requestCar(path, params = {}) {
  const url = new URL(`${normalizedHost()}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url, { method: "GET", cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function safeRequest(path, params, successMessage) {
  try {
    const result = await requestCar(path, params);
    setCarOnline(true);
    if (successMessage) appendCarLog(successMessage);
    return result;
  } catch (error) {
    setCarOnline(false);
    appendCarLog(`${path} failed: ${error.message}`, true);
    return null;
  }
}

function speedValue() {
  return Number.parseInt(carElements.speedSlider.value, 10);
}

async function sendSpeed(speed = speedValue(), shouldLog = false) {
  carElements.speedSlider.value = String(speed);
  carElements.speedValue.textContent = String(speed);
  await safeRequest("/speed", { v: speed }, shouldLog ? `Speed set to ${speed}` : "");
}

async function sendMove(direction) {
  carState.currentDirection = direction;
  await safeRequest("/move", { dir: direction }, `Move ${direction}`);
}

async function stopCar() {
  carState.currentDirection = "stop";
  stopJoystickLoop();
  resetJoystick();
  document.querySelectorAll(".drive-button.active").forEach((button) => button.classList.remove("active"));
  await safeRequest("/stop", {}, "Stop");
}

async function checkStatus() {
  const status = await safeRequest("/status", {}, "");
  if (!status) return;
  carElements.speedSlider.value = String(status.speed ?? speedValue());
  carElements.speedValue.textContent = String(status.speed ?? speedValue());
  appendCarLog(`Status: dir=${status.dir}, speed=${status.speed}, turn=${status.turnSpeed}, ip=${status.ip}`);
}

function startDriveButton(button) {
  if (!button.dataset.dir) return;
  button.classList.add("active");
  sendMove(button.dataset.dir);
}

function stopDriveButton(button) {
  button.classList.remove("active");
  stopCar();
}

function directionFromVector(x, y) {
  const distance = Math.hypot(x, y);
  if (distance < 0.18) return "stop";

  const angle = Math.atan2(-y, x) * (180 / Math.PI);
  if (angle >= 67.5 && angle < 112.5) return "f";
  if (angle >= 22.5 && angle < 67.5) return "fr";
  if (angle >= -22.5 && angle < 22.5) return "r";
  if (angle >= -67.5 && angle < -22.5) return "br";
  if (angle >= -112.5 && angle < -67.5) return "b";
  if (angle >= -157.5 && angle < -112.5) return "bl";
  if (angle >= 112.5 && angle < 157.5) return "fl";
  return "l";
}

function labelForDirection(direction) {
  return {
    f: "Up",
    b: "Down",
    l: "Left",
    r: "Right",
    fr: "Up Right",
    fl: "Up Left",
    br: "Down Right",
    bl: "Down Left",
    stop: "Idle",
  }[direction];
}

function updateJoystick(event) {
  const rect = carElements.joystickPad.getBoundingClientRect();
  const radius = rect.width / 2;
  const centerX = rect.left + radius;
  const centerY = rect.top + radius;
  const rawX = event.clientX - centerX;
  const rawY = event.clientY - centerY;
  const maxTravel = radius - 43;
  const distance = Math.min(Math.hypot(rawX, rawY), maxTravel);
  const angle = Math.atan2(rawY, rawX);
  const x = Math.cos(angle) * distance;
  const y = Math.sin(angle) * distance;
  const strength = maxTravel > 0 ? distance / maxTravel : 0;
  const nextDirection = directionFromVector(x / maxTravel, y / maxTravel);
  const nextSpeed = Math.max(40, Math.round(strength * 255));

  carElements.joystickBullet.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  carElements.joystickDirection.textContent = `${labelForDirection(nextDirection)} · ${nextDirection === "stop" ? 0 : nextSpeed}`;

  carState.currentDirection = nextDirection;
  if (nextDirection !== "stop") {
    carElements.speedSlider.value = String(nextSpeed);
    carElements.speedValue.textContent = String(nextSpeed);
  }
}

function resetJoystick() {
  carElements.joystickBullet.style.transform = "translate(-50%, -50%)";
  carElements.joystickDirection.textContent = "Idle";
}

function startJoystickLoop() {
  stopJoystickLoop();
  carState.joystickTimer = window.setInterval(() => {
    if (carState.currentDirection === "stop") {
      stopCar();
      return;
    }
    sendSpeed(speedValue());
    sendMove(carState.currentDirection);
  }, JOYSTICK_REPEAT_MS);
}

function stopJoystickLoop() {
  if (!carState.joystickTimer) return;
  window.clearInterval(carState.joystickTimer);
  carState.joystickTimer = null;
}

function bindCarEvents() {
  carElements.statusButton.addEventListener("click", checkStatus);
  carElements.stopButton.addEventListener("click", stopCar);
  carElements.centerStopButton.addEventListener("click", stopCar);

  carElements.carSelect.addEventListener("change", () => {
    appendCarLog(`Selected ${carElements.carSelect.value}. Connect Wi‑Fi to that network first.`);
  });

  carElements.speedSlider.addEventListener("input", () => {
    carElements.speedValue.textContent = String(speedValue());
    window.clearTimeout(carState.speedTimer);
    carState.speedTimer = window.setTimeout(() => sendSpeed(), SPEED_SEND_DELAY_MS);
  });

  document.querySelectorAll(".speed-preset").forEach((button) => {
    button.addEventListener("click", () => sendSpeed(Number.parseInt(button.dataset.speed, 10), true));
  });

  document.querySelectorAll(".drive-button[data-dir]").forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
      button.setPointerCapture(event.pointerId);
      startDriveButton(button);
    });
    button.addEventListener("pointerup", () => stopDriveButton(button));
    button.addEventListener("pointercancel", () => stopDriveButton(button));
    button.addEventListener("lostpointercapture", () => {
      if (button.classList.contains("active")) stopDriveButton(button);
    });
  });

  carElements.joystickPad.addEventListener("pointerdown", (event) => {
    carState.activePointerId = event.pointerId;
    carElements.joystickPad.setPointerCapture(event.pointerId);
    updateJoystick(event);
    startJoystickLoop();
  });

  carElements.joystickPad.addEventListener("pointermove", (event) => {
    if (event.pointerId !== carState.activePointerId) return;
    updateJoystick(event);
  });

  ["pointerup", "pointercancel", "lostpointercapture"].forEach((eventName) => {
    carElements.joystickPad.addEventListener(eventName, (event) => {
      if (event.pointerId !== carState.activePointerId) return;
      carState.activePointerId = null;
      stopCar();
    });
  });
}

bindCarEvents();
appendCarLog("Ready. Join car1/car2/car3/smart-car Wi‑Fi, then Check Car.");
