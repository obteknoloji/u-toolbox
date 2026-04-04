<div align="center">
  <img src="assets/logo.png" alt="Ü Toolbox Logo" width="128" />
  # Ü Toolbox
  ![App Version](https://img.shields.io/badge/version-0.0.1-blue)
  ![License](https://img.shields.io/badge/license-GPLv3-blue)
  ![Platform](https://img.shields.io/badge/platform-Windows_11-0078d7)
</div>
<br>

**Ü Toolbox**, Windows 11 deneyiminizi iyileştirmek, gizliliğinizi artırmak ve sistem performansını maksimize etmek için özel olarak tasarlanmış **açık kaynaklı** bir araç setidir. Ağır sistem programlarına ihtiyaç duymadan, modern bir arayüz ile bilgisayarınızın kontrolünü tamamen elinize alın.
## Öne Çıkan Özellikler
- **Sistem İzleme & Özeti:** CPU, RAM, Ekran Kartı, Depolama ve İnternet kullanımınızı anlık olarak modern bir panodan takip edin.
- **Derinlemesine Temizlik:** Temp, Prefetch, Windows Update artıkları, Minidump ve önbellek dosyalarını güvenle temizleyerek disk alanı açın. Temizlik geçmişinizi saklayın.
- **RAM Optimizasyonu:** Arka planda bekleyen ve askıda kalan uygulamaların bellekteki (Working Set) yerini zorla boşaltarak sistemi rahatlatın.
- **Windows Debloat & Tweaks:**
  - Tek tıkla Microsoft Edge ve OneDrive'ı sistemden kalıcı olarak sökün.
  - Ultimate (Nihai) Performans modunu açın, Hazırda Bekletme'yi kapatıp diskte yer açın.
  - Windows klasik sağ tık menüsüne (Context Menu) geri dönün, başlat menüsündeki Bing aramalarını kapatın.
- **Güvenlik & Gizlilik:**
  - **Telemetri Engelleyici:** Etkinlik geçmişini, konum takibini ve Microsoft teşhis veri akışını kapatın.
  - **Güvenli Dosya Silici (Shredder):** Dosyalarınızı kurtarılamayacak şekilde diskten fiziksel olarak yok edin.
  - **URL Kontrolü:** Kısaltılmış şüpheli linklerin (bit.ly vb.) arkasındaki gerçek hedefleri tıklamadan görün.
- **Kapanış Planlayıcı:** Bilgisayarınızı geri sayım sayacıyla veya belirli bir saatte otomatik olarak kapanmaya programlayın.
- **Kullanım Geçmişi:** Bilgisayarınızı hangi gün ve hangi saat aralıklarında ne kadar süreyle kullandığınızı detaylı olarak görüntüleyin.
- **Sistem Geri Yükleme:** Herhangi bir kritik ayar öncesi Windows'un sağlıklı anının güvenli yedeğini tek tıkla oluşturun.
---
## Geliştirme ve Kurulum
Projeyi kendi bilgisayarınızda çalıştırmak veya geliştirmeye katkıda bulunmak için aşağıdaki adımları izleyin.
### Gereksinimler
- [Node.js](https://nodejs.org/) (Sürüm 18+ önerilir)
- Windows 11 İşletim Sistemi.
### 1. Klonlama ve Yükleme
```bash
# Repoyu bilgisayarınıza indirin
git clone https://github.com/obteknoloji/u-toolbox.git
# Proje klasörüne girin
cd u-toolbox/ToolboxApp
# Gerekli kütüphaneleri yükleyin
npm install
```

## 2. Geliştirici Modunda Başlatma
Koddaki değişiklikleri anında görebilmek (Hot-reload) için geliştirici modunda şu komutla çalıştırın:
```bash
npm run electron:dev
```
## Paketleme ve Derleme (.exe oluşturma)
Projeyi düzenledikten sonra kendiniz veya son kullanıcılar için yüklenebilir/çalıştırılabilir bir .exe dosyası oluşturmak istiyorsanız:
```bash
npm run electron:build
```
Bu işlem tamamlandığında proje klasörünün içindeki release klasöründe uygulamanızın çalıştırılabilir yükleme dosyası bulunacaktır.

## Kullanılan Teknolojiler
- Electron.js: Masaüstü entegrasyonu ve çekirdek yapısı.
- Vite: Hızlı frontend derleyicisi ve HMR.
- Vanilla JS & CSS3: Saf ve yüksek performanslı, framework-bağımsız ön yüz donanımı ve Glassmorphism tasarımı.

## Katkıda Bulunma
Bu proje topluluğa açıktır! Herhangi bir eksiği tamamlayabilir, hata bildirebilir (Issue) veya yeni bir özellik ekleyip çekme isteği (Pull Request) gönderebilirsiniz. Yeni ince ayarlar (tweaks) eklemek için her zaman açığız.
