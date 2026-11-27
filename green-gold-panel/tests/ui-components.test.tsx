import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Button,
  DataTable,
  EmptyState,
  Field,
  Meter,
  Notice,
  PageHeader,
  Stat,
  StatusPill,
  Stepper,
  TextInput,
  TONES,
} from '../app/components/ui';

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe('Button', () => {
  it('varsayılan type="button" (formu yanlışlıkla göndermez)', () => {
    expect(html(<Button>Kaydet</Button>)).toContain('type="button"');
  });
  it('yüklenirken pasif ve aria-busy; yükleniyor metni gösterilir', () => {
    const out = html(
      <Button loading loadingLabel="Gönderiliyor…">
        Gönder
      </Button>,
    );
    expect(out).toContain('disabled');
    expect(out).toContain('aria-busy="true"');
    expect(out).toContain('Gönderiliyor…');
    expect(out).not.toContain('>Gönder<');
  });
});

describe('Field', () => {
  it('etiket, açıklama ve hata denetime aria ile bağlanır', () => {
    const out = html(
      <Field id="rooms" label="Oda sayısı" hint="Satışa açık odalar" error="Zorunlu" required>
        {(c) => <TextInput {...c} />}
      </Field>,
    );
    expect(out).toContain('for="rooms"');
    expect(out).toContain('id="rooms"');
    expect(out).toContain('aria-describedby="rooms-hint rooms-error"');
    expect(out).toContain('aria-invalid="true"');
    expect(out).toContain('required=""');
    expect(out).toContain('id="rooms-error"');
  });
  it('hata yoksa aria-invalid yazılmaz', () => {
    const out = html(<Field id="x" label="X">{(c) => <TextInput {...c} />}</Field>);
    expect(out).not.toContain('aria-invalid');
    expect(out).not.toContain('aria-describedby');
  });
});

describe('Notice', () => {
  it('uyarı/hata role=alert, diğerleri role=status', () => {
    expect(html(<Notice tone="danger">x</Notice>)).toContain('role="alert"');
    expect(html(<Notice tone="warning">x</Notice>)).toContain('role="alert"');
    for (const tone of ['info', 'success', 'pending', 'neutral'] as const) {
      expect(html(<Notice tone={tone}>x</Notice>)).toContain('role="status"');
    }
  });
});

describe('StatusPill', () => {
  it('her tonda metin görünür (anlam yalnız renkle verilmez)', () => {
    for (const tone of TONES) {
      expect(html(<StatusPill tone={tone}>Onay bekliyor</StatusPill>)).toContain('Onay bekliyor');
    }
  });
});

describe('Stat', () => {
  it('eksik değer 0 değil "—" gösterir ve birimi gizler', () => {
    const out = html(<Stat label="Emisyon" value={null} unit="kg CO₂e" />);
    expect(out).toContain('—');
    expect(out).not.toContain('kg CO₂e');
  });
  it('0 geçerli bir değerdir', () => {
    expect(html(<Stat label="Emisyon" value={0} unit="kg" />)).toContain('>0<');
  });
});

describe('Stepper', () => {
  it('geçerli adım aria-current=step; durum metni ekran okuyucuya yazılır', () => {
    const out = html(
      <Stepper
        steps={[
          { key: 'a', label: 'Doluluk', state: 'done' },
          { key: 'b', label: 'Tüketim', state: 'current', status: 'Eksik' },
          { key: 'c', label: 'Onay', state: 'upcoming' },
        ]}
      />,
    );
    expect(out.match(/aria-current="step"/g)).toHaveLength(1);
    expect(out).toContain('şu anki adım');
    expect(out).toContain('tamamlandı');
    expect(out).toContain('<nav aria-label="İlerleme">');
  });
  it('href verilen adım bağlantı olur', () => {
    const out = html(<Stepper steps={[{ key: 'a', label: 'A', state: 'done', href: '/x' }]} />);
    expect(out).toContain('href="/x"');
  });
});

describe('DataTable', () => {
  const columns = [
    { key: 'name', header: 'Başlık', cell: (r: { name: string; v: number }) => r.name, primary: true },
    { key: 'v', header: 'Miktar', cell: (r: { name: string; v: number }) => r.v, align: 'end' as const },
  ];
  it('başlık (caption), scope ve mobil etiketleri üretir', () => {
    const out = html(
      <DataTable caption="Kalemler" columns={columns} rows={[{ name: 'Elektrik', v: 1000 }]} rowKey={(r) => r.name} />,
    );
    expect(out).toContain('<caption');
    expect(out).toContain('scope="col"');
    expect(out).toContain('data-label="Miktar"');
    expect(out).toContain('data-primary="true"');
  });
  it('boşken açıklayıcı metin gösterir', () => {
    const out = html(<DataTable caption="K" columns={columns} rows={[]} rowKey={(r) => r.name} emptyText="Henüz kayıt yok" />);
    expect(out).toContain('Henüz kayıt yok');
    expect(out).toContain('colSpan="2"');
  });
});

describe('Diğer', () => {
  it('PageHeader tek h1 üretir', () => {
    const out = html(<PageHeader eyebrow="03 / Otel paneli" title="Karbon ölçümü" />);
    expect(out.match(/<h1/g)).toHaveLength(1);
  });
  it('EmptyState başlık seviyesi ayarlanabilir', () => {
    expect(html(<EmptyState title="Boş" headingLevel={3} />)).toContain('<h3');
  });
  it('Meter değeri metin olarak yazar ve aralık dışını sınırlar', () => {
    const out = html(<Meter label="Konaklama payı" value={1.7} valueText="%100" />);
    expect(out).toContain('%100');
    expect(out).toContain('width:100%');
  });
});
