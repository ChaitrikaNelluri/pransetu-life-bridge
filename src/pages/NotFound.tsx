import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { PranSetuMark } from "@/components/PranSetuMark";
import { APP_NAME } from "@/convex/lib/constants";

export default function NotFound() {
  return (
    <div className="paper-texture flex min-h-screen flex-col items-center justify-center px-4">
      <PranSetuMark className="size-14 text-primary/70" />
      <p className="stamp mt-6 text-muted-foreground">Folio not found · 404</p>
      <h1 className="mt-2 text-center font-serif text-4xl font-black">
        This page is missing from the archive.
      </h1>
      <p className="mt-3 max-w-md text-center text-sm text-muted-foreground">
        The record you requested does not exist or has been retired. The bridge,
        however, remains open.
      </p>
      <Button asChild className="mt-6">
        <Link to="/">Return to {APP_NAME}</Link>
      </Button>
    </div>
  );
}
