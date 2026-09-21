import { useEffect, useMemo } from "react";
import { useStore } from "zustand";
import { useInfrastructure } from "../../data/infrastructureContext";
import { createPresentation } from "../../presentation/presentation";

export function PresentationControls() {
  const { store, assets, rack, catalog } = useInfrastructure();
  const tour = useMemo(() => createPresentation(store, assets, rack.id), [store, assets, rack.id]);
  const p = useStore(tour.state);
  const active = ["loading", "playing", "paused"].includes(p.status);
  useEffect(() => {
    const timer = window.setInterval(() => tour.tick(performance.now()), 50);
    let pointerStart: { x: number; y: number } | undefined;
    const manual = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element) || target.closest("[data-presentation-controls]")) return;
      if (target.closest("canvas") || event.type === "wheel") {
        if (event.type === "pointerdown" && event instanceof MouseEvent) pointerStart = { x: event.clientX, y: event.clientY };
        tour.pause("Paused for manual inspection", true);
      }
      else if (target.closest("button, input, select, textarea, summary, a")) tour.stop(false);
    };
    const sceneClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest("canvas")) return;
      // Match AssetSelection/ComponentInteraction's rounded four-pixel drag threshold.
      if (!pointerStart || Math.round(Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y)) <= 4) tour.stop(false);
      pointerStart = undefined;
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable=true]")) return;
      if (event.key === "Escape") tour.stop();
      else if (["Enter", " "].includes(event.key)) manual(event);
    };
    const visibility = () => { if (document.hidden) tour.pause("Paused while tab is hidden"); };
    document.addEventListener("pointerdown", manual, true);
    document.addEventListener("click", sceneClick, true);
    document.addEventListener("wheel", manual, { capture: true, passive: true });
    document.addEventListener("keydown", keyboard, true);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("pointerdown", manual, true);
      document.removeEventListener("click", sceneClick, true);
      document.removeEventListener("wheel", manual, true);
      document.removeEventListener("keydown", keyboard, true);
      document.removeEventListener("visibilitychange", visibility);
      tour.dispose();
    };
  }, [tour]);
  const step = active || p.status === "complete" ? p.steps[p.index] : undefined;
  const title = step ? catalog.get(step.componentId ?? step.assetId)?.name : "Guided infrastructure tour";
  return (
    <div className="presentation-controls" data-presentation-controls role="region" aria-label="Presentation">
      <div className="presentation-buttons">
        <select aria-label="Presentation mode" value={p.mode} disabled={active} onChange={event => tour.mode(event.target.value as "executive" | "detailed")}>
          <option value="executive">Executive</option><option value="detailed">Detailed</option>
        </select>
        {!active ? <button onClick={() => tour.play()}>▶ Play presentation</button>
          : p.status === "paused" ? <button onClick={() => tour.resume()}>▶ Resume</button>
          : <button onClick={() => tour.pause()}>Ⅱ Pause</button>}
        <button disabled={!active} onClick={() => tour.stop()}>■ Stop</button>
        <label>Speed <select aria-label="Presentation speed" value={p.speed} onChange={event => tour.speed(Number(event.target.value))}>
          {[1, 2, 4].map(speed => <option key={speed} value={speed}>{speed}×</option>)}
        </select></label>
        <span aria-label="Presentation progress">{p.steps.length ? `${p.index + 1} / ${p.steps.length}` : ""}</span>
      </div>
      {(active || p.message) && <div className="presentation-step" aria-live="off">
        <strong>{step?.phase ?? "Presentation"} · {step?.componentId ? `${step.assetId} / ` : ""}{title}</strong>
        {step?.summary && <span>{step.summary}</span>}
        <span role="status" aria-live={p.status === "playing" ? "off" : "polite"}>{p.message}{p.status === "complete" ? ` · ${(p.elapsedMs / 1000).toFixed(1)} s active time` : ""}</span>
      </div>}
      {p.notices.length > 0 && <details><summary>{p.notices.length} availability notes</summary>{p.notices.map((notice, i) => <p key={i}>{notice}</p>)}</details>}
    </div>
  );
}
