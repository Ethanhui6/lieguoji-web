import { _n as extensions, nt as Container } from "./ParticleBuffer-sr-KNQeB.js";
import "./FilterSystem-BTKKFfb6.js";
import { c as DOMPipe, l as accessibilityTarget, n as EventSystem, t as FederatedContainer, u as AccessibilitySystem } from "./FederatedEventTarget-CK18NVE1.js";
import "./init-xgq-iJuH.js";
//#region node_modules/pixi.js/lib/accessibility/init.mjs
extensions.add(AccessibilitySystem);
extensions.mixin(Container, accessibilityTarget);
//#endregion
//#region node_modules/pixi.js/lib/dom/init.mjs
extensions.add(DOMPipe);
//#endregion
//#region node_modules/pixi.js/lib/events/init.mjs
extensions.add(EventSystem);
extensions.mixin(Container, FederatedContainer);
//#endregion
