# VINDERA — Elle Uçtan Uca Test Senaryosu

> Amaç: Alış → teslim → ilan → satış → iade → yeniden satış zincirinin, deftere ve rapora doğru rakamlarla yansıdığını **kendi gözünle** görmek.
> Faz 4 sonrası hali. Faz 9'da son haline gelecek (ör. tarama adımı gerçek Keepa/OpenAI anahtarlarıyla eklenecek).

**Nerede çalıştır:** Yerel ortamda (canlı veritabanında değil). Backend + frontend açık, `admin@…` ile giriş yapılmış olmalı. Yerel veritabanı boşsa `supabase db reset --local` ile temiz başla.

**Hesaplar hangi ayarla yapıldı:** `business_settings` yer tutucu değerleri (M5): gönderim 6,90 · ambalaj 1,50 · gelen kargo 0 · komisyon %0 · iade payı %3 · min. net marj %25 · min. net kâr 15 €. Gerçek değerleri girdiysen aşağıdaki rakamlar farklı çıkar; o zaman "Beklenen" sütununu kendi ayarlarınla yeniden hesapla (formül: `docs`'ta değil, kodda: `backend/src/services/profit_calculator.py` başlığında).

Aşağıda kullanılan ürün: ASIN `B0TEST0001`, planlanan alış 20 €, hedef satış 60 €.

---

## 1. Fırsatı gir

| # | Yap | Beklenen |
|---|---|---|
| 1.1 | **Manual Entry** → ASIN, başlık, kategori; Buy Price `20`, Target Sell `60`; Status `Pending`; ilan başlığı ve metni doldur → **Save Deal** | Yeşil başarı mesajı, SKU görünür. |
| 1.2 | Aynı formda kaydetmeden önce "Profit" kutusuna bak | **Net Profit +29,80 €**, **Net Margin 138,6 %**, Break-even ≈ 29,28 €, "Passes No-Buy Guardrails". |
| 1.3 | **Workspace** → DEALS sekmesi → yeni kartı seç | Sağ üstte "138,6 % Net Margin · €29.80". |
| 1.4 | Aynı ASIN'i ikinci kez **Pending** olarak kaydetmeyi dene | Kırmızı hata: bu ürünün zaten açık bir kaydı var. Kayıt oluşmaz. |

## 2. Satın al ve teslim al

| # | Yap | Beklenen |
|---|---|---|
| 2.1 | **Mark as Bought** → ödenen `20`, tarih bugün, sipariş no `TEST-1`, gelen kargo `2`, ambalaj `1` → **Confirm purchase** | Kutuda toplam maliyet **23,00 €**, net kâr **28,30 € (123,0 %)**, iade son günü **bugün + 30 gün**. Kaydedilince yeşil bildirim, kart INVENTORY sekmesine geçer. |
| 2.2 | Kartı aç | Fiyat bölümünde Max Buy 20; Emergency, alış sonrası break-even'in (30,82 €) altına düşmemeli (bu senaryoda 51 €). |
| 2.3 | **Receive & Check Quality** → dört kutuyu işaretle → **Approve** | Durum `in_inventory`. |
| 2.4 | **Listed on Willhaben** | Durum `listed`. Willhaben URL alanına `https://www.willhaben.at/iad/test/1` yazıp **Save** de. `https://example.com` yazarsan kırmızı hata almalısın. |
| 2.5 | Kaydı **Manual Entry**'den (Edit) aç | "Purchase Record" bölümünde 20 / bugün / TEST-1 / 2 / 1 dolu. |

## 3. Sat

| # | Yap | Beklenen |
|---|---|---|
| 3.1 | **Item Sold!** → satış `60`, alıcıya kargo `6,90` (hazır gelir), ücret boş | Önizleme **30,10 €**. |
| 3.2 | **Confirm Sale** | Başarı ekranı: maliyet 23,00 €, **net kâr 30,10 € (130,9 %)**. Bu sayıyı sunucu hesapladı. |
| 3.3 | **Done** → SOLD sekmesi | Kart burada; Manual Entry'de bu kart için **Remove düğmesi yok**. |
| 3.4 | Aynı kartı tekrar satmayı dene (sayfayı yenile) | "Item Sold!" düğmesi yok; API ile denersen 409. |

## 4. İade

| # | Yap | Beklenen |
|---|---|---|
| 4.1 | **Returned** → iade kargosu `4,50` → **Confirm return** | Yeşil bildirim. Kart INVENTORY'de, **karantinada** ("REVIEW NEEDED"). Hedef fiyat **hâlâ 60 €** (eski %10 indirim yok). |
| 4.2 | **Resolve** (karantinayı kaldır) → **Listed on Willhaben** | Durum `listed`, `sold_at` boş. |

## 5. Yeniden sat

| # | Yap | Beklenen |
|---|---|---|
| 5.1 | **Item Sold!** → satış `70`, kargo `5`, ücret `1,50` | Önizleme ve sonuç: **net kâr 40,50 €**. |

## 6. Raporu elle hesapla ve karşılaştır

1. **Tax & Reports** → yıl = bu yıl. **Expenses** bölümüne 10 € "Storage" gideri ekle.
2. Elle hesap (yalnızca bu ürün var varsayımıyla):

| Kalem | Hesap | Beklenen |
|---|---|---|
| Revenue | 60 − 60 + 70 | **70,00 €** |
| Maliyet (COGS) | 23 − 23 + 23 (iade maliyeti geri alır) | **23,00 €** |
| Kargo | 6,90 + 4,50 + 5,00 | **16,40 €** |
| Ücretler | 1,50 | **1,50 €** |
| Brüt kâr | 70 − 23 − 16,40 − 1,50 | **29,10 €** |
| Gewinn vor Steuern | 29,10 − 10 | **19,10 €** ("vor Einkommensteuer und SVS" notu görünür) |
| Units sold | 1 satış − 1 iade + 1 satış | **1** |
| Average ROI | 29,10 / 23 | **126,5 %** |
| VAT çubuğu | 70 / 55.000 | **%0,13** (çubuk genişliği; yazı "0.1% used" gösterir; çubuk rengi indigo) |

3. **Cash (E/A) view**'a geç: Income 70,00 · Purchases 23,00 · Other outgoings 27,90 (16,40 + 1,50 + 10) · Cash result **19,10 €**.
4. Yıl seçiciyi bir önceki yıla al: gelir, maliyet ve KDV çubuğu **0** olmalı (artık tüm zamanlar değil, takvim yılı). Seçicide yalnızca verisi olan yıllar çıkar; temiz veritabanında önceki yıl listede yoktur. Denemek için o yıla tarihli bir gider ekle (örn. geçen yıl için 5 € — tarih alanından seç) ve sonra sil.
5. KDV çubuğu renklerini görmek istersen (yerelde): `business_settings.vat_threshold_eur` değerini geçici olarak 80 yap → amber (%87,5); 72 yap → kırmızı (%97,2); sonra 55000'e geri al.
6. **Export CSV** (Decimal comma açık) → Excel'de aç. Beklenen satırlar: Verkauf 60,00 · Rückerstattung −60,00 · Verkauf 70,00 · Versandkosten 6,90 / 4,50 / 5,00 · Plattformgebühren 1,50 · Einkauf 23,00 · Ausgabe 10,00. Türkçe/Almanca karakterler bozuk çıkmamalı.

## 7. Silme ve durum kuralları

| # | Yap | Beklenen |
|---|---|---|
| 7.1 | Yeni bir `Pending` fırsat oluştur, Manual Entry'de **Remove** → onay | Kayıt listelerden ve mağazadan kaybolur (veritabanında `deleted_at` dolar, silinmez). |
| 7.2 | Satılıp iade edilmiş kartı (geçmişi olan) API ile silmeyi dene | 409: "satış kaydı var, muhasebe için saklanır". Onun yerine durumu **Written Off** yap. |
| 7.3 | `Pending` kartta doğrudan "Item Sold!" veya durum atlamayı dene | Düğme görünmez; API ile denersen 409 ve anlaşılır mesaj. |

## 8. Günlük kontrol (n8n veya elle)

`POST /api/v1/deals/dead-stock/scan` (n8n workflow'unun ikinci düğümü): 60 günden uzun bekleyen ve iade süresi ≤ 5 gün kalan ürünler için **birer** Pushover özeti gönderir; aynı ürün için tekrar göndermez. Test için bir ürünün `return_by` alanını Table Editor'dan bugün + 3 gün yap, çağrıyı yap, bildirimin geldiğini gör.

---

**Bir yerde beklenenden farklı rakam çıkarsa:** ekran görüntüsünü ve hangi adım olduğunu bana yapıştır; ilk şüphelim `business_settings` değerleri olur (M5).
