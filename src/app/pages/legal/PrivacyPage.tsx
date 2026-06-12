import { LegalDoc, LegalShell, SUPPORT_EMAIL } from "./LegalShell";

const DOC: { en: LegalDoc; id: LegalDoc } = {
  en: {
    title: "Privacy Policy",
    updated: "Last updated: 11 June 2026",
    intro:
      "This Privacy Policy explains what information LokaSync (“we”, “us”) collects when you use the LokaSync project-management workspace, how we use it, and the choices you have. By creating an account or using LokaSync you agree to this policy.",
    sections: [
      {
        title: "Information we collect",
        blocks: [
          "We only collect information that is needed to provide the service:",
          [
            "Account information — your full name, email address, phone number, job title, and company name, provided when you register or edit your profile.",
            "Workspace content — the projects, tasks, calendar events, files metadata, and other content you create inside your workspace.",
            "Billing information — your chosen plan, billing interval, voucher codes you apply, and the status of your payment transactions.",
            "Technical information — basic device and browser preferences (such as your language choice), stored locally on your device.",
          ],
        ],
      },
      {
        title: "How we use your information",
        blocks: [
          "We use your information to:",
          [
            "Create and secure your account, and let you sign in.",
            "Provide the workspace features: tasks, projects, calendar, teams, analytics, and files.",
            "Process subscription payments and apply vouchers.",
            "Show your name and plan inside the app, and contact you about your account (for example, email verification and password reset).",
            "Maintain, debug, and improve the service.",
          ],
          "We do not sell your personal information, and we do not use it for third-party advertising.",
        ],
      },
      {
        title: "Payments",
        blocks: [
          "Payments are processed by Midtrans, a licensed Indonesian payment gateway. When you pay, your name, email, and phone number are shared with Midtrans to create the transaction, and Midtrans handles the payment itself (for example, a bank virtual account). We never see or store your card numbers or bank credentials — we only store the order ID, amount, payment method, and transaction status.",
          "Midtrans processes your data under its own privacy policy, available on the Midtrans website.",
        ],
      },
      {
        title: "Where your data is stored",
        blocks: [
          "Your account and workspace data are stored with Supabase, our cloud infrastructure provider. Data is protected in transit with HTTPS/TLS, and access to it is restricted to your authenticated account.",
        ],
      },
      {
        title: "Cookies and local storage",
        blocks: [
          "LokaSync uses browser storage for essential purposes only:",
          [
            "Keeping you signed in (authentication session).",
            "Remembering preferences such as your language choice.",
          ],
          "We do not use advertising or cross-site tracking cookies.",
        ],
      },
      {
        title: "Data retention and deletion",
        blocks: [
          "We keep your data for as long as your account is active. If your subscription ends, your data remains stored and your account simply returns to the Free plan. You may request deletion of your account and associated data at any time by contacting us; we will delete it within a reasonable period, except for transaction records we are legally required to keep.",
        ],
      },
      {
        title: "Your rights",
        blocks: [
          "You can view and update your profile information at any time from the Profile page. You may also request a copy of your data, correction of inaccurate data, or deletion of your account by emailing us at " +
            SUPPORT_EMAIL +
            ".",
        ],
      },
      {
        title: "Children",
        blocks: [
          "LokaSync is not directed at children under 13, and we do not knowingly collect personal information from them.",
        ],
      },
      {
        title: "Changes to this policy",
        blocks: [
          "We may update this Privacy Policy from time to time. When we do, we will update the “Last updated” date above. Significant changes will be announced inside the app or by email.",
        ],
      },
    ],
  },
  id: {
    title: "Kebijakan Privasi",
    updated: "Terakhir diperbarui: 11 Juni 2026",
    intro:
      "Kebijakan Privasi ini menjelaskan informasi apa yang dikumpulkan LokaSync (“kami”) saat Anda menggunakan ruang kerja manajemen proyek LokaSync, bagaimana kami menggunakannya, dan pilihan yang Anda miliki. Dengan membuat akun atau menggunakan LokaSync, Anda menyetujui kebijakan ini.",
    sections: [
      {
        title: "Informasi yang kami kumpulkan",
        blocks: [
          "Kami hanya mengumpulkan informasi yang diperlukan untuk menyediakan layanan:",
          [
            "Informasi akun — nama lengkap, alamat email, nomor telepon, jabatan, dan nama perusahaan, yang Anda berikan saat mendaftar atau mengubah profil.",
            "Konten ruang kerja — proyek, tugas, agenda kalender, metadata file, dan konten lain yang Anda buat di dalam ruang kerja.",
            "Informasi tagihan — paket yang Anda pilih, interval tagihan, kode voucher yang Anda gunakan, dan status transaksi pembayaran Anda.",
            "Informasi teknis — preferensi perangkat dan browser dasar (seperti pilihan bahasa), yang disimpan secara lokal di perangkat Anda.",
          ],
        ],
      },
      {
        title: "Bagaimana kami menggunakan informasi Anda",
        blocks: [
          "Kami menggunakan informasi Anda untuk:",
          [
            "Membuat dan mengamankan akun Anda, serta memproses login.",
            "Menyediakan fitur ruang kerja: tugas, proyek, kalender, tim, analitik, dan file.",
            "Memproses pembayaran langganan dan menerapkan voucher.",
            "Menampilkan nama dan paket Anda di dalam aplikasi, serta menghubungi Anda terkait akun (misalnya verifikasi email dan reset kata sandi).",
            "Memelihara, memperbaiki, dan meningkatkan layanan.",
          ],
          "Kami tidak menjual informasi pribadi Anda dan tidak menggunakannya untuk iklan pihak ketiga.",
        ],
      },
      {
        title: "Pembayaran",
        blocks: [
          "Pembayaran diproses oleh Midtrans, gerbang pembayaran berlisensi di Indonesia. Saat Anda membayar, nama, email, dan nomor telepon Anda dibagikan ke Midtrans untuk membuat transaksi, dan Midtrans yang menangani pembayarannya (misalnya virtual account bank). Kami tidak pernah melihat atau menyimpan nomor kartu maupun kredensial bank Anda — kami hanya menyimpan ID pesanan, jumlah, metode pembayaran, dan status transaksi.",
          "Midtrans memproses data Anda berdasarkan kebijakan privasinya sendiri, yang tersedia di situs web Midtrans.",
        ],
      },
      {
        title: "Di mana data Anda disimpan",
        blocks: [
          "Data akun dan ruang kerja Anda disimpan di Supabase, penyedia infrastruktur cloud kami. Data dilindungi saat transit dengan HTTPS/TLS, dan aksesnya dibatasi hanya untuk akun Anda yang terautentikasi.",
        ],
      },
      {
        title: "Cookie dan penyimpanan lokal",
        blocks: [
          "LokaSync menggunakan penyimpanan browser hanya untuk keperluan esensial:",
          [
            "Menjaga Anda tetap masuk (sesi autentikasi).",
            "Mengingat preferensi seperti pilihan bahasa.",
          ],
          "Kami tidak menggunakan cookie iklan atau pelacakan lintas situs.",
        ],
      },
      {
        title: "Penyimpanan dan penghapusan data",
        blocks: [
          "Kami menyimpan data Anda selama akun Anda aktif. Jika langganan berakhir, data Anda tetap tersimpan dan akun hanya kembali ke paket Free. Anda dapat meminta penghapusan akun beserta datanya kapan saja dengan menghubungi kami; kami akan menghapusnya dalam jangka waktu wajar, kecuali catatan transaksi yang wajib kami simpan menurut hukum.",
        ],
      },
      {
        title: "Hak Anda",
        blocks: [
          "Anda dapat melihat dan memperbarui informasi profil kapan saja dari halaman Profil. Anda juga dapat meminta salinan data, perbaikan data yang tidak akurat, atau penghapusan akun dengan mengirim email ke " +
            SUPPORT_EMAIL +
            ".",
        ],
      },
      {
        title: "Anak-anak",
        blocks: [
          "LokaSync tidak ditujukan untuk anak di bawah 13 tahun, dan kami tidak dengan sengaja mengumpulkan informasi pribadi dari mereka.",
        ],
      },
      {
        title: "Perubahan kebijakan ini",
        blocks: [
          "Kami dapat memperbarui Kebijakan Privasi ini dari waktu ke waktu. Saat itu terjadi, tanggal “Terakhir diperbarui” di atas akan kami sesuaikan. Perubahan signifikan akan diumumkan di dalam aplikasi atau melalui email.",
        ],
      },
    ],
  },
};

export function PrivacyPage() {
  return <LegalShell doc={DOC} />;
}
