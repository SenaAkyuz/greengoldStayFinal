/**
 * Panelin ekran haritası (önizleme). Her öğe BUGÜN var olan bir ekrana ya da
 * onaylanmış plandaki karbon ölçümü ekranlarına karşılık gelir; yeni işlev
 * uydurulmaz. `preview: false` olanlar henüz yeni tasarıma geçirilmedi.
 */
export interface Screen {
  key: string;
  label: string;
  /** Gerçek paneldeki adres. */
  route: string;
  preview: boolean;
  /** Ekranın bugünkü işlevleri (yer tutucu sayfada gösterilir). */
  purpose: string;
  group: 'main' | 'carbon' | 'guest' | 'phase2' | 'admin';
  soon?: boolean;
}

export const BASE = '/onizleme/panel';

export const SCREENS: Screen[] = [
  { key: 'genel', label: 'Genel bakış', route: '/', preview: true, group: 'main', purpose: 'Widget görüntülenme, katkı seçimi, dönüşüm ve tahmini CO₂ etkisi; rezervasyon katkıları ve entegrasyon özeti.' },
  { key: 'karbon-olcumu', label: 'Karbon ölçümü', route: '/olcum', preview: true, group: 'carbon', purpose: 'Tesis tüketim verileri, ölçüm ortağı onayı, dönem hesabı ve yayın (onaylanan ConnectHub planı).' },
  { key: 'karbon-etkisi', label: 'Karbon etkisi', route: '/karbon', preview: false, group: 'carbon', purpose: 'Misafirlerin widget üzerinden seçtiği katkılara dayalı tahmini CO₂ etkisi, ağaç-yılı eşdeğeri ve oda-gece katsayısı.' },
  { key: 'misafir-onizleme', label: 'Misafir önizleme', route: '/misafir-onizleme', preview: false, group: 'guest', purpose: 'Misafirin rezervasyon sırasında gördüğü widget’ın canlı önizlemesi.' },
  { key: 'donusum', label: 'Dönüşüm', route: '/funnel', preview: false, group: 'guest', purpose: 'Görüntülenme → seçim → katkı butonu hunisi ve oranları.' },
  { key: 'raporlar', label: 'Raporlar', route: '/raporlar', preview: false, group: 'guest', purpose: 'Dönem raporu ve dışa aktarma.' },
  { key: 'rezervasyonlar', label: 'Rezervasyonlar', route: '/rezervasyonlar', preview: false, group: 'phase2', soon: true, purpose: 'Rezervasyon sisteminden gelen rezervasyonlar ve katkı durumları (Faz 2).' },
  { key: 'tahsilatlar', label: 'Tahsilatlar', route: '/tahsilatlar', preview: false, group: 'phase2', soon: true, purpose: 'Tahsil edilen, iade edilen ve bekleyen katkı tutarları (Faz 2).' },
  { key: 'sertifikalar', label: 'Sertifikalar', route: '/sertifikalar', preview: false, group: 'phase2', soon: true, purpose: 'Dönem belgeleri (Faz 2).' },
  { key: 'tesis-profili', label: 'Tesis profili', route: '/olcum/profil', preview: true, group: 'admin', purpose: 'Ülke, oda sayısı ve alanlar (karbon ölçümü hesabının girdileri).' },
  { key: 'entegrasyon', label: 'Entegrasyon', route: '/entegrasyon', preview: false, group: 'admin', purpose: 'Widget yerleştirme kodu, izinli alan adları ve rezervasyon entegrasyonu sağlığı.' },
  { key: 'ayarlar', label: 'Ayarlar', route: '/ayarlar', preview: true, group: 'admin', purpose: 'Otel bilgileri, marka, katkı tutarı ve karbon hesap yöntemi (eski 3pmetrics/CCA akışı dahil).' },
];

export function previewHref(s: Screen): string {
  return s.key === 'genel' ? BASE : `${BASE}/${s.key}`;
}
