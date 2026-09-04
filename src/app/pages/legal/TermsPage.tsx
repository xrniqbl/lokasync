import { LegalDoc, LegalShell, SUPPORT_EMAIL } from "./LegalShell";

const DOC: { en: LegalDoc; id: LegalDoc } = {
  en: {
    title: "Terms of Service",
    updated: "Last updated: 11 June 2026",
    intro:
      "These Terms of Service (\"Terms\") govern your use of LokaSync, a project-management workspace operated by LokaSync (\"we\", \"us\"). By creating an account or using LokaSync you agree to these Terms. If you do not agree, please do not use the service.",
    sections: [
      {
        title: "Your account",
        blocks: [
          "You must provide accurate registration information and keep your password confidential. You are responsible for all activity that happens under your account. You must be at least 13 years old to use LokaSync, and if you use it on behalf of a company, you confirm you are authorized to accept these Terms for that company.",
        ],
      },
      {
        title: "The service and plans",
        blocks: [
          "LokaSync offers a Free plan and paid plans (Pro and Business). Each plan has its own limits and features as described on the Pricing page -- for example, the Free plan is limited to 3 projects, while paid plans unlock features such as Analytics and Team management.",
          "We may adjust plan features and prices. Price changes never apply retroactively to a subscription period you have already paid for.",
        ],
      },
      {
        title: "Payments and billing",
        blocks: [
          [
            "Paid plans are billed in advance, either monthly or yearly, in Indonesian Rupiah.",
            "Payments are processed by Midtrans. A subscription becomes active once Midtrans confirms your payment has settled.",
            "Yearly billing is charged at the equivalent of 10 monthly payments (2 months free).",
            "Voucher discounts are applied at checkout to the first payment they cover; each voucher has its own conditions and usage limit.",
          ],
          "Subscriptions are prepaid for a fixed period and do not auto-renew: when your period ends, your account automatically returns to the Free plan unless you renew. Your data is never deleted because a subscription ends -- paid features simply lock until you upgrade again.",
        ],
      },
      {
        title: "Refunds",
        blocks: [
          "Payments that have settled are non-refundable, except where required by Indonesian law or when we fail to deliver the service for a prolonged period due to a fault on our side. If you believe a charge is incorrect, contact us within 14 days and we will review it.",
        ],
      },
      {
        title: "Your content",
        blocks: [
          "You keep full ownership of everything you create in your workspace -- projects, tasks, files, and other content. You grant us only the technical license needed to store, display, and process that content in order to run the service. You are responsible for your content and must have the rights to anything you upload.",
        ],
      },
      {
        title: "Acceptable use",
        blocks: [
          "You agree not to:",
          [
            "Use LokaSync for anything unlawful, or to store or share content that is illegal, infringing, or harmful.",
            "Attempt to breach, probe, or circumvent our security, plan limits, or payment flow.",
            "Resell or provide the service to third parties without our written consent.",
            "Interfere with the service, for example by sending automated traffic that degrades it for others.",
          ],
          "We may suspend or terminate accounts that violate these rules.",
        ],
      },
      {
        title: "Availability and changes to the service",
        blocks: [
          "We work to keep LokaSync available and reliable, but the service is provided \"as is\" without a guaranteed uptime level. We may add, change, or remove features. If we discontinue the service entirely, we will give reasonable notice so you can export your data.",
        ],
      },
      {
        title: "Limitation of liability",
        blocks: [
          "To the maximum extent permitted by law, LokaSync is not liable for indirect, incidental, or consequential damages -- such as lost profits or lost data -- arising from your use of the service. Our total liability for any claim is limited to the amount you paid us in the 12 months before the claim arose.",
        ],
      },
      {
        title: "Termination",
        blocks: [
          "You may stop using LokaSync and request account deletion at any time. We may suspend or terminate your account if you materially breach these Terms, with notice where reasonably possible. Sections that by their nature should survive (such as ownership, liability limits, and governing law) survive termination.",
        ],
      },
      {
        title: "Governing law",
        blocks: [
          "These Terms are governed by the laws of the Republic of Indonesia. Any dispute will first be attempted to be resolved amicably; failing that, it will be settled in the competent courts of Indonesia.",
        ],
      },
      {
        title: "Changes to these Terms",
        blocks: [
          "We may update these Terms from time to time. The \"Last updated\" date above reflects the latest version. If a change is significant, we will announce it inside the app or by email. Continuing to use LokaSync after a change means you accept the updated Terms.",
        ],
      },
    ],
  },
  id: {
    title: "Syarat Layanan",
    updated: "Terakhir diperbarui: 11 Juni 2026",
    intro:
      "Syarat Layanan ini (\"Syarat\") mengatur penggunaan Anda atas LokaSync, ruang kerja manajemen proyek yang dioperasikan oleh LokaSync (\"kami\"). Dengan membuat akun atau menggunakan LokaSync, Anda menyetujui Syarat ini. Jika tidak setuju, mohon tidak menggunakan layanan.",
    sections: [
      {
        title: "Akun Anda",
        blocks: [
          "Anda wajib memberikan informasi pendaftaran yang akurat dan menjaga kerahasiaan kata sandi. Anda bertanggung jawab atas semua aktivitas yang terjadi pada akun Anda. Anda harus berusia minimal 13 tahun untuk menggunakan LokaSync, dan jika menggunakannya atas nama perusahaan, Anda menyatakan berwenang menerima Syarat ini untuk perusahaan tersebut.",
        ],
      },
      {
        title: "Layanan dan paket",
        blocks: [
          "LokaSync menyediakan paket Free dan paket berbayar (Pro dan Business). Setiap paket memiliki batas dan fitur masing-masing sebagaimana dijelaskan di halaman Harga -- misalnya paket Free dibatasi 3 proyek, sedangkan paket berbayar membuka fitur seperti Analitik dan manajemen Tim.",
          "Kami dapat menyesuaikan fitur dan harga paket. Perubahan harga tidak pernah berlaku surut terhadap periode langganan yang sudah Anda bayar.",
        ],
      },
      {
        title: "Pembayaran dan tagihan",
        blocks: [
          [
            "Paket berbayar ditagih di muka, bulanan atau tahunan, dalam Rupiah.",
            "Pembayaran diproses oleh Midtrans. Langganan aktif setelah Midtrans mengonfirmasi pembayaran Anda berhasil (settlement).",
            "Tagihan tahunan dikenakan setara 10 pembayaran bulanan (gratis 2 bulan).",
            "Diskon voucher diterapkan di halaman checkout pada pembayaran yang dicakupnya; setiap voucher memiliki ketentuan dan batas pemakaian masing-masing.",
          ],
          "Langganan dibayar di muka untuk periode tetap dan tidak diperpanjang otomatis: saat periode berakhir, akun Anda otomatis kembali ke paket Free kecuali Anda memperpanjang. Data Anda tidak pernah dihapus karena langganan berakhir -- fitur berbayar hanya terkunci sampai Anda upgrade kembali.",
        ],
      },
      {
        title: "Pengembalian dana",
        blocks: [
          "Pembayaran yang sudah berhasil (settlement) tidak dapat dikembalikan, kecuali diwajibkan oleh hukum Indonesia atau jika kami gagal menyediakan layanan dalam jangka waktu lama karena kesalahan di pihak kami. Jika Anda yakin ada tagihan yang keliru, hubungi kami dalam 14 hari dan kami akan meninjaunya.",
        ],
      },
      {
        title: "Konten Anda",
        blocks: [
          "Anda tetap memiliki sepenuhnya semua yang Anda buat di ruang kerja -- proyek, tugas, file, dan konten lainnya. Anda hanya memberi kami lisensi teknis yang diperlukan untuk menyimpan, menampilkan, dan memproses konten tersebut demi menjalankan layanan. Anda bertanggung jawab atas konten Anda dan harus memiliki hak atas apa pun yang Anda unggah.",
        ],
      },
      {
        title: "Penggunaan yang wajar",
        blocks: [
          "Anda setuju untuk tidak:",
          [
            "Menggunakan LokaSync untuk hal yang melanggar hukum, atau menyimpan dan membagikan konten ilegal, melanggar hak pihak lain, atau berbahaya.",
            "Mencoba membobol, memindai, atau mengakali keamanan, batas paket, maupun alur pembayaran kami.",
            "Menjual kembali atau menyediakan layanan ini kepada pihak ketiga tanpa persetujuan tertulis dari kami.",
            "Mengganggu layanan, misalnya mengirim trafik otomatis yang menurunkan kualitas layanan bagi pengguna lain.",
          ],
          "Kami dapat menangguhkan atau menghentikan akun yang melanggar aturan ini.",
        ],
      },
      {
        title: "Ketersediaan dan perubahan layanan",
        blocks: [
          "Kami berupaya menjaga LokaSync tetap tersedia dan andal, namun layanan disediakan \"sebagaimana adanya\" tanpa jaminan tingkat uptime tertentu. Kami dapat menambah, mengubah, atau menghapus fitur. Jika layanan dihentikan sepenuhnya, kami akan memberi pemberitahuan yang wajar agar Anda dapat mengekspor data.",
        ],
      },
      {
        title: "Batasan tanggung jawab",
        blocks: [
          "Sejauh diizinkan hukum, LokaSync tidak bertanggung jawab atas kerugian tidak langsung, insidental, atau konsekuensial -- seperti kehilangan keuntungan atau kehilangan data -- yang timbul dari penggunaan layanan. Total tanggung jawab kami atas klaim apa pun dibatasi sebesar jumlah yang Anda bayarkan kepada kami dalam 12 bulan sebelum klaim timbul.",
        ],
      },
      {
        title: "Penghentian",
        blocks: [
          "Anda dapat berhenti menggunakan LokaSync dan meminta penghapusan akun kapan saja. Kami dapat menangguhkan atau menghentikan akun Anda jika Anda melanggar Syarat ini secara material, dengan pemberitahuan bila memungkinkan. Ketentuan yang menurut sifatnya tetap berlaku (seperti kepemilikan, batasan tanggung jawab, dan hukum yang mengatur) tetap berlaku setelah penghentian.",
        ],
      },
      {
        title: "Hukum yang mengatur",
        blocks: [
          "Syarat ini diatur oleh hukum Republik Indonesia. Setiap sengketa akan diupayakan diselesaikan secara musyawarah terlebih dahulu; jika tidak tercapai, akan diselesaikan di pengadilan yang berwenang di Indonesia.",
        ],
      },
      {
        title: "Perubahan Syarat ini",
        blocks: [
          "Kami dapat memperbarui Syarat ini dari waktu ke waktu. Tanggal \"Terakhir diperbarui\" di atas menunjukkan versi terkini. Jika ada perubahan signifikan, kami akan mengumumkannya di dalam aplikasi atau melalui email. Tetap menggunakan LokaSync setelah perubahan berarti Anda menerima Syarat yang diperbarui. Pertanyaan dapat dikirim ke " +
            SUPPORT_EMAIL +
            ".",
        ],
      },
    ],
  },
};

export function TermsPage() {
  return <LegalShell doc={DOC} />;
}
