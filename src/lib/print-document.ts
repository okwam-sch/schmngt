/** Print only a rendered document, in a same-origin frame, after its assets load. */
export function printDocument(element: HTMLElement, title: string) {
  const frame = document.createElement("iframe");
  frame.className = "offer-print-frame";
  frame.title = title;
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) { frame.remove(); return; }
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map((el) => el.outerHTML).join("");
  frame.onload = () => { void (async () => {
    await doc.fonts.ready;
    await Promise.all(Array.from(doc.images).map((image) => image.complete ? Promise.resolve() : new Promise<void>((resolve) => { image.onload = () => resolve(); image.onerror = () => resolve(); })));
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 60_000);
  })(); };
  doc.open();
  doc.write(`<!doctype html><html><head>${styles}</head><body>${element.outerHTML}</body></html>`);
  doc.title = title;
  doc.close();
}