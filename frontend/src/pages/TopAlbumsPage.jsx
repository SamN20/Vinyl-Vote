import StatusCard from "../components/common/StatusCard";

export default function TopAlbumsPage() {
  return (
    <>
      <section className="hero">
        <p className="eyebrow">Vinyl Vote V2</p>
        <h1>Top Albums</h1>
        <p className="subtitle">
          V2 migration for Top Albums is in progress. Use the legacy page while this table migrates.
        </p>
      </section>
      <StatusCard message="Top Albums V2 table is coming next in this migration." />
    </>
  );
}
