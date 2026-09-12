# Object photo covers

Implemented 2026-09-12 for notebooks and tasks. Camera → photo → optional cutout → actual cover preview → Apply. The original photo is processed locally and never sent to a background-removal service. Only the result the user applies is synced.

## Free processing decision

| Approach | Cost and tradeoff | Decision |
| --- | --- | --- |
| BiRefNet lite 512 in a browser worker | MIT model. The fp32 weights are about 192 MB, plus about 22 MB for ONNX Runtime. No fee per photo. CPU and memory use fall on the device. | Implemented as an explicit action with the download size disclosed before starting. |
| BiRefNet lite fp16 / WebGPU | The weights are about 98.5 MB. Browser/GPU support varies, particularly inside Android WebView. | Keep for a measured device optimization, not an untested automatic fallback. |
| BRIA RMBG 1.4 | The publisher permits noncommercial use under its model license and requires a commercial agreement for commercial use. | Avoided for this app. |
| remove.bg cloud API | Its official free offering includes 50 preview API images per month. Larger outputs and ongoing volume use paid credits. An API key and backend would be required. | Not added: it introduces quota, cost, and photo transmission. |

Primary sources, checked 2026-09-12:

- [Browser-ready BiRefNet lite 512 model card](https://huggingface.co/studioludens/birefnet-lite-512) and [weight sizes](https://huggingface.co/studioludens/birefnet-lite-512/tree/main/onnx). The original 1024 export failed during browser inference in our test. The publisher documents its browser memory limitation.
- [BiRefNet MIT license](https://github.com/ZhengPeng7/BiRefNet/blob/main/LICENSE), copyright 2024 ZhengPeng. The model is fetched from its publisher at runtime and is not redistributed in this repository.
- [BRIA RMBG 1.4 model/license](https://huggingface.co/briaai/RMBG-1.4).
- [remove.bg free limits](https://www.remove.bg/help/a/is-remove-bg-free-%3F.class).

## Runtime and storage

- Existing `@huggingface/transformers` dependency, `background-removal` pipeline with `studioludens/birefnet-lite-512`. Pinned model revision `4a3c40c36c94093cc1e724d9ea428b8fa4b57dc7`, which includes the config and processor files as well as weights.
- Input is validated, decoded, orientation-corrected by the browser, and limited to a 1280 px longest edge. The model runs the 512 × 512 export preprocessing. The output preserves alpha and trims transparent margins.
- The model and runtime are lazy-loaded in a dedicated worker. Cancel or close terminates that worker. A four-minute deadline returns to the photo with a retry or full-photo option. Download progress reports actual bytes, while inference is deliberately indeterminate.
- Model caching is browser-managed and can be evicted. Offline use requires the necessary downloaded assets to remain cached. No claim that all Android devices have equal speed or memory availability.
- Camera uses `getUserMedia`, requests video only, releases tracks on every exit, and offers the native camera file input or ordinary upload when unavailable. Android declares CAMERA as an optional hardware feature and uses Capacitor's existing runtime permission flow.
- The applied result is written to IndexedDB with owner-scoped metadata before upload. It then goes to the existing private `bd-files` bucket under `<uid>/object-covers/<kind>__<id>__<timestamp>.png`. Existing first-folder owner RLS applies. No schema migration or paid API is needed.
- Failed/offline uploads remain visibly identified as local saves. Pending covers retry on reconnect, focus, or the next app load. A successful response clears pending, and a stale response cannot replace a newer cover. Private signed URLs are resolved through the existing batched signer. Legacy notebook cover photos still render as fallbacks.
- Animation respects reduced motion and Basedly's motion setting. The review uses the real target title. Where the actual card is visible, Apply animates the object toward that card.

## Validation boundary

TypeScript and browser checks are recorded in the redesign delivery notes. Camera hardware, Xiaomi stylus/device performance, authenticated cross-device sync, and full model quality need device/session validation; a fixture preview cannot prove production storage policies.
