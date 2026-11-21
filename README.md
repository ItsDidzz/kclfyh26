# Field / Sound

A browser skeleton for a live camera instrument. Start it locally and grant camera permission.

```bash
npm run dev
```

Use the marked regions or their **Preview** controls to hear temporary Web Audio sounds. Starting the camera replaces the illustrated preview with your live feed. MediaPipe tracks up to two index fingertips and plays a sound when either enters a region. Each region has a 250 ms cooldown. Pointer taps remain available for testing.

Mount the rear camera directly above the interaction surface. The live camera feed is unmirrored so the back of the hand, fingertip markers, and detected-object boxes stay in the same top-down coordinate system.

## Playing session

1. **Start camera**, then click **Calibrate**.
2. **Tabletop area.** Drag the four numbered corners onto the corners of your playing surface. Detected objects whose centre is outside the area, and fingertips outside it, are ignored. Everything outside is dimmed.
3. **Fingertip alignment.** The overhead camera sees the back of the hand, so the tracked index tip (dashed ring) often sits a little off the real contact point. Either rest a fingertip on the table and click where it really touches, or press **Align on corner 1** and touch corner 1 before the 3 s countdown ends. Fine-tune with the Offset X/Y sliders and widen **Touch margin** if taps are missed. Calibration is saved in `localStorage`.
4. **Done calibrating**, place your objects and keep your hands out of view. With **Auto-lock** on, the scene locks after the same set of objects has been visible for 2.5 s (or press **Lock scene**). Locking stops the object detector, freezes the regions so your hand cannot occlude them, and freezes the backdrop to a still frame. Tick **Live video while locked** to see the camera again. **Rescan objects** unlocks.
5. In the **Orchestra** panel under the camera view, objects are numbered left to right (shown on the stage too). Pick a preset or choose an instrument and note per object. Presets hand out their sounds in left-to-right order, and are re-applied when you rescan and lock again.

### Presets for the demo

| Preset | Objects | Sounds | Song guide |
| --- | --- | --- | --- |
| Ode to Joy | 5 (+1 optional bass) | Marimba C D E F G | Ode to Joy, mostly neighbouring steps: easiest to perform |
| Twinkle | 6 | Chimes C D E F G A | Twinkle Twinkle Little Star |
| Pentatonic jam | 5 (+3 optional) | Kick, shaker, bass, marimba E/G, chime, plucks | A short groove; any combination sounds good for improvising |

With a preset active, the **song guide** shows the tune as a row of object numbers. The next object glows on the stage and in the list; hitting it advances the guide. **Listen** plays the tune through the objects so the audience hears it first. If fewer objects are on the table than the song needs, the steps for missing objects are skipped.

## Object detection and LLM assignments

When the camera is live, MediaPipe EfficientDet identifies common objects and turns their bounding boxes into tappable regions. The detector excludes people. It runs about five times per second while the hand tracker continues to use every decoded frame.

To enable LLM sound assignments, copy `.env.example` to `.env.local`, export `OPENAI_API_KEY` and `OPENAI_MODEL` in the shell that starts the sound service, then run the two processes in separate terminals.

```bash
export OPENAI_API_KEY="your-api-key"
export OPENAI_MODEL="your-responses-model"
npm run sound-service
npm run dev
```

`VITE_SOUND_ASSIGNMENT_ENDPOINT` points the browser at the local sound service. The service calls the OpenAI Responses API with a structured response constrained to `marimba`, `bass`, or `chime`. The browser keeps a per-label assignment cache. Without the endpoint, it uses its deterministic offline mappings.

The component boundaries, staged implementation plan, technology options, decisions and risks are in [ARCHITECTURE.md](./ARCHITECTURE.md).
