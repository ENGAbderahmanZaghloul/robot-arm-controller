# Robot Arm Web Controller

A browser-based GUI for the existing Arduino serial commands. The Arduino code does not need to change.

## Run

Use Chrome or Microsoft Edge, then serve this folder from localhost:

```bash
python3 -m http.server 5173
```

Open:

```text
http://localhost:5173
```

Click `Connect Arduino`, choose the Arduino USB serial port, then use the buttons.

## Smart Car Controller

The car controller is a separate page:

```text
http://localhost:5173/car.html
```

Connect your computer/phone Wi‑Fi to one of the ESP access points first:

- `car1`
- `car2`
- `car3`
- `smart-car`

The default ESP address is `http://192.168.4.1`. Use the speed slider, press-and-hold movement buttons, or drag the free-control bullet joystick. The page calls:

- Move: `/move?dir=f`, `/move?dir=b`, `/move?dir=l`, `/move?dir=r`
- Diagonal: `/move?dir=fr`, `/move?dir=fl`, `/move?dir=br`, `/move?dir=bl`
- Stop: `/stop`
- Speed: `/speed?v=220`
- Status: `/status`

## Commands Sent

- Servo motors: `m1-0` through `m5-180`
- Holder open: `o-0` through `o-50`
- Holder close: `c-0` through `c-50`
- Holder home: `h`
- Stepper movement: `mx+100`, `mx-100`, `my+100`, `my-100`
- Status: `status`
- Calibration: `setx0`, `setxm`, `setxe`, `x0`, `xm`, `xe`, `sety0`, `setym`, `setye`, `y0`, `ym`, `ye`
- Reset: `reset`
- Factory reset: `factory`

## Notes

- Web Serial works on secure contexts; `localhost` is accepted.
- If the port does not appear, close Arduino IDE Serial Monitor first.
- Baud rate is set to `115200`, matching the Arduino sketch.
