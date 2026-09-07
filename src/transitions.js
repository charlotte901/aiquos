const SCROLL_DURATION = 840;

/** The home and login pages share a virtual scroll surface; no browser bar. */
export async function animateScrollPage(host, outgoing, incoming, scrollY = 0, reverse = false) {
  const stage = document.createElement("div");
  const track = document.createElement("div");
  const outFace = document.createElement("div");
  const inFace = document.createElement("div");
  // freezeView already produced decoded, inert snapshots. Cloning them a
  // second time copies every canvas and image again right before the first
  // transition frame.
  const outFrozen = outgoing;
  const inFrozen = incoming;

  stage.className = "scroll-page-stage";
  track.className = "scroll-page-track";
  outFace.className = "scroll-page-face";
  inFace.className = "scroll-page-face scroll-page-incoming";
  outFrozen.style.width = `${innerWidth}px`;
  outFrozen.style.transform = `translateY(${-scrollY}px)`;
  inFrozen.style.width = `${innerWidth}px`;
  if (reverse) inFace.classList.add("is-before");
  outFace.append(outFrozen);
  inFace.append(inFrozen);
  track.append(outFace, inFace);
  stage.append(track);
  host.replaceChildren(stage);
  host.classList.add("is-running");
  // Give the browser one clean frame to lay out and paint the resting state
  // before the shared transform starts. This removes the first-frame stall.
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );

  const scroll = track.animate(
    [
      { transform: "translate3d(0, 0, 0)" },
      { transform: `translate3d(0, ${reverse ? "100%" : "-100%"}, 0)` },
    ],
    {
      duration: SCROLL_DURATION,
      easing: "cubic-bezier(.32,.08,.16,1)",
      fill: "both",
    },
  );
  const cancel = () => scroll.finish();
  window.addEventListener("resize", cancel, { once: true });
  try {
    await scroll.finished.catch(() => {});
  } finally {
    window.removeEventListener("resize", cancel);
    host.replaceChildren();
    host.classList.remove("is-running");
  }
}
