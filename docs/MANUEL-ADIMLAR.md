# VINDERA — Senin Yapman Gereken Adımlar (tam rehber)

> Yazılımın kendi başına yapamayacağı işler burada: paneller, hesaplar, para, gizli anahtarlar, yasal ve vergi konuları.
> **Yukarıdan aşağıya sırayla ilerle.** Her adımın altında ne yapacağın, ne kadar süreceği ve doğru yaptığını nasıl anlayacağın yazıyor.
> Son güncelleme: 21 Eylül 2026 (Faz 0–9 sonrası).

**Öncelik etiketleri:**
**Launch-blocker** = gerçek müşteriye/yayına çıkmadan önce şart · **Soon** = ilk haftalar · **Later** = sonra.

**Üç kural:**
1. Gizli anahtarları (API anahtarı, şifre, token) **asla** sohbete, e-postaya, ekran görüntüsüne yapıştırma. Hata metni paylaşırken anahtar satırlarını sil.
2. Emin olmadığın bir komutu çalıştırmadan önce dur ve sor. Canlı veritabanında geri alınamayan işlerden önce **yedek** al (Adım 1'deki komutlar).
3. Yasal ve vergi maddeleri (Adım 16) en uzun sürenlerdir. Diğer adımlarla **paralel** yürüt, bugün başlat.

**Yardımcı dosyalar:** `docs/DEPLOY.md` (sunucu kurulumunun komutları, İngilizce) · `docs/LAUNCH-CHECKLIST.tr.md` (canlıya çıkış listesi, ilk hafta rutini, geri alma, ilk gerçek tarama) · `docs/MANUAL-TEST-SCRIPT.md` (uçtan uca elle test).

---

## Özet tablo

| Adım | Konu | Öncelik | Durum |
|---|---|---|---|
| 1 | Yedek al, migration'ları uygula | Launch-blocker | ✔ TAMAMLANDI (21 Eylül 2026) |
| 2 | Herkese açık kaydı kapat | Launch-blocker | ✔ TAMAMLANDI |
| 3 | Canlı veritabanındaki test verisini temizle | Launch-blocker | ☐ |
| 4 | GitHub: depoyu Private yap, birleştir, CI'ı izle | Launch-blocker | ☐ |
| 5 | Gizli anahtarları yenile, yenilerini üret | Launch-blocker | ☐ |
| 6 | Hesaplar ve maliyetler | Launch-blocker | ☐ |
| 7 | Supabase panelinde kontroller | Launch-blocker | ☐ |
| 8 | `business_settings` sayılarını gerçek değerlerle doldur | Launch-blocker | ☐ |
| 9 | Sunucu, alan adı ve backend | Launch-blocker | ☐ |
| 10 | Vercel (frontend) ve Supabase adres ayarları | Launch-blocker | ☐ |
| 11 | İlk admin kullanıcısı | Launch-blocker | ☐ |
| 12 | n8n: günlük tarama | Launch-blocker | ☐ |
| 13 | Yedekleme ve geri yükleme provası | Launch-blocker | ☐ |
| 14 | İzleme ve uyarılar | Launch-blocker | ☐ |
| 15 | İlk gerçek tarama (Keepa, OpenAI, Pushover) | Launch-blocker | ☐ |
| 16 | Yasal ve vergi işleri (paralel yürüt) | Launch-blocker | ☐ |
| 17 | Uçtan uca elle test ve alış/satış/iade akışı | Soon | ☐ |
| 18 | Eski faturalar | Soon | bilgi |
| 19 | Eski (uydurma) fiyat geçmişi | Soon | ☐ karar |
| 20 | İlk hafta rutini | Soon | ☐ |
| 21 | Otomatik kimlik doğrulama kontrolü | Later | ☐ |
| 22 | Yerelde sahte veriyle çalışmak | Later | isteğe bağlı |
| 23 | Düzenli bakım takvimi | Later | ☐ |
| 24 | Sonraya bırakılanlar | Later | bilgi |

---

# LAUNCH-BLOCKER

## Adım 1. Önce yedek al, sonra veritabanı değişikliklerini (migration) uygula — ✔ TAMAMLANDI (21 Eylül 2026)

**Durum:** 21 Eylül 2026'da 13 migration canlı Supabase'e uygulandı. Yedek alındı, önce `--dry-run` yapıldı, hata çıkmadı. Kontrol: 1 `sale_events` kaydı, 1 `business_settings` satırı, `invoices` klasörü private, 3 eski çift tarama gizlendi (silinmedi), 7 `events_calendar` kaydı (seasonal event satırları da bu adımda tamamlandı).

**Dikkat:** Canlı veritabanı artık yeni şemada. **Eski (main) uygulama kodu bu şemayla düzgün çalışmaz** (tarama çift kayıt hatası verir, eski fatura linkleri açılmaz, eski Reports sayfası yanlış rakam gösterir). Bu yüzden yeni backend ve yeni frontend'i **birlikte** canlıya al (Adım 9 ve 10); eski sürümü canlı veritabanına bağlı bırakma.

**Bundan sonraki her yeni migration için aynı sıra** (ben yazarım, sen uygularsın; Terminal, proje klasöründe):
```bash
mkdir -p ~/Documents/vindera-yedek
supabase db dump --linked -f ~/Documents/vindera-yedek/sema-$(date +%Y%m%d).sql
supabase db dump --linked --data-only -f ~/Documents/vindera-yedek/veri-$(date +%Y%m%d).sql
supabase migration list --linked          # bekleyenler: Local dolu, Remote boş
supabase db push --linked --dry-run       # sadece göster
supabase db push --linked                 # onay sorusuna Y
supabase migration list --linked          # hepsinde Remote da dolu olmalı
```
Fatura dosyaları (Storage) bu yedeğe dahil değildir; Dashboard → Storage → `invoices` içinden ara sıra indir.

## Adım 2. Herkese açık kayıt (signup) kapatıldı — ✔ TAMAMLANDI

Supabase'te "yeni kullanıcı kaydı" kapatıldı. Admin olmak için `admin_users` tablosunda olmak zaten şart; artık dışarıdan hesap açılamıyor.
**Kontrol (istersen):** Gizli pencerede giriş sayfasından yeni bir e-postayla hesap açmayı dene: reddedilmeli.
Bu ayar, sonradan Adım 11'de kendi hesabını Dashboard'dan ekleyebilmene engel olmaz (Dashboard'dan eklenen kullanıcılar bu ayardan etkilenmez).

---

## Adım 3. Canlı veritabanındaki test verisini temizle

**Öncelik:** Launch-blocker (vitrinde "Test Product for ASIN: …" görünmemeli). **Süre:** 20–30 dakika.
**Neden:** Eski sahte-veri (mock) moduyla yapılan taramalar "Test Product for ASIN: …" başlıklı kayıtlar bıraktı; bunlar herkese açık vitrinde görünüyor. Ayrıca 1 satılmış kayıt ve `sale_events`'te 1 satır test verisi olabilir. Veritabanı, satılmış kayıtların ve satış defterinin (vergi kaydı) silinmesini bilerek engeller; uygulama bunları silemez. Bu adım, **elle çalıştırılan**, korumalı ve önce sadece deneme yapan bir SQL dosyasıyla bunu güvenle çözer: `supabase/scripts/cleanup_test_data.sql`. (Bu bir migration **değildir**; otomatik hiçbir yerde çalışmaz.)

> **UYARI: Gerçek bir satışı asla bu yöntemle silme.** Gerçek satış muhasebe kaydıdır; yaklaşık 7 yıl saklanmalı. Gerçek bir satışı geri almak için uygulamada **Returned** kullan (iade kaydı düşer, defter bozulmaz). Bu betik **yalnızca** test verisi içindir.

**Bilmen gereken:** Bu betik yerel (kendi bilgisayarındaki) Supabase'te tüm senaryolarıyla denendi (deneme modu, reddedilen girdiler, gerçek silme, korumaların sonradan tekrar açık olması). **Canlı Supabase SQL Editor'ünde henüz çalıştırılmadı**; ilk kez sen çalıştıracaksın. Bu yüzden deneme modu ve yedek şart.

### 3.1 Yedek al
Adım 1'deki iki `supabase db dump` komutunu çalıştır (tarihli dosya oluşur). Ücretli plandaysan Dashboard → Database → Backups'ta bugünün yedeğini de gör.

### 3.2 Dosyayı SQL Editor'e getir
1. Bilgisayarında `~/Desktop/vindera-workspace/supabase/scripts/cleanup_test_data.sql` dosyasını bir metin düzenleyicide (VS Code, TextEdit) aç. **Hepsini seç (Cmd+A) ve kopyala (Cmd+C).**
2. Tarayıcıda Supabase Dashboard'a git → projeni aç → sol menüden **SQL Editor** → **New query** (boş bir sayfa).
3. Yapıştır (Cmd+V). Sayfa uzun görünür; sorun değil.

### 3.3 BÖLÜM 1: sadece bak (hiçbir şeyi değiştirmez)
Dosyada `PART 1` başlığı altında üç sorgu var: **1a**, **1b**, **1c**. Her birini **tek tek** çalıştır: sorgunun tamamını fareyle sürükleyip seç (`-- 1a.` satırından, sonundaki `;` işaretine kadar), sonra sağ alttaki **Run** düğmesine bas (ya da Cmd+Enter). Seçili metin varsa yalnızca o çalışır. (**Seçmeden Run'a basma:** editör dosyanın tamamını çalıştırır, Bölüm 2 dahil; varsayılan hâlinde zararsız bir hata verir ama karışıklık yaratır ve yalnızca en son sonucu gösterir.)

- **1a**: "Test Product for ASIN" ya da "[MOCK]" başlıklı ürünler. Sütunlar: `asin`, `title`, `units` (kaç adet kayıt), `sold_units` (kaçı satılmış), `sale_rows` (kaç satış/iade satırı var).
  **Beklenen:** senin bildiğin test ürünleri. Tanımadığın ya da gerçek olduğunu düşündüğün bir ürün görürsen **dur** ve bana yaz.
- **1b**: veritabanındaki **bütün** satış ve iade kayıtları, ürün adıyla. Şunu sor: "Bu satış gerçek bir müşteriye mi yapıldı, yoksa test miydi?"
  **Kural:** Gerçek bir satış görürsen o ürünün ASIN'ini listeye **koyma**.
- **1c**: bu ürünlerden şu an vitrinde görünenler. Silme sonrası bu sorgunun boş dönmesi gerekir.

Bir kâğıda/nota, silmek istediğin test ürünlerinin **ASIN**'lerini yaz (10 karakter, büyük harf/rakam, ör. `B0AAAAAAA1`).

### 3.4 BÖLÜM 2, adım A: deneme (hiçbir şey değişmez)
1. Editörde aşağı in, `PART 2` başlığını bul. `DO $cleanup$` bloğunun başında üç satır var, yanlarında `<== EDIT` yazıyor.
2. **İlk satırı** düzenle: `ARRAY['B0EXAMPLE00']` yerine kendi ASIN'lerini yaz, her biri tek tırnak içinde, virgülle ayrılmış:
   `v_asins text[] := ARRAY['B0AAAAAAA1','B0BBBBBBB2'];`
3. **İkinci satır** (`v_commit`) `false` kalsın. **Üçüncü satır** (`v_confirm`) boş kalsın.
4. Fareyle `BEGIN;` satırından dosyanın en sonundaki `COMMIT;` satırına kadar **hepsini seç** ve **Run**'a bas.
5. **Kırmızı bir hata görmen NORMAL ve beklenen sonuçtur.** Hata metni şöyle başlar:
   `DRY RUN OK, nothing was changed. This is what WOULD be removed: 2 product(s), 4 unit(s) (1 of them sold), 1 sale/refund row(s), …`
   Bu, "silinecek olanlar bunlar, ama hiçbir şey silinmedi" demektir. Sayıları 3.3'te gördüklerinle karşılaştır: ürün sayısı, adet, satılmış adet, satış satırı. Beklediğinden fazlaysa **dur**.
6. Başka bir kırmızı hata görürsen (ör. "No test product found", "more than v_max_units", "example ASIN"), bu betiğin seni koruduğu anlamına gelir. Metni oku, ASIN listeni düzelt, adım A'yı yeniden çalıştır. Sık görülenler:

| Hata metni | Anlamı |
|---|---|
| `v_asins still contains the example ASIN` | Örnek ASIN'i kendi ASIN'inle değiştirmedin |
| `Every ASIN must be exactly 10 capital letters/digits` | ASIN yanlış yazılmış (küçük harf, eksik karakter) |
| `No test product found for ASIN(s) …` | ASIN yanlış, zaten silinmiş ya da başlığında "Test Product for ASIN" geçmiyor (gerçek ürünü korur) |
| `The list matches N units, more than v_max_units` | Liste beklenenden çok kayıt yakalıyor; listeyi kontrol et |
| `v_confirm is not exactly 'DELETE TEST DATA'` | Gerçek silmede onay yazısı eksik/yanlış |

### 3.5 BÖLÜM 2, adım B: gerçek silme
Yalnızca adım A'nın raporundan **tamamen** memnunsan:
1. İkinci satırı `v_commit boolean := true;` yap.
2. Üçüncü satırı tam olarak `v_confirm text := 'DELETE TEST DATA';` yap.
3. Aynı aralığı (`BEGIN;` … `COMMIT;`) seç ve **Run**'a bas. Editör "destructive/yıkıcı işlem" diye onay isterse onayla.
4. **Kırmızı hata yok** ve "Success" görüyorsan bitti.

### 3.6 Doğrula
- PART 1'deki **1a, 1b, 1c**'yi tekrar çalıştır: 1a'da silinen ASIN'ler yok, 1b'de test satışı yok (gerçek satış varsa hâlâ orada), 1c boş.
- Denetim kaydı: yeni sorguda `select action, table_name, old_row, new_row, changed_at from public.audit_log where table_name = 'cleanup_test_data' order by id desc limit 5;` Silinen satış satırlarının bir kopyası `old_row` içinde `sale_events` altında durur; her silinen kayıt ayrıca `table_name = 'opportunities'`, `action = 'DELETE'` satırıyla kayda geçer.
- Vitrin: sitenin ana sayfasını yenile. Ürün sayfaları en fazla 1 dakika önbellekte tutulur; 1–2 dakika sonra test ürünleri kaybolur, ürün adresleri "bulunamadı" sayfasına döner.
- Betik sonrasında koruma tetikleyicileri tekrar açıktır (betik bunu kendisi kontrol eder; kontrol tutmazsa her şeyi geri alır).

### 3.7 Bir şey ters giderse
- Hata verirse: hiçbir şey silinmemiştir (tek işlem; hata her şeyi geri alır).
- Yanlış şeyi sildiysen: 3.1'deki yedekten geri yükleme gerekir (`docs/LAUNCH-CHECKLIST.tr.md` → Geri alma). Bu yüzden 3.1 atlanmaz.

---

## Adım 4. GitHub: depoyu Private yap, birleştir, CI'ın ilk çalışmasını izle

**Öncelik:** Launch-blocker (sunucu ve Vercel kodu buradan alır). **Süre:** 30–45 dakika.
**Durum:** Yerelde `origin` = `https://github.com/ridvanyigit/vindera-workspace.git` tanımlı. Yeni çalışmanın **hiçbiri** GitHub'da değil: `launch-hardening` dalı (Faz 0–9, birkaç düzine dosya) yalnızca bilgisayarında. Ayrıca yerel `main`, GitHub'daki `main`'den 1 commit ilerde (plan dosyası). Hepsi aşağıdaki adımlarda birlikte gider.
**CI hakkında:** `.github/workflows/ci.yml` şimdiye dek GitHub'da **hiç çalışmadı**; ilk çalışmada bir hata çıkabilir (bu normal ve bilinen bir belirsizlik; 4.4'e bak).

### 4.1 Depoyu Private yap
1. Tarayıcıda `https://github.com/ridvanyigit/vindera-workspace` → **Settings** → aşağıda **Danger Zone** → **Change repository visibility** → **Change to private** → onay.
2. **Doğrula:** Gizli pencerede depo adresini aç: "404" görmelisin.
3. Depo daha önce herkese açıktıysa, geçmişteki her şey görülmüş olabilir. Git geçmişindeki dosya adlarını kontrol ettim: hiçbir dosyada gerçek bir `.env`, anahtar ya da sertifika adı yok, yalnızca `*.example` şablonları var (dosya **içeriklerini** tek tek taramadım). Yine de **Adım 5'te anahtarları yenile**, en güvenlisi bu.
4. GitHub hesabında 2 adımlı doğrulamayı (2FA) aç (Settings → Password and authentication).

### 4.2 Dalı GitHub'a gönder
Terminal:
```bash
cd ~/Desktop/vindera-workspace
git status                       # "nothing to commit, working tree clean" görmelisin
git branch --show-current        # launch-hardening
git push -u origin launch-hardening
```
Şifre sorarsa GitHub şifren değil, bir **Personal Access Token** (GitHub → Settings → Developer settings → Personal access tokens) ya da `gh auth login` gerekir. Daha önce `main`'i gönderebildiysen büyük ihtimalle hazırdır.

### 4.3 Pull Request aç ve CI'ı izle
1. GitHub'da depo sayfasında sarı bir şerit çıkar: **Compare & pull request**. Tıkla. `base: main` ← `compare: launch-hardening` olmalı. **Create pull request**.
   (CI yalnızca `main`'e push ve Pull Request'lerde çalışır; bu yüzden dalı doğrudan `main`'e itmiyoruz, önce PR ile sınıyoruz.)
2. PR sayfasının altında **Checks** bölümü: dört iş çalışır — *Backend tests*, *Frontend*, *Database* (yerel Supabase'i Docker'da kurar), *Deployment files*. Her biri birkaç dakika sürer (toplam yaklaşık 10–15 dk).
3. Hepsi **yeşil ✓** olunca PR sayfasında **Merge pull request** → **Confirm merge**. (Varsayılan "Create a merge commit" iyi.)
4. Yerelde `main`'i güncelle:
   ```bash
   git switch main
   git pull
   git log --oneline -3
   ```
5. GitHub **Settings → Secrets** bölümüne **hiçbir şey ekleme**: CI gizli anahtar istemez (bilerek).

### 4.4 CI kırmızı çıkarsa ne yapılır
1. **Birleştirme.** Kırmızı ✗ ile `main`'e geçme.
2. PR sayfasında kırmızı işin yanındaki **Details** (ya da **Actions** sekmesi → kırmızı çalıştırma) → soldan ✗ işaretli işi aç → ✗ işaretli adımı genişlet → **son 30 satırı** kopyala. Anahtar/şifre içermez. Bana yapıştır; nedenini bulup dalda düzeltirim (dala yeni commit gelince CI kendiliğinden yeniden çalışır).
3. Bilinen olası nedenler (hepsi yapılandırma; kod değil):
   - `Unable to resolve action` / sürüm bulunamadı → action sürümlerini (`checkout@v4`, `setup-node@v4`, `setup-uv@v6`, `supabase/setup-cli@v1`) bir güncelleme ile düzeltiriz.
   - Python 3.14 indirilemedi (uv) → Python sürümü ayarı.
   - *Database* işi zaman aşımı ya da Docker hatası → sağ üstten **Re-run failed jobs** ile bir kez daha dene; yine düşerse bana yaz.
   - Kırmızı bir **test** → gerçek bir hata olabilir; hata metnini gönder.
4. GitHub Free planında özel depolar için aylık ücretsiz Actions dakikası sınırlıdır (2 000 dakika civarı, güncelini GitHub Billing sayfasında gör); her CI çalışması yaklaşık 10–15 dakika tutar. Gereksiz "Re-run" yapma.

### 4.5 Sonrası
Sunucu kodu `main`'den `git clone`/`git pull` ile alır (`docs/DEPLOY.md` bölüm 5 ve 15); Vercel de `main`'i izler (Adım 10). Dal koruma kuralı (Settings → Branches) şimdilik zorunlu değil; ileride "PR olmadan main'e itme" kuralı eklenebilir.

---

## Adım 5. Gizli anahtarları yenile, yenilerini üret

**Öncelik:** Launch-blocker. **Süre:** 30 dakika. **Neden:** Bir anahtarın bir yere (sohbet, ekran görüntüsü, eski depo) düşmüş olma ihtimali varsa değiştirmek ucuzdur, sızmış anahtar pahalıdır. Yenilerini bir **şifre yöneticisine** yaz (1Password, Bitwarden, iCloud Anahtar Zinciri...).

### 5.1 Servis anahtarlarını yenile (yeni bir tane oluştur, eskisini iptal et)
| Değer | Nerede | Not |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → **API** (ya da **API Keys**) | Panelin sunduğu seçeneğe göre: yeni "secret" anahtar oluştur + eskisini iptal et, ya da `service_role` için **Reset/Roll** kullan. **Dikkat:** JWT Secret'ı yenilersen `anon` anahtarı ve açık oturumlar da değişir; o zaman Vercel'deki `NEXT_PUBLIC_SUPABASE_ANON_KEY` da güncellenmeli. Menü adları Supabase sürümüne göre biraz değişebilir; emin olamazsan ekranı tarif et |
| `OPENAI_API_KEY` | platform.openai.com → API keys → **Create new secret key** | Eskisini **Revoke** et |
| `KEEPA_API_KEY` | keepa.com → hesabın API / "Access Key" bölümü | Yenileme seçeneği yoksa Keepa desteğine yaz |
| `PUSHOVER_API_TOKEN` (+ `PUSHOVER_USER_KEY`) | pushover.net → Your Applications → **Create an Application/API Token** (yeni uygulama), eskisini sil | `PUSHOVER_USER_KEY` ana sayfada "Your User Key" olarak durur, değişmez |

### 5.2 Kendi rastgele değerlerini üret
Terminalde **her değer için ayrı ayrı** çalıştır ve çıktıyı şifre yöneticisine kaydet:
```bash
openssl rand -hex 32
```
| Değer | Ne işe yarar | Nereye yazılır |
|---|---|---|
| `AUTOMATION_SHARED_SECRET` | n8n'in backend'e kendini tanıtması | Sunucuda `.env.prod`; n8n'deki "Vindera Automation Key" kimlik bilgisi (Adım 12); yerelde `/.env` |
| `METRICS_TOKEN` | Prometheus'un `/metrics`'e girmesi | Sunucuda `.env.prod`; yerelde `/.env` ve `infrastructure/monitoring/secrets/metrics_token` (tek satır) |
| `N8N_ENCRYPTION_KEY` | n8n'in kayıtlı kimlik bilgilerini şifrelemesi | Sunucuda `.env.prod`. **Bir kopyasını şifre yöneticinde sakla**; kaybedersen n8n'de kayıtlı kimlik bilgileri okunamaz |
| `GRAFANA_ADMIN_PASSWORD` | Grafana girişi | Sunucuda `.env.prod`; yerel Grafana için `infrastructure/monitoring/.env` |

Canlıda `AUTOMATION_SHARED_SECRET` ve `METRICS_TOKEN` 32 karakterden kısaysa backend **başlamaz** (bilerek). Üretimde yerel ve sunucu değerlerini farklı tut.

### 5.3 Doğrula
Anahtarları yeni yerlerine yazdıktan sonra Adım 9'un duman testi (`smoke_auth.sh`) ve Adım 15'in gerçek taraması bunları uçtan uca doğrular. Eski anahtarların gerçekten iptal edildiğini ilgili panelde gör.

---

## Adım 6. Hesaplar ve maliyetler

**Öncelik:** Launch-blocker. Yazılımın hazırladığı her şey burada bitiyor; hesap ve para tarafı senin. Ben hiçbir hesap açmadım. **Tüm hesaplarda 2 adımlı doğrulamayı (2FA) aç.**

| Ne | Ne için | Not |
|---|---|---|
| **Alan adı** | `www.`, `api.`, `n8n.` adresleri | Herhangi bir kayıt şirketi |
| **Hetzner Cloud** (ya da başka bir AB VPS) | Backend, n8n, izleme | Ubuntu 24.04, 2 vCPU / 4 GB yeterli (ör. CX22), Falkenstein/Nürnberg |
| **Supabase** (zaten var) | Veritabanı, giriş, dosyalar | **Pro plan önerilir:** günlük yedek, projenin duraklatılmaması. Ücretsiz planda proje bir süre kullanılmazsa duraklar |
| **Vercel** | Frontend | Vercel'in ücretsiz **Hobby** planı şartlarına göre **ticari olmayan** kullanım içindir; iş için site **Pro plan** gerektirebilir. Güncel şartları vercel.com/legal'dan oku ve buna göre seç |
| **GitHub** (zaten var) | Kod deposu | Depo **Private** olmalı (Adım 4) |
| **OpenAI** | Yapay zekâ | platform.openai.com → **Settings → Billing → Limits**: **aylık harcama limiti** koy (ör. küçük bir tutar) ve e-posta uyarısı aç |
| **Keepa** | Amazon fiyat ve geçmiş verisi | Ücretli plan (token'lı). Gerçek BuyBox ve fiyat geçmişi ücretli plan ister. Her tarama token harcar; token biterse tarama başarısız olur ve tek bir Pushover bildirimi gelir |
| **Pushover** | Telefon bildirimi | Uygulamayı telefona kur; API token ve User Key al (Adım 5) |
| İsteğe bağlı: **Sentry**, **UptimeRobot**, **healthchecks.io** | Hata takibi, "site kapandı" uyarısı, "yedek gelmedi" uyarısı | Üçünün de ücretsiz katmanı var (Adım 13, 14) |

**Doğrula:** Şifre yöneticinde her hesap için giriş bilgisi ve (varsa) kurtarma kodları duruyor; her hesapta 2FA açık.

---

## Adım 7. Supabase panelinde kontroller

**Öncelik:** Launch-blocker. **Süre:** 20 dakika. Supabase Dashboard'da, projende:

1. **Plan ve yedek:** Project Settings → Billing: Pro plan; Database → **Backups**: günlük yedekler listeleniyor. PITR (istediğin ana geri dönme) isteğe bağlı eklentidir; veri arttıkça düşün.
2. **Bölge:** Project Settings → General: bölge bir **AB bölgesi** olmalı. Gizlilik metni "Frankfurt" diyor; farklıysa `frontend/src/app/datenschutz` metni avukatla birlikte düzeltilmeli (Adım 16).
3. **Yalnızca sen adminsin.** SQL Editor:
   ```sql
   select user_id, email from public.admin_users;                 -- yalnızca senin e-postan
   select id, email, created_at from auth.users order by created_at;   -- tanımadığın kullanıcı olmamalı
   ```
   Tanımadığın bir kullanıcı varsa Authentication → Users'tan sil ve bana haber ver. (Henüz admin eklemediysen `admin_users` boş çıkar; Adım 11'de eklersin.)
4. **Fatura klasörü private mi ve gevşek politika var mı?** SQL Editor:
   ```sql
   select id, public from storage.buckets where id = 'invoices';    -- public = false
   ```
   Sonra Storage → **Policies** → `storage.objects` altındaki her politikayı oku. Herkese (`public`/`anon`) okuma izni veren ya da koşulsuz bir politika varsa sil. (Bunu otomatik bulamam; migration yalnızca kendi yazdığı politikaları yönetir.)
   **Doğrula:** Gizli pencerede eski bir fatura linkini aç: açılmamalı.
5. **Realtime** (tarama bitince ekranın kendiliğinden yenilenmesi): SQL Editor: `select tablename from pg_publication_tables where pubname = 'supabase_realtime';` sonucunda `opportunities` yer almalı.
6. **Şifre kuralı:** Authentication → Sign In / Providers → Email: en az şifre uzunluğunu 12 yap (varsa).
7. **Site URL ve yönlendirme adresleri** alan adın belli olunca Adım 10'da girilir.

---

## Adım 8. `business_settings` sayılarını gerçek değerlerle doldur

**Öncelik:** Launch-blocker. **Süre:** 30 dakika araştırma. **Bu adım ilk gerçek taramadan (Adım 15) ÖNCE yapılmalı.** Kâr hesabı ve "almama kuralı" bu tablodaki sayılara dayanır. Şu anki değerler **yer tutucudur (varsayım)**; onlarla çıkan "kâr" gerçek değildir.

**Nasıl düzenlenir:** Supabase Dashboard → **Table Editor** → `business_settings` → tek satıra tıkla → değerleri düzenle → **Save**. (Backend bu tabloyu 60 saniyede bir yeniler; kaydettikten en geç 1 dakika sonra yeni sayılarla hesaplar.)

| Alan | Şimdiki yer tutucu | Ne yazmalısın / nereden bulursun |
|---|---|---|
| `outbound_shipping_eur` | 6,90 | Ortalama bir paketin Österreichische Post ile gönderim ücreti (post.at → Paket fiyatları; ağırlık/boyut sınıfına göre) |
| `packaging_eur` | 1,50 | Bir paket için ambalaj malzemesi maliyeti |
| `inbound_shipping_eur` | 0 | Amazon'dan sana gelen kargo ücreti (ücretsizse 0) |
| `platform_fee_pct`, `platform_fee_fixed_eur` | 0 / 0 | Willhaben'in satış başına aldığı komisyon (hesap türüne ve kategoriye göre; Willhaben'in güncel ücret tablosuna bak) |
| `payment_fee_pct` | 0 | Ödeme yönteminin komisyonu (kullandığın ödeme yöntemine göre; Willhaben/PayPal koşullarına bak) |
| `return_reserve_pct` | 3 | İade için ayırdığın pay (%): kendi deneyimine göre gerçekçi bir değer |
| `min_net_margin_pct`, `min_net_profit_eur` | 25 / 15 | "Almama" kuralı: net marj (maliyet üzerinden) ve net kâr alt sınırı. İkisi birlikte sağlanmalı; eşit olması yeterli |
| `vat_threshold_eur`, `vat_warn_pct` | 55000 / 80 | Kleinunternehmer sınırı: **Steuerberater'inle doğrula** (Adım 16) |
| `return_window_days` | 30 | Amazon.de iade süresi (kategoriye göre değişebilir, kontrol et) |
| `listing_payment_text` | mevcut metin | İlana eklenen ödeme cümlesi. Değiştirirsen ilanlarda aynen görünür |
| `listing_legal_footer` | boş | Avukat onayladıktan sonra ilanın altına eklenecek yasal metin. **Ben yazmıyorum.** |

**Doğrula:** `updated_at` alanı kaydettiğin an güncellenir. Adım 15'teki tarama sonucunda net kâr, bu sayılarla el hesabınla tutar.

---

## Adım 9. Sunucu, alan adı ve backend

**Öncelik:** Launch-blocker. **Süre:** yarım gün. Yazılım hazır: `infrastructure/prod/` (compose, Caddy, Prometheus, örnek ortam dosyası), `backend/Dockerfile`, `infrastructure/backup/`. **Tüm komutlar `docs/DEPLOY.md` içinde sırayla yazılı** (İngilizce, kopyala-yapıştır). Ben hiçbir sunucuya bağlanmadım.

1. **Hesaplar** (Adım 6): alan adı, Hetzner Cloud.
2. **DNS:** `api.<alan>` ve `n8n.<alan>` için sunucu IP'sine **A kaydı** (DEPLOY.md bölüm 3). **Doğrula:** `dig +short api.<alan>` sunucu IP'sini yazar.
3. **Sunucu hazırlığı** (bölüm 4): normal kullanıcı, yalnızca SSH anahtarıyla giriş, güvenlik duvarı, Docker. Hetzner **Cloud Firewall**'da yalnızca 22, 80, 443 (tcp) ve 443 (udp) açık olsun.
4. **Kod** (bölüm 5): Adım 4'ten sonra depo Private ve `main` güncel; sunucuda salt-okunur bir "deploy key" ile `git clone`.
5. **`.env.prod`** (bölüm 6): Adım 5'teki değerlerle doldur. Dosyayı kimseye gösterme, sohbete yapıştırma.
6. **İlk başlatma** (bölüm 7) ve **duman testi** (bölüm 8). **Doğrula:** kendi bilgisayarında:
   ```bash
   BEHIND_PROXY=1 EXPECT_PRODUCTION=1 BASE_URL=https://api.<alan> backend/scripts/smoke_auth.sh
   ```
   sonunda "All checks passed" yazmalı.
7. Backend'in CORS ayarını (`CORS_ALLOWED_ORIGINS`) frontend adresinle aynı yap (Adım 10'dan sonra; DEPLOY.md bölüm 9.5).

**Bilmen gereken:** Sunucu tarafında (sertifika alma, güvenlik duvarı, Docker Engine, Vercel, n8n ilk kurulum ekranları) henüz **hiçbir şey gerçek bir sunucuda denenmedi**; tüm dosyalar yerelde doğrulandı. İlk kurulumda takıldığın adımın çıktısını (anahtarsız) bana yapıştır. DEPLOY.md bölüm 18 doğrulananları ve doğrulanmayanları listeler.

---

## Adım 10. Vercel (frontend) ve Supabase adres ayarları

**Öncelik:** Launch-blocker. **Süre:** 30 dakika. (DEPLOY.md bölüm 9 ile aynı.)

1. Vercel → **Add New → Project** → GitHub'daki `vindera-workspace` deposunu içe aktar (Vercel, Private depo için GitHub'dan izin ister; ver). **Root Directory: `frontend`**. Framework: Next.js (otomatik). Node.js: 24. Plan konusu için Adım 6'ya bak.
2. **Settings → Environment Variables** (Production ve Preview), tam olarak dört değişken (`frontend/.env.example` dosyasındaki gibi):
   - `NEXT_PUBLIC_SUPABASE_URL` = Supabase proje adresin
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = **anon** anahtar (asla `service_role` değil!)
   - `NEXT_PUBLIC_API_URL` = `https://api.<alan>`
   - `NEXT_PUBLIC_SITE_URL` = `https://www.<alan>` (sonunda `/` yok)
   Bu değişkenler build sırasında okunur: birini değiştirirsen yeniden deploy et.
3. **Deploy.** Sonra **Settings → Domains**: `www.<alan>` (ve çıplak alan) ekle, Vercel'in gösterdiği DNS kayıtlarını alan adı sağlayıcında oluştur.
4. Backend'in `CORS_ALLOWED_ORIGINS` değerini tam bu frontend adresi yap (`https://www.<alan>`) ve sunucuda uygula: `docker compose --env-file .env.prod up -d backend`.
5. Supabase Dashboard → **Authentication → URL Configuration**: **Site URL** = `https://www.<alan>`; **Redirect URLs**'e aynı adresi ekle.
6. **Doğrula:**
   - `https://www.<alan>/robots.txt` içindeki "Sitemap:" satırı gerçek alan adını göstermeli; `/sitemap.xml` satırları da (yanlışsa `NEXT_PUBLIC_SITE_URL` eksiktir; `http://localhost:3000` görürsen değişken girilmemiş demektir).
   - `https://www.<alan>/impressum` ve `/datenschutz` açılıyor.
   - Vitrinde (Adım 3'ten sonra) test ürünü yok.
   - Yeni backend ve yeni frontend canlıda birlikte olduğundan Adım 1'deki uyumsuzluk ortadan kalkmış olur.
7. Vercel'de "Production Branch" = `main` olmalı (varsayılan).

---

## Adım 11. İlk admin kullanıcısı ve hesap güvenliği

**Öncelik:** Launch-blocker. **Süre:** 10 dakika. (DEPLOY.md bölüm 11.)

1. Supabase Dashboard → **Authentication → Users → Add user → Create new user**: e-postan + **uzun ve benzersiz bir şifre** (şifre yöneticisiyle üret), **Auto Confirm User** kutusunu işaretle.
2. **SQL Editor:**
   ```sql
   insert into public.admin_users (user_id, email)
   select id, email from auth.users where email = 'SENIN-EPOSTAN';
   select * from public.admin_users;     -- tam olarak bir satır: sen
   ```
3. `https://www.<alan>/admin/login` adresinden gir. **Doğrula:** panel kırmızı hata şeridi olmadan açılıyor.
4. **Hesap güvenliği hakkında dürüst not:** Uygulamada **admin girişi için ek doğrulama (MFA) yok**; bu özellik (kayıt ve giriş ekranları, backend'de doğrulama seviyesi kontrolü) yazılmadı, sonraya bırakıldı (Adım 24). Şimdiki koruma: herkese açık kayıt kapalı (Adım 2), yalnızca sen `admin_users`'dasın, backend her istekte bunu kontrol eder. Bu yüzden **uzun ve benzersiz şifre** şart. **Yapabileceğin asıl MFA**, işin anahtarını tutan diğer hesaplarda: Supabase, GitHub, Vercel, Hetzner, alan adı sağlayıcı, OpenAI, e-posta hesabın (Adım 6). Supabase panelindeki "Multi-Factor" ayarı yalnızca uygulamanın arayüz desteğiyle işe yarar; o destek olmadığı için tek başına bir şey değiştirmez.

---

## Adım 12. n8n: günlük tarama

**Öncelik:** Launch-blocker. **Süre:** 30 dakika. (DEPLOY.md bölüm 12.)

1. **`https://n8n.<alan>` adresini açar açmaz** n8n'in "owner account" oluşturma ekranı gelir. **Hemen** güçlü bir şifreyle oluştur (o ana kadar adres herkese açıktır).
2. **Workflows → Import from file** → `n8n/Vindera_Daily_Scan.json`.
3. **Credentials → Add credential → Header Auth**: **Name:** `Vindera Automation Key` · **Header Name:** `X-Vindera-Key` · **Header Value:** `.env.prod`'daki `AUTOMATION_SHARED_SECRET` değeri → Save. Workflow'daki **HTTP Request** düğümlerinin her birinde bu kimlik bilgisini seç.
4. Backend adresi (`VINDERA_API_BASE_URL`) sunucu compose'unda zaten `http://backend:8000`'e ayarlı; dokunma.
5. **Execute workflow** ile bir kez elle çalıştır. **Doğrula:** Supabase → Table Editor → `scan_jobs` içinde yeni satırlar (`succeeded`, `rejected` ya da nedeni okunur şekilde `failed`, ör. Keepa token bitti). İki HTTP düğümü yeşil (202) dönmeli; anahtarı yanlış girdiysen 401 alırsın. Sonra workflow'u **Active** yap.
6. **İzlenen ürün listesi (watchlist):** günlük taranan ASIN'ler n8n'de değil veritabanında: Table Editor → `watchlist_asins`. Bir ürünü durdurmak için `active` alanını kapat; yeni ürün için satır ekle (ASIN 10 karakter, BÜYÜK harf/rakam). n8n her sabah 08:15'te (Viyana saati) aktif olanları alır. **Doğrula:** Execute sonrası "Fetch Watchlist" çıktısında `asins` listesi görünür; admin panelinde AI Terminal → **Scans** listesinde her ASIN için bir satır çıkar.
7. **Çift tarama uyarısı:** Bilgisayarındaki **yerel** n8n (`localhost:5678`) de aynı işi yapar. Canlı n8n **Active** olunca yerel n8n'i durdur (`cd n8n && docker compose stop`); yoksa aynı ürünler iki kez taranır ve Keepa token'ları iki kat harcanır.
8. Workflow'u yerelde değiştirirsen (`n8n/Vindera_Daily_Scan.json`) canlı n8n'e yeniden içe aktarman gerekir. İçe aktardığın n8n sürümünü sabitle (`N8N_IMAGE_TAG`, DEPLOY.md bölüm 12).

---

## Adım 13. Yedekleme ve geri yükleme provası

**Öncelik:** Launch-blocker (canlıda gerçek veri birikmeden önce). `infrastructure/backup/backup.sh` veritabanının (tablolar + giriş hesapları) ikinci, bağımsız bir kopyasını alır. **Fatura dosyaları (Storage) dahil değildir.** (DEPLOY.md bölüm 14.)

1. **Supabase'in kendi yedeği önce gelir:** Pro plan (Adım 7). Dashboard → Database → Backups'ta yedek göründüğünü gör.
2. **Script'i kur:** `backup.env` dosyasını oluştur (`SUPABASE_DB_URL` = Dashboard → **Connect** → **Session pooler** bağlantı metni, veritabanı şifrenle), günlük cron satırını ekle.
3. **Şifreleme (önerilir):** kendi bilgisayarında `brew install age`, `age-keygen -o vindera-backup.key`. `age1...` ile başlayan **açık** anahtarı `BACKUP_AGE_RECIPIENT`'e yaz. `.key` dosyasını şifre yöneticinde sakla, **sunucuya koyma**; kaybedersen şifreli yedekler açılamaz.
4. **healthchecks.io** (ücretsiz) adresini `BACKUP_PING_URL`'e yaz: günlük yedek gelmezse sana haber verir.
5. **Sunucu dışına kopya:** yedek klasörünü (`/var/backups/vindera`) düzenli olarak başka bir yere kopyala (Hetzner Storage Box, başka bir bulut hesabı). Aynı sunucudaki yedek, sunucu giderse birlikte gider.
6. **Geri yükleme provası (bir kez şimdi, sonra 3 ayda bir):** DEPLOY.md bölüm 14'teki komutlarla bir yedeği kendi bilgisayarındaki geçici bir veritabanına yükle ve satır sayılarını kontrol et. **Doğrula:** `pg_restore` hatasız biter, sayılar canlıdakilerle uyuşur.
7. **Fatura dosyaları için:** Dashboard → Storage → `invoices` içindeki dosyaları ara sıra indir (ya da asıllarını sakla).
**Doğrulanmayan:** Session pooler bağlantı metniyle script, cron ve yeni bir Supabase projesine tam yeniden kurulum gerçek ortamda denenmedi; felaket durumunda önce Supabase'in kendi geri yüklemesini kullan.

---

## Adım 14. İzleme ve uyarılar

**Öncelik:** Launch-blocker (UptimeRobot); diğerleri önerilir. **Süre:** 30 dakika.

1. **UptimeRobot (ya da benzeri):** hesap aç → **Add New Monitor** → tür HTTP(s) → adres `https://api.<alan>/healthz` → 5 dakikada bir → kapanınca e-posta/telefon bildirimi. Bu bugün çalışan tek "kapandı" alarmıdır. `/healthz` uygulamanın ayakta olduğunu, `/readyz` veritabanına ulaşılabildiğini söyler (ulaşılamazsa 503).
2. **Sentry (isteğe bağlı, önerilir):** sentry.io'da proje (platform Python/FastAPI), verdiği DSN'i sunucuda `.env.prod` içine `SENTRY_DSN="..."` yaz, backend'i yeniden başlat. İstek içerikleri, Authorization başlığı ve kullanıcı bilgisi gönderilmeden silinir. **Doğrula:** log'da "Sentry error tracking is active" satırı. Frontend için Sentry kurulmadı (Adım 24): tarayıcı hataları şimdilik hiçbir yere raporlanmıyor.
3. **Grafana (sunucuda):** hiçbir zaman internetten açılmaz; `ssh -L 3002:127.0.0.1:3002 vindera@<sunucu>` yaz, sonra tarayıcıda `http://localhost:3002` (kullanıcı `admin`, şifre `.env.prod`'daki `GRAFANA_ADMIN_PASSWORD`). Faydalı sorgular: `vindera_scan_jobs_total`, `vindera_keepa_tokens_left`, `vindera_openai_errors_total`.
4. **Prometheus uyarı kuralları** (`infrastructure/monitoring/alerts.yml`, 5 kural: BackendDown, HighServerErrorRate, ScanJobsFailing, KeepaTokensLow, OpenAIErrors) yalnızca Prometheus içinde "firing" olur; **kimseye bildirim göndermez** (e-posta/Pushover için Alertmanager gerekir, Adım 24). Günlük rutinde Grafana'ya bakarak izlersin.
5. **Bilgisayarındaki yerel monitoring (Faz 8 değişikliği):** `infrastructure/monitoring/docker-compose.yml` değişti: Grafana/Prometheus yalnızca bu bilgisayardan açılır (`127.0.0.1`), `admin` varsayılan şifresi kaldırıldı, `GRAFANA_ADMIN_PASSWORD` **zorunlu**. Çalışan kapsayıcılarına dokunmadım; değişiklik, sen `cd infrastructure/monitoring && docker compose up -d` çalıştırınca devreye girer (alert kurallarını yüklemek için zaten çalıştıracaksın).
   - `infrastructure/monitoring/.env` dosyanda zaten `GRAFANA_ADMIN_PASSWORD=...` satırı varsa hiçbir şey yapma. Yoksa `.env.example`'ı `.env` olarak kopyalayıp şifre yaz; yoksa komut "GRAFANA_ADMIN_PASSWORD is missing" ile durur (bilerek).
   - Prometheus'un `metrics_token` dosyası: `infrastructure/monitoring/secrets/metrics_token.example` dosyasını aynı klasörde `metrics_token` adıyla kopyala, içine `METRICS_TOKEN` değerini tek satır yaz (git'e girmez).
   - Grafana şifreyi ilk açılışta diske yazar; değişkeni sonradan değiştirmek giriş şifresini değiştirmez. Değiştirmek için: `docker exec vindera_grafana grafana cli admin reset-admin-password <yeni-şifre>`. Eski varsayılan `admin` şifresiyle giriyorsan bunu yap.
   - **Doğrula:** http://localhost:9090/alerts sayfasında 5 kural görünür.
6. Loglar: sunucuda `docker compose --env-file .env.prod logs --tail 100 backend` (JSON satırları; her isteğin `X-Request-Id` numarası vardır, bir hata olunca aynı numarayı log'da bulabilirsin; gizli anahtarlar loglara yazılmaz).
7. Backend yeniden başlarken 15 dakikadan uzun süredir "queued/running" görünen tarama işleri otomatik "failed — interrupted by restart" olur (log'da "Closed N scan job(s)").

---

## Adım 15. İlk gerçek tarama (gerçek Keepa, OpenAI ve Pushover anahtarlarıyla)

**Öncelik:** Launch-blocker. **Süre:** 30–45 dakika. **Neden:** Keepa'nın yanıt biçimi Keepa'nın resmî istemci kaynaklarından uygulandı, ancak **canlı bir Keepa yanıtıyla hiç denenmedi**. 90 günlük BuyBox ortalamasını (`stats.avg90[18]`) düz bir fiyat olarak okuduğumuz bir varsayımdır; canlı yanıt farklıysa kod Amazon ortalamasına geri düşer. Bu tek tarama bu belirsizliği kapatır. **Ayrıntılı kontrol listesi: `docs/LAUNCH-CHECKLIST.tr.md` → "İlk gerçek tarama".**

Kısaca:
1. Adım 5, 8, 9, 10, 11 tamam olsun (yeni anahtarlar canlıda, `business_settings` gerçek).
2. Admin panelinden AI Terminal'e `/scan <GERÇEK-ASIN>` yaz (Amazon.de'de gerçekten satılan, gözünün önünde fiyatı olan bir ürün).
3. **Scans** düğmesinde sonucu izle: `succeeded` ya da `rejected` beklenir (`rejected` de geçerli bir sonuçtur: hesap yapıldı, kural reddetti). `failed` ise nedeni okunur.
4. **Özellikle kontrol et:** (a) Keepa'nın ürün sayfasındaki "Buy Box" 90 günlük ortalaması ile kayıttaki referans fiyat aynı büyüklükte mi; (b) fiyat geçmişi grafiği Keepa'nın grafiğiyle uyuşan, gerçek günlük noktalar mı (eski sahte "6 satır" kalıbı değil); (c) BuyBox satıcısı doğru mu; (d) net kâr el hesabınla tutuyor mu; (e) Pushover ve OpenAI çalıştı mı.
5. Aynı ASIN'i bir kez daha tara: yeni satır eklenmemeli (tek açık kayıt), yeni bildirim gelmemeli.
6. Bir şey tutmuyorsa (Keepa'dan gelen sayı beklediğinden farklı), **anahtarları paylaşmadan** hangi sayının yanlış olduğunu ve Keepa sayfasındaki karşılığını bana yaz.

---

## Adım 16. Yasal ve vergi işleri (bunlar yazılımla çözülmez; paralel yürüt)

**Öncelik:** Launch-blocker (düzenli satıştan önce). **Ben avukat ya da vergi danışmanı değilim.** Aşağıda **cevap değil soru** var: bunları Steuerberater'ine, avukatına ve ilgili kurumlara götür. Süreleri uzundur, **bugün başla.**

### 16.1 Gewerbeanmeldung (işletme kaydı)
- Düzenli satıştan önce **Gewerbeanmeldung** (Handelsgewerbe) gerekir. Nereden: WKO, ilgili Gewerbeamt/Bezirkshauptmannschaft ya da USP (Unternehmensserviceportal).
- Sor: Hangi Gewerbe tanımı ve faaliyet metni doğru (Amazon'dan alıp Willhaben'de satmak)? Kaydın satış başlamadan önce mi tamamlanması gerekiyor?
- Verilince `frontend/src/lib/legal.ts` içindeki `tradeLicense` satırını güncelle (şu an "Anmeldung in Vorbereitung").

### 16.2 Steuerberater'e sorular
1. **Kleinunternehmer sınırı:** Sınır aşılırsa KDV yükümlülüğü **ne zaman** başlar, tolerans kuralı var mı, hangi tutar esas (iade düşülmüş ciro)? (`business_settings.vat_threshold_eur` = 55 000 bir varsayımdır.)
2. **E/A-Rechnung:** Alışlar (stoktaki ürünler dahil) hangi yıla ve nasıl gider yazılır? Raporun "Cash (E/A)" görünümü yalnızca yönetim amaçlıdır; senin için yeterli mi? CSV dışa aktarımı (Reports → Export CSV) Steuerberater'in için yeterli mi?
3. **Alış şekli:** Amazon'dan özel kişi olarak mı, işletme olarak mı almalısın? Faturalar işletme adına mı olmalı? **Amazon Business** hesabı gerekli mi?
4. **Kleinunternehmer fatura notu:** Faturalarda § 6 Abs 1 Z 27 UStG notu tam olarak nasıl yazılmalı?
5. **Registrierkassenpflicht:** Nakit satışlar (Barzahlung bei Abholung) için kasa/fiş yükümlülüğü var mı?
6. **SVS ve gelir vergisi planı:** SVS (sosyal sigorta) ne zaman ve ne kadar; Einkommensteuer için ön ödeme (Vorauszahlung) planı nasıl olmalı?
7. Satış defteri (`sale_events`) ve iade kayıtlarının saklama süresi ve biçimi yeterli mi?

### 16.3 Avukata sorular (Impressum, Datenschutz, Willhaben ilan metni)
Yazılım yalnızca teknik kısmı yaptı: sana ait bilgiler (ad, adres, e-posta, Steuernummer, Gewerbe durumu) **tek dosyada**: `frontend/src/lib/legal.ts`. Impressum, Datenschutz ve sayfa altbilgisi buradan okur. **Metinleri ben yazmadım.** Canlıya çıkmadan gözden geçirtilecek noktalar:
1. **Impressum, "Vertragspartner" cümlesi:** Metin "Vindera sözleşmenin tarafı değildir, sözleşme alıcı ile Willhaben'deki satıcı arasında kurulur" diyor. Willhaben'de satıcı sensin. Bu cümle doğru mu, nasıl yazılmalı?
2. **İletişim e-postası:** `info@rai-recht.at` alan adı işinle mi ilgili, başka bir firmaya mı ait? Yayına almadan doğru adres olduğundan emin ol.
3. **Datenschutz, hosting paragrafı:** Şu an genel ("Cloud-Hosting-Anbieter"). Hosting sağlayıcılarını (Hetzner, Vercel, Supabase, OpenAI, Keepa, Pushover) ve sunucu konumlarını sayması gerekir mi; sözleşmeler (Auftragsverarbeitung) gerekli mi? Supabase paragrafı Frankfurt bölgesini söylüyor; bölgeyi Adım 7'de doğrula.
4. **Tarayıcı depolaması:** Vitrin, "son görüntülenenler" listesini tarayıcının kendi hafızasında (localStorage) tutar. Bu çerez/izin (Einwilligung) gerektirir mi, gizlilik metnine yazılmalı mı?
5. **Gewährleistung ve Widerrufsrecht (FAGG):** Kargoyla satışlarda alıcıya hangi bilgiler verilmeli (cayma hakkı, garanti/Gewährleistung)? İlan metnine ve sayfalara ne eklenmeli? (`listing_legal_footer` alanına yazılacak metni avukat verir.)
6. **Willhaben ilan metni:** Ödeme cümlesi (`listing_payment_text`) ve ilan şablonu uygun mu?
7. Impressum'daki "Gewerbeberechtigung" ifadesi Gewerbeanmeldung sonrası nasıl olmalı?

### 16.4 Platform koşulları
- **Willhaben:** gewerblich (ticari) satıcı hesabı ve güncel ücret koşulları (Adım 8'deki komisyon alanları buna göre doldurulur).
- **Amazon:** hesap koşulları ve iade politikası (iade süresi kategoriye göre; `return_window_days`).

**Doğrula:** Avukat/Steuerberater onayladıktan sonra `/impressum` ve `/datenschutz` sayfalarını aç, bilgilerin doğru göründüğünü kontrol et; `listing_legal_footer` doldurulmuşsa yeni bir taramada ilanın altında aynen göründüğünü gör.

---

# SOON

## Adım 17. Uçtan uca elle test ve alış / satış / iade akışı

**Öncelik:** Soon. İlk **gerçek** alışverişinden önce bir kez uygula. **Nerede:** yerel ortamda (canlı veritabanında değil): backend + frontend açık, admin girişi yapılmış. Adım adım senaryo ve beklenen rakamlar: **`docs/MANUAL-TEST-SCRIPT.md`**.

Akışın özeti (test bunları doğrular):
- **Mark as Bought** gerçekte ödediğin fiyatı, alış tarihini, sipariş numarasını, gelen kargoyu ve ambalajı kaydeder. Amazon iade son günü (`return_by`) = alış tarihi + `return_window_days`. Taramadaki fiyat yalnızca plandır.
- **Item Sold!** satışı deftere (`sale_events`) yazar. Kârı sunucu hesaplar (senin girdiğin kargo ve ücretler dahil); ekrandaki önizleme yalnızca ön izlemedir.
- **Returned** müşteri iadesidir: iade defterde eksi kayıt olur, ürün karantinada stoğa döner, hedef fiyat **değişmez**.
- **Remove** kayıt silmez, gizler. Satılmış ya da satış geçmişi olan ürün kaldırılamaz (muhasebe kaydı). Stokta kalıp işe yaramayan ürün için durumu **Written Off** yap.
- **Daha önce alınmış ürünler:** yeni alanlar boş kalır; raporun "Cash (E/A)" görünümünde "alış tarihi yok" uyarısı çıkar. Manual Entry → "Purchase Record" bölümünden gerçek fiyat ve tarihi gir.
- **Günlük kontrol (n8n):** iki bildirim türü: 60 günden uzun bekleyen ürünler ve Amazon iade süresi 5 gün içinde dolacak, henüz satılmamış ürünler; her ürün için her türden bir kez.
- **Raporlar:** `Reports` sayfasının "Cash (E/A)" görünümü yönetim aracıdır, vergi beyanı değildir. Steuerberater'e sorularını Adım 16'da bulursun.

## Adım 18. Eski faturalar

Yeni faturalar **özel** klasöre yüklenir ve "View Invoice" ile 10 dakikalık geçici bir linkle açılır. Eskiden yüklenen faturaların herkese açık linkleri artık çalışmaz, ama dosyalar klasörde duruyor: uygulama bu kayıtlarda **"View Invoice (legacy)"** düğmesini gösterir ve dosyayı yine geçici linkle açar. **Zorunlu işlem yok.** İstersen bir eski faturayı **Attach again** ile yeniden yükle; kayıt yeni yapıya (`invoice_path`) geçer. Hiçbir şeyi elle silme.
**Doğrula:** Bir fırsatı aç → "View Invoice" → fatura yeni sekmede açılır. Aynı linki 10 dakika sonra gizli pencerede aç: açılmamalı.

## Adım 19. Eski (uydurma) fiyat geçmişi — karar senin

Eski taramalar her seferinde 6 tane **uydurma** fiyat noktası yazmıştı. Yeni backend bunu yapmıyor; her taramada Keepa'dan **gerçek** 90 günlük geçmişi yazıyor. Ama eski uydurma noktalar veritabanında duruyor ve grafik onları gerçek gibi gösterir. Hangisinin uydurma olduğunu kesin ayırt edemem (elle girilen ürünlerin 2 dürüst noktası da aynı tabloda):
- **Seçenek A (temiz):** Adım 15'ten (gerçek tarama doğrulandıktan) sonra SQL Editor'de `delete from public.price_history;` çalıştır, sonra watchlist'i bir kez tara (gerçek noktalar geri gelir). Elle girdiğin ürünlerin iki referans fiyatı silinir; düzenleme formundan yeniden girebilirsin. **Geri alınamaz: önce Adım 1'deki yedeği al.**
- **Seçenek B:** Hiçbir şey yapma; eski ürünlerde grafik bir süre uydurma noktalar içerir, yeni taramalar gerçek noktaları ekler.
Not: Adım 3'teki test ürünleri silindiğinde onların fiyat noktaları da gider.

## Adım 20. İlk hafta rutini

Günlük 5 dakikalık kontrol, haftalık ve aylık işler **`docs/LAUNCH-CHECKLIST.tr.md` → "İlk hafta rutini"** bölümünde. Kısaca: her gün Grafana/Sentry ve `Scans` listesi, Keepa token'ı, bildirimler; haftada bir defter ile banka/PayPal karşılaştırması; ayda bir Steuerberater için CSV.

---

# LATER

## Adım 21. Otomatik kimlik doğrulama kontrolü
Canlıya her yeni sürümden sonra (ya da bir yapılandırma değişikliğinden sonra):
```bash
BASE_URL=https://api.<alan> BEHIND_PROXY=1 EXPECT_PRODUCTION=1 AUTOMATION_KEY=<AUTOMATION_SHARED_SECRET> METRICS_TOKEN=<METRICS_TOKEN> backend/scripts/smoke_auth.sh
```
Yeşil "All checks passed" görmelisin. Yerelde: `BASE_URL=http://localhost:8000` (`BEHIND_PROXY` ve `EXPECT_PRODUCTION` olmadan). Admin olarak da denemek için `ADMIN_TOKEN=<giriş yapmış admin'in access token'ı>` ekle.

## Adım 22. Yerelde sahte veriyle çalışmak istersen
Keepa/OpenAI anahtarı yokken ya da hata verince tarama sahte fırsat üretmez, **başarısız** olur. Yerelde eskisi gibi örnek veriyle denemek için `.env`'ye `ALLOW_MOCK_DATA=true` ekle (başlıklar `[MOCK]` ile başlar). **Canlıda bu ayar reddedilir** (backend başlamaz).

## Adım 23. Düzenli bakım takvimi
- **Her yıl:** `frontend/src/lib/austriaCalendar.ts` içindeki `STATIC_ITEMS` (okul tatilleri, spor, festival) Eylül 2026 – Eylül 2027'yi kapsar; yılda bir yenilenir. Kleinunternehmer sınırını ve `business_settings`'i (kargo, komisyon) yıllık gözden geçir.
- **3 ayda bir:** geri yükleme provası (Adım 13.6); Docker imajlarını ve n8n sürümünü güncelle (DEPLOY.md bölüm 15).
- **Yılda bir ya da şüphede:** gizli anahtarları yenile (Adım 5).
- **Keepa ve OpenAI harcamasını** ayda bir panelden kontrol et.
- **Kategori listesi** iki dosyada durur (`backend/src/core/categories.py` ve `frontend/src/lib/constants.ts`); değişirse ikisi birlikte güncellenmeli (yazılım işi).

## Adım 24. Bilerek sonraya bırakılanlar (bilgi)
Bunlar planlı değil, ihtiyaç doğarsa yapılacak: admin girişi için **MFA** (arayüz + backend kontrolü), **Alertmanager** (uyarıların e-posta/Pushover ile gelmesi), **frontend Sentry**, Keepa Deals/Tracking webhook'ları, Willhaben karşılaştırma fiyatı araştırması, watchlist yönetim ekranı, tekrarlayan giderler, çoklu adetli partiler, Willhaben satış eşitlemesi, çoklu dil.

---

## Bu rehberde bilmen gereken sınırlar
Yazılım tarafında her şey yerelde denendi (testler, yerel Supabase, Docker imajı, Caddy, yedek betiği). **Gerçek sunucuda, GitHub'da (CI), Vercel'de, Supabase Dashboard'un SQL Editor'ünde ve gerçek Keepa/OpenAI/Pushover ile henüz hiçbir şey denenmedi.** Bu yüzden ilk kez çalıştırdığın adımlarda takılırsan hata metnini (anahtarsız) bana yapıştır. Ayrıntılı liste: `docs/DEPLOY.md` bölüm 18 ve `docs/LAUNCH-PROGRESS.md`.
