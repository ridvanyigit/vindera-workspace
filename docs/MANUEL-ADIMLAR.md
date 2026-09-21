# VINDERA — Senin Yapman Gereken Adımlar

> Bu dosya, yazılımın kendi başına yapamayacağı işleri toplar (paneller, hesaplar, para, yasal/vergi konuları).
> Şu an **Faz 0–3 sonrası hali**. Faz 9'da tam, adım adım, tıklama düzeyinde bir rehbere dönüşecek.
> Her madde: **Öncelik** · **Ne yapılacak** · **Nasıl doğrularsın**.

Öncelik etiketleri:
**Launch-blocker** = canlıya çıkmadan önce şart · **Soon** = ilk haftalar · **Later** = sonra.

---

## Launch-blocker

### M1. Önce yedek al, sonra veritabanı değişikliklerini (migration) uygula

**Neden:** Faz 2'de 12 yeni migration yazıldı (`supabase/migrations/20260921…`). Bunlar canlı veritabanını değiştirir (kısıtlar, yeni tablolar, eski çift kayıtların temizlenmesi). Ben (Claude) bunları senin onayın olmadan uzak veritabanına **uygulamadım ve uygulamayacağım**.

**Ne zaman:** En erken, yeni backend ve yeni frontend'i canlıya aldığın gün. Migration'ları tek başına şimdi uygularsan **şu anki (main) uygulama** şu noktalarda bozulur:
- Tarama, aynı ürün için ikinci kayıt eklemeye çalışınca hata verir (artık üründe tek açık kayıt olabilir).
- Faturaların eski herkese açık linkleri çalışmaz (`invoices` klasörü private oluyor).
- Ürün silme (chatbot `/delete`, silme düğmesi) satılmış ürünlerde engellenir.

**Adımlar (Terminal, proje klasöründe):**

1. Yedek klasörü oluştur (proje klasörünün DIŞINDA, gizli veri içerir):
   ```bash
   mkdir -p ~/Documents/vindera-yedek
   ```
2. Şema + veri yedeği al (Docker açık olmalı; veritabanı şifreni sorar — Supabase Dashboard → Project Settings → Database'den sıfırlayabilirsin):
   ```bash
   cd ~/Desktop/vindera-workspace
   supabase db dump --linked -f ~/Documents/vindera-yedek/sema-$(date +%Y%m%d).sql
   supabase db dump --linked --data-only -f ~/Documents/vindera-yedek/veri-$(date +%Y%m%d).sql
   ```
3. Fatura dosyaları yedeğe **dahil değil**. Dashboard → Storage → `invoices` klasöründeki dosyaları indir (varsa).
4. Ücretli planda ayrıca Dashboard → Database → Backups bölümünden bir yedek olduğunu gör. Ücretsiz planda indirilebilir otomatik yedek yoktur; bu yüzden 2. adım şart.
5. Hangi migration'ların bekleyeceğine bak (Local dolu, Remote boş olan 12 satır olmalı):
   ```bash
   supabase migration list --linked
   ```
6. Önce sadece göster, hiçbir şey değiştirme:
   ```bash
   supabase db push --linked --dry-run
   ```
7. Sorun yoksa uygula (onay sorusuna `Y`):
   ```bash
   supabase db push --linked
   ```
8. Kontrol: `supabase migration list --linked` şimdi tüm satırlarda Remote da dolu olmalı. Dashboard → SQL Editor'de şunları çalıştır:
   ```sql
   select count(*) from public.sale_events;                        -- satılmış ürün sayın kadar
   select * from public.business_settings;                         -- 1 satır
   select id, public from storage.buckets where id = 'invoices';   -- public = false
   select status, count(*) from public.opportunities group by status;
   select count(*) from public.opportunities where deleted_at is not null;  -- eski çift taramalar (gizlendi, silinmedi)
   ```

**Bir şey ters giderse:** Migration'lar tek tek transaction içinde çalışır; hata verirse o migration'ın değişiklikleri geri alınır ve hata mesajı sebebi söyler (örneğin bilinmeyen bir `status` değeri). Mesajı bana yapıştır. Yedeği geri yükleme adımları Faz 9'da (`Rollback` bölümü) yazılacak.

### M2. Herkese açık kayıt (signup) kapatılmalı

Supabase Dashboard → **Authentication** → **Sign In / Providers** (veya "Providers → Email") → "Allow new users to sign up" / "Enable sign ups" kapat → Save.
**Doğrulama:** Gizli pencerede uygulamanın giriş sayfasından yeni bir e-postayla kayıt olmayı dene: reddedilmeli. Admin olmak için zaten `admin_users` tablosunda olman gerekiyor, ama kayıt hiç açık olmamalı.

### M3. Yeni gizli anahtarlar üret ve `.env` dosyasına koy

Terminalde iki ayrı kez çalıştır ve çıktıları kopyala:
```bash
openssl rand -hex 32
```
- Birincisi → `.env` içinde `AUTOMATION_SHARED_SECRET="…"`
- İkincisi → `.env` içinde `METRICS_TOKEN="…"`

Production'da bu ikisi 32+ karakter değilse backend **başlamaz** (bilerek). Bu değerleri kimseyle paylaşma, sohbete yapıştırma.
**Doğrulama:** `backend/scripts/smoke_auth.sh` çalıştır (aşağıda M12).

### M4. n8n'de "Vindera Automation Key" kimlik bilgisi oluştur

Workflow dosyası (`n8n/Vindera_Daily_Scan.json`) artık gizli anahtar içermiyor.
1. n8n'i aç (http://localhost:5678) → sol menü **Credentials** → **Add credential** → **Header Auth**.
2. **Name:** `Vindera Automation Key` · **Header Name:** `X-Vindera-Key` · **Header Value:** M3'teki `AUTOMATION_SHARED_SECRET` değeri → Save.
3. Workflow'u yeniden içe aktar (Workflows → Import from file → `Vindera_Daily_Scan.json`), "Trigger FastAPI Deal Scan" ve "Trigger Dead Stock Check" düğümlerinde credential olarak bunu seç.
4. Backend adresini değiştirmek istersen `VINDERA_API_BASE_URL` ortam değişkenini kullan (varsayılan `http://host.docker.internal:8000`).

**Doğrulama:** Workflow'da **Execute workflow** → iki HTTP düğümü yeşil (202) dönmeli. Anahtarı yanlış girersen 401 alırsın.

### M5. `business_settings` sayılarını gerçek değerlerle doldur

Faz 2'de kâr hesabının kullanacağı ayarlar tablosu oluşturuldu, **ama içindeki sayılar yer tutucudur (varsayım)**. Gerçek kâr rakamları bunlara bağlı olacak.

Dashboard → **Table Editor** → `business_settings` → tek satıra tıkla → değerleri düzenle → Save.

| Alan | Şimdiki yer tutucu | Ne yazmalısın / nereden bulursun |
|---|---|---|
| `outbound_shipping_eur` | 6,90 | Ortalama bir paketin Österreichische Post ile gönderim ücreti (post.at → Paket fiyatları) |
| `packaging_eur` | 1,50 | Bir paket için ambalaj malzemesi maliyeti |
| `inbound_shipping_eur` | 0 | Amazon'dan sana gelen kargo ücreti (ücretsizse 0) |
| `platform_fee_pct`, `platform_fee_fixed_eur` | 0 / 0 | Willhaben'in satış başına aldığı komisyon (hesap türüne göre; Willhaben ücret tablosuna bak) |
| `payment_fee_pct` | 0 | Ödeme sağlayıcı komisyonu (ör. Willhaben "Sicher bezahlen"/PayPal) |
| `return_reserve_pct` | 3 | İade için ayırdığın pay (%) — kendi deneyimine göre |
| `min_net_margin_pct`, `min_net_profit_eur` | 25 / 15 | "Almama" kuralı: net marj ve net kâr alt sınırı |
| `vat_threshold_eur`, `vat_warn_pct` | 55000 / 80 | Kleinunternehmer sınırı — **Steuerberater'inle doğrula** (tolerans kuralları var) |
| `return_window_days` | 30 | Amazon.de iade süresi (kategoriye göre değişebilir, kontrol et) |
| `listing_legal_footer` | boş | Avukat onayından sonra ilana eklenecek yasal metin (ben yazmıyorum) |

**Doğrulama:** Tablodaki `updated_at` alanı değiştirdiğin an güncellenir.

### M6. Monitoring için token dosyası (Prometheus)

`infrastructure/monitoring/secrets/metrics_token.example` dosyasını aynı klasörde `metrics_token` adıyla kopyala; içine `.env`'deki `METRICS_TOKEN` değerini tek satır olarak yaz. (Bu dosya git'e girmez.) Yoksa Prometheus başlamaz.

### M7. Storage politikalarını kontrol et (faturalar)

Migration `invoices` klasörünü private yapar ve onu anlatan eski politikaları siler. **Hiç koşulu olmayan** ya da başka klasörler için yazılmış geniş bir politika varsa onu otomatik bulamam.
Dashboard → **Storage** → **Policies** → `storage.objects` altındaki her politikayı oku; herkese (`public`/`anon`) okuma izni veren varsa sil.
**Doğrulama:** Gizli pencerede eski bir fatura linkini aç: artık açılmamalı.

---

## Soon

### M8. Eski fatura dosyalarını yeniden yükle
`opportunities.invoice_url` alanındaki eski herkese açık linkler çalışmayacak. Dosyaları Storage'dan indirip uygulamadaki fatura yükleme düğmesiyle yeniden yükle; sonra eski `invoice_url` alanını temizle. (Uygulama tarafı Faz 5'te güncellenecek.)

### M9. Admin hesabına MFA (2 adımlı doğrulama) ekle
Dashboard → Authentication → Multi-Factor'ı aç, sonra kendi hesabın için bir doğrulama uygulaması (TOTP) tanımla.

### M10. Yerelde sahte veri kullanmak istersen
Keepa/OpenAI anahtarı yokken ya da hata verince tarama artık sahte fırsat üretmiyor, iptal oluyor. Yerelde eskisi gibi örnek veriyle denemek istersen `.env`'ye `ALLOW_MOCK_DATA=true` ekle. Production'da bu ayar reddedilir.

### M11. İzlenen ürün listesini (watchlist) düzenle
Günlük taranan ASIN'ler artık n8n içinde değil, veritabanında (`watchlist_asins`). n8n her sabah `GET /deals/watchlist` ile aktif olanları alır.
Dashboard → Table Editor → `watchlist_asins`. Bir ürünü durdurmak için `active` alanını kapat; yeni ürün için satır ekle (ASIN 10 karakter, BÜYÜK harf/rakam).
**Önemli:** `n8n/Vindera_Daily_Scan.json` Faz 3'te değişti (sabit liste yerine "Fetch Watchlist" + "Split Watchlist" düğümleri). n8n'de eski workflow'u silip yeniden içe aktar (M4'teki gibi) ve iki HTTP düğümünde "Vindera Automation Key" credential'ını seç.
**Doğrulama:** Execute workflow → "Fetch Watchlist" çıktısında `asins` listesi görünmeli; sonra admin panelinde AI Terminal → **Scans** düğmesinde her ASIN için bir satır çıkar.

### M15. Keepa ve OpenAI anahtarları, tarama başarısızlıkları
Faz 3'ten beri sahte veri yok: anahtar yoksa ya da Keepa/OpenAI hata verirse tarama **başarısız (failed)** olur ve nedeni admin panelinde AI Terminal → **Scans** listesinde görünür. Gerçek BuyBox/talep verisi için ücretli bir Keepa planı gerekir; her tarama Keepa token'ı harcar (BuyBox verisi ek token maliyetlidir, Keepa panelinden tüketimi izle). Token biterse aynı gün içinde **tek** bir Pushover bildirimi gelir.
- Anahtarlar `.env` içinde: `KEEPA_API_KEY`, `OPENAI_API_KEY` (asla sohbete yapıştırma).
- OpenAI'da aylık harcama limiti koy (platform.openai.com → Billing → Limits).
- Kâr hesabı `business_settings` sayılarına bağlı (M5). Sayılar yer tutucuyken "kâr" rakamları gerçek değildir.

---

## Later

### M12. Otomatik kimlik doğrulama kontrolü
```bash
BASE_URL=http://localhost:8000 AUTOMATION_KEY=<AUTOMATION_SHARED_SECRET> METRICS_TOKEN=<METRICS_TOKEN> backend/scripts/smoke_auth.sh
```
Yeşil "All checks passed" görmelisin. Admin olarak da denemek için `ADMIN_TOKEN=<giriş yapmış admin'in access token'ı>` ekle.

### M13. Eski (sahte) fiyat geçmişi
Eski taramalar her seferinde 6 tane **uydurma** fiyat noktası yazmıştı (5 gün önce = ortalama fiyat, bugün = güncel fiyat). Yeni backend bunu yapmıyor; her taramada Keepa'dan gelen **gerçek** 90 günlük geçmişi yazıyor. Ama eski uydurma noktalar veritabanında duruyor ve grafik onları gerçek gibi gösterir. Hangisinin uydurma olduğunu kesin ayırt edemem (elle girilen ürünlerin 2 dürüst noktası da aynı tabloda), o yüzden **karar senin**:
- **Seçenek A (önerilen, temiz):** Yeni backend canlıya alındıktan sonra SQL Editor'de `delete from public.price_history;` çalıştır, sonra watchlist'i bir kez tara (gerçek noktalar geri gelir). Elle girdiğin ürünlerin iki referans fiyatı silinir; düzenleme formundan yeniden girebilirsin.
- **Seçenek B:** Hiçbir şey yapma; eski ürünlerde grafik bir süre uydurma noktalar içerir, yeni taramalar gerçek noktaları ekler.
Not: Bu adım **geri alınamaz**; A'yı seçersen önce M1'deki yedeği al.

### M14. `events_calendar` kontrolü
Migration, mevsimsel etkinlik satırlarını (Halloween, Black Friday …) canlı veritabanına da ekler. Table Editor → `events_calendar` içinde 7 satır görmelisin.

---

## Faz 9'da doldurulacak başlıklar

Anahtar rotasyonu (Supabase service-role, OpenAI, Keepa, Pushover), Supabase panel ayarları (Site URL, redirect URL, plan/PITR, bölge), hesaplar ve hosting (VPS, alan adı, Vercel, Sentry, UptimeRobot, Pushover, Keepa planı, OpenAI aylık limit), ilk admin kullanıcısı (SQL), yasal/vergi maddeleri (Gewerbeanmeldung, Steuerberater ve avukat için **sorular**), canlıya çıkış kontrol listesi, ilk hafta rutini, geri alma (rollback).
