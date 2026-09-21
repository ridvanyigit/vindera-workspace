# VINDERA - Senin Yapman Gereken Adimlar

> Bu dosya iskelet halinde. Faz 9'da tam, adim adim, tiklama duzeyinde rehbere donusturulecek.
> Simdilik yazilim tarafindan yapilamayan ve kesfedilen maddeler asagida birikiyor.

Oncelik etiketleri: **Launch-blocker** (canliya cikmadan once sart), **Soon** (ilk haftalar), **Later**.

## Bulunan maddeler (Faz 9'da genisletilecek)

### Launch-blocker

1. **Yedek al, sonra migration'lari uygula.** Faz 2'de yazilan migration'lar uzaktaki (hosted) Supabase veritabanina `supabase db push` ile SADECE yedek alindiktan sonra uygulanmali. Ben (Claude) bunu senin onayin olmadan calistirmayacagim.
2. **Supabase Dashboard: herkese acik kayit (signup) kapatilmali.** Authentication -> Sign In / Providers bolumunden "Allow new users to sign up" kapatilmali. Su an sadece `admin_users` tablosundaki hesaplar admin olabiliyor ama kayit acik olmamali.
3. **Yeni gizli anahtarlar uretilmeli:** `AUTOMATION_SHARED_SECRET` ve `METRICS_TOKEN` (her biri icin `openssl rand -hex 32`). Bunlar Faz 1'de backend'e ve n8n'e gerekli hale geldi; production'da ikisi de tanimli degilse backend acilmaz.
4. **n8n icinde `X-Vindera-Key` degiskeni tanimlanmali** (Faz 1'de workflow guncellendi): n8n -> Settings -> Variables (veya Credentials) altinda `VINDERA_AUTOMATION_KEY` ve `VINDERA_API_BASE_URL`.

### Soon

5. **Eski herkese acik fatura linkleri** (`opportunities.invoice_url`): Faz 2'de `invoices` bucket'i private yapiliyor. Eski dosyalari indirip uygulama uzerinden yeniden yuklemen gerekecek.
6. **Supabase admin hesabina MFA (TOTP) ekle.**

### Later

7. Hosted `events_calendar` tablosundaki satirlar Faz 2'de migration ile eklenecek; Supabase Table Editor'den kontrol et.

## Faz 9'da doldurulacak basliklar

Yedek ve migration, anahtar rotasyonu, Supabase panel ayarlari, `business_settings` degerleri, hesaplar/hosting, n8n, ilk admin kullanicisi, yasal/vergi maddeleri (Steuerberater ve avukat icin sorular), canli kontrol listesi, ilk hafta rutini, geri alma (rollback).
