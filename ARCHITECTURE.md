# Field / Sound prototype

This repository contains a browser prototype for an interactive camera instrument. It already provides the input and output ends of the loop.

- `getUserMedia` creates a rear-camera video feed when permission is granted.
- `src/lib/objects.ts` holds normalised object locations and sound mappings.
- `src/lib/interaction.ts` tests a point against each circular object region.
- `src/lib/audio.ts` provides low-latency synthetic placeholder sounds through the Web Audio API.
- `src/hooks/useHandTracker.ts` uses MediaPipe's Hand Landmarker in video mode and converts landmark `8` from up to two hands into overhead-camera display coordinates.
- `src/hooks/useObjectDetector.ts` runs EfficientDet Lite0 at a lower inference rate, associates same-label boxes using IoU, and exposes stable detected-object regions.
- `src/lib/contactTracker.ts` emits only outside-to-inside fingertip transitions across all active index fingers, with a 450 ms per-object cooldown.
- `src/lib/soundAssignment.ts` asks a configured sound service for an instrument choice and caches the assignment by detected label.
- Pointer input remains available to test the existing regions.

## Production loop

```text
Camera frame -> object segmentation and tracking -> object masks
                                                \
Camera frame -> hand landmark model -> index fingertip -> contact state -> audio trigger
```

Run object detection and hand landmarks at different rates. Hand landmarks need to react quickly. Object segmentation can run less often and use tracker predictions between inference frames. Keep video capture, inference, rendering and audio on separate browser scheduling paths where practical.

## Replace the prototype regions

The values in `src/lib/objects.ts` stand in for detector output. A real detector adapter should emit this shape on each result.

```ts
type DetectedObject = {
  id: string
  label: string
  mask: ImageData | Float32Array
  bounds: { x: number; y: number; width: number; height: number }
  confidence: number
}
```

Assign a stable `id` by associating detections across frames with IoU or an object tracker. Convert the fingertip image coordinate into the same camera coordinate system as the masks. Trigger only on the transition from outside to inside a mask, then impose a short per-object cooldown. The overhead camera view is intentionally unmirrored, so camera, object, and fingertip coordinates share the same orientation.

## Technical paths

| Need | Browser-first approach | More controlled approach |
| --- | --- | --- |
| Hand/fingertip | MediaPipe Tasks Vision hand landmarker | Custom hand landmark model via ONNX Runtime Web |
| Known household classes | Detector with a browser model | Fine-tuned YOLO or segmentation model served by a local Python service |
| Any arbitrary foreground item | Interactive segmentation seeded by a tap or calibration step | Fine-tuned instance segmentation model |
| Audio | Preload `AudioBuffer` samples with Web Audio | Native audio engine in a desktop/mobile application |

## LLM sound assignment service

`server/sound-assignment.mjs` receives a detected class label and calls the OpenAI Responses API. Its strict JSON schema limits the output to the three instruments that the prototype can render. Configure `OPENAI_API_KEY`, `OPENAI_MODEL`, and `VITE_SOUND_ASSIGNMENT_ENDPOINT` outside the browser. The current assignment prompt receives the detector label, so it maps semantic associations such as a plant to a chime. Sending an object crop to a vision-capable model would add visual materials and colour to the assignment decision.

For an early demonstration, use three deliberately chosen, visually different objects, a fixed camera, and a hand landmarker. Object masks can come from simple colour or background segmentation when the scene is controlled. For arbitrary live scenes, semantic labels alone are insufficient because the system must preserve each physical instance across frames.

## Decisions needed before the next build

- **Platform.** Browser, mobile application, or desktop installation changes the camera and inference choices.
- **Scene.** Fixed tabletop scene or uncontrolled environment determines whether calibration and background subtraction are viable.
- **Objects.** A known set of props can use markers or a trained detector. Arbitrary objects need a selection or segmentation interaction.
- **Gesture.** Define whether contact means fingertip enters the mask, a downward tap motion, a pinch, or a dwell.
- **Sound behaviour.** Confirm whether repeated hits should overlap, retrigger, vary velocity, or map touch position to pitch and volume.
- **Latency target and hardware.** A musical interaction generally needs an end-to-end response that feels immediate. This constrains camera resolution, model size and GPU acceleration.

## Main risks to test early

- Hand or object occlusion during a tap can temporarily remove the target mask.
- A 2D camera cannot confirm physical contact when a finger passes in front of an object. Use motion history, depth, or a constrained overhead view if false hits are unacceptable.
- Lighting changes, reflections and motion blur reduce segmentation quality.
- Mirrored previews, mobile browser permissions and audio autoplay rules can produce integration-specific failures.
- One sound should not fire continuously while the finger remains inside an object. The touch state machine and cooldown prevent this.
