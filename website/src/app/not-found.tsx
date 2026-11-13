import Link from "next/link";

export default function NotFound() {
  return (
    <section className="page-hero">
      <div className="container">
        <p className="eyebrow">404 · Page not found</p>
        <h1>That page isn’t here.</h1>
        <p>The address may have changed, or the page may no longer be available.</p>
        <p style={{ marginTop: 25 }}>
          <Link className="button button-lime" href="/">Back to FXSnap</Link>
        </p>
      </div>
    </section>
  );
}
