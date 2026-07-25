export default function MasterDetailLayout({
  master,
  detailHeader,
  detailTabs,
  detail,
  mobileView = "master",
  className = "",
}) {
  return (
    <div className={`master-detail ${className}`.trim()} data-mobile-view={mobileView}>
      <aside className="master-pane" aria-label="Master navigation">
        {master}
      </aside>
      <section className="detail-pane" aria-label="Selected item workspace">
        {detailHeader}
        {detailTabs}
        <div className="detail-pane-content">
          {detail}
        </div>
      </section>
    </div>
  );
}
