export const metadata = {
  title: "Meeting Recorder Backend",
  description: "API backend para transcrição e ata de reuniões",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
