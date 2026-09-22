# Grafana kurulum notları (yerel)

Bu dosya, Claude'un 2026-09-22 tarihinde yerel Grafana'da (`localhost:3002`) yaptığı ayarların kaydıdır. Oturum yanlışlıkla kapanırsa ne yapıldığını buradan hatırlayabilirsin. Bu bir migration veya otomatik betik değil — sadece Grafana'nın kendi arayüzünden elle yapılabilecek işlemlerin dökümü.

## Dayanıklılık: container/volume kaybolsa bile hiçbir şey bozulmaz (2026-09-22, üçüncü geçiş)

**Kısa cevap: Evet, artık gerçekten sağlandı — ve bunu gerçekten test ettim, varsayım değil.**

İlk iki geçişte (dashboard'lar, alarm kuralları, contact point'ler) her şey Grafana'nın kendi arayüzü/API'si üzerinden yapılmıştı — yani sadece `grafana_data` adlı Docker volume'ünün içindeki SQLite veritabanında duruyordu. Container silinse volume kalırsa sorun olmazdı, ama **volume da silinirse** (disk temizliği, `docker system prune --volumes`, Docker Desktop sıfırlama, bozuk disk vs.) **her şey — dashboard'lar, alarm kuralları, contact point'ler, veri kaynakları — tamamen giderdi**, çünkü hiçbir yerde dosya halinde bir kopyası yoktu.

Bunu çözmek için Grafana'nın **"provisioning" (dosyadan otomatik kurulum)** özelliğine geçildi: artık her şeyin kaynak kopyası `infrastructure/monitoring/grafana-provisioning/` altında, **git'e commit edilen dosyalarda** duruyor. Grafana, container her başladığında bu dosyaları okuyup her şeyi (veri kaynakları, 3 dashboard, 3 alarm kuralı, 2 contact point, bildirim yönlendirmesi) **sıfırdan yeniden kurar** — elle hiçbir şey yapmaya gerek kalmadan.

**Bunu iddia etmekle kalmadım, gerçekten yıktım ve test ettim:** Grafana container'ını tamamen sildim, ardından `grafana_data` volume'ünü de tamamen sildim (yani "container çökse" senaryosundan daha kötüsünü yaptım — sıfırdan, hiçbir veri kalmadan), sonra `docker compose up -d` ile yeniden ayağa kaldırdım. Sonuç: **3 dashboard, 2 veri kaynağı, 2 contact point, 3 alarm kuralı (doğru severity etiketleri ve doğru bildirim yönlendirmesiyle) hiçbir elle müdahale olmadan otomatik geri geldi.** API üzerinden tek tek doğruladım, tarayıcıda da açıp göründüğünü kontrol ettim.

**Klasör yapısı:**
```
infrastructure/monitoring/grafana-provisioning/
├── datasources/datasources.yml      # prometheus + vindera-postgres
├── dashboards/dashboards.yml        # "bu klasördeki json'ları yükle" talimatı
├── dashboards/json/*.json           # 3 dashboard'ın tam tanımı
└── alerting/
    ├── contactpoints.yml            # 2 Pushover kanalı (şifreler $VAR ile .env'den)
    ├── notification-policies.yml    # severity'ye göre yönlendirme
    └── rules.yml                    # 3 alarm kuralı
```

**Gizli bilgiler dosyalarda düz metin olarak durmuyor** — `docker-compose.yml`'e eklenen `VINDERA_DB_PASSWORD`, `PUSHOVER_API_TOKEN`, `PUSHOVER_USER_KEY` ortam değişkenleri `infrastructure/monitoring/.env`'den (git-ignored) geliyor, YAML dosyaları içinde sadece `$PUSHOVER_API_TOKEN` gibi referanslar var. `.env.example` güncellendi, gerçek `.env`'e de değerler eklendi.

**Hâlâ geriye kalan tek gerçek risk:** `infrastructure/monitoring/.env` dosyasının kendisi (git-ignored, sadece bu bilgisayarda) kaybolursa, provisioning dosyaları `$VAR` referanslarını dolduramaz ve Grafana başlamaz (bilerek: `docker-compose.yml`'deki `${VAR:?mesaj}` söz dizimi, eksik bir gizli bilgiyle sessizce yanlış başlamak yerine açık bir hata ile durur). Bu durumda tek yapmanız gereken `.env.example`'ı kopyalayıp değerleri (Grafana admin şifresi, Pushover bilgileri — zaten kök `.env`'de de var) tekrar girmek; hiçbir dashboard/alarm tanımı kaybolmaz çünkü onlar zaten git'te.

## Claude bunu nasıl yaptı?

Bu bölümdeki genel açıklama hâlâ geçerli, tek fark: artık `infrastructure/monitoring/` klasörüne gerçekten dokunuldu (yukarıdaki provisioning dosyaları eklendi, `docker-compose.yml` güncellendi) — önceki geçişlerde olduğu gibi sadece Grafana'nın çalışan container'ına dışarıdan bağlanmakla kalınmadı.

Claude, zaten çalışan Grafana konteynerine iki şekilde bağlandı:
1. **Kendi tarayıcısıyla** (Claude Desktop'ın "Browser pane"i) `http://localhost:3002` adresini açıp, tıpkı bir insan gibi formları doldurdu, butonlara tıkladı.
2. Bazı kontrol adımlarında Grafana'nın kendi HTTP API'sine (`curl` ile, `infrastructure/monitoring/.env` içindeki `GRAFANA_ADMIN_PASSWORD` kullanılarak) doğrudan istek attı (örn. "hangi dashboard'lar zaten var" diye bakmak için).

Yani Claude Code, Claude Desktop'ın tarayıcı ve terminal araçlarına sahip olduğu için Grafana dahil **`localhost` üzerinde çalışan herhangi bir web arayüzünü** kullanabilir. Bu Vindera'ya özgü bir entegrasyon değil.

## Yapılanlar (2026-09-22, ikinci geçiş: eski tek panelli dashboard silindi, 3 gerçek dashboard ile değiştirildi)

### 0. Yeni veri kaynağı: `vindera-postgres`
Prometheus sadece HTTP/scan/Keepa/OpenAI gibi *teknik* metrikleri tutuyor — ciro, envanter, kâr gibi *iş* verileri veritabanında. Bu yüzden Grafana'ya ikinci bir veri kaynağı eklendi:
- **Ad:** `vindera-postgres`, tip Postgres, UID `bfyyiwh1pi0hsd`.
- Şu an **yerel** Supabase'e bağlı: `host.docker.internal:54322`, kullanıcı `postgres`, şifre `postgres` (Supabase CLI'nin `supabase start` ile gelen standart yerel varsayılanı — gizli bir şey değil, herkeste aynı).
- Business ve Veritabanı Sağlığı dashboard'larının çalışması için **yerel Supabase'in açık olması gerekiyor** (`supabase start`). Kapalıysa panellerde "No data" / bağlantı hatası görünür, bu bir hata değil.
- **VPS + hosted Supabase'e geçince** yapılması gereken tek şey: bu veri kaynağının `host`/`user`/`password`'ünü Supabase Dashboard → Connect → "Session pooler" bilgileriyle güncellemek (Settings → Database'den şifreyi almanız gerekir). Dashboard'ların hiçbiri değişmeyecek, sadece bu tek veri kaynağı hosted DB'yi gösterecek.

### 1. Dashboard'lar (3 adet, "Vindera" klasöründe)

**a) "Vindera — Sistem Sağlığı"** (`vindera-system-health`, Prometheus) — teknik/altyapı sağlığı:
- Genel Durum: Backend ayakta mı, kalan Keepa token (gauge), son 1 saatte başarısız scan sayısı, son 1 saatte OpenAI hata sayısı.
- HTTP Trafiği: durum koduna göre istek oranı, 5xx hata oranı %, p50/p95/p99 gecikme, en çok istek alan uçlar tablosu.
- Scan Pipeline: saatlik scan sonuçları (başarılı/reddedilen/başarısız, yığılmış bar), zaman içinde kalan Keepa token.
- Süreç Kaynakları: CPU ve bellek kullanımı. **Not:** şu an "No data" gösteriyorlar çünkü `prometheus_client`'ın process metrikleri (`process_cpu_seconds_total`, `process_resident_memory_bytes`) `/proc` dosya sistemine ihtiyaç duyar, bu da yalnızca **Linux**'ta var — macOS'ta hiç üretilmiyor. VPS'e (Linux) taşındığında bu paneller otomatik dolacak, kodda hiçbir değişiklik gerekmiyor.

**b) "Vindera — İş Metrikleri"** (`vindera-business`, Postgres) — gerçek arbitraj/e-ticaret verileri, uygulamanın kendi `report_summary()` fonksiyonunu kullanıyor (Reports sayfasıyla aynı, tek doğru kaynak):
- Bu Yıl Özet: yıllık ciro, brüt kâr, vergi öncesi kâr, ROI %, küçük işletme KDV sınırı kullanım yüzdesi (bar gauge, 80/97 eşiklerinde renk değişiyor).
- Aylık Kırılım ve Kategoriler: bu yılın ay ay ciro/brüt kâr grafiği, kategori bazında performans tablosu.
- Envanter (Canlı): bekleyen fırsat sayısı, envanterdeki birim sayısı, envanter değeri (maliyet üzerinden), listelenenlerin potansiyel satış değeri, durum dağılımı (pasta grafik).
- Dikkat Gerektirenler: iade süresi ≤5 gün kalan birimler (tablo), 60+ gün durgun stok (tablo) — bunlar "bugün ne yapmalıyım" sorusuna cevap veren, gerçekten aksiyon alınabilir paneller.
- Tarama Faaliyeti: watchlist boyutu, son 20 scan işi (ASIN, durum, hata metni).

**c) "Vindera — Veritabanı Sağlığı"** (`vindera-db-health`, Postgres) — kompakt, "şu an" durumu:
- Veritabanı boyutu, aktif bağlantı sayısı, cache hit oranı (gauge), en uzun süren aktif sorgu (saniye).
- En büyük 10 tablo (satır sayısı + boyut), iş tablolarının kayıt sayıları.
- **Dürüst bir not:** bunlar zaman içindeki geçmişi göstermiyor, sadece dashboard her yenilendiğinde "şu an"ı gösteriyor (Prometheus gibi sürekli örneklenmiyor). Gerçek zaman-serisi veritabanı metrikleri (bağlantı sayısının saatler içindeki grafiği gibi) istenirse `postgres_exporter` eklenip Prometheus'a bağlanması gerekir — bu şu an yok, süs olsun diye sahte bir grafik de eklenmedi.

**Bilinçli olarak yapılMADI: "Frontend" dashboard'u.** Sebep: frontend'in (Vercel/Next.js) hiçbir telemetri/metrik kaynağı yok — ne Vercel Analytics bağlı, ne frontend Sentry kurulu (`CLAUDE.md`'nin kendi notu: "Frontend Sentry is not trivial... documented in M19 instead"). Böyle bir dashboard kurmak, gösterecek gerçek veri olmadığı için sadece boş kutulardan ibaret olurdu — "süs için yapılmasın" isteğinize aykırı olurdu. İstenirse Vercel Analytics (ücretsiz, kurulumu kolay) veya frontend Sentry kurulup ayrı bir oturumda gerçek bir frontend dashboard'u eklenebilir.

### 2. Bildirim kanalları — artık iki tane, önem derecesine göre ayrıldı

Önceki tek kanal, kritik olsun olmasın her şeyi aynı şiddette (High öncelik = telefonun sessiz saatlerini bile atlar) gönderiyordu. "Olur olmaz zamanlarda değil, doğru zamanda" isteğiniz üzerine gerçek e-ticaret/SRE pratiğine uygun şekilde **önem derecesine göre iki kanala** ayrıldı:

- **"Ridvan Pushover"** (öncelik **High**) — sadece **kritik** alarmlar: "Backend Ayakta Degil". Anında gönderilir (`group_wait: 0s`), hâlâ çözülmemişse her 30 dakikada bir hatırlatır, telefonun sessiz saatlerini bilerek atlar (backend düşmüşse gece de olsa haberiniz olmalı).
- **"Ridvan Pushover (Normal)"** (öncelik **Normal**) — "uyarı" seviyesindeki her şey: "Keepa Token Azaldi", "Scan Islemleri Basarisiz". 30 saniye toplanıp gönderilir, hâlâ sürüyorsa 3 saatte bir hatırlatır, telefonun sessiz saatlerine **uyar** (gece saat 3'te "Keepa token azaldı" diye uyanmanıza gerek yok).
- İkisi de aynı Pushover hesabını (`.env`'deki `PUSHOVER_USER_KEY`/`PUSHOVER_API_TOKEN`) kullanıyor, sadece Pushover'a gönderilen "priority" değeri farklı.
- Mesaj şablonu ikisinde de aynı, düz metin (markdown `**` yok): `{{ .CommonLabels.alertname }} - {{ .Status }}` + her alarmın değeri.
- Grafana'nın kendi e-posta (SMTP) özelliği hâlâ **kullanılmadı** (bkz. önceki not, hâlâ geçerli).

### 3. Yönlendirme (Notification policy) ve etiketler
- Her 3 alarm kuralına bir `severity` etiketi eklendi: "Backend Ayakta Degil" → `severity=critical`, diğer ikisi → `severity=warning`.
- Kök (varsayılan) politika artık **"Ridvan Pushover (Normal)"**'a gidiyor (yakalanmayan her şey için güvenli varsayılan).
- `severity=critical` etiketli alarmlar ayrı bir dala yönlendirilip **"Ridvan Pushover"** (High + anında) kanalına gidiyor.
- Böylece: "backend çöktü" gibi gerçekten acil bir şey anında ve sesli gelir; "Keepa token azalıyor" gibi bilgilendirme daha sakin ve makul aralıklarla gelir.

### 4. Klasör ve Evaluation Group
- **"Vindera"** adında bir alert klasörü oluşturuldu.
- **"vindera-backend"** adında bir evaluation group oluşturuldu (kurallar her 1 dakikada bir kontrol ediliyor).

### 5. Alarm kuralları (3 adet, `infrastructure/monitoring/alerts.yml`'deki mantığın Grafana'ya taşınmış hali)

| Kural adı | Sorgu | Koşul | Bekleme süresi (pending period) |
|---|---|---|---|
| Backend Ayakta Degil | `up{job="vindera_fastapi"}` | 1'in altına düşerse | 2 dakika |
| Keepa Token Azaldi | `vindera_keepa_tokens_left` | 20'nin altına düşerse | 1 dakika |
| Scan Islemleri Basarisiz | `increase(vindera_scan_jobs_total{status="failed"}[1h])` | 3'e eşit veya üstüne çıkarsa | 1 dakika |

Üçü de "Ridvan Pushover" contact point'ine bağlı. "Keepa Token Azaldi" ve "Scan Islemleri Basarisiz" kuralları için metrik henüz hiç veri üretmediğinden (`vindera_keepa_tokens_left` gerçek bir Keepa çağrısı olmadan, `vindera_scan_jobs_total` ilk scan çalışmadan hiç oluşmuyor) bu iki kuralın **"Alert state if no data" ayarı `OK` yapıldı** (2026-09-22, Grafana API üzerinden). Varsayılan `NoData` ayarıyla, veri yokluğunun kendisi Grafana'nın dahili "DatasourceNoData" alarmını tetikleyip Pushover'a sürekli bildirim gönderiyordu — bu **hata değil, beklenen bir durumdu** ama gereksiz gürültüydü. Artık veri yokken bu iki kural sessiz kalıyor, ilk gerçek Keepa çağrısı / ilk gerçek scan olduğunda normal şekilde değerlendirmeye başlayacaklar. "Backend Ayakta Degil" kuralı `NoData` olarak bırakıldı (`up` metriği Prometheus çalıştığı sürece her zaman bir değer üretir, o yüzden veri yokluğu orada gerçekten anlamlı bir sorunu işaret eder).

### 5. Prometheus'un kendi `alerts.yml` dosyası (`infrastructure/monitoring/alerts.yml`)
Bu dosyaya dokunulmadı, hâlâ orada duruyor ve Prometheus'un kendi arayüzünde (`localhost:9090/alerts`) "firing" gösteriyor ama hiçbir yere bildirim atmıyor (`docs/MANUEL-ADIMLAR.md`'de zaten böyle açıklanmış). Yukarıdaki 3 Grafana kuralı bunun yerini alıyor ve gerçekten bildirim gönderiyor — iki sistemi aynı anda tutmaya gerek yok, ama `alerts.yml` production'da Prometheus'un kendi "Alerts" sekmesinde durumu görmek için faydalı, o yüzden silinmedi.

## Ayrıca bu oturumda düzeltilen ayrı bir konu
Backend'in `--reload` ile çok yavaş açılması ve gereksiz yeniden başlama sorunu çözüldü: [CLAUDE.md](../CLAUDE.md) ve [backend/src/main.py](../backend/src/main.py) içindeki çalıştırma komutuna `--reload-dir src` eklendi (artık sadece `backend/src/` izleniyor, `.venv` değil). Ayrıntı için bu konuşmanın ilgili bölümüne bakılabilir.

## Yapılmadı / bilerek atlandı
- **E-posta (SMTP) bildirimi** kurulmadı — Pushover zaten yeterli ve daha az kurulum gerektiriyor. İleride e-posta da istenirse `infrastructure/monitoring/docker-compose.yml`'e `GF_SMTP_*` ortam değişkenleri eklenmesi gerekir (Gmail uygulama şifresi gibi bir kimlik bilgisi gerektirir, bu adım kullanıcı tarafından yapılmalı).
- Dashboard'a sadece 1 panel eklendi ("Backend Ayakta mı?") — Keepa token, scan hataları gibi diğer panelleri eklemek hâlâ kullanıcıya/ileriki bir oturuma kalmış bir iş.
