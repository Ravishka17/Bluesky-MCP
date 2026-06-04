export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" style={{ background: '#0a0a0a', margin: 0 }}>
      <body style={{ background: '#0a0a0a', margin: 0 }}>{children}</body>
    </html>
  );
}