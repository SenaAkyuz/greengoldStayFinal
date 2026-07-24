/**
 * Shadow DOM içine enjekte edilen CSS. Host sayfa stillerinden tamamen izole.
 * `:host` reset'i ile dışarıdan miras alınan (inherited) stilleri de nötrler.
 */
export const STYLES = `
:host {
  all: initial;
  display: block;
  contain: content;
  /* Marka aksan rengi — otel brand_color'ı (doğrulanmış hex) kartta override eder. */
  --gg-accent: #075442;
  font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.45;
  color: #1f2933;
}
*, *::before, *::after { box-sizing: border-box; }

.card {
  width: 100%;
  min-width: min(100%, 320px);
  max-width: 680px;
  background: #f4f8f4;
  border: 1px solid color-mix(in srgb, var(--gg-accent) 64%, #dce5de);
  border-radius: 12px;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--gg-accent) 8%, transparent), 0 10px 30px rgba(14, 59, 47, 0.07);
  padding: 16px;
  color: #17372d;
  font-size: 14px;
}

.card.preview { position: relative; }
.preview-badge {
  position: absolute; top: 12px; right: 12px;
  font-size: 10px; font-weight: 700; letter-spacing: .03em;
  text-transform: uppercase;
  color: #22604f; background: #e7f1e9; border: 1px solid #cfe1d3;
  padding: 2px 8px; border-radius: 999px;
  white-space: nowrap;
}

.header { display: flex; align-items: center; gap: 11px; margin-bottom: 4px; padding-right: 72px; }
.leaf {
  flex: 0 0 auto;
  width: 38px; height: 38px;
  display: grid; place-items: center;
  background: var(--gg-accent);
  border-radius: 999px;
  color: var(--gg-accent);
  overflow: hidden;
}
.leaf svg { width: 19px; height: 19px; display: block; color: #d7ef64; }
.logo { width: 100%; height: 100%; object-fit: contain; display: block; }

.heading { font-family: Georgia, "Times New Roman", serif; font-size: 18px; font-weight: 500; margin: 0; color: #102b22; }
.subheading { margin: 0 0 14px 49px; font-size: 11.5px; color: #65776f; }

.row {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 13px; border-radius: 10px;
  border: 1px solid #d9e4dc; background: #ffffff;
  cursor: pointer;
  transition: border-color .15s ease, background .15s ease;
}
.row:hover { border-color: color-mix(in srgb, var(--gg-accent) 55%, #d9e4dc); background: #fbfdfb; }
.row input[type=checkbox] {
  flex: 0 0 auto;
  width: 18px; height: 18px; margin-top: 1px;
  accent-color: var(--gg-accent);
  cursor: pointer;
}
.row-body { flex: 1 1 auto; }
.row-label { font-weight: 700; font-size: 13px; color: #17372d; }
.row-sub { font-size: 11.5px; color: #6d7c75; margin-top: 3px; }

.details { margin-top: 12px; display: grid; gap: 8px; padding: 12px 13px; border-radius: 10px; background: rgba(255,255,255,.7); border: 1px solid #dce6df; }
.line { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.line-label { font-size: 12.5px; color: #556070; }
.line-value { font-size: 13.5px; font-weight: 650; color: #10231b; }
.co2-value { display: inline-flex; align-items: center; gap: 6px; }

.badge {
  display: inline-block;
  font-size: 10.5px; font-weight: 700; letter-spacing: .02em;
  text-transform: uppercase;
  color: #8a5a00; background: #fdf3d8; border: 1px solid #f4e2ad;
  padding: 2px 7px; border-radius: 999px;
  white-space: nowrap;
}
.co2-note { font-size: 11px; color: #8a94a3; margin: 2px 0 0; }

.impact {
  margin: 12px 0 0;
  padding-top: 10px;
  border-top: 1px solid #eef1f5;
  font-size: 11.5px; color: #556070;
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
}

.btn {
  margin-top: 14px; width: 100%;
  font-size: 14px; font-weight: 650; font-family: inherit;
  color: #ffffff; background: var(--gg-accent);
  border: 0; border-radius: 8px;
  padding: 11px 14px; cursor: pointer;
  transition: background .15s ease, opacity .15s ease;
}
.btn:hover:not(:disabled) { filter: brightness(0.92); }
.btn:focus-visible { outline: 3px solid #a7d8c4; outline-offset: 2px; }
.btn:disabled { background: #cbd5df; color: #eef2f6; cursor: not-allowed; }

.row input:focus-visible { outline: 3px solid #a7d8c4; outline-offset: 2px; }

.confirm {
  margin-top: 14px;
  display: flex; align-items: flex-start; gap: 10px;
  padding: 12px; border-radius: 10px;
  background: #e5f2e8; border: 1px solid #bed9c5;
  color: #10231b; font-size: 13px;
}
.confirm svg { flex: 0 0 auto; width: 18px; height: 18px; color: var(--gg-accent); margin-top: 1px; }

@media (prefers-reduced-motion: reduce) {
  .row, .btn { transition: none; }
}

@media (max-width: 460px) {
  .card { padding: 14px; }
  .subheading { margin-left: 0; }
  .header { padding-right: 64px; }
}
`;
