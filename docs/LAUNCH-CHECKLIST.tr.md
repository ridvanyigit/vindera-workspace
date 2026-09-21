# VINDERA — Canlıya Çıkış Kontrol Listesi

> Bu liste `docs/MANUEL-ADIMLAR.md` içindeki adımların **kısa, işaretlenebilir** hâlidir. Nasıl yapılacağı orada, burada "yapıldı mı?" sorusu var.
> Kutuları (☐) `☑` yaparak işaretle. Bir madde neden kırmızıysa `docs/MANUEL-ADIMLAR.md`'de aynı numaralı adıma bak.
> Son güncelleme: 21 Eylül 2026.

İçindekiler: **1.** Canlıya çıkmadan önce · **2.** İlk gerçek tarama · **3.** Çıkış günü sırası · **4.** İlk hafta rutini · **5.** Geri alma ve acil durum

---

## 1. Canlıya çıkmadan önce

### Veri ve veritabanı
- [x] Yedek alındı, 13 migration canlı Supabase'e uygulandı (Adım 1, 21 Eylül 2026)
- [x] Herkese açık kayıt kapalı (Adım 2)
- [ ] Test verisi temizlendi: vitrinde "Test Product for ASIN" yok, 1a/1b/1c sorguları boş (Adım 3)
- [ ] `business_settings` gerçek sayılarla dolu, yer tutucu kalmadı (Adım 8)
- [ ] `admin_users` içinde yalnızca sen varsın; tanımadığın kullanıcı yok (Adım 7)
- [ ] `invoices` klasörü private, gevşek Storage politikası yok (Adım 7)

### Kod ve GitHub
- [ ] Depo **Private**; gizli pencerede 404 veriyor (Adım 4)
- [ ] `launch-hardening` PR'ı açıldı, CI dört işiyle **yeşil**, `main`'e birleştirildi (Adım 4)
- [ ] GitHub hesabında 2FA açık

### Anahtarlar
- [ ] Supabase service-role, OpenAI, Keepa, Pushover anahtarları yenilendi; eskiler iptal edildi (Adım 5)
- [ ] `AUTOMATION_SHARED_SECRET`, `METRICS_TOKEN`, `N8N_ENCRYPTION_KEY`, `GRAFANA_ADMIN_PASSWORD` üretildi ve şifre yöneticisinde (Adım 5)
- [ ] Hiçbir anahtar sohbete, e-postaya ya da ekran görüntüsüne yapıştırılmadı

### Hesaplar
- [ ] Alan adı, Hetzner, Vercel (plan şartları okundu), OpenAI **aylık limit**, Keepa planı, Pushover (Adım 6)
- [ ] Her hesapta 2FA açık

### Sunucu ve backend
- [ ] DNS: `dig +short api.<alan>` sunucu IP'sini gösteriyor (Adım 9)
- [ ] Hetzner Cloud Firewall: yalnızca 22, 80, 443 (tcp) ve 443 (udp) açık
- [ ] `.env.prod` dolu (izin 600) ve kimseyle paylaşılmadı
- [ ] `docker compose ps`: tüm servisler çalışıyor, backend **healthy**
- [ ] `smoke_auth.sh` (`BEHIND_PROXY=1 EXPECT_PRODUCTION=1`) → "All checks passed"
- [ ] `https://api.<alan>/docs` → 404; `/metrics` internetten → 404

### Frontend
- [ ] Vercel: Root Directory `frontend`, dört `NEXT_PUBLIC_*` değişkeni, `main` izleniyor (Adım 10)
- [ ] `CORS_ALLOWED_ORIGINS` = frontend adresi; Supabase Site URL ve Redirect URL girildi
- [ ] `/robots.txt` ve `/sitemap.xml` gerçek alan adını gösteriyor
- [ ] Vitrin, `/impressum`, `/datenschutz` açılıyor

### Giriş
- [ ] İlk admin eklendi, `/admin/login` ile girilebiliyor, panel hatasız (Adım 11)
- [ ] Şifre uzun ve benzersiz (uygulamada MFA yok; bu bilinen bir eksik, Adım 11.4)

### Otomasyon
- [ ] n8n owner hesabı **ilk açılışta hemen** oluşturuldu (Adım 12)
- [ ] Workflow içe aktarıldı, "Vindera Automation Key" seçili, elle çalıştırıldı, `scan_jobs`'ta satırlar var, **Active**
- [ ] `watchlist_asins` dolu ve doğru
- [ ] Yerel n8n durduruldu (çift tarama olmasın)

### Yedek ve izleme
- [ ] `backup.sh` kurulu, cron çalışıyor, `age` anahtarı sunucu **dışında** (Adım 13)
- [ ] healthchecks.io ping'i geliyor
- [ ] **Geri yükleme provası** bir kez yapıldı, satır sayıları tuttu
- [ ] Yedek klasörü sunucu dışına da kopyalanıyor
- [ ] Fatura dosyaları (Storage) ayrıca indirildi
- [ ] UptimeRobot `https://api.<alan>/healthz` izliyor ve sana bildirim gönderiyor (Adım 14)
- [ ] Sentry (isteğe bağlı) ve Grafana SSH tüneliyle açılıyor

### Yasal ve vergi (paralel yürütülen iz)
- [ ] Gewerbeanmeldung yapıldı, `legal.ts` güncellendi (Adım 16.1)
- [ ] Steuerberater soruları soruldu, cevaplar not edildi (Adım 16.2); Kleinunternehmer sınırı `business_settings`'te doğru
- [ ] Avukat Impressum, Datenschutz, ilan şablonu ve Widerrufsrecht/Gewährleistung metnini gözden geçirdi (Adım 16.3); `listing_legal_footer` dolduruldu
- [ ] Willhaben ticari satıcı hesabı ve ücret koşulları netleşti; Adım 8'deki komisyon alanları buna göre

### Test
- [ ] `docs/MANUAL-TEST-SCRIPT.md` yerelde baştan sona geçti (Adım 17)
- [ ] **İlk gerçek tarama yapıldı ve doğrulandı** (bölüm 2)

---

## 2. İlk gerçek tarama

> **Gerçek Keepa, OpenAI ve Pushover anahtarlarıyla tek bir gerçek ASIN taraması yap ve sonucu kontrol et (özellikle Keepa yanıtındaki 90 günlük BuyBox ortalaması ve fiyat geçmişi).**

**Neden:** Backend'in Keepa okuyucusu Keepa'nın resmî istemci kaynaklarından uygulandı, ancak **canlı bir Keepa yanıtıyla hiç çalıştırılmadı**. Özellikle 90 günlük BuyBox ortalaması (`stats.avg90[18]`) düz fiyat olarak okunuyor; bu bir varsayım. Canlı yanıtta farklıysa kod sessizce "90 günlük Amazon ortalaması"na düşer ve kâr hesabı biraz yanlış olur. Bu tek tarama bunu ortaya çıkarır.

**Koşullar:** Adım 5 (yeni anahtarlar canlıda), Adım 8 (gerçek `business_settings`), Adım 9–11 (backend, frontend ve admin girişi) tamam. Keepa hesabında token var, OpenAI'da limit ve bakiye var.

**Hazırlık:** Amazon.de'de gerçekten satılan, tek bir ürün seç. Ürün sayfasını (amazon.de) ve Keepa'nın ürün sayfasını (keepa.com'da ASIN ile ara) ayrı sekmelerde aç; karşılaştıracaksın.

### 2.1 Taramayı başlat
1. `https://www.<alan>/admin` → AI Terminal → `/scan <ASIN>`.
2. Terminal başlığındaki **Scans** düğmesine bas; birkaç dakika içinde satırın durumunu izle.

### 2.2 Sonucu oku
- [ ] Durum `succeeded` ya da `rejected`. **`rejected` de geçerli bir sonuçtur:** veriler alındı, hesap yapıldı, "almama" kuralı reddetti. `failed` ise nedenini oku; sık nedenler: Keepa token'ı bitmiş, anahtar yanlış, OpenAI bakiyesi/limiti.
- [ ] Ürün, `Pending` (ya da `Rejected`) olarak listede göründü.

### 2.3 Sayıları Keepa ve Amazon ile karşılaştır
Supabase → SQL Editor (kendi ASIN'ini yaz):
```sql
select p.asin, p.title, o.status, o.buy_price, o.target_sell_price,
       o.net_profit_estimate, o.profit_margin, o.buybox_seller, o.buybox_is_fba,
       o.deal_score, o.ai_decision
from public.opportunities o join public.products p on p.id = o.product_id
where p.asin = 'BURAYA-ASIN' and o.deleted_at is null;
```
- [ ] **`buy_price`** = amazon.de'deki güncel BuyBox fiyatıyla aynı (birkaç sent farkı normal; BuyBox fiyatı kargo dahildir).
- [ ] **`ai_decision` ilk satırı** şuna benzer: `Data: buy price EUR … = Amazon BuyBox price; reference EUR … = 90-day BuyBox average.`
  - Kaynak **"90-day BuyBox average"** ise varsayım doğru çıktı. ✔
  - **"90-day Amazon price average"** ya da "third-party marketplace average" yazıyorsa Keepa'nın BuyBox 90 günlük ortalamasını okuyamadık ve geri düştük. **Bu bir bulgudur:** bana yaz (anahtarları değil, Keepa sayfasındaki 90 günlük BuyBox ortalamasını ve `ai_decision` metnini).
  - "WARNING: no BuyBox or Amazon price was available" varsa ürünün o an BuyBox'ı yok; başka bir ürünle tekrar dene.
- [ ] **Referans fiyat** (`reference EUR …`), Keepa ürün sayfasındaki "Buy Box" satırının **90 gün ort. (90 days avg.)** değeriyle aynı büyüklükte (birkaç % fark olabilir; iki katı ya da sıfır olmamalı).
- [ ] **`buybox_seller`**, Keepa'daki güncel BuyBox satıcısıyla uyumlu: `Amazon`, ya da `Marketplace (<satıcı kimliği>)`. Satıcı adı uydurulmaz; kimlik gelir.
- [ ] **Net kâr el hesabı:** hedef satış fiyatı = bugünkü fiyat ile 90 günlük fiyatın ortası. Net kâr = satış − (alış + gelen kargo + ambalaj) − giden kargo − komisyonlar − iade payı (`business_settings` sayılarıyla). Ekrandaki `net_profit_estimate` ve `profit_margin` (maliyet üzerinden %) el hesabınla kuruş düzeyinde tutmalı.

### 2.4 Fiyat geçmişini kontrol et
```sql
select recorded_at::date as gun, price_amazon, price_buybox
from public.price_history
where product_id = (select id from public.products where asin = 'BURAYA-ASIN')
order by recorded_at;
```
- [ ] Günlük noktalar var (Keepa'da veri varsa 90 güne yakın), **bugünün noktası** dahil.
- [ ] Değerler Keepa'nın ürün grafiğiyle uyuşuyor (aynı iniş/çıkışlar). Eski sahte kalıp (tek taramada sabit 6 satır) **olmamalı**.
- [ ] Admin panelinde deal detayındaki fiyat grafiği gerçek noktaları gösteriyor ("Sample" etiketi yok; 2'den az nokta varsa örnek eğri çıkar).
- Keepa'da o ürünün Amazon (ya da BuyBox) serisi boşsa ilgili sütun boş kalır; bu hata değildir. Nokta hiç yoksa başka bir ürünle tekrar dene.

### 2.5 OpenAI ve ilan metni
- [ ] Deal detayında 0–100 arası `deal_score` ve gerekçe var.
- [ ] Almama kuralını geçtiyse Almanca ilan metni oluştu; **ödeme cümlesi** `business_settings.listing_payment_text`'teki gibi, **yasal alt metin** `listing_legal_footer`'daki gibi (boşsa görünmez) aynen sonda duruyor.
- [ ] İlan metninde alış fiyatı ya da kâr rakamı **geçmiyor**.

### 2.6 Pushover
- Bildirim yalnızca **deal_score ≥ 80** olan sıcak fırsatta ve aynı ürün için 7 günde en fazla bir kez gelir. Skoru düşük bir tarama bildirim göndermez; bu normal.
- [ ] Pushover'ın çalıştığını ayrıca görmek için (isteğe bağlı) terminalde, anahtarları geçici değişkenle vererek:
  ```bash
  read -s "PT?Pushover app token: "; read -s "PU?Pushover user key: "
  curl -s -F "token=$PT" -F "user=$PU" -F "message=Vindera test" https://api.pushover.net/1/messages.json; unset PT PU
  ```
  Telefona "Vindera test" gelmeli. Anahtarları bir yere yapıştırma.

### 2.7 Tekrar ve token
- [ ] Aynı ASIN'i bir kez daha tara: **yeni satır eklenmez** (tek açık kayıt yenilenir), yeni bildirim gelmez.
- [ ] Keepa token harcamasına bak (Keepa hesabında ya da Grafana'da `vindera_keepa_tokens_left`). Her tarama token harcar; günlük watchlist boyutunu buna göre ayarla.

### 2.8 Sonuç
- Hepsi tutuyorsa: kutuyu işaretle ve bu satırı `docs/LAUNCH-PROGRESS.md` içinde "gerçek tarama doğrulandı" diye not ettir (bana söylemen yeter).
- Tutmayan bir şey varsa: **çıkışı durdur**, hangi sayının farklı olduğunu ve Keepa sayfasındaki karşılığını yaz. Keepa yanıtının biçimi ilk kez gerçekle karşılaşıyor; ufak bir ayar gerekebilir ve bunun için testler hazır.

---

## 3. Çıkış günü sırası

1. Yeni bir yedek al (Adım 1'deki iki komut) ve Supabase panelinde bugünün yedeğini gör.
2. `main` güncel ve CI yeşil mi? (`git log --oneline -3`, GitHub Actions)
3. Sunucuda `git pull` → `docker compose --env-file .env.prod up -d --build backend` → `readyz` 200.
4. Vercel'de son deploy yeşil mi? Değişkenler doğru mu?
5. `smoke_auth.sh` (canlı adrese karşı) yeşil.
6. Uçtan uca bir kez kendin gez: vitrin → ürün sayfası → admin girişi → Scans listesi → Reports.
7. n8n **Active**; yerel n8n durdurulmuş.
8. UptimeRobot yeşil; telefonuna bir test bildirimi gelmiş.
9. Bu listedeki tüm kutular işaretli mi? Değilse çıkışı ertele: yasal maddeler (bölüm 1, son başlık) gerçek müşteri satışından önce **zorunludur**.

---

## 4. İlk hafta rutini

### Her gün (yaklaşık 5 dakika)
- [ ] **Uptime:** UptimeRobot yeşil mi? (Kapandıysa `docker compose --env-file .env.prod ps` ve `logs --tail 100 backend`.)
- [ ] **Scans listesi** (admin → AI Terminal → Scans): dünkü taramalar `succeeded`/`rejected` mı, `failed` var mı? Başarısızlık nedenini oku (Keepa token, OpenAI, ağ).
- [ ] **Keepa token'ı:** Grafana → `vindera_keepa_tokens_left` ya da Keepa paneli. Düşükse watchlist'i kısalt ya da planı yükselt.
- [ ] **Grafana / Sentry:** `vindera_scan_jobs_total` (başarısız sayısı artıyor mu), `vindera_openai_errors_total`; Sentry'de yeni hata var mı. (Grafana: `ssh -L 3002:127.0.0.1:3002 vindera@<sunucu>` → http://localhost:3002.)
- [ ] **Bildirimler:** Pushover'daki "sıcak fırsat", "60 günü geçen stok" ve "iade süresi doluyor" bildirimlerini oku ve harekete geç.
- [ ] **Bekleyen fırsatlar:** yeni `Pending` kayıtları gözden geçir; almayacaklarını `Rejected` yap.
- [ ] Yedek ping'i (healthchecks.io) dün gelmiş mi?

### Haftada bir
- [ ] **Defter kontrolü:** o haftanın satış ve iade satırlarını banka/PayPal/Willhaben ödemeleriyle karşılaştır (Reports → yıl seçili → satırlar). Uyuşmayan varsa hemen düzelt (satış eksikse **Item Sold!**, iade varsa **Returned**).
- [ ] **İade süreleri:** iade tarihi yaklaşan, satılmamış ürünleri (Amazon iade süresi) gözden geçir.
- [ ] **Eski stok:** 60 günü geçenleri fiyat düşür ya da `Written Off` yap.
- [ ] `docker compose ... ps` ve disk doluluğu (`df -h`); sunucuda güncelleme uyarısı.
- [ ] Yedek dosyaları oluşuyor mu (`ls -lh /var/backups/vindera | tail`); sunucu dışı kopya çalışıyor mu.
- [ ] OpenAI ve Keepa harcamasını panelden gör.

### Ayda bir
- [ ] **Steuerberater için dışa aktarım:** Reports → yıl → **Export CSV**. Dosyayı ilet, gelen sorularını Adım 16'daki listeye ekle.
- [ ] **Kleinunternehmer çubuğu:** yıl cirosu sınırın neresinde (Reports'ta çubuk). Sınıra yaklaşınca Steuerberater'e haber ver.
- [ ] `business_settings`'i gözden geçir (Post/Willhaben ücretleri değişti mi?).
- [ ] Fatura yüklemelerini kontrol et: satılan/alınan her ürünün faturası kayıtlı mı; dosyaları ayrıca indir (Storage yedeklere dahil değil).
- [ ] Docker imajı ve n8n güncellemeleri (DEPLOY.md bölüm 15).

### Üç ayda bir
- [ ] **Geri yükleme provası** (DEPLOY.md bölüm 14): bir yedeği geçici veritabanına yükle, satır sayılarını canlıyla karşılaştır.

---

## 5. Geri alma (rollback) ve acil durum

Komutların tamamı `docs/DEPLOY.md` bölüm 16'dadır. Sunucuda `cd /opt/vindera/infrastructure/prod` içinde çalıştır.

**Önce şunu bil:** Canlı veritabanı yeni şemada (Adım 1). **Eski (main öncesi) koda geri dönemezsin.** "Geri alma" = yeni sürümün bir önceki iyi hâline dönmek.

### Backend kötü çıktıysa
```bash
BACKEND_IMAGE=vindera-backend:previous docker compose --env-file .env.prod up -d --no-build backend
docker compose --env-file .env.prod ps                     # backend "healthy"
curl -fsS https://api.<alan>/readyz
```
Önceki imaj yoksa: `git checkout <son-iyi-commit>` ve `docker compose --env-file .env.prod up -d --build backend`. (Güncellemeden önce her seferinde `docker tag vindera-backend:prod vindera-backend:previous` çalıştır.)

### Frontend kötü çıktıysa
Vercel → Deployments → son iyi olan → **⋯ → Promote to Production** (ya da Instant Rollback).

### n8n, Caddy, izleme
Önceki `N8N_IMAGE_TAG` ile `docker compose --env-file .env.prod up -d`. Veriler Docker volume'larında kalır, kaybolmaz.

### Veritabanı
Otomatik "down" migration yoktur. Kötü bir migration, **yeni bir düzeltici migration** ile giderilir. Kaybolan ya da bozulan veri şuradan geri yüklenir: (1) Supabase'in kendi yedeği / PITR (Dashboard → Database → Backups), ya da (2) senin `backup.sh` dökümün (DEPLOY.md bölüm 14'teki geri yükleme komutları). Bu yüzden her migration'dan ve her elle silme işleminden önce yedek alınır (Adım 1, Adım 3).
Hatalı bir **satış** ya da **iade** kaydı silinmez: uygulamada **Returned** ile telafi kaydı düşersin (defter silinmez, yalnızca eklenir).

### Yanlış birleştirme (merge)
Henüz yalnızca GitHub'da olan bir hatayı düzeltmek için bana yaz; `main`'i geri sarmak (`git reset`) ya da zorla göndermek (`--force`) yerine bir **düzeltme commit'i** ya da `git revert` tercih ederiz.

### Acil durdurma (para ya da veri akıyorsa)
1. **Taramaları durdur:** n8n → workflow'u **Inactive** yap. (Anında etkili; yeni Keepa/OpenAI harcaması durur.)
2. **Backend'i durdur:** `docker compose --env-file .env.prod stop backend`. (Vitrin çalışmaya devam eder; admin ve tarama durur.)
3. **Anahtar sızdıysa:** ilgili panelden anahtarı hemen iptal et (OpenAI, Keepa, Supabase), yenisini üret (Adım 5), sunucuda `.env.prod`'u güncelle, `up -d backend`.
4. **Admin hesabı ele geçirildiyse:** Supabase → Authentication → Users → şifreyi sıfırla / kullanıcıyı sil; `admin_users`'ı kontrol et.
5. **Vitrini kapatmak gerekirse:** Vercel → Project → Settings → alan adını kaldır ya da projeyi duraklat.
6. Sonra `docker compose --env-file .env.prod logs --tail 200 backend` çıktısını (anahtarsız) bana gönder.
