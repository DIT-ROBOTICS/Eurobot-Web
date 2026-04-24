/**
 * Cinematic auto-orbit for <model-viewer>: full horizontal 360 + pitch/radius
 * sweeps. Pauses after user input; respects prefers-reduced-motion.
 */
(function () {
  var el = document.getElementById("robot-model");
  if (!el) return;

  var reduce = false;
  try {
    reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {}

  var periodAz = reduce ? 220 : 60;
  var periodEl1 = reduce ? 90 : 26;
  var periodEl2 = reduce ? 0 : 41;
  var periodR = reduce ? 80 : 32;
  var t0 = performance.now() * 0.001;
  // rAF: ~24Hz throttle + 2dp meters had made the dolly (radial zoom) look stepped, not the mesh.
  var lastTick = 0;
  var intervalMs = reduce ? 150 : 0;
  var pauseUntil = 0;
  var pauseAfterMs = 4800;

  function isPaused() {
    return performance.now() < pauseUntil;
  }
  function noteInteraction() {
    pauseUntil = performance.now() + pauseAfterMs;
  }
  el.addEventListener("pointerdown", noteInteraction, { passive: true });
  el.addEventListener("wheel", noteInteraction, { passive: true });
  el.addEventListener("keydown", function (e) {
    if (e.key && e.key.length === 1) noteInteraction();
  });

  if (reduce) {
    el.setAttribute("camera-orbit", "0deg 55deg 1.12m");
    return;
  }

  /** When src is set via the JS property, getAttribute("src") is often empty. */
  function hasModelSource() {
    if (el.getAttribute("src")) return true;
    var s = el.src;
    return typeof s === "string" && s.length > 0;
  }

  function tick(now) {
    requestAnimationFrame(tick);
    if (intervalMs > 0 && now - lastTick < intervalMs) return;
    lastTick = now;
    if (!hasModelSource()) return;
    if (isPaused()) return;

    var t = now * 0.001 - t0;
    var az = (t * 360) / periodAz % 360;
    if (az < 0) az += 360;

    var s1 = Math.sin((2 * Math.PI * t) / periodEl1);
    var s2 = periodEl2
      ? Math.sin((2 * Math.PI * t) / periodEl2) * 0.22
      : 0;
    var elPitch = 52 + 28 * s1 + 8 * s2;
    elPitch = Math.max(18, Math.min(86, elPitch));

    // Slightly gentler dolly: large excursions read as "popping" scale on-screen.
    var rad = 1.04 + 0.08 * Math.sin((2 * Math.PI * t) / periodR);
    rad = Math.max(0.88, Math.min(1.6, rad));

    el.setAttribute(
      "camera-orbit",
      az.toFixed(3) + "deg " + elPitch.toFixed(3) + "deg " + rad.toFixed(4) + "m"
    );
  }

  requestAnimationFrame(tick);
})();
