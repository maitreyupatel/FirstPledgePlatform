export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-4xl font-bold tracking-tight">Page Not Found</h1>
      <p className="max-w-md text-muted-foreground">
        The page you are looking for might have been removed, renamed, or does not exist.
      </p>
    </main>
  );
}

