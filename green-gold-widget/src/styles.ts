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
  --gg-accent: #1a7f5a;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.45;
  color: #1f2933;
}
*, *::before, *::after { box-sizing: border-box; }

.card {
  max-width: 360px;
  background: #ffffff;
  border: 1px solid #e3e8ee;
  border-radius: 14px;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04), 0 4px 14px rgba(16, 24, 40, 0.06);
  padding: 18px 18px 16px;
  color: #1f2933;
  font-size: 14px;
}

.card.preview { position: relative; }
.preview-badge {
  position: absolute; top: 10px; right: 10px;
  font-size: 10px; font-weight: 700; letter-spacing: .03em;
  text-transform: uppercase;
  color: #3d4b5c; background: #eef1f5; border: 1px solid #dbe1e8;
  padding: 2px 8px; border-radius: 999px;
  white-space: nowrap;
}

.header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.leaf {
  flex: 0 0 auto;
  width: 32px; height: 32px;
  display: grid; place-items: center;
  background: #e7f4ee;
  border-radius: 9px;
  color: var(--gg-accent);
  overflow: hidden;
}
.leaf svg { width: 18px; height: 18px; display: block; }
.logo { width: 100%; height: 100%; object-fit: contain; display: block; }

.heading { font-size: 15px; font-weight: 650; margin: 0; color: #10231b; }
.subheading { margin: 0 0 14px; font-size: 12.5px; color: #556070; }

.row {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 10px; border-radius: 10px;
  border: 1px solid #eef1f5; background: #fbfcfd;
  cursor: pointer;
  transition: border-color .15s ease, background .15s ease;
}
.row:hover { border-color: #cfe6db; background: #f7fbf9; }
.row input[type=checkbox] {
  flex: 0 0 auto;
  width: 18px; height: 18px; margin-top: 1px;
  accent-color: var(--gg-accent);
  cursor: pointer;
}
.row-body { flex: 1 1 auto; }
.row-label { font-weight: 600; font-size: 13.5px; color: #1f2933; }
.row-sub { font-size: 12px; color: #6b7684; margin-top: 2px; }

.details { margin-top: 12px; display: grid; gap: 8px; }
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
  border: 0; border-radius: 10px;
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
  background: #e7f4ee; border: 1px solid #bfe3d1;
  color: #10231b; font-size: 13px;
}
.confirm svg { flex: 0 0 auto; width: 18px; height: 18px; color: var(--gg-accent); margin-top: 1px; }

@media (prefers-reduced-motion: reduce) {
  .row, .btn { transition: none; }
}
`;
