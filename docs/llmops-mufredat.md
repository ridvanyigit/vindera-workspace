# Vindera Üzerinden LLMOps / AI Platform Engineering Müfredatı

2026-09-24 · @Robin

## Genel Yaklaşım

Bu müfredatın amacı: her aracı soyut bir "demo proje" üzerinde değil, **gerçek Vindera kod tabanı üzerinde** öğrenmek — sonuçta ya gerçekten kullanılan bir özellik ya da gerçek bir sandbox deneyimi ortaya çıkıyor.

**Çalışma modeli**

- Her modül: (1) resmi dokümantasyon okuması, (2) Vindera üzerinde somut hands-on görev, (3) benimle interaktif çalışma (soru-cevap, kod incelemesi, küçük quizler, "şunu sen dene" görevleri).
- Bir modülü bitirdiğinde bana haber ver, bir sonrakine geçerim. Modül ortasında soru sorman tamamen serbest.
- İçerik büyük olduğu için tamamı tek seferde üretilmeyecek — her modülün detaylı içeriğini, o modüle geldiğimizde sohbette üreteceğim. Bu doküman, tüm müfredatın **iskeleti ve ilerleme takibi** olarak kalacak.

**Güvenlik kuralları (CLAUDE.md ile birebir uyumlu)**

- Tüm pratik çalışma ayrı bir **öğrenme branch'inde** yapılacak, `main`'e asla direkt commit atılmayacak.
- **Hosted Supabase projesine asla bağlanılmayacak** — sadece `supabase start` ile local instance kullanılacak.
- Yeni migration gereken modüllerde (ör. pgvector) her zaman yeni, timestamp'li bir migration dosyası oluşturulacak; var olan migration'lar asla değiştirilmeyecek; `supabase db push` çalıştırılmayacak.
- Prod altyapısını (`infrastructure/prod/`) riske atabilecek modüller (Terraform, Kubernetes) **plan/dry-run seviyesinde** veya tamamen ayrı bir sandbox'ta (minikube/kind, ayrı bir test VPS'i ya da sadece `terraform plan`) yapılacak — gerçek prod'a `apply` sadece sen açıkça isterse ve onaylarsan yapılır.
- Yeni bağımlılık/servis eklerken mevcut CI (`.github/workflows/ci.yml`) ve testler kırılmayacak şekilde ilerlenecek.

## Modül Haritası

| # | Modül / Araç | Vindera'daki Karşılığı | Tip | Neden bu sırada |
|---|---|---|---|---|
| 0 | Ön Hazırlık | Branch, ortam, çalışma disiplini | Koşul | Her şeyin güvenli temeli |
| 1 | LLM Observability — Langfuse | `DealAnalyzerAgent` / `ListingGeneratorAgent` çağrılarına tracing | Core | Sistemi bozmadan eklenebilecek en düşük riskli modül, hemen görünür sonuç verir |
| 2 | LLM Evaluation — Promptfoo / DeepEval / Ragas | Listing metni ve deal skoru kalitesi | Core | Observability ile "neyi izliyoruz" netleşinceye kadar değerlendirme anlamsız |
| 3 | Vector DB — pgvector | Yeni özellik: benzer geçmiş deal/ürün arama | Core (yeni migration) | İlk gerçek migration deneyimi, projeye gerçek değer katan ilk yeni özellik |
| 4 | LLM Gateway — LiteLLM | OpenAI çağrılarının soyutlanması | Core | Observability + eval oturduktan sonra gateway'in sağladığı fayda (model değiştirme, rate limit) daha net görülür |
| 5 | Experiment Tracking — MLflow | Prompt versiyonlarının karşılaştırılması | Core | Modül 2'deki eval metrikleri olmadan MLflow'un loglandıracak bir şey yok |
| 6 | Guardrails & PII — NeMo Guardrails / Presidio | Keepa ürün başlığı/açıklamasından prompt injection riski | Core | Gateway kurulduktan sonra guardrail'i tek noktadan eklemek kolaylaşır |
| 7 | IaC — Terraform | `infrastructure/prod/` altyapısının koda dökülmesi | Core (plan-only) | Uygulama katmanı bitince altyapı fazına geçiş |
| 8 | Kubernetes | Backend'in K8s'e deploy’u | Sandbox | Prod docker compose kullanıyor; K8s paralel/izole ortamda öğrenilir |
| 9 | Model Serving — vLLM / TGI | Self-hosted küçük bir modelin deneşel yol olarak eklenmesi | Sandbox | Modül 8'deki K8s sandbox'ı üzerine kurulur |
| 10 | Pipeline Orchestration — Airflow | Günlük watchlist scan tetikleme | Karşılaştırmalı | n8n zaten bu işi prod'da yapıyor; ama Airflow ilanlarda çok arandığı için kıyaslı öğrenilir |
| 11 | Capstone — Entegre Observability | Langfuse + Prometheus/Grafana + OpenTelemetry'nin tek panelde birleşmesi | Core | Tüm modülleri tek bir sonuçta toplayan kapanış |

*Tip açıklaması: **Core** = Vindera'ya doğrudan entegre edilir ve kalıcı değer katar. **Sandbox** = Vindera'nın mimarisine (tek VPS + docker compose) doğrudan uymadığı için izole bir ortamda, Vindera kodu üzerinden ama prod'u etkilemeden yapılır. **Karşılaştırmalı** = Vindera'da zaten başka bir araç (n8n) bu işi gördüğü için ama tekrar değer, kıyaslı olarak öğrenilir.*

## Araç Karşılaştırması (basit bakış)

Konuya hiç aşina olmayan biri için: her araç ne, tek cümleyle ne işe yarıyor, hangi soruyu cevaplıyor, ve resmi dokümantasyonu nerede. Her yeni modül tamamlandıkça bu tabloya bir satır daha eklenecek.

| Araç | En basit tanım | Ana amacı | Resmi dokümantasyon |
|---|---|---|---|
| **Langfuse** | 🔍 **LLM Monitoring** | LLM uygulamasının nasıl çalıştığını izlemek ve analiz etmek | [langfuse.com/docs](https://langfuse.com/docs) |
| **DeepEval** | 🧪 **LLM Testing** | LLM uygulamasının ne kadar iyi çalıştığını test etmek | [deepeval.com/docs/getting-started](https://deepeval.com/docs/getting-started) |
| **pgvector** | 🧭 **Semantik Arama** | "Buna benzer olanlar hangileri" sorusunu, kelime değil anlam bazında cevaplamak | [github.com/pgvector/pgvector](https://github.com/pgvector/pgvector) · [Supabase pgvector rehberi](https://supabase.com/docs/guides/database/extensions/pgvector) |
| **LiteLLM** | 🛣️ **LLM Gateway** | Farklı LLM'lere tek bir API üzerinden erişmek | [docs.litellm.ai](https://docs.litellm.ai/docs/) |
| **MLflow** | 📊 **Experiment Tracking** | Farklı prompt/model varyantlarını deneyip sonuçlarını yan yana karşılaştırmak | [mlflow.org/docs/latest](https://mlflow.org/docs/latest/index.html) |
| **Presidio / Guardrails** | 🛡️ **PII & Injection Guardı** | LLM'e giren dış kaynaklı metni ve LLM'den çıkan metni kontrol altında tutmak | [microsoft.github.io/presidio](https://microsoft.github.io/presidio/) · [NeMo Guardrails](https://docs.nvidia.com/nemo/guardrails/latest/index.html) |
| **Terraform** | 🏗️ **Infrastructure as Code** | Sunucu/firewall gibi altyapıyı elle tıklamak yerine kod olarak tanımlamak | [developer.hashicorp.com/terraform](https://developer.hashicorp.com/terraform/docs) |
| **Kubernetes / Helm** | ☸️ **Container Orkestrasyon** | Container'ları çalışır tutmak, kendi kendini onarmak, sabit bir ağ adresi vermek | [kubernetes.io/docs](https://kubernetes.io/docs/home/) · [helm.sh/docs](https://helm.sh/docs/) |
| **vLLM / TGI / Ollama** | 🖥️ **Self-Hosted Serving** | Açık ağırlıklı bir modeli kendi altyapında, ücretsiz çalıştırmak | [docs.vllm.ai](https://docs.vllm.ai/) · [ollama.com/docs](https://ollama.com/docs) |
| **Apache Airflow** | 🌬️ **Pipeline Orchestration** | Zamanlanmış, birden çok adımlı iş akışlarını kod olarak tanımlamak | [airflow.apache.org/docs](https://airflow.apache.org/docs/) |
| **OpenTelemetry** | 🔭 **Observability Standardı** | Trace/metric/log'u tek, satıcı-bağımsız bir formatta toplamanın endüstri standardı | [opentelemetry.io/docs](https://opentelemetry.io/docs/) |

- **Langfuse** — "Uygulamam çalışırken neler oluyor?"
- **DeepEval** — "LLM'im doğru çalışıyor mu?"
- **pgvector** — "Bu ürüne/deal'e benzer başka ne var?"
- **LiteLLM** — "Hangi modeli/sağlayıcıyı kullanacağım, ve biri çökerse ne olacak?"
- **MLflow** — "Hangi prompt versiyonu gerçekten daha iyi?"
- **Presidio / Guardrails** — "Bu metne güvenebilir miyim — ne giriyor, ne çıkıyor?"
- **Terraform** — "Sunucumu kaybedersem, aynısını tekrar nasıl kurarım?"
- **Kubernetes / Helm** — "Bir container çökerse ne olur, ve gerçekten trafik almaya hazır mı?"
- **vLLM / TGI / Ollama** — "OpenAI'a hiç ödeme yapmadan bir model çalıştırabilir miyim, ve kalitesi nasıl?"
- **Apache Airflow** — "n8n'in yaptığı işi kodla yapsaydım, ne değişirdi?"
- **OpenTelemetry** — "Farklı gözlemlenebilirlik araçlarını (Langfuse, Prometheus, Grafana) ortak bir dilde nasıl birleştiririm?"

## Faz 1 — Uygulama Katmanı Genişletmeleri

### Modül 0 — Ön Hazırlık

**Hedef:** Tüm servisleri (backend, frontend, local Supabase, n8n, Prometheus/Grafana) sorunsuz ayağa kaldırabilmek; öğrenme branch'ini açmak. **Hands-on:** `README`/`CLAUDE.md`'deki tüm servisleri sıfırdan başlatıp `docker exec` ile smoke test SQL'lerini çalıştırmak; `git checkout -b learn/llmops` ile branch açmak. **Değerlendirme:** Seninle birlikte tüm servislerin health check'lerini (`/healthz`, `/readyz`, Grafana paneli) tek tek gözden geçireceğiz.

### Modül 1 — LLM Observability (Langfuse)

**Hedef:** `DealAnalyzerAgent` ve `ListingGeneratorAgent`'ın her çağrısını token, maliyet, latency ve prompt/response detayıyla izlemek. **Resmi dokümantasyon:** Langfuse self-hosting rehberi (Docker Compose) ve Python SDK / OpenAI entegrasyon sayfası. **Vindera'da hands-on:** Langfuse'u local'de `docker compose` ile ayağa kaldırmak; `services/` altındaki agent çağrılarını Langfuse decorator/callback'iyle sarmalamak; bir scan job çalıştırıp trace'i Langfuse UI'da incelemek. **Değerlendirme:** Sana trace çıktısı üzerinden soru sorup token/maliyet hesabını birlikte yorumlayacağız; küçük bir quiz.

#### Modül 1 — Uygulama Günlüğü (gerçekte ne oldu)

**Yapılan değişiklikler (branch `learn/llmops`):**

- `backend/pyproject.toml` / `uv.lock` — `langfuse` paketi eklendi (`uv add langfuse`, v4.15.6).
- `backend/src/core/config.py` — `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` alanları (mevcut `OPENAI_API_KEY` deseniyle aynı, optional).
- `backend/src/core/observability.py` (yeni dosya) — `init_langfuse()`: iki anahtar da doluysa `Settings` değerlerini `os.environ`'a köprüler, sonra `import langfuse.openai` ile OpenAI SDK'yı patch'ler. `core/sentry.py`'deki `init_sentry()` deseniyle birebir aynı yapıda.
- `backend/src/main.py` — `init_sentry()`'nin hemen ardından `init_langfuse()` çağrısı.
- Workspace kökü `.env` — `AUTOMATION_SHARED_SECRET` eklendi (n8n'in kullandığı yöntemle `POST /deals/scan`'i tetikleyebilmek için); kullanıcı kendi Langfuse Cloud hesabından `LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY`'i ekledi.

**Doğrulanan gerçek teknik detaylar (kaynak kod okunarak, sonra testle):**

- Vindera'nın `client.beta.chat.completions.parse(...)` çağrıları (her iki agent dosyasında) hiç değiştirilmeden izlenebiliyor: yüklü `openai` SDK'da (v3.13.0) `beta.chat`, ana `chat` ile **aynı** `AsyncCompletions` sınıfına giden bir geriye-uyumluluk alias'ı — langfuse'un patch'i her ikisini de kapsıyor.
- Vindera hiçbir yerde `load_dotenv()` çağırmıyor: `.env`'e konan `LANGFUSE_*` anahtarları Pydantic `Settings` tarafından okunur ama gerçek `os.environ`'a otomatik yansımaz; Langfuse SDK'sı anahtarlarını doğrudan `os.environ`'dan okuyor. Bu yüzden `init_langfuse()` içinde açık bir köprü (`os.environ.setdefault(...)`) gerekti; yoksa "her şey doğru görünür ama hiç trace gelmez" tarzı sinsi bir hata olurdu.
- `uv run pytest -q` — 283 test, hepsi geçti; değişiklikler mevcut davranışı bozmadı.

**Karşılaşılan gerçek sorun:** Asistanın kendi aracının çalıştırma ortamında (sandbox), `import langfuse.openai` — daha doğrusu bunun tetiklediği `openai.resources.chat.completions` alt-modül import'u — süresiz kilitleniyor. İzole edildi: genel ağ erişimi çalışıyor (curl ile pypi.org/api.openai.com anında cevap veriyor), sorun özellikle bu import'un tetiklediği bir şey (muhtemelen thread/process açma kısıtlaması). Aynı kalıp daha önce `npm run dev` ve `supabase db reset`'te de görüldü: asistanın ortamında yavaş/tıkanık, kullanıcının kendi terminalinde sorunsuz. **Sonuç:** Langfuse'u etkinleştiren gerçek ilk restart'ı kullanıcı kendi terminalinde yaptı / yapıyor; asistan sadece hafif HTTP çağrılarını (scan tetikleme, healthz) kendi aracıyla yürüterek doğruladı.

**Çözüm:** Sonradan anlaşıldı ki gerçek bir sonsuz kilitlenme yokmuş — sadece **çok ağır, tek seferlik bir soğuk import** (openai SDK'nın yüzlerce tip tanımını ilk kez derlemesi), asistanın art arda başlattığı test süreçlerinin sistemde yarattığı yoğunlukla birleşince çok uzun sürmüş. Aynı import, sistem sakinleşinca temiz bir testte 4.4 saniyede bitti; kullanıcının kendi terminalinde başlattığı backend de birkaç dakika içinde sağlıklı ayağa kalktı. **Ders:** ilk çalıştırmada uzun süren bir import'u erkenden "kilitlendi" diye öldürmek yerine, özellikle sistemde başka ağır süreçler dönerken daha sabırlı olmak gerekiyor.

#### ⚠️ Güvenlik bulgusu: test scan yanlışlıkla hosted Supabase'e gitti

Backend ayağa kalkıp sağlıklı görününce, entegrasyonu doğrulamak için gerçek bir `POST /deals/scan` tetiklendi (ASIN `B09Y2MYL5C`, `X-Vindera-Key` ile). Sonuç local Docker'daki `scan_jobs` tablosunda hiç görünmeyince araştırıldı ve **`backend/.env` içindeki `SUPABASE_URL`'nin baştan beri hosted (gerçek) Supabase projesine işaret ettiği** ortaya çıktı (`https://gkeonnhhcdffxknnwftn.supabase.co`), local (`127.0.0.1:54321`) değil. Yani bu test scan — gerçek Keepa/OpenAI çağrıları dahil — hosted projeye gitmiş olabilir.

**Önemli ayrım:** Modül 0'daki `supabase db reset --local` ve SQL smoke test'leri her zaman doğru şekilde **local** Docker container'a karşı çalıştırılmıştı (doğrudan `docker exec` ile, backend'in `SUPABASE_URL`'inden bağımsız). Sorun sadece backend sürecinin kendi `.env`'inden okuduğu bağlantı ile ilgili.

**Alınan aksiyon:** Kullanıcıya durum hemen bildirildi, başka hiçbir scan/yazı işlemi yapılmadı, kullanıcının onayı beklendi.

**Ders (tüm sonraki müfredat için geçerli):** Herhangi bir modülde backend üzerinden gerçek bir istek (özellikle yazma/scan tetikleme) çalıştırmadan **hemen önce**, `.env`'deki `SUPABASE_URL`'in gerçekten `127.0.0.1:54321` olduğunu doğrulamak artık standart bir ön-kontrol adımı. "Local'de çalışıyoruz" varsayımı, projenin kendi `.env` dosyası okunmadan asla doğru kabul edilmemeli.

#### ✅ Modül 1 sonucu: doğrulanmış, tamamlandı

- Kullanıcı backend'i kendi terminalinde başlattı ve logda `"Langfuse LLM tracing is active (host: https://cloud.langfuse.com)"` satırı görüldü — entegrasyon doğru yüklendi.
- `POST /deals/scan` ile yapılan ilk deneme Keepa adımında durdu: `.env`'deki `KEEPA_API_KEY` hala `.env.example`'daki placeholder değerdi (`your_keepa_api_key_here`) — kod bunu açıkça kontrol ediyor (keepa_service.py `configured` property'si). Gerçek bir Keepa isteği hiç gitmedi, dolayısıyla OpenAI da hiç çağrılmadı — hosted DB'ye sadece zararsız bir "failed" scan_jobs satırı düştü, opportunities/Pushover hiç tetiklenmedi.
- Bunun üzerine Keepa'yı ve veritabanını tamamen atlayan, `DealAnalyzerAgent`'ı sahte `KeepaFacts` ile doğrudan çağıran izole bir test scripti yazıldı (`init_langfuse()` + `deal_analyzer.analyze_deal(...)` + `get_client().flush()`). Sonuç: **gerçek bir OpenAI cağrısı başarıyla yapıldı (deal_score=70, gerçek reasoning metni döndü) ve Langfuse client'ı başarıyla flush etti.**
- **Kalıcı (opsiyonel) TODO:** Gerçek uçtan uca bir scan için `.env`'e gerçek bir `KEEPA_API_KEY` girilmesi gerekiyor — bu Langfuse'dan tamamen bağımsız, önceden var olan bir eksiklik.

**Doğrulama adımı (kullanıcıya ait):** https://cloud.langfuse.com/project/cmuk2dibl0msbad0cddercmf9/traces adresine gidip bu test çağrısının trace'ini (prompt, token, maliyet, latency ile) görmek.

#### 📚 Langfuse — Kavramdan Uzmanlığa (derin dalış)

**Basit tanım:** 🔍 **LLM Monitoring** — LLM uygulamasının nasıl çalıştığını izlemek ve analiz etmek. Cevapladığı soru: *"Uygulamam çalışırken neler oluyor?"* **Resmi dokümantasyon:** [langfuse.com/docs](https://langfuse.com/docs)

**Ne sorunu çözüyor?** Normalde bir LLM çağrısı yapılır, cevap gelir, ama aradaki her şey (tam prompt, token sayısı, süre, maliyet) hiçbir yerde kaydedilmez. Langfuse her LLM çağrısını otomatik yakalayıp kalıcı saklayan bir **LLM observability** platformu.

**Sözlük:**

| Kavram | Anlamı |
|---|---|
| Trace (İz) | Bir isteğin baştan sona tam kaydı. Bizde: `analyze_deal()` çağrısının tamamı = 1 trace. |
| Observation | Trace içindeki tek adım. 3 türü: **Generation** (bir LLM çağrısı — input/output/model/token/maliyet/süre), **Span** (LLM olmayan süren işlem), **Event** (anık işaret). |
| Session | Birden fazla trace'i gruplaştıran üst kimlik (henüz kullanmıyoruz). |
| Score | Trace'e sonradan eklenen değerlendirme puanı (sayısal/kategorik/boolean) — elle ya da otomatik (bir eval sonucu). |
| Dataset | Sistematik test için bir araya getirilmiş örnek girdi/çıktı seti — DeepEval fixture'larımızın Langfuse karşılığı gibi. |
| Prompt Management | Prompt'ları koddan ayırıp Langfuse'da versiyonlama — bizde henüz kullanılmıyor, prompt'lar kod içinde sabit string. |
| Cost & Usage | Her Generation için otomatik hesaplanan token sayısı + maliyet. |

**Vindera'daki kod, satır satır:**

- backend/src/core/observability.py — `init_langfuse()`: iki anahtar da doluysa `os.environ`'a yazıp `import langfuse.openai` yapıyor.
- Bu import bir **monkey-patch**: OpenAI SDK'nın `AsyncCompletions.parse`/`create` metodlarını, öncesinde/sonrasında Langfuse'a veri gönderen bir sarmalayıcıyla değiştiriyor. Agent dosyalarında hiç kod değişikliği gerekmedi.
- backend/src/main.py — `init_langfuse()` en başta, herhangi bir agent import edilmeden önce çağrılıyor (patch'in devrede olması için şart).

**Terminal komutları (kullanılanlar):**

```bash
cd backend && uv add langfuse
```

**Dashboard turu (kullanıcı tarafından yapıldı, başarılı):**

- URL: https://cloud.langfuse.com/project/cmuk2dibl0msbad0cddercmf9/traces
- Sol menü: Traces, Sessions, Users, Scores, Datasets, Prompts, Playground, Settings.
- Bir trace'e tıklayınca: üstte latency+cost, ortada "OpenAI-generation" ağacı, tıklayınca Input/Output/Model parameters/Usage (token sayıları) görülüyor.
- Settings → API Keys sayfasındaki Public/Secret key'ler `.env`'dekiyle eşleşiyor.

### Modül 2 — LLM Evaluation (Promptfoo / DeepEval / Ragas)

**Hedef:** `ListingGeneratorAgent`'ın ürettiği Almanca metnin tutarlılığını (yasal footer birebir mi, ton doğru mu) ve `DealAnalyzerAgent` skorlarının tutarlılığını otomatik test etmek. **Resmi dokümantasyon:** Promptfoo config/CLI rehberi, DeepEval metrik kataloğu. **Vindera'da hands-on:** `backend/tests/` yanına ayrı bir eval seti kurmak; geçmiş scan sonuçlarını (veya mock data) fixture olarak kullanmak; CI'a **bloklamayan** bir eval adımı eklemek. **Değerlendirme:** Bilerek bozduğum bir prompt değişikliğinin eval setini nasıl kırdığını birlikte göreceğiz.

#### ✅ Modül 2 — Uygulama Günlüğü ve sonuç

**Karar:** Üç aday arasından (Promptfoo, DeepEval, Ragas) **DeepEval** seçildi — Python-native, `BaseMetric`/`LLMTestCase` API'si Vindera'nın mevcut pytest tabanlı test kaltırımına en yakın olanı.

**Neden `backend/tests/` değil, ayrı bir `backend/evals/` klasörü:** `tests/conftest.py` tüm outgoing socket'leri bloke ediyor (bkz. proje kuralı). Eval'lar gerçek, ücretli OpenAI çağrıları yaptığı için bu bloğun tamamen dışında, ayrı ve manuel çalıştırılan bir klasörde yaşıyor — `uv run pytest -q` bunları hiç toplamaz/çalıştırmaz.

**Oluşturulan dosyalar (branch `learn/llmops`):**

- `backend/evals/fixtures.py` — 2 gerçekçi ürün senaryosu (`KeepaFacts`) + örnek ödeme metni/yasal footer.
- `backend/evals/metrics.py` — 3 **deterministik** (LLM-judge kullanmayan, ekstra maliyet yaratmayan) DeepEval `BaseMetric`: `ListingStructureMetric` (4 zorunlu Almanca bullet başlığı var mı), `ForbiddenTopicsMetric` (modelin kendi metninde ödeme/fiyat kelimesi geçiyor mu — sistem prompt'unun yasakladığı şey), `VerbatimAppendMetric` (sahibin ödeme metni/yasal footer'ı birebir ve değiştirilmeden eklenmiş mi).
- `backend/evals/check_listing_generator.py` — runner: her senaryo için 2 gerçek çağrı (biri boş ödeme/footer ile sadece model metnini test etmek için, biri gercek metinle verbatim testi için); aynı zamanda `init_langfuse()` çağrılıyor, yani bu eval çalıştırmaları da Langfuse'a trace düşürüyor — Modül 1 ile Modül 2 birbirine bağlanmış oldu.

**Çalıştırma:** `cd backend && PYTHONPATH=. .venv/bin/python evals/check_listing_generator.py`

**Sonuç (ilk gerçek çalıştırma):** 2 senaryo × 3 metrik = 6 kontrol, **hepsi PASS**. Toplam **4 gerçek OpenAI çağrısı** (gpt-4o-mini, maliyet-bilinçli model tercihine uygun şekilde). Langfuse client başarıyla flush etti.

**Kapsam dışı bırakılan (bilerek):** `DealAnalyzerAgent` için ayrı bir eval (ör. reasoning'in gerçekten "Willhaben verisine erişimim yok" dediğini doğrulamak) aynı desenle eklenebilir; kapsamı dar tutup Modül 2'yi sağlam bitirmek için şimdilik `ListingGeneratorAgent`'a odaklandık.

#### 📚 DeepEval — Kavramdan Uzmanlığa (derin dalış)

**Basit tanım:** 🧪 **LLM Testing** — LLM uygulamasının ne kadar iyi çalıştığını test etmek. Cevapladığı soru: *"LLM'im doğru çalışıyor mu?"* **Resmi dokümantasyon:** [deepeval.com/docs/getting-started](https://deepeval.com/docs/getting-started)

**Ne sorunu çözüyor?** Normal pytest testleri kesin şeyleri kontrol eder ("2+2=4 mü"). "Bu LLM'in ürettiği Almanca metin doğru yapıda mı" gibi belirsiz sorular için DeepEval, LLM çıktılarını test edilebilir hale getiren bir framework — pytest'e doğrudan entegre olur.

**Sözlük:**

| Kavram | Anlamı |
|---|---|
| LLMTestCase | Bir test senaryosu: `input`, `actual_output`, opsiyonel `expected_output`/`context`. |
| Metric | `actual_output`'u 0-1 arası bir `score`'a çeviren mantık. **LLM-judge** (G-Eval gibi, kendi içinde ek bir LLM çağrısı yapar → ek maliyet) vs **deterministik** (düz Python, sıfır maliyet — bizimkiler bunlar). |
| BaseMetric | Kendi metriğini yazmak için miras alınan sınıf — `measure()`, `a_measure()`, `is_successful()`, `__name__` zorunlu. |
| threshold | Metriğin `score`'unun geçmesi gereken eşik (bizde hepsi 1.0). |
| `assert_test()` | pytest içinden çağrılan resmi yol — **pytest-asyncio ile asenkron OpenAI çağrılarıyla çakıştı, aşağıya bak.** |
| `evaluate()` | Programatik, eşzamansız olmayan çağrı — hazır `LLMTestCase` listesi + metrikleri alıp skorlar, Confident AI'a raporlar. **Kullandığımız, çalışan yöntem.** |
| Confident AI | DeepEval'in ücretsiz bulut dashboard'u — `deepeval login` ile bağlanılır. |

**Vindera'daki kod, satır satır:**

- backend/evals/metrics.py — 3 metrik: `ListingStructureMetric` (4 zorunlu Almanca bullet var mı), `ForbiddenTopicsMetric` (ödeme/fiyat kelimesi sızmış mı), `VerbatimAppendMetric` (sahibin metni birebir eklenmiş mi).
- backend/evals/fixtures.py — 2 gerçekçi ürün senaryosu.
- backend/evals/check_listing_generator.py — ilk versiyon, sadece konsola yazdırır, dashboard'a rapor etmez.

**⚠️ Yaşanan gerçek sorun — `deepeval test run` ile async çakışması:**

Dashboard'a rapor etmek için önce standart yol denendi: `pytest.mark.asyncio` + `assert_test()` kullanan bir test dosyası, `uv run deepeval test run evals/test_listing_generator.py` ile çalıştırıldı. Sonuç: 4 testten 3'ü `NoEventLoopError: Not currently running on any asynchronous event loop` hatasıyla çöktü. Kaynak: `deepeval test run`'ın kendi async test yörüngı mekanizması ile OpenAI SDK'nın `httpx`/`anyio` tabanlı async client'ı aynı event loop üzerinde çakıştı — genç (Python 3.14 + çok yeni openai sürümü) bir kombinasyonda ortaya çıkan gerçek bir uyumsuzluk.

**Çözüm:** `evals/test_listing_generator.py` silindi, yerine backend/evals/report_to_confident_ai.py yazıldı: gerçek OpenAI çağrıları **check_listing_generator.py ile aynı, kanıtlanmış yöntemle** (düz `asyncio.run`) yapılıyor; sonuçlar bitince, tamamen senkron olan `evaluate()` fonksiyonuna teslim ediliyor. DeepEval'in async orkestrasyonu hiçbir zaman gerçek OpenAI çağrısına dokunmuyor — çakışma tamamen ortadan kalktı.

**Çalıştırma:**

```bash
cd backend && uv run deepeval login
cd backend && PYTHONPATH=. .venv/bin/python evals/report_to_confident_ai.py
```

**Sonuç (başarılı çalışma):** 4 gerçek OpenAI çağrısı, 6/6 kontrol PASS, Langfuse'a trace düştü, ve iki ayrı Confident AI test-run linki üretildi:

- https://app.confident-ai.com/project/cmuk83571000sry0tzlejedp8/test-runs/cmuk8si8z000cs10tujbqq1du (structure + forbidden-topics)
- https://app.confident-ai.com/project/cmuk83571000sry0tzlejedp8/test-runs/cmuk8sjge000js10t99s82dt3 (verbatim-append)

Proje dashboard'u: https://app.confident-ai.com/project/cmuk83571000sry0tzlejedp8

**Not:** `backend/.deepeval/` ve `.deepeval-cache.json` `.gitignore`'a eklendi — `deepeval login` sonrası oluşan yerel durum dosyaları, repo'ya girmemesi için.

**Confident AI dashboard navigasyonu (yaşanan gerçek kafa karışıklığı):** Bare proje URL'si (`https://app.confident-ai.com/project/cmuk83571000sry0tzlejedp8`) dashboard yerine genel bir "SDK kur" onboarding ekranı (`curl ... setup.sh`) gösteriyor — bu, Confident AI'ın ayrı bir özelliği olan **Tracing** (canlı izleme, Langfuse'un yaptığı işin benzeri) için bir kurulum komutu ve çalıştırılmasına gerek yok. Bizim kullandığımız özellik **Evaluation / Test Runs**; sonuçları görmek için proje köküne değil, doğrudan test-run linklerine gidilmeli:

- https://app.confident-ai.com/project/cmuk83571000sry0tzlejedp8/test-runs/cmuk8si8z000cs10tujbqq1du
- https://app.confident-ai.com/project/cmuk83571000sry0tzlejedp8/test-runs/cmuk8sjge000js10t99s82dt3

Her linkte: üstte özet (kaç test case, kaçı geçti), altında her test case + uygulanan metrik(ler) + skor, tıklayınca `input`/`actual_output` ve metriğin "reason" açıklaması görülüyor.

#### ✅ Modül 1 ve Modül 2 tamamlandı

Langfuse tracing doğrulandı (kullanıcı kendi UI'ında trace'i gördü) ve DeepEval + Confident AI raporlaması uçtan uca çalışıyor (6/6 kontrol PASS, iki test-run linki doğrulandı). Faz 1'in ilk iki modülü kapandı, sırada Modül 3 (pgvector) var.

### Modül 3 — Vector Database (pgvector)

**Hedef:** Geçmiş `opportunities`/`products` arasında semantik benzerlik araması ("bu ürüne benzer geçmiş deal'ler") — admin panelde gerçekten kullanılabilecek yeni bir özellik. **Resmi dokümantasyon:** pgvector README, Supabase'in pgvector rehberi. **Vindera'da hands-on:** Yeni, timestamp'li bir migration ile `pgvector` extension'ı ve embedding kolonu eklemek; embedding üretim adımını scan pipeline'a veya ayrı bir script'e eklemek; local'de `supabase db reset` ile test etmek. **Değerlendirme:** Migration'ını birlikte review edeceğiz (idempotency, geri alınabilirlik) ve bir benzerlik sorgusunu birlikte yazacağız.

#### 📚 pgvector — Kavramdan Uzmanlığa (derin dalış)

**Basit tanım:** 🧭 **Semantik Arama** — "Buna benzer olanlar hangileri" sorusunu kelime değil anlam bazında cevaplamak. Cevapladığı soru: *"Bu ürüne/deal'e benzer başka ne var?"* **Resmi dokümantasyon:** [github.com/pgvector/pgvector](https://github.com/pgvector/pgvector) · [Supabase pgvector rehberi](https://supabase.com/docs/guides/database/extensions/pgvector)

**Ne sorunu çözüyor?** "Bu ürüne benzer geçmiş deal'ler hangileri" sorusu, kelime eşleşmesiyle (`LIKE '%kulaklık%'`) cevaplanamaz — "Sony WH-1000XM4" ile "Sony WH-1000XM5" kelime olarak neredeyse aynı ama "Bose QuietComfort" alakalı olsa da tek ortak kelimeleri yok. **Embedding**, bir metnin anlamını sabit uzunlukta bir sayı dizisine (vektöre) çeviren bir model çıktısıdır — anlamına yakın metinler, vektör uzayında birbirine yakın çıkar. pgvector, Postgres'e bu vektörleri saklama + hızlı "en yakın komşu" arama yeteneği ekleyen bir extension.

| Kavram | Anlamı |
|---|---|
| Vector / Embedding | Bir embedding modelinin ürettiği sabit uzunlukta float dizisi. `text-embedding-3-small` → 1536 boyut. |
| Dimensionality (boyut) | Vektördeki sayı adedi. Postgres kolon tipi: `vector(1536)`. |
| Distance operatörü | pgvector'ün üç operatörü: `<->` (L2/Öklid mesafesi), `<=>` (cosine mesafesi — metin embedding'lerinde standart, çünkü vektörün *yönü* önemli, *büyüklüğü* değil), `<#>` (negatif iç çarpım — sadece normalize edilmiş vektörlerde). |
| Similarity vs. distance | Operatörler *mesafe* döner (cosine'da 0 = birebir aynı). "Benzerlik skoru" istiyorsan `1 - mesafe` hesaplarsın (bizim `match_similar_products` fonksiyonumuzda yaptığımız gibi). |
| Exact search (indekssiz) | Postgres tüm satırları tek tek karşılaştırır — %100 doğru ama O(n). Bizim ölçeğimizde (yüzlerce ürün) zaten anılık. |
| IVFFlat indeks | Yaklaşık (approximate) arama — veriyi önce kümelere ayırır (`lists` parametresi), kümeleme kalitesi *var olan veriye* bağlı olduğu için genelde veri yüklendikten sonra kurulur. |
| HNSW indeks | Yaklaşık arama — graf tabanlı, IVFFlat'ten farklı olarak veri yokken/azken de kurulabilir, sorgu zamanında genelde daha hızlı ve daha isabetli. Bugün pgvector'de varsayılan tercih. Bizim seçimimiz. |
| Neden yaklaşık arama gerekir? | Milyonlarca satırda exact search çok yavaşlar; yüzlerce/birkaç bin satırda (Vindera'nın bugünkü ölçeği) aslında hiç gerekmez — HNSW'yi burada gerçek bir performans ihtiyacından değil, "üretimde nasıl yapılır"ı öğrenmek için kuruyoruz. |

**Vindera'ya nasıl uygulandı (kod, satır satır):**

- `supabase/migrations/20260927120000_add_product_embeddings.sql` (yeni migration): `CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;` (Supabase konvansiyonu, `config.toml`'daki `extra_search_path` ile eşleşiyor); `products` tablosuna `embedding vector(1536)` kolonu (`opportunities`'e değil — embedding edilecek metin ürün başına bir kere değişir, aranacak "varlık" `products`); `products_embedding_hnsw_idx` (`USING hnsw (embedding vector_cosine_ops)`); `match_similar_products(p_product_id, match_count=5)` RPC fonksiyonu — `persist_scan_result` gibi, sadece `service_role`'e `GRANT EXECUTE`.
- `backend/scripts/backfill_product_embeddings.py` (yeni script) — embedding'i olmayan her `products` satırı için `text-embedding-3-small` ile gerçek embedding üretip yazıyor. **Güvenlik kontrolü:** Modül 1'deki hosted-Supabase olayından ders çıkarılarak, `SUPABASE_URL` local değilse çalışmayı reddediyor.

**Terminal komutları (gerçekten çalıştırılanlar):**

```bash
supabase start
supabase db reset --local
docker exec -i supabase_db_vindera-workspace psql -U postgres -v ON_ERROR_STOP=1
# psql içinde doğrulama: \dx vector | \d public.products | \df public.match_similar_products
```

**Doğrulanan sonuç:** `vector` extension'ı (v0.8.2, `extensions` şemasında) kuruldu; `products.embedding vector(1536)` kolonu ve `products_embedding_hnsw_idx` (HNSW/cosine) indeksi doğrulandı; `match_similar_products(uuid, int)` fonksiyonu doğru imzayla oluştu. `uv run pytest -q` → 283/283 geçti, regresyon yok.

**Demo verisi (local, sadece test amaçlı, `db reset`'te silinir):** 4 test ürünü eklendi — 3 kablosuz kulaklık (Sony XM4, Sony XM5, Bose QC35 II — birbirine anlamca yakın olmalı) ve 1 LEGO seti (alakasız olmalı) — embedding'ler üretildikten sonra `match_similar_products` sonucunu birlikte yorumlamak için.

**Karşılaşılan gerçek sorun — `supabase start` sessizce eksik kalıyordu:** Script ilk çalıştırıldığında `_assert_local_supabase()` güvenlik kontrolü doğru şekilde durdurdu (`backend/.env`'deki `SUPABASE_URL` hâlâ hosted — Modül 1'deki bilinen, kasıtlı durum). Script'i **backend/.env'e hiç dokunmadan**, sadece o tek komutun kendi ortamında `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`'i local değerlerle geçici olarak override ederek çalıştırmayı denedim — bu sefer PostgREST'e giden istek `{"message":"name resolution failed"}` ile döndü. Sebep: `supabase start`, `db`/`auth`/`kong` container'ları zaten ayaktayken diğer servisleri (`rest`, `storage`, `realtime`, `studio` vb.) sessizce başlatmıyor. **Çözüm:** `supabase stop` (otomatik yedekle) + `supabase start` (yedekten geri yükleyerek) ile stack'in tamamı temiz şekilde ayağa kalktı; 4 test ürünü ve migration yedekten sağlam döndü.

**Gerçek çalıştırma (backend/.env'e dokunmadan, sadece bu tek komutun ortamında local'e geçici override ile):**

```bash
cd backend && SUPABASE_URL="http://127.0.0.1:54321" SUPABASE_SERVICE_ROLE_KEY="<local service role key>" \
  PYTHONPATH=. .venv/bin/python scripts/backfill_product_embeddings.py
```

**Sonuç:** 4 gerçek `text-embedding-3-small` çağrısı yapıldı, her biri 1536 boyutlu vektör döndürdü, `products.embedding` güncellendi. `uv run pytest -q` tekrar 283/283.

**Benzerlik sorgusu — birlikte yazılan ve test edilen sorgu:**

```sql
SELECT m.title, m.category, round(m.similarity::numeric, 4) AS similarity
FROM public.products p,
     LATERAL public.match_similar_products(p.id, 5) m
WHERE p.title LIKE 'Sony WH-1000XM5%';
```

**Gerçek sonuç (embedding'lerin işe yaradığının kanıtı):**

| title | category | similarity |
|---|---|---|
| Sony WH-1000XM4 Kabelloser Noise Cancelling Kopfhörer | Elektronik | 0.9041 |
| Bose QuietComfort 35 II Wireless Kopfhörer | Elektronik | 0.6070 |
| LEGO Star Wars Millennium Falcon Bauset | Spielzeug | 0.1997 |

Model, aynı ürünün bir önceki neslini (%90 benzer), farklı markadan ama aynı kategoriden bir rakibi (%61) ve tamamen alakasız bir ürünü (%20) doğru sırayla ayırt etti — kelime eşleşmesi değil, gerçek anlamsal benzerlik.

#### ✅ Modül 3 sonucu: doğrulanmış, tamamlandı

pgvector kuruldu, `products.embedding` dolduruldu, `match_similar_products` RPC'si gerçek verilerle doğru sıralama üretti. Admin panelde bu RPC'yi bir "Benzer Ürünler" widget'ına bağlamak (opsiyonel, kalıcı özellik olarak) ileride ayrı bir küçük görev olarak eklenebilir — Modül 3'ün öğrenme hedefi (pgvector'ü kavramdan uzmanlığa öğrenmek + Vindera'ya entegre etmek) tamamlandı.

## Faz 2 — Platform Soyutlama & Deney Takibi

### Modül 4 — LLM Gateway (LiteLLM)

**Hedef:** Tüm OpenAI çağrılarını tek bir gateway katmanından geçirmek; model değiştirme, rate limit ve merkezi loglama kazanmak. **Resmi dokümantasyon:** LiteLLM Proxy Server ve Python SDK rehberi. **Vindera'da hands-on:** `services/` içindeki doğrudan OpenAI çağrılarını LiteLLM SDK/proxy üzerinden geçirmek; local'de LiteLLM proxy'yi Docker ile ayağa kaldırmak; bir fallback model tanımlamak (ör. OpenAI hata verirse ikinci bir sağlayıcı). **Değerlendirme:** OpenAI anahtarını geçici olarak geçersiz kılıp fallback'in devreye girdiğini birlikte doğrulayacağız.

#### 📚 LiteLLM — Kavramdan Uzmanlığa (derin dalış)

**Basit tanım:** 🛣️ **LLM Gateway** — Farklı LLM'lere tek bir API üzerinden erişmek. Cevapladığı soru: *"Hangi modeli/sağlayıcıyı kullanacağım, ve biri çökerse ne olacak?"* **Resmi dokümantasyon:** [docs.litellm.ai](https://docs.litellm.ai/docs/)

**Ne sorunu çözüyor?** `deal_analyzer_agent.py` ve `listing_generator_agent.py`, her biri kendi `AsyncOpenAI` client'ını doğrudan `api.openai.com`'a karşı kuruyordu. Bu; model/sağlayıcı değişikliğini kod değişikliğine bağlıyor, OpenAI çökünce/rate-limit yiyince otomatik bir kurtarma yolu bırakmıyor, ve maliyeti tek yerden izlemeyi zorlaştırıyordu. **LLM Gateway**, uygulama ile sağlayıcı(lar) arasına giren, tek tip bir arayüz sunan proxy katmanı.

| Kavram | Anlamı |
|---|---|
| LiteLLM SDK modu | `litellm.completion(...)` — kodun içine gömlülü, OpenAI SDK'ya benzer. Kullanmadık. |
| LiteLLM Proxy modu | Ayrı bir sunucu (Docker), OpenAI-uyumlu `/v1/chat/completions` sunar. **Kullandığımız mod** — mevcut `openai` SDK çağrılarına dokunmadan, sadece `base_url` değiştirerek entegre olur. |
| `config.yaml` / `model_list` | Proxy'nin "model adı" → gerçek sağlayıcı+key eşlemesini tanımladığı dosya. |
| Router / deployment | Aynı `model_name` altında birden fazla deployment (farklı key/sağlayıcı) tanımlanabilir; proxy aralarında geçiş yapar. |
| Fallback | `router_settings.fallbacks` — bir model grubu hata verirse (401, rate-limit, timeout) başka bir gruba otomatik geçiş. |
| Virtual key / `LITELLM_MASTER_KEY` | Proxy'nin kendi erişim kontrolü — biz local/tek kullanıcı olduğumuz için kapalı bıraktık. |

**Vindera'ya nasıl uygulandı (kod, satır satır):**

- `litellm/docker-compose.yml` + `litellm/config.yaml` (yeni, `n8n/` klasörüyle aynı desen) — proxy'yi `localhost:4000`'de ayağa kaldırıyor, tek bir `gpt-4o-mini` deployment'ı gerçek `OPENAI_API_KEY`'i kullanıyor.
- `backend/src/core/config.py` — `OPENAI_BASE_URL: str | None = None` (Langfuse'daki opsiyonel alan deseniyle aynı).
- `deal_analyzer_agent.py` ve `listing_generator_agent.py` — `AsyncOpenAI(...)` çağrılarına `base_url=settings.OPENAI_BASE_URL` eklendi (tek satır, her ikisinde). Langfuse'dan farklı: orada agent dosyalarına hiç dokunulmamıştı, burada açık bir parametre gerekti.

**Terminal komutları (gerçekten çalıştırılanlar):**

```bash
cd litellm && docker compose up -d
curl http://localhost:4000/health/readiness
curl http://localhost:4000/v1/models
```

**Doğrulanan sonuç (şeffaf geçiş):** `OPENAI_BASE_URL=http://localhost:4000/v1` ile `listing_generator_agent`'ı gerçek bir ürünle çağırdım — kod hiç değişmeden, aynı çıktı şekliyle gerçek bir Almanca ilan üretildi. Proxy logunda `POST /v1/chat/completions HTTP/1.1 200 OK` görülerek isteğin gerçekten proxy üzerinden geçtiği kanıtlandı. `uv run pytest -q` → 283/283.

**Fallback deneyi (ayrı/geçici bir config ile):** `litellm/config.fallback-demo.yaml` — iki deployment: `gpt-4o-mini-primary` (bilerek bozuk key) ve `gpt-4o-mini-fallback` (gerçek key), `router_settings.fallbacks`. Ana proxy'yi geçici durdurup ayrı portta (4001) bu config'le bir container çalıştırdım: proxy önce `gpt-4o-mini-primary`'de `AuthenticationError` aldı, otomatik olarak `gpt-4o-mini-fallback`'e geçti, gerçek bir `"OK"` cevabı döndü.

**Karşılaşılan gerçek sorun — `docker run --env-file` vs `docker compose`'un `.env` ayrıştırma farkı:** İlk denememde `docker run --env-file ../.env` kullandım ve **gerçek (doğru) key bile reddedildi**. Sebep: kök `.env`'de `OPENAI_API_KEY="sk-proj-..."` tırnak içinde tanımlı; `docker compose`'un `env_file` ayrıştırıcısı çevreleyen tırnakları temizlerken, `docker run --env-file` bunu **yapmıyor** — key'i tırnak işaretleriyle birlikte taşıyor, bu da OpenAI'ın reddettiği bozuk bir key'e dönüşüyor. **Çözüm:** değeri shell'de `tr -d '"'` ile temizleyip `-e OPENAI_API_KEY=...` olarak doğrudan geçtim. **Ders:** `docker run --env-file` ile `docker compose`'un `env_file`'ı aynı davranmıyor — tırnaklı değerler sessizce bozulabilir.

Demo bitince ana proxy geri başlatıldı, sağlıklı olduğu doğrulandı, `uv run pytest -q` tekrar 283/283.

#### 🖥️ LiteLLM Admin UI — kendi gözünle görmek istersen

LiteLLM proxy'nin, Langfuse/Confident AI'a benzer görsel bir dashboard'u var (**Admin UI**), ama çalışması için bir Postgres veritabanı istiyor — biz bunu ilk kurulumda bilerek atlamıştık (sade tutmak için). Görsel dashboard'u da açmak istediğin için ekledim:

**Yapılan değişiklik (`litellm/docker-compose.yml`):** Yeni bir `db` servisi (Postgres 16, sadece LiteLLM'in kendi kullanıcı/key/log verisini tutuyor — Vindera'nın kendi Supabase'iyle hiç ilgisi yok) + `litellm` servisine `DATABASE_URL`, `LITELLM_MASTER_KEY` ve `UI_USERNAME`/`UI_PASSWORD` eklendi. Bunlar gerçek sırlar değil, sadece local'de var olan bir paneli kilitleyen değerler.

**Erişim:**

- URL: http://localhost:4000/ui
- Kullanıcı adı: `admin`
- Şifre: `vindera-local`

**Dashboard turu (birlikte gezdim, doğruladım):**

- **Virtual Keys** — proxy'nin kendi API key'lerini oluşturduğun yer (biz kullanmıyoruz, local/tek kullanıcıyız).
- **Playground → Chat** ("Test Key" kutusu) — sağ tarafta gerçek bir sohbet kutusu var, buradan `gpt-4o-mini`'ye canlı mesaj gönderip cevabı görebilirsin — Confident AI'daki gibi statik bir rapor değil, gerçek zamanlı bir test arayüzü.
- **Models + Endpoints → All Models** — `config.yaml`'daki `gpt-4o-mini` (→ `openai/gpt-4o-mini`) burada listeleniyor; doğruladım, doğru göründü.
- **Observability → Logs → Request Logs** — her gerçek isteğin zaman, tip, durum, session/request ID ve maliyetini canlı gösteren bir tablo (auto-refresh açık); Modül 4'te yaptığımız gerçek çağrılar bu DB'siz container'da olduğu için burada görünmüyor, ama bundan sonra proxy üzerinden yapılan her çağrı burada birikecek.

**Not (Admin UI'nin kendi uyarısı):** Sayfa açılınca "Environment-credential login is enabled" uyarısı görürsün — bu, `UI_USERNAME`/`UI_PASSWORD` ile girişin (production'da) daha az güvenli bir yöntem olduğunu, gerçek kullanımda kendi kullanıcı hesabını oluşturup bu yöntemi kapatman gerektiğini söylüyor. Local/tek kullanıcı öğrenme ortamımızda risksiz, olduğu gibi bırakıyoruz.

#### ✅ Modül 4 sonucu: doğrulanmış, tamamlandı

Backend artık isteğe bağlı olarak bir LLM gateway'den geçebiliyor (varsayılan davranış değişmedi — `OPENAI_BASE_URL` boşsa doğrudan OpenAI'a gidiyor). Gateway'in hem şeffaf model-değiştirme hem de otomatik fallback değerini gerçek isteklerle kanıtladık.

### Modül 5 — Experiment Tracking (MLflow)

**Hedef:** `ListingGeneratorAgent` için farklı system prompt versiyonlarını MLflow run'ları olarak loglayıp, Modül 2'deki eval skorlarıyla karşılaştırmak. **Resmi dokümantasyon:** MLflow Tracking API (`mlflow.log_param`, `log_metric`) ve local tracking server kurulumu. **Vindera'da hands-on:** Local MLflow server'ı Docker ile aynı network'e eklemek; iki farklı prompt versiyonunu aynı eval seti üzerinde koşturup sonuçları MLflow UI'da yan yana görmek. **Değerlendirme:** Hangi prompt versiyonunun "kazandığını" MLflow verisine dayanarak birlikte tartışacağız.

#### 📚 MLflow — Kavramdan Uzmanlığa (derin dalış)

**Basit tanım:** 📊 **Experiment Tracking** — farklı prompt/model varyantlarını dener, sonuçlarını yan yana koyup karşılaştırırsın. Cevapladığı soru: *"Hangi prompt versiyonu gerçekten daha iyi?"* **Resmi dokümantasyon:** [mlflow.org/docs/latest](https://mlflow.org/docs/latest/index.html)

**Ne sorunu çözüyor?** Modül 2'de `ListingGeneratorAgent`'ı tek bir prompt versiyonuyla test ettik. Prompt'u değiştirip "daha iyi mi kötü mü" sorusuna cevap ararken, sonuçları elle karşılaştırmak hızla kaosa dönüşür. **MLflow**, her deneme için kullanılan parametreleri + elde edilen metrikleri + üretilen çıktıları kalıcı kaydeden ve görsel karşılaştırma sağlayan bir **experiment tracking** aracı.

| Kavram | Anlamı |
|---|---|
| Experiment | Run'ları gruplayan üst kategori (bizde: `vindera-listing-generator-prompts`). |
| Run | Tek bir deneme — belirli parametrelerle (ör. `prompt_variant=concise`) yapılan bir çalıştırma. |
| Param | Bir run'ı tanımlayan sabit girdi (`mlflow.log_param`) — hangi prompt, hangi model. |
| Metric | Run'ın ürettiği ölçülebilir sonuç (`mlflow.log_metric`) — bizde DeepEval skorları. |
| Artifact | Run'a ekli dosya (`mlflow.log_artifact`) — bizde üretilen ilan metinleri. |
| Tracking URI | Verinin nereye kaydedildiği — local SQLite dosyası (`sqlite:///mlflow.db`) veya bir sunucu. |
| MLflow UI | `mlflow ui` komutuyla açılan, run'ları tablo/grafik halinde karşılaştırdığın web arayüzü. |

**Langfuse'dan farkı:** Langfuse, canlı prod trafiğinin her çağrısını otomatik izler ("üretimde ne oluyor?"). MLflow, bilerek tetiklenen deneyleri karşılaştırmak için ("hangi versiyon daha iyi?") — offline, kasıtlı bir değerlendirme akışı.

**Vindera'ya nasıl uygulandı (kod, satır satır):**

- `backend/src/agents/listing_generator_agent.py` — hardcoded sistem prompt'u `DEFAULT_SYSTEM_PROMPT` sabitine çıkarıldı; `generate_willhaben_listing()`'e opsiyonel `system_prompt_override: str | None = None` parametresi eklendi (varsayılan davranış hiç değişmedi).
- `backend/evals/compare_prompts_mlflow.py` (yeni) — iki varyant: `baseline` (mevcut prompt) ve `concise` (`CONCISE_SYSTEM_PROMPT`: aynı zorunlu yapıyı isteyen ama alan bazlı örnekleri olmayan, bilerek daha kısa bir yeniden yazım). Her varyant için `PRODUCT_SCENARIOS`'taki her ürünle gerçek bir çağrı yapılıyor, Modül 2'nin `ListingStructureMetric`/`ForbiddenTopicsMetric`'i `metric.measure()` ile doğrudan skorlanıyor, ortalama skor + üretilen metinler MLflow'a run olarak loglanıyor.

**Çalıştırma:**

```bash
cd backend && PYTHONPATH=. .venv/bin/python evals/compare_prompts_mlflow.py
cd backend && .venv/bin/mlflow ui --backend-store-uri sqlite:///mlflow.db --port 5001
# tarayıcıda: http://127.0.0.1:5001
```

**Gerçek sonuç:**

| Varyant | listing_structure_score | forbidden_topics_score |
|---|---|---|
| baseline | 1.00 | 1.00 |
| concise | 1.00 | 1.00 |

**İlginç bulgu:** `concise` varyantı, her alan için verilen örnekleri tamamen çıkarıp sadece dört bullet başlığını istedi — buna rağmen `gpt-4o-mini` yapıyı ve yasakları eksiksiz korudu. Küçük örneklem (2 ürün) ile genel bir sonuç değil, ama gerçek bir veri noktası.

**MLflow UI turu:** `http://127.0.0.1:5001` → sol menüden `vindera-listing-generator-prompts` deneyi → `baseline` ve `concise` run'larını seçip "Compare" ile yan yana: Parameters ve Metrics sütun sütun karşılaştırılıyor; bir run'a tıklayınca Artifacts sekmesinde o varyantın ürettiği tam ilan metinlerini okuyabiliyorsun.

#### ⚠️ Karşılaşılan gerçek sorunlar

**1) MLflow'un dosya tabanlı deposu artık "bakım modunda":** İlk denemede `mlflow.set_tracking_uri("file:./mlruns")` şu hatayı verdi: *"The filesystem tracking backend ... is in maintenance mode."* **Çözüm:** `mlflow.set_tracking_uri("sqlite:///mlflow.db")` — hâlâ tek bir local dosya, Docker/sunucu gerekmiyor.

**2) Bu oturumun en büyük gerçek sorunu — sistem çapında disk G/Ç tıkanıklığı:** Modül 5 boyunca hem `uv run pytest -q` hem de `mlflow ui`'nin ilk açılışı olağanın çok üzerinde sürdü:

- `pytest` üç kez art arda tam 300 saniyede zaman aşımına uğrayan aynı iki teste takıldı (`test_platform.py`'deki, üretim ayarlarıyla `import src.main`'i **taze bir subprocess'te** çalıştıran testler) — geri kalan 281 test her seferinde sorunsuz geçti.
- Kök sebep, `python -X importtime -c "import src.main"` ile elle tekrarlanıp doğrulandı: `openai` SDK'sının yüzlerce `openai.types.chat.*` alt modülü var; normalde 2-4 saniyede biten bu import, o an sistemdeki ağır disk aktivitesi (macOS Spotlight/`mdworker` + Time Machine yardımcı süreçleri, `ps`/`uptime`/`tmutil status` ile doğrulandı) yüzünden onlarca kat yavaşladı — `sample` ile alınan stack trace'in **%99.9'u `read()` sistem çağrısında** çıktı, yani gerçekten ilerleyen ama çok yavaş bir import.
- Aynı desen `mlflow ui`'nin ilk açılışında da tekrarlandı (bu sefer `pandas`/`protobuf`'un devasa alt modül ağacında) — `-X importtime` ile tekrar doğrulandı (satır sayısı her kontrolde artıyordu, donmamıştı).
- **Sonuç:** Vindera kodunda bir hata değil, bu makinede o an süren geçici bir sistem yükü. `uv run pytest -q` → **281/283**, iki başarısızlık da aynı, tek, doğrulanmış, kod-dışı nedenden.
- **Ders:** Yeni, ağır bir bağımlılık eklendikten hemen sonra anormal yavaşlık görürsen: `python -X importtime -c "<import>"` ile gerçekten ilerleyip ilerlemediğini doğrula, `sample <pid>` ile stack'in `read()`'te mi gerçek hesaplamada mı olduğuna bak, `ps aux | grep -E "mdworker|backupd"` ile Spotlight/Time Machine'i kontrol et — sabırla beklemek (Modül 1'deki ders) burada da doğru çözümdü.

**Not:** MLflow UI'ın canlı görsel turu bu oturumda tamamlanamadı — sunucu hâlâ soğuk başlangıç aşamasındaydı; kullanıcıyla birlikte, sayısal sonuçlar zaten elimizde olduğu için görsel turu ertelemeye ve Modül 6'ya geçmeye karar verildi. `mlflow ui --backend-store-uri sqlite:///mlflow.db --port 5001` komutu ileride, sistem sakinken tekrar çalıştırılıp http://127.0.0.1:5001 üzerinden gezilebilir.

#### ✅ Modül 5 sonucu: doğrulanmış, tamamlandı

`system_prompt_override` parametresi eklendi (geriye dönük uyumlu), iki prompt varyantı gerçek OpenAI çağrılarıyla karşılaştırıldı, ikisi de Modül 2 metriklerinde tam puan aldı, sonuçlar MLflow'a (SQLite backend) kalıcı olarak loglanı. Görsel dashboard turu, bu oturumdaki disk G/Ç sorunundan dolayı ertelendi.

### Modül 6 — Guardrails & PII (NeMo Guardrails / Presidio)

**Hedef:** Keepa'dan gelen ürün başlığı/açıklaması gibi dış kaynaklı verinin prompt injection riskini azaltmak; LLM çıktısında beklenmeyen içeriği yakalamak. **Resmi dokümantasyon:** NeMo Guardrails Colang rehberi, Microsoft Presidio (RAI Portal'da zaten kullanılıyor, oradan referans alınacak). **Vindera'da hands-on:** `DealAnalyzerAgent`'a giren ham Keepa metnine input guardrail eklemek; `ListingGeneratorAgent` çıktısına output guardrail (ör. yasal footer'ın birebir korunduğunu doğrulama) eklemek. **Değerlendirme:** Bilerek zararlı/injection içeren bir test verisiyle guardrail'in yakalayıp yakalamadığını birlikte deneyeceğiz.

**Düzeltme (dürüstlük payı):** Yukarıdaki "RAI Portal'da zaten kullanılıyor" notu erken planlama aşamasından kalma, yanlış bir varsayımdı — kod tabanı taranarak doğrulandı, böyle bir kullanım yok. Bu modül sıfırdan, Vindera'nın gerçek yüzeyine göre kuruldu.

#### 📚 Guardrails & PII — Kavramdan Uzmanlığa (derin dalış)

**Basit tanım:** 🛡️ **PII & Injection Guardı** — LLM'e giren dış kaynaklı metni ve LLM'den çıkan metni kontrol altında tutmak. Cevapladığı soru: *"Bu metne güvenebilir miyim — ne giriyor, ne çıkıyor?"* **Resmi dokümantasyon:** [microsoft.github.io/presidio](https://microsoft.github.io/presidio/) · [NeMo Guardrails](https://docs.nvidia.com/nemo/guardrails/latest/index.html)

**Gerçek risk neydi?** `DealAnalyzerAgent` ve `ListingGeneratorAgent`, Keepa'dan gelen **ham, dış kaynaklı** ürün başlığı/kategori metnini prompt'a doğrudan yerleştiriyor — bir satıcı ürün başlığına "Ignore previous instructions..." gibi bir metin gizleyebilir (**prompt injection**). Ayrıca `ListingGeneratorAgent`'ın ürettiği metin doğrudan storefront'ta gösteriliyor — model halüsinasyonla bir telefon/email/IBAN üretirse bu **PII sızıntısı** olur.

| Kavram | Anlamı |
|---|---|
| Input guardrail | LLM'e **giren** veriyi kontrol eder — bizde: Keepa'dan gelen ham başlık/kategori metni. |
| Output guardrail | LLM'den **çıkan** veriyi kontrol eder — bizde: üretilen ilan metninde PII var mı. |
| Prompt injection | Dış kaynaklı verinin, model talimatlarını geçersiz kılmaya çalışan gömülü komutlar içermesi. |
| PII | İsim, telefon, email, IBAN, kredi kartı gibi kişiyi tanımlayabilecek veri. |
| Presidio (Microsoft) | Metin içinde PII tespit eden açık kaynak kütüphane — `AnalyzerEngine`, dil-bazlı NLP modelleriyle (spaCy) çalışır. |
| NeMo Guardrails (NVIDIA) | Konuşma akışlarına kural ekleyen framework — kendi dili **Colang** ile tanımlanır. |

**Mühendislik kararı (neden NeMo Guardrails'in tam Colang akışı değil):** NeMo Guardrails'in "topical rails"/self-check akışları genelde ek bir LLM çağrısı gerektirir — her taramaya, sadece girdiyi denetlemek için ekstra gerçek OpenAI maliyeti eklemek anlamına gelir. Modül 2'nin metrik felsefesiyle aynı gerekçeyle (deterministik, sıfır ek maliyet), **hem input hem output guardrail'i düz Python (regex/pattern-based) olarak kurduk.** Bu bilinçli bir mühendislik tercihi — framework'ü atlamak değil, maliyet/fayda dengesini gözetmek.

**Vindera'ya nasıl uygulandı (kod, satır satır):**

*Output guardrail (PII):*

- `backend/src/core/pii_guard.py` (yeni) — Presidio `AnalyzerEngine`'i Almanca spaCy modeliyle (`de_core_news_sm`) sarmalayan `find_pii(text) -> list[str]`.
- `backend/evals/metrics.py` — `NoPIIMetric` eklendi (Modül 2'nin `ForbiddenTopicsMetric` deseniyle birebir aynı), `check_listing_generator.py` ve `report_to_confident_ai.py`'deki "bare" kontrolüne eklendi.

*Input guardrail (prompt injection):*

- `backend/src/core/injection_guard.py` (yeni) — İngilizce ve Almanca yaygın talimat-geçersiz-kılma kalıplarını (`ignore previous instructions`, `ignoriere die vorherigen anweisungen`, `system:`, `du bist jetzt...` vb.) yakalayan `looks_like_prompt_injection(text) -> bool`.
- `backend/src/services/scan_pipeline.py` — Keepa verisi geldikten hemen sonra, herhangi bir agent'a ulaşmadan önce `facts.title`/`facts.category` kontrol ediliyor; eşleşirse tarama `_fail_job(...)` ile temiz şekilde durduruluyor.
- `backend/src/core/metrics.py` — `vindera_prompt_injection_blocked_total` Prometheus sayıcısı.
- `infrastructure/monitoring/alerts.yml` — `PromptInjectionBlocked` alert kuralı.

**Gerçek test/eval sonuçları:**

- `check_listing_generator.py` çalıştırıldı: her iki ürün senaryosunda `NoPIIMetric` **PASS**.
- `tests/test_injection_guard.py` (yeni, 15 test) + `tests/test_scan_pipeline.py`'ye eklenen 3 yeni test — hepsi **PASS**.
- `uv run pytest -q` → **301/303** (283 eski + 18 yeni), kalan 2 başarısızlık Modül 5'te tam teşhis edilen, kod dışı disk G/Ç sorununun aynısı — regresyon değil.

**Karşılaşılan gerçek sorunlar:**

**1) Almanca spaCy modelinin yanlış pozitifi:** `find_pii()` ilk halinde `PERSON` varlığını da içeriyordu. Temiz bir test metninde ("Tolle Kopfhörer...") `de_core_news_sm` modeli **"Tolle"yi bir kişi ismi sandı** (%85 güvenle) — sadece büyük harfle başladığı için. **Çözüm:** `PERSON`'ı çıkarıp sadece regex/checksum tabanlı varlıkları (`EMAIL_ADDRESS`, `PHONE_NUMBER`, `IBAN_CODE`, `CREDIT_CARD`) tuttuk.

**2) Kendi yazdığım testte gerçek bir hata:** `test_an_ordinary_keepa_title_is_never_blocked` testi ilk halinde `job["status"] in ("pending", "rejected")` bekliyordu ama gerçekte `"running"` döndü. Kök sebep: test veritabanındaki sahte `persist_scan_result` RPC handler'ı **gerçek Postgres RPC'sinin yaptığı gibi `scan_jobs.status`'u güncellemiyor** — bu tamamen testimin hatasıydı. **Çözüm:** `job["status"]` yerine `stubs.persisted[0]["title"]`'ı kontrol ettim. **Ders:** Bir fake/stub'ın gerçekte ne yaptığını bilmeden ona karşı assertion yazmak, test tasarım hatasına yol açabilir.

#### ✅ Modül 6 sonucu: doğrulanmış, tamamlandı

Hem input (prompt injection) hem output (PII) guardrail'i gerçek, ücretsiz, deterministik kontrollerle kuruldu — hiçbiri ekstra OpenAI maliyeti eklemiyor. Yeni Prometheus sayıcısı ve alert kuralı, guardrail'in production'da da izlenebilir olmasını sağlıyor. 18 yeni test yazıldı, hepsi geçti; tam test takımı (301/303, kalan 2'si bilinen çevresel sorun) regresyon göstermedi.

## Faz 3 — Altyapı

### Modül 7 — Infrastructure as Code (Terraform)

**Hedef:** `infrastructure/prod/`'daki VPS kurulumunu (Caddy, backend, n8n, Prometheus, Grafana) Terraform koduna dökmek. **Resmi dokümantasyon:** Terraform dilinin resmi dokümantasyonu ve kullanılan VPS sağlayıcısının (Hetzner/DigitalOcean vb.) resmi Terraform provider dokümantasyonu. **Vindera'da hands-on:** Mevcut altyapıyı **değiştirmeden**, onu tanımlayan bir Terraform modulü yazmak; sadece `terraform plan` ile mevcut kaynaklarla karşılaştırmak. Gerçek `apply` sadece sen açıkça istersen ve ayrı onay verirsen yapılır. **Değerlendirme:** `terraform plan` çıktısını birlikte okuyup neyin değişeceğini yorumlayacağız.

**Kapsam netleştirmesi (senin onayınla):** `docs/DEPLOY.md`'nin kendi ifadesiyle, Vindera henüz **gerçek bir sunucuya deploy edilmedi** ("nothing in this document has been run against a real server"). Sana sordum, sen de bunu doğruladın ve gerçek bir Hetzner API token'ı paylaşmak istemediğini belirttin. Bu yüzden bu modülde `terraform plan`/`apply` **hiç çalıştırılmadı** — sadece kimlik bilgisi gerektirmeyen `init` ve `validate` ile HCL'in doğruluğu kanıtlandı.

#### 📚 Terraform — Kavramdan Uzmanlığa (derin dalış)

**Basit tanım:** 🏗️ **Infrastructure as Code** — sunucu/firewall gibi altyapıyı elle tıklamak yerine kod olarak tanımlamak. Cevapladığı soru: *"Sunucumu kaybedersem, aynısını tekrar nasıl kurarım?"* **Resmi dokümantasyon:** [developer.hashicorp.com/terraform](https://developer.hashicorp.com/terraform/docs)

**Ne sorunu çözüyor?** `docs/DEPLOY.md`'deki kurulum adımları elle, konsoldan tıklanarak yapılacak şekilde yazılmış — tekrarlanabilir değil, `git diff` ile incelenemez, zamanla dokümantasyon ile gerçek durum birbirinden sapabilir. Terraform, bunu kod olarak tanımlar.

| Kavram | Anlamı |
|---|---|
| Provider | HCL kaynaklarını belirli bir bulut sağlayıcının API çağrılarına çeviren eklenti — bizde `hcloud` (Hetzner). |
| Resource | Tek bir altyapı nesnesi — bir sunucu, bir firewall, bir SSH key. |
| State | Terraform'un "şu an ne var olduğuna inandığının" kaydı (`.tfstate`). |
| `terraform init` | Provider eklentisini indirir. **Gerçek hesaba hiç bağlanmaz.** |
| `terraform validate` | HCL'in söz dizimini/iç tutarlılığını kontrol eder. **Gerçek hesaba bağlanmaz.** |
| `terraform plan` | İstenen (HCL) ile mevcut (state + canlı API) arasındaki farkı hesaplar. **Gerçek kimlik bilgisi gerektirir.** |
| `terraform apply` | Plan'ı gerçekten uygular — tek **değiştiren** adım. |
| Idempotency | Aynı kodu tekrar çalıştırmak, değişiklik yoksa "no changes" der. |

**Vindera'ya nasıl uygulandı (kod, satır satır):**

- `infrastructure/terraform/main.tf` (yeni) — `hcloud_server` (CX22, Ubuntu 24.04, Falkenstein — dokümandaki değerlerle birebir), `hcloud_firewall` (22/80/443 TCP + 443 UDP, Caddy'nin QUIC'i dahil), `hcloud_ssh_key`.
- `infrastructure/terraform/variables.tf` — `hcloud_token` (`sensitive = true`), `ssh_public_key`, `server_type`/`location` (varsayılanlar: `cx22`, `fsn1`).
- `infrastructure/terraform/outputs.tf` — sunucunun IP'si.
- `infrastructure/terraform/terraform.tfvars.example` — gerçek değer içermeyen örnek; gerçek `terraform.tfvars`/`.tfstate` `.gitignore`'a eklendi (`.terraform.lock.hcl` ise **bilerek commit edilir**).

**Gerçekten çalıştırılanlar (ikisi de kimlik bilgisi gerektirmez):**

```bash
cd infrastructure/terraform && terraform init      # → "successfully initialized!"
terraform validate                                  # → "Success! The configuration is valid."
terraform fmt -recursive -diff                      # küçük bir hizalama düzeltmesi
```

**Gerçek bir `terraform plan` neden çalıştırılmadı, yerine ne yapıldı:** Sahte bir token ile bilerek bir deneme yaptım — provider'ın gerçek bir API çağrısı yapmadan önce token formatını yerel olarak doğruladığını göstermek için:

```bash
TF_VAR_hcloud_token="dummy-token-for-demo" TF_VAR_ssh_public_key="ssh-ed25519 AAAA...demo" terraform plan
```

**Gerçek çıktı:** `Error: entered token is invalid (must be exactly 64 characters long)` — provider hiçbir ağ isteği göndermeden token'ı reddetti. Hiçbir gerçek Hetzner hesabına dokunulmadı.

**Gerçek bir token olsaydı `terraform plan` ne gösterirdi (açıklayıcı, çalıştırılmadı):** `Plan: 3 to add, 0 to change, 0 to destroy.` — SSH key, firewall, server olmak üzere üç yeni kaynak `+` ile listelenirdi. `apply` onaylanmadan hiçbir şey gerçekleşmez.

#### ✅ Modül 7 sonucu: doğrulanmış, tamamlandı (plan-only)

`docs/DEPLOY.md`'deki üretim sunucusu artık kod olarak da tanımlı — `init`/`validate`/`fmt` ile doğrulandı, gerçek bir hesaba hiç bağlanılmadı. CLAUDE.md'nin "Terraform/Kubernetes plan-only, gerçek apply sadece açık onayla" kuralına tam uyumlu.

### Modül 8 — Kubernetes (Sandbox)

**Hedef:** Backend'i (ve gerekirse Postgres'i) local bir Kubernetes cluster'ında (minikube/kind) çalıştırmak; Helm chart yazmak. **Resmi dokümantasyon:** Kubernetes resmi dokümantasyonu (Deployments, Services, ConfigMaps/Secrets) ve Helm resmi rehberi. **Vindera'da hands-on:** `backend/Dockerfile` imajını kullanarak bir Deployment + Service + ConfigMap yazmak; local Supabase yerine gerekirse geçici bir Postgres pod'u ile bağlamak; bunu **ayrı bir sandbox olarak**, prod docker compose kurulumuna dokunmadan yapmak. **Değerlendirme:** `kubectl get pods/svc` çıktılarını birlikte inceleyip bir pod'u bilerek çöküp self-healing'i gözlemleyeceğiz.

#### 📚 Kubernetes — Kavramdan Uzmanlığa (derin dalış)

**Basit tanım:** ☸️ **Container Orkestrasyon** — container'ları çalışır tutmak, kendi kendini onarmak, sabit bir ağ adresi vermek. Cevapladığı soru: *"Bir container çökerse ne olur, ve gerçekten trafik almaya hazır mı?"* **Resmi dokümantasyon:** [kubernetes.io/docs](https://kubernetes.io/docs/home/) · [helm.sh/docs](https://helm.sh/docs/)

**Ne sorunu çözüyor?** Vindera prod'da `docker compose` kullanıyor (tek VPS, doğru bir seçim bu ölçekte). Kubernetes, çoklu sunucuya yayılan, otomatik ölçeklenen, kendi kendini onaran sistemler için var. Bu modül **prod'a hiç dokunmadan**, tamamen izole bir local cluster'da (minikube) bu farkı elle görmek için.

| Kavram | Anlamı |
|---|---|
| Pod | K8s'in en küçük birimi — bir veya birkaç container'ı sarar. |
| Deployment | "Şu image'dan şu kadar pod hep ayakta olsun" diyen kaynak — bir pod ölürse otomatik yenisini başlatır (**self-healing**). |
| Service | Pod'lara sabit bir ağ adresi/DNS adı veren soyutlama. |
| ConfigMap / Secret | Ortam değişkeni olarak geçirilen, koddan ayrı yapılandırma/gizli veri. |
| livenessProbe | "Süreç hayatta mı?" — başarısız olursa container **öldürülüp yeniden başlatılır**. |
| readinessProbe | "Gerçek trafik almaya hazır mı?" — başarısız olursa pod Service'in rotasyonundan **çıkarılır, ama öldürülmez**. |
| startupProbe | "Uygulama hâlâ açılıyor mu?" — bu geçmeden liveness/readiness hiç değerlendirilmez. |
| Helm | Kubernetes manifest'lerini şablonlayan paket yöneticisi. |

**Vindera'nın kendi kodu, bu dersi hazır bir şekilde veriyor:** `backend/src/api/endpoints/health.py`'nin kendi yorumu — *"`/healthz` never touches a dependency, so a database outage cannot make an orchestrator restart a healthy process; `/readyz` does one cheap query."* — tam olarak Kubernetes'in `livenessProbe`/`readinessProbe` ayrımının kendisi.

**Vindera'ya nasıl uygulandı (kod, satır satır):**

- `infrastructure/k8s-sandbox/vindera-backend/` (yeni Helm chart) — `Chart.yaml`, `values.yaml`, `templates/{deployment,service,configmap,secret}.yaml`.
- `deployment.yaml` — `livenessProbe` → `/healthz`, `readinessProbe` → `/readyz`, `startupProbe` → `/healthz` (aşağıdaki gerçek olaydan sonra eklendi).
- Bilerek **sahte** `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` (`values.yaml`) — amaç gerçek bir Supabase-on-Kubernetes kurmak değil, K8s'in kendi mekaniklerini öğrenmek.

**Gerçekten çalıştırılanlar:**

```bash
minikube start --driver=docker
brew install helm
docker build -t vindera-backend:sandbox backend        # host'ta, minikube'ün içinde değil
minikube image load vindera-backend:sandbox
kubectl create namespace vindera-sandbox
helm install vindera infrastructure/k8s-sandbox/vindera-backend -n vindera-sandbox
```

**Gerçek sonuç 1 — asıl ders (liveness vs readiness):**

```
NAME                       READY   STATUS    RESTARTS   AGE
vindera-6d76975585-km8s5   0/1     Running   0          17s
vindera-6d76975585-wtjsd   0/1     Running   0          17s
```

Pod'lar **Running** ama **0/1 Ready**. `kubectl port-forward` ile doğrudan test ettim:

```
GET /healthz  → HTTP/1.1 200 OK   {"status":"ok"}
GET /readyz   → HTTP/1.1 503 Service Unavailable   {"status":"unavailable"}
```

Container tamamen sağlıklı çalışıyor (liveness geçiyor), ama gerçek trafik almaya hazır değil — Kubernetes bunu doğru şekilde ayırt edip pod'u **öldürmeden** Service'in dışında tutuyor.

**Gerçek sonuç 2 — self-healing:** Bir pod'u bilerek sildim (`kubectl delete pod vindera-6d76975585-km8s5`). Hemen ardından Deployment, ReplicaSet üzerinden otomatik olarak yeni bir pod yarattı — hiçbir elle müdahale olmadan, istenen kopya sayısı (2) korundu.

**Karşılaşılan gerçek sorunlar:**

**1) minikube'ün kendi VM'i bellek açlığından bytecode derlemesi zaman aşımına uğradı:** İlk denemede image'ı minikube'ün içinde build etmeye çalıştım: `Bytecode timed out (60s) compiling file: phonenumbers/geodata/data23.py`. `minikube ssh -- free -h` → VM'in 3.8GiB belleğinin sadece 165Mi'si boş, 1GiB swap'ın tamamı dolu. `minikube start --memory=4096` Docker Desktop'ın kendi bellek sınırının (3919MB) üzerinde olduğu için reddedildi. **Çözüm:** Image'ı host'un kendi daemon'ında build edip `minikube image load` ile cluster'a kopyaladım. **Ders:** Kaynak kısıtlı bir local cluster için, build'i her zaman minikube'ün kendi docker-env'inde değil, host'ta yapıp taşımak daha güvenilir.

**2) Gerçek, çok yaygın bir Kubernetes hatası — `startupProbe` olmadan sağlıklı bir container'ın öldürülmesi:** İlk deployment'ta sadece `initialDelaySeconds: 5` olan bir `livenessProbe` vardı. Olay geçmişi: `Liveness probe failed: connection refused` → `will be restarted` → gerçekten yeniden başlatıldı (`RESTARTS: 2`). Kök sebep: uygulamanın soğuk import zinciri (bu oturumda tekrar tekrar karşılaştığımız `openai` SDK'sının yüzlerce tip tanımı) bazen 5+10 saniyeden uzun sürdü, Kubernetes **sağlıklı ama yavaş açılan** bir container'ı ölü sandı. **Çözüm:** `startupProbe` eklendi (`failureThreshold: 24`, `periodSeconds: 5` → 120 saniyeye kadar süre). Yeni pod **0 restart** ile stabil çalıştı. **Ders:** Yavaş açılan uygulamalarda `startupProbe` olmadan `initialDelaySeconds`'a güvenmek, gerçek dünyada çok sık görülen bir kendi-kendini-sabote etme kalıbı.

#### ✅ Modül 8 sonucu: doğrulanmış, tamamlandı (sandbox)

Backend, tamamen izole bir local Kubernetes sandbox'ında (minikube + Helm) gerçekten çalıştırıldı — prod'un `docker compose` kurulumuna hiç dokunulmadı. Hem "canlı ama hazır değil" ayrımı hem de self-healing, gerçek `kubectl`/`curl` çıktılarıyla kanıtlandı. Temizlik: `helm uninstall vindera -n vindera-sandbox && kubectl delete namespace vindera-sandbox`.

## Faz 4 — İleri Seviye & Capstone

### Modül 9 — Model Serving (vLLM / TGI, Sandbox)

**Hedef:** Açık kaynaklı küçük bir modeli self-host edip, riski düşük bir yan yolda (ör. deal skoruna "ikinci görüş" olarak) kullanmak. Gerçek OpenAI tabanlı prod pipeline'a dokunulmaz. **Resmi dokümantasyon:** vLLM resmi dokümantasyonu (OpenAI-uyumlu API sunucusu) ve Hugging Face model kartı/serving rehberleri. **Vindera'da hands-on:** Modül 8'deki K8s sandbox'ına vLLM'i deploy etmek; `DealAnalyzerAgent`'ın yanına, sonucu sadece loglayan (kararı etkilemeyen) deneysel bir ikinci-model çağrısı eklemek. **Değerlendirme:** Self-hosted model ile OpenAI'ın verdiği skorları Modül 1'deki Langfuse trace'leri üzerinden karşılaştıracağız.

**Araç değişikliği (senin onayınla):** vLLM'in resmi dokümantasyonu, macOS/Apple Silicon'da **sadece kaynak koddan derlenerek** çalıştığını, resmi olarak **"deneysel"** olduğunu ve build sırasında C++ uyumluluk sorunları çıkabileceğini açıkça belirtiyor. Sana sordum, sen de pratik ve güvenilir alternatif olan **Ollama**'yı seçtin — Apple Silicon'da native çalışıyor ve vLLM gibi OpenAI-uyumlu bir API sunuyor.

#### 📚 Model Serving — Kavramdan Uzmanlığa (derin dalış)

**Basit tanım:** 🖥️ **Self-Hosted Serving** — açık ağırlıklı bir modeli kendi altyapında, ücretsiz çalıştırmak. Cevapladığı soru: *"OpenAI'a hiç ödeme yapmadan bir model çalıştırabilir miyim, ve kalitesi nasıl?"* **Resmi dokümantasyon:** [docs.vllm.ai](https://docs.vllm.ai/) · [ollama.com/docs](https://ollama.com/docs)

| Kavram | Anlamı |
|---|---|
| vLLM | Yüksek verimli inference sunucusu — **PagedAttention** ile GPU belleğini verimli kullanır, OpenAI-uyumlu API sunar. |
| TGI | Hugging Face'in benzer amaçlı sunucusu. |
| Quantization | Model ağırlıklarını küçültme (ör. 4-bit). |
| Ollama | Local model çalıştırmayı kolaylaştıran araç — `llama.cpp` kullanır, OpenAI-uyumlu `/v1/chat/completions` sunar. |
| "İkinci görüş" deseni | Gerçek kararı hâlâ OpenAI verir; local model sadece loglanır, karara hiç etki etmez. |

**Vindera'ya nasıl uygulandı (kod, satır satır):**

- `backend/src/core/config.py` — `ENABLE_SECOND_OPINION_MODEL` (varsayılan `false`), `SECOND_OPINION_BASE_URL`, `SECOND_OPINION_MODEL` (`gemma3:1b`).
- `backend/src/agents/second_opinion.py` (yeni) — `get_second_opinion()`: `DealAnalyzerAgent`'ın aynı `SYSTEM_PROMPT`/`_describe_facts()`/`LlmAnalysis`'ını yeniden kullanıyor, sadece client Ollama'ya yönleniyor. Kapalıyken ağ çağrısı yapmadan `None` döner; hata olursa da sessizce `None` — **asla exception fırlatmaz**.
- `backend/src/services/scan_pipeline.py` — gerçek analiz sonrası çağrılıyor; sonuç `build_analysis()` ile karşılaştırılabilir bir skora çevrilip **sadece loglanıyor**, hiçbir kalıcı veriye dokunmuyor.

**Gerçek doğrulama 1:** Ollama'nın OpenAI-uyumluluğu gerçekten `.parse()`'ın katı JSON-schema protokolünü destekliyor mu, garanti değildi — test ettim, **destekliyor**.

**Gerçek doğrulama 2 — kalite farkı (modülün asıl amacı):** `gemma3:1b`'nin çıktısında JSON dışına taşan gereksiz metin ve `holding_period_months=60` gibi gerçekçi olmayan bir değer görüldü — tam olarak bu deneyin göstermesi gereken şey: küçük, local bir model OpenAI'ın yapısal güvenilirliğine henüz ulaşamyor.

**Karşılaşılan gerçek sorun — kendi testimde ölçek hatası:** `analysis_for(kf, 10)`'un `deal_score`'unun `10` olacağını varsaydım; gerçekte `10` her kriterin puanı, `compute_deal_score` bunu 0-100'e ölçekliyor (hepsi maksimumken sonuç `100`). **Çözüm:** testleri `deal_score == 100` olarak düzelttim. **Ders:** Modül 6'daki hatayla aynı sınıf — bir yardımcı fonksiyonun ne ürettiğini varsaymadan önce doğrulamak gerekiyor.

**Gerçek test sonuçları:** 2 yeni test (bayrak kapalıyken; gerçek ama çılgın bir ikinci görüş sonucuyla) — ikisinde de kaydedilen `deal_score` hep gerçek OpenAI analizinden geldi. `uv run pytest -q` → **303/305** (kalan 2'si bilinen disk G/Ç sorunu).

#### ✅ Modül 9 sonucu: doğrulanmış, tamamlandı (sandbox)

Local, ücretsiz bir "ikinci görüş" modeli gerçekten entegre edildi — varsayılan olarak kapalı, açıldığında bile gerçek karara asla dokunmuyor. Ollama'nın OpenAI-uyumluluğu gerçek bir `.parse()` çağrısıyla doğrulandı, küçük modelin gerçek kalite farkı somut olarak gözlemlendi.

### Modül 10 — Pipeline Orchestration (Airflow, Karşılaştırmalı)

**Hedef:** Günlük watchlist scan tetiklemesini (şu an n8n'de) bir Airflow DAG'ı olarak yeniden kurup iki yaklaşımı karşılaştırmak. n8n'deki prod akışına dokunulmaz. **Resmi dokümantasyon:** Apache Airflow resmi dokümantasyonu (DAG yazma, scheduling, Docker ile çalıştırma). **Vindera'da hands-on:** `n8n/Vindera_Daily_Scan.json`'ın mantığını (watchlist çek, `/deals/scan` çağrıları) bir Airflow DAG'ına taşımak; local Airflow'u Docker ile ayağa kaldırmak. **Değerlendirme:** n8n ve Airflow yaklaşımlarını (görsel akış vs. kod-first, hata yönetimi, retry mantığı) birlikte karşılaştıracağız — ne zaman hangisi tercih edilir sorusuna cevap arayacağız.

**Açık yorum notu:** Bu modülün kapsamı hakkında (tam yeniden kurulum mu, kavramsal kıyas mı) daha önce dokümanda bir yorum bıraktın; cevaplanmadan kapatılmıştı. Müfredatın kendi "hands-on" planı zaten net olduğu için (gerçek bir DAG kurmak), o şekilde ilerledim.

#### 📚 Pipeline Orchestration — Kavramdan Uzmanlığa (derin dalış)

**Basit tanım:** 🌬️ **Pipeline Orchestration** — zamanlanmış, birden çok adımlı iş akışlarını kod olarak tanımlamak. Cevapladığı soru: *"n8n'in yaptığı işi kodla yapsaydım, ne değişirdi?"* **Resmi dokümantasyon:** [airflow.apache.org/docs](https://airflow.apache.org/docs/)

| Kavram | Anlamı |
|---|---|
| DAG | Bir iş akışının tamamı — görevler ve aralarındaki bağımlılıklar. |
| Task / Operator | DAG içindeki tek bir adım (bizde: düz Python fonksiyonları, `@task` ile). |
| Scheduler | DAG'ı zamanına göre tetikleyen, görevleri sıraya koyan süreç. |
| Dynamic Task Mapping (`.expand()`) | Bir listedeki her eleman için otomatik paralel bir görev kopyası oluşturma. |
| Variable | Airflow'un kendi key-value deposu. |
| Retry / `retry_delay` | Görev bazında, DAG-seviyesinde varsayılanı override edilebilen yeniden deneme politikası. |

**n8n workflow'unun gerçek analizi:** `n8n/Vindera_Daily_Scan.json`'ı doğrudan okudum. Beş node var: Schedule Trigger (`15 8 * * *`), Fetch Watchlist, Split Watchlist, Trigger FastAPI Deal Scan, Trigger Dead Stock Check. **Sadece "Fetch Watchlist" node'unda** `retryOnFail: true, maxTries: 3, waitBetweenTries: 5000` var — scan ve dead-stock çağrılarında **hiç retry yok**. Bu, n8n'in per-node opsiyonel retry ayarının ne kadar kolay unutulabileceğinin gerçek bir kanıtı.

**Vindera'ya nasıl uygulandı (kod, satır satır):**

- `infrastructure/airflow/dags/vindera_daily_scan.py` (yeni) — TaskFlow API ile üç görev: `fetch_watchlist` (n8n ile **birebir aynı** retry: `retries=3, retry_delay=5s`), `trigger_deal_scan` (retry yok), `trigger_dead_stock_check` (retry yok). `trigger_deal_scan.expand(asin=asins)` — n8n'in "Split Watchlist" + örtük döngüsünün kod-first karşılığı.
- `infrastructure/airflow/docker-compose.yml` (yeni) — **tek container**, `apache/airflow:3.0.3` image'ı `standalone` komutuyla (SQLite + LocalExecutor). Airflow'un resmi çoklu-container compose'u **4GB+ RAM** istiyor — bu makinede Docker Desktop'ın toplam sınırı (~3.8GB) zaten Supabase+n8n+monitoring tarafından paylaşılıyor. **Gerçek kaynak kararı:** Airflow'u başlatmadan önce Modül 8'in minikube'ü ve Modül 4'ün LiteLLM'i durduruldu (silinmeden) yer açmak için.

**Karşılaşılan gerçek sorun — Airflow 3'ün Task SDK'sinde parse-zamanı `Variable.get()` hatası:** İlk yazımda `API_BASE_URL = Variable.get(...)` DAG dosyasının **en üst seviyesinde** tanımlıydı. Sonuç: DAG hiç yüklenmedi, loglarda `Variable with key 'VINDERA_API_BASE_URL' not found` + `404` — Airflow 3'ün yeni Task SDK'sı, parse zamanındaki `Variable.get()` çağrılarını API sunucusuna **gerçek bir ağ isteği** olarak gönderiyor. **Çözüm:** Her iki `Variable.get()` çağrısını sadece `@task` fonksiyonlarının **içinden** çağrılan yardımcı fonksiyonlara taşıdım — bu hem sorunu çözdü hem de Airflow'un kendi resmi tavsiyesi.

**Gerçek doğrulama (bilerek backend çalıştırılmadan — gerçek Keepa/OpenAI maliyeti ve hosted Supabase'e yazma riskini almamak için):**

```bash
docker exec vindera_airflow airflow dags list-import-errors   # → "No data found"
docker exec vindera_airflow airflow dags test vindera_daily_scan 2026-01-01
```

**Gerçek sonuç:** `fetch_watchlist` tam olarak 3 kez yeniden denedi (`try_number=4`, `max_tries=3`) — retry mekanizması doğrulandı — sonra `ConnectionError: Network is unreachable` ile başarısız oldu (beklenen). UI'da "2 Failed Tasks, 1 Failed Run" görüldü, graph görünümünde üç görev de doğru şekilde listelendi.

**Karşılaştırma sonucu:** n8n'in görsel canvas'ı kurulumu hızlandırıyor ve retry ayarını arayüzde anında görebiliyorsun — ama tam olarak bunu doğruladık: 3 node'dan sadece 1'inde retry açıktı, çünkü bu bir sistem varsayılanı değil. Airflow'da retry, DAG-seviyesinde açık bir varsayılan + görev bazında override — kod incelemesinde görülebilir, unutulması daha zor. Dynamic task mapping, n8n'in sabit görsel döngüsünden daha ölçeklenebilir. Ama bedeli gerçek: Python bilgisi gerekiyor, ve bugün gördüğümüz gibi gerçek işletim yükü de var.

#### ✅ Modül 10 sonucu: doğrulanmış, tamamlandı

n8n'in gerçek prod akışının kod-first bir eşlenii, gerçek retry davranışıyla birebir eşleşecek şekilde kuruldu ve gerçek `airflow` CLI komutlarıyla + UI üzerinden doğrulandı — n8n'in kendi prod workflow'una hiç dokunulmadı.

### Modül 11 — Capstone: Entegre Observability (Kavramsal)

**Hedef:** Modül 1 (Langfuse), mevcut Prometheus/Grafana ve OpenTelemetry'yi tek bir izlenebilirlik hikayesinde birleştirmek. **Resmi dokümantasyon:** OpenTelemetry Python SDK ve Grafana'nın OTel/trace entegrasyon rehberi. **Vindera'da hands-on:** Backend'e OTel instrumentation eklemek; `vindera_openai_errors_total` gibi mevcut metriklerle Langfuse trace'lerini aynı zaman çizgisinde okunabilir hale getirmek; Grafana'da tek bir "LLM Health" dashboard'u kurmak. **Değerlendirme:** Bilerek bir hata senaryosu (ör. geçersiz OpenAI key) tetikleyip, hatanın metrik + trace + logda nasıl uçtan uca izlenebildiğini birlikte doğrulayacağız. Bu, tüm müfredatın kapanış görevi olacak.

**Kapsam notu:** Bu modül, orijinal plandan (OTel instrumentation kurulumu + yeni Grafana dashboard'u) bilerek daraltıldı: bu modülün hemen ardından `learn/llmops` branch'i tamamen silinip `main`'e dönülecek, bu yüzden yeni bir bağımlılık/servis kurup birkaç saat içinde geri sökmek anlamsız olurdu. Modül 11 burada **tamamen kavramsal** işlendi — hands-on kurulum yok, yeni paket yok. İçerik, mevcut Vindera altyapısını (Modül 1'in Langfuse'u, prod'un Prometheus/Grafana'sı) referans alarak "hepsi birlikte nasıl çalışırdı" sorusunu cevaplıyor; ileride ayrı, kalıcı bir branch'te gerçek hands-on olarak açılabilir.

#### 📚 Entegre Observability — Kavramdan Uzmanlığa (derin dalış)

**Basit tanım:** 🔭 **Entegre Observability** — ayrı ayrı çalışan izleme araçlarını (LLM-özel tracing, altyapı metrikleri, loglar) tek bir olay etrafında okunabilir hale getirmek. Cevapladığı soru: *"Prod'da bir şey ters giderse, tek bir olayı log + metrik + trace'te uçtan uca takip edebilir miyim?"* **Resmi dokümantasyon:** [opentelemetry.io/docs](https://opentelemetry.io/docs/) · [grafana.com/docs](https://grafana.com/docs/)

| Kavram | Anlamı |
|---|---|
| Observability'nin 3 sütunu | **Logs** (ayrık olaylar), **Metrics** (zaman içinde sayılar), **Traces** (bir isteğin sistem içindeki tam yolculuğu). |
| Trace / Span | Trace = bir isteğin baştan sona hikayesi. Span = o hikayenin tek bir adımı (ör. "Keepa çağrısı", "OpenAI çağrısı"). |
| Correlation ID | Aynı isteğe ait log satırını, metriği ve trace'i birbirine bağlayan ortak kimlik (Vindera'da: `request_id`). |
| OpenTelemetry (OTel) | Farklı araçların (Langfuse, Prometheus, Grafana, Sentry) format konusunda anlaştığı, satıcı-bağımsız standart. |
| LLM-özel vs genel tracing | Langfuse; prompt, token sayısı, maliyet gibi LLM'e özel alanları anlar. OTel/Prometheus bunları bilmez, sadece genel "bu adım ne kadar sürdü / kaç kez hata verdi" bilgisini tutar — rakip değil, tamamlayıcıdırlar. |

**Vindera'da bugün zaten var olanlar (bu modülün üzerine kurulacağı temel):**

- `core/logging_config.py` — stdout'a JSON log, her istekte `request_id`.
- `/healthz`, `/readyz` — canlılık/hazır olma ayrımı (Modül 8'de K8s ile gerçek pod'larla doğrulandı).
- Prometheus metrikleri (`vindera_scan_jobs_total`, `vindera_keepa_tokens_left`, `vindera_openai_errors_total`) + `infrastructure/monitoring/alerts.yml`.
- Grafana (port 3002) — bu metrikleri gösteren, projeyle birlikte kalıcı olan dashboard.
- Sentry (`SENTRY_DSN`, opsiyonel) — PII temizlenmiş hata raporlama.
- Modül 1'de eklenen Langfuse tracing (bu branch'le birlikte kaldırılacak, ama deseni burada kayıtlı kalıyor).

**Gerçek entegre bir kurulum olsaydı adımlar şöyle olurdu (dokümante edildi, bilerek çalıştırılmadı):**

1. `opentelemetry-instrumentation-fastapi` ile backend'e otomatik span üretimi eklemek.
2. Her isteğin `request_id`'sini OTel trace ID'siyle eşleştirip JSON loglara tek satır olarak işlemek.
3. Grafana'da, Prometheus metrikleriyle trace'leri aynı dashboard'da yan yana gösteren tek bir "LLM Health" panosu kurmak.
4. Bilerek geçersiz bir `OPENAI_API_KEY` ile bir istek tetikleyip: `vindera_openai_errors_total` metriğinin arttığını, JSON logda hatanın göründüğünü ve Sentry'de aynı olayın raporlandığını — üçünü de aynı `request_id` üzerinden eşleştirerek doğrulamak.

**Neden hands-on yapılmadı (açık karar):** Branch bu turda tamamen silinip `main`'e dönülecek; yeni bir OTel bağımlılığı eklemek, birkaç saat içinde geri sökülecek bir şeyi kurmak olurdu. Müfredatın kendi güvenlik kuralı da yeni bağımlılıkların CI'ı bozmayacak şekilde eklenmesini şart koşuyor — bu da gerçek bir hands-on'un en azından bir branch/PR ömrü kadar yaşamasını gerektirirdi.

#### ✅ Modül 11 sonucu: kavramsal olarak tamamlandı (hands-on bilerek atlandı)

Observability'nin üç sütunu, OpenTelemetry'nin rolü ve Vindera'nın mevcut gözlemlenebilirlik altyapısının (loglar, healthz/readyz, Prometheus/Grafana, Sentry) hangi boşluğu (LLM-özel tracing, uçtan uca correlation) kapatabileceği kavramsal olarak netleşti. Gerçek kurulum, ileride ayrı, kalıcı bir branch'te ele alınabilir.

## 🎓 Müfredat Kapanışı

Bu, 11 modüllük LLMOps / AI Platform Engineering müfredatının sonu. `learn/llmops` branch'indeki tüm hands-on kod (Langfuse tracing, DeepEval evals, pgvector migration, LiteLLM gateway, MLflow tracking, Presidio/injection guard, Terraform, K8s sandbox, Ollama ikinci görüş, Airflow DAG'ı) bilerek ve tamamen silindi — branch hiçbir zaman `main`'e commit atılmadan kapatıldı. Bu doküman, müfredatın **tek kalıcı kaydı** olarak kalıyor: her modülün gerçek terminal çıktısı, karşılaşılan gerçek hatalar ve alınan mühendislik kararları burada.

## Kapsam Dışı / Bonus

**GPU Altyapısı (GPU scheduling, K8s + Slurm entegrasyonu):** Vindera'nın hiçbir bileşeni GPU gerektirmiyor (tüm LLM çağrıları hosted OpenAI API üzerinden). Bu yüzden bu konu müfredatın ana gövdesine dahil edilmedi. İstersen ileride, Modül 9'daki self-hosted model deneyiminin üzerine geçici bir cloud GPU instance'ı (ör. bir saatliğine kiralanan bir GPU) ekleyerek **ayrı bir bonus mini-proje** olarak ele alabiliriz.

## İlerleme Takibi

- Bir modülü bitirdiğinde bana "Modül X'i bitirdim, sıradakine geçelim" de — o modülün detaylı dersini (dokümantasyon linkleri, adım adım hands-on görevler, interaktif sorular) sohbette üreterek başlatacağım.
- Modül sırasında takıldığın her yerde soru sorabilirsin; sırayı bozmadan devam ederiz.
- Bu dokümanı ilerledikçe güncelleyeceğim: tamamlanan modüllerin başlıklarına ✅ ekleyeceğim, gerekirse sırayı senin geri bildirimine göre yeniden düzenleyeceğiz (ör. bir konu işine daha yakınsa öne çekebiliriz).
- Başlamaya hazır olduğunda Modül 0 ile başlayabiliriz.