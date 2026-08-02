const BAUD_RATE = 115200;
const SERVO_ANGLES = Array.from({ length: 19 }, (_, index) => index * 10);
const M1_ANGLES = [0, 3, 5, 7, ...SERVO_ANGLES.slice(1)];
const HOLDER_ANGLES = [0, 20, 50, 60, 70, 80, 90, 110, 120];
const HOLD_REPEAT_MS = 220;

const state = {
  port: null,
  reader: null,
  writer: null,
  isConnected: false,
  readBuffer: "",
  statusCapture: null,
  holdTimer: null,
};

const elements = {
  connectButton: document.querySelector("#connectButton"),
  disconnectButton: document.querySelector("#disconnectButton"),
  connectionStatus: document.querySelector("#connectionStatus"),
  servoGrid: document.querySelector("#servoGrid"),
  holderGrid: document.querySelector("#holderGrid"),
  stepAmount: document.querySelector("#stepAmount"),
  statusOutput: document.querySelector("#statusOutput"),
  serialLog: document.querySelector("#serialLog"),
  clearLogButton: document.querySelector("#clearLogButton"),
  manualCommandForm: document.querySelector("#manualCommandForm"),
  manualCommandInput: document.querySelector("#manualCommandInput"),
};

function createButton(label, command, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset.command = command;
  button.className = ["command-button", className].filter(Boolean).join(" ");
  return button;
}

function buildServoControls() {
  for (let motorNumber = 1; motorNumber <= 5; motorNumber += 1) {
    const card = document.createElement("article");
    card.className = "motor-card";
    card.innerHTML = `
      <div class="motor-head">
        <div>
          <p class="eyebrow">Motor ${motorNumber}</p>
          <h3>M${motorNumber}</h3>
        </div>
        <span class="current-angle" id="m${motorNumber}Angle">No grade sent</span>
      </div>
      <div class="grade-buttons"></div>
    `;

    const buttons = card.querySelector(".grade-buttons");
    const angles = motorNumber === 1 ? M1_ANGLES : SERVO_ANGLES;
    angles.forEach((angle) => {
      buttons.append(createButton(`${angle}°`, `m${motorNumber}-${angle}`));
    });

    elements.servoGrid.append(card);
  }
}

function buildHolderControls() {
  [
    { title: "Open", prefix: "o" },
    { title: "Close", prefix: "c" },
  ].forEach((group) => {
    const card = document.createElement("article");
    card.className = "motor-card";
    card.innerHTML = `
      <div class="motor-head">
        <div>
          <p class="eyebrow">Holder</p>
          <h3>${group.title}</h3>
        </div>
        <span class="current-angle" id="${group.prefix}HolderAngle">No grade sent</span>
      </div>
      <div class="holder-buttons"></div>
    `;

    const buttons = card.querySelector(".holder-buttons");
    HOLDER_ANGLES.forEach((angle) => {
      buttons.append(createButton(`${angle}°`, `${group.prefix}-${angle}`));
    });

    elements.holderGrid.append(card);
  });
}

function setConnected(isConnected) {
  state.isConnected = isConnected;
  elements.connectButton.disabled = isConnected;
  elements.disconnectButton.disabled = !isConnected;
  elements.connectionStatus.textContent = isConnected ? "Connected" : "Disconnected";
  elements.connectionStatus.classList.toggle("connected", isConnected);
  document.querySelectorAll(".command-button, .hold-command").forEach((button) => {
    button.disabled = !isConnected;
  });
}

function appendLog(message, direction = "rx") {
  const time = new Date().toLocaleTimeString();
  const prefix = direction === "tx" ? ">>" : "<<";
  elements.serialLog.textContent += `[${time}] ${prefix} ${message}\n`;
  elements.serialLog.scrollTop = elements.serialLog.scrollHeight;
}

function updateLastSent(command) {
  const motorMatch = command.match(/^m([1-5])-(\d+)$/);
  if (motorMatch) {
    document.querySelector(`#m${motorMatch[1]}Angle`).textContent = `${motorMatch[2]}°`;
    return;
  }

  const holderMatch = command.match(/^([oc])-(\d+)$/);
  if (holderMatch) {
    document.querySelector(`#${holderMatch[1]}HolderAngle`).textContent = `${holderMatch[2]}°`;
  }
}

function captureStatusLine(line) {
  if (line.includes("=========== STATUS ===========")) {
    state.statusCapture = [line];
    return;
  }

  if (!state.statusCapture) return;

  state.statusCapture.push(line);

  if (line.includes("==============================")) {
    elements.statusOutput.textContent = state.statusCapture.join("\n");
    state.statusCapture = null;
  }
}

async function sendCommand(command) {
  if (!state.writer) {
    appendLog("Connect Arduino first.", "rx");
    return;
  }

  const cleanCommand = command.trim();
  if (!cleanCommand) return;

  const data = new TextEncoder().encode(`${cleanCommand}\n`);
  await state.writer.write(data);
  appendLog(cleanCommand, "tx");
  updateLastSent(cleanCommand);
}

async function readLoop() {
  const decoder = new TextDecoder();

  while (state.port?.readable && state.isConnected) {
    state.reader = state.port.readable.getReader();

    try {
      while (state.isConnected) {
        const { value, done } = await state.reader.read();
        if (done) break;
        state.readBuffer += decoder.decode(value, { stream: true });
        const lines = state.readBuffer.split(/\r?\n/);
        state.readBuffer = lines.pop() ?? "";
        lines.filter(Boolean).forEach((line) => {
          appendLog(line);
          captureStatusLine(line);
        });
      }
    } catch (error) {
      appendLog(`Read error: ${error.message}`);
    } finally {
      state.reader.releaseLock();
      state.reader = null;
    }
  }
}

async function connectSerial() {
  if (!("serial" in navigator)) {
    appendLog("Web Serial is not supported. Use Chrome or Edge on localhost.");
    return;
  }

  try {
    state.port = await navigator.serial.requestPort();
    await state.port.open({ baudRate: BAUD_RATE });
    state.writer = state.port.writable.getWriter();
    setConnected(true);
    appendLog(`Connected at ${BAUD_RATE} baud.`);
    readLoop();
  } catch (error) {
    appendLog(`Connect failed: ${error.message}`);
  }
}

async function disconnectSerial() {
  stopHoldCommand();
  setConnected(false);

  try {
    if (state.reader) await state.reader.cancel();
    if (state.writer) {
      state.writer.releaseLock();
      state.writer = null;
    }
    if (state.port) {
      await state.port.close();
      state.port = null;
    }
    appendLog("Disconnected.");
  } catch (error) {
    appendLog(`Disconnect error: ${error.message}`);
  }
}

function getStepAmount() {
  const amount = Math.abs(Number.parseInt(elements.stepAmount.value, 10));
  return Number.isFinite(amount) && amount > 0 ? amount : 1;
}

function commandForHoldButton(button) {
  const amount = getStepAmount();
  return `${button.dataset.axis}${button.dataset.direction}${amount}`;
}

function startHoldCommand(button) {
  sendCommand(commandForHoldButton(button));
  button.classList.add("active");
  state.holdTimer = window.setInterval(() => {
    sendCommand(commandForHoldButton(button));
  }, HOLD_REPEAT_MS);
}

function stopHoldCommand() {
  if (state.holdTimer) {
    window.clearInterval(state.holdTimer);
    state.holdTimer = null;
  }
  document.querySelectorAll(".hold-command.active").forEach((button) => {
    button.classList.remove("active");
  });
}

function bindEvents() {
  elements.connectButton.addEventListener("click", connectSerial);
  elements.disconnectButton.addEventListener("click", disconnectSerial);
  elements.clearLogButton.addEventListener("click", () => {
    elements.serialLog.textContent = "";
    elements.statusOutput.textContent = "Status output will appear here.";
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest(".command-button");
    if (!button || button.disabled) return;
    if (button.dataset.confirm && !window.confirm(button.dataset.confirm)) return;
    sendCommand(button.dataset.command);
  });

  document.querySelectorAll(".hold-command").forEach((button) => {
    button.addEventListener("pointerdown", () => {
      if (!button.disabled) startHoldCommand(button);
    });
  });

  ["pointerup", "pointercancel", "pointerleave", "blur"].forEach((eventName) => {
    window.addEventListener(eventName, stopHoldCommand);
  });

  elements.manualCommandForm.addEventListener("submit", (event) => {
    event.preventDefault();
    sendCommand(elements.manualCommandInput.value);
    elements.manualCommandInput.value = "";
  });

  navigator.serial?.addEventListener("disconnect", disconnectSerial);
}

buildServoControls();
buildHolderControls();
bindEvents();
setConnected(false);
