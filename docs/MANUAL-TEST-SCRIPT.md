# VINDERA — Elle Uçtan Uca Test Senaryosu

> Amaç: Alış → teslim → ilan → satış → iade → yeniden satış zincirinin, deftere ve rapora doğru rakamlarla yansıdığını **kendi gözünle** görmek.
> Son hali (Faz 9). Gerçek Keepa/OpenAI/Pushover anahtarlarıyla yapılan **tarama testi** ayrıdır: `docs/LAUNCH-CHECKLIST.tr.md` → "İlk gerçek tarama". Bu senaryo yerelde, sahte/elle girilmiş veriyle çalışır ve gerçek hiçbir servisi çağırmaz.

**Nerede çalıştır:** Yalnızca kendi bilgisayarında, **yerel** Supabase'e karşı. **Canlı veritabanında ÇALIŞTIRMA:** senaryo satış, iade ve gider kayıtları oluşturur.

## 0. Hazırlık (yerel ortam, canlıya dokunmaz)

Bilgisayarındaki `.env` ve `frontend/.env.local` dosyaları büyük ihtimalle **canlı** Supabase'i gösteriyor. Aşağıdaki komutlar bunları yalnızca o komut için **ezer**; dosyalara dokunmaz. Normal `npm run dev` açıksa önce durdur (aynı klasörü paylaşamazlar).

1. Yerel Supabase (Docker açık olmalı). Proje klasöründe:
   ```bash
   supabase start                 # ilk seferde imajları indirir, birkaç dakika sürebilir
   supabase db reset --local      # temiz veritabanı + tüm migration'lar
   supabase status -o env         # ANON_KEY ve SERVICE_ROLE_KEY'i gösterir (yerel demo anahtarları, gizli değil)
   ```
2. Backend (Terminal 1; `<SERVICE_ROLE_KEY>` yerine yukarıdaki yerel değeri koy):
   ```bash
   cd backend
   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY> \
   AUTOMATION_SHARED_SECRET=yerel-test-anahtari ALLOW_MOCK_DATA=true \
   KEEPA_API_KEY= OPENAI_API_KEY= PUSHOVER_USER_KEY= PUSHOVER_API_TOKEN= \
   CORS_ALLOWED_ORIGINS=http://localhost:3100 uv run uvicorn src.main:app --port 8100
   ```
   (Anahtarlar bilerek boş: gerçek Keepa/OpenAI/Pushover çağrılmaz.)
3. Frontend (Terminal 2):
   ```bash
   cd frontend
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY> \
   NEXT_PUBLIC_API_URL=http://localhost:8100 NEXT_PUBLIC_SITE_URL=http://localhost:3100 npm run dev -- -p 3100
   ```
4. Yerel admin hesabı: tarayıcıda yerel Studio'yu aç (`http://127.0.0.1:54323`) → **Authentication → Users → Add user → Create new user** (ör. `admin@example.test`, bir şifre, **Auto Confirm** işaretli). Sonra Studio → **SQL Editor**:
   ```sql
   insert into public.admin_users (user_id, email) select id, email from auth.users where email = 'admin@example.test';
   ```
5. `http://localhost:3100/admin/login` → giriş yap. **Doğrula:** panel hatasız açılır (listeler boş olabilir).
6. Bitince: iki terminalde Ctrl+C, sonra `supabase stop`.

**Hesaplar hangi ayarla yapıldı:** `business_settings` yer tutucu değerleri (`db reset` sonrası yerel veritabanında bunlar vardır; canlı değerler için `docs/MANUEL-ADIMLAR.md` Adım 8): gönderim 6,90 · ambalaj 1,50 · gelen kargo 0 · komisyon %0 · iade payı %3 · min. net marj %25 · min. net kâr 15 €. Gerçek değerleri girdiysen aşağıdaki rakamlar farklı çıkar; o zaman "Beklenen" sütununu kendi ayarlarınla yeniden hesapla (formül: `TECH-DOKUMENTATION.md` bölüm 6.4 ve `backend/src/services/profit_calculator.py` başlığında).

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

`POST /api/v1/deals/dead-stock/scan` (n8n workflow'unun ikinci düğümü): 60 günden uzun bekleyen ve iade süresi ≤ 5 gün kalan ürünler için **birer** Pushover özeti gönderir; aynı ürün için tekrar göndermez.

| # | Yap | Beklenen |
|---|---|---|
| 8.1 | Bir ürünün (satılmamış, `listed`) `return_by` alanını yerel Studio → Table Editor'dan bugün + 3 gün yap. Terminalde: `curl -X POST http://localhost:8100/api/v1/deals/dead-stock/scan -H "X-Vindera-Key: yerel-test-anahtari"` | Yanıt `202`. |
| 8.2 | Backend terminaline bak | Yerelde Pushover anahtarı **boş** olduğundan telefona bildirim **gitmez**; log'da "push not delivered" uyarısı görülür ve ürün "bildirildi" diye işaretlenmez (canlıda anahtarla bildirim gelir ve ürün bir kez işaretlenir). Bildirimin kendisini görmek için Adım 15'teki canlı testi kullan. |
| 8.3 | Aynı çağrıyı `X-Vindera-Key` **olmadan** yap | `401`. |

## 9. Vitrin ve fatura (2.4'te ürün `listed` iken yapmak en kolayı)

| # | Yap | Beklenen |
|---|---|---|
| 9.1 | Gizli pencerede `http://localhost:3100` aç | `listed`/`in_inventory` ürün vitrinde görünür. `pending`, karantinadaki, satılmış ve kaldırılmış ürünler **görünmez**. |
| 9.2 | Ürün kartına tıkla | Ürün sayfası açılır; Willhaben URL'si yoksa "Bald verfügbar" düğmesi kapalı ve açıklama var. Satılmış/karantinadaki ürünün adresi "bulunamadı" sayfası verir. |
| 9.3 | `http://localhost:3100/robots.txt` ve `/sitemap.xml` | "Sitemap:" satırı `http://localhost:3100` gösterir (canlıda gerçek alan adı olmalı); yalnızca satılabilir ürünler listede. |
| 9.4 | Admin → ürün kartı → **fatura yükle**: bir PDF | Yüklenir; **View Invoice** yeni sekmede açar. Geçersiz tür (ör. .exe) ya da 10 MB'tan büyük dosya okunur bir hata mesajıyla reddedilir. |
| 9.5 | Açılan fatura adresini gizli pencerede aç | Açılmamalı (özel klasör, 10 dakikalık geçici link). |

## 10. Tarama (sahte veriyle, yerelde)

| # | Yap | Beklenen |
|---|---|---|
| 10.1 | Admin → AI Terminal → `/scan B0TEST0002` | Terminal "scan started" benzeri bir yanıt verir; **Scans** düğmesinde satır belirir. |
| 10.2 | Birkaç saniye sonra Scans listesi | Durum `succeeded` ya da `rejected` (`ALLOW_MOCK_DATA=true` olduğundan sahte veri kullanılır). Kart `[MOCK]` ile başlar; BuyBox satıcısı `MOCK`. |
| 10.3 | Aynı komutu tekrar çalıştır | Yeni kart eklenmez, mevcut açık kayıt yenilenir. |
| 10.4 | Backend'i `ALLOW_MOCK_DATA` olmadan (ve anahtarsız) başlatıp tekrar tara | Tarama **`failed`** olur (nedeni Scans listesinde okunur), **hiçbir kart oluşmaz**. Bu doğru davranıştır: sahte fırsat üretilmez. |

Gerçek Keepa/OpenAI/Pushover ile tarama: `docs/LAUNCH-CHECKLIST.tr.md` → "İlk gerçek tarama".

---

**Bir yerde beklenenden farklı rakam çıkarsa:** ekran görüntüsünü ve hangi adım olduğunu bana yapıştır; ilk şüphelim `business_settings` değerleri olur (Adım 8).
